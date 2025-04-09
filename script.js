// === Глобальное состояние приложения ===
const appState = {
  isPlaying: false,
  isPaused: false,
  isRecording: false,
  bpm: 120,
  volume: 1.0,
  activeMelody: null,
  activeMelodyIndex: null,
  activeSounds: new Map(),
  beatTrack: [],
  trackDuration: 6000,
  trackStartTime: null,
  pauseTime: null,
  lastSoundTime: 0,
  currentCycle: 0,
};

// === Аудио ===
const audioContext = new (window.AudioContext || window.webkitAudioContext)();
const destination = audioContext.createMediaStreamDestination();
let mediaRecorder = null;
let audioCache = new Map();
let imageCache = new Map();
let chunks = [];
let worker = null;

let isAudioContextActivated = false;
let isAudioLoaded = false;

const isMobile = /Mobi|Android/i.test(navigator.userAgent);
const eventType = isMobile ? 'touchstart' : 'click';
console.log('Устройство мобильное:', isMobile, 'eventType:', eventType);

// === Объекты звуков ===
const soundPaths = {
  kick: ['access/sounds/kick1.mp3', 'access/sounds/kick2.mp3', 'access/sounds/kick3.mp3'],
  melody: ['access/sounds/melody1.mp3', 'access/sounds/melody2.mp3', 'access/sounds/melody3.mp3'],
  melodytop: ['access/sounds/melodyTop1.mp3', 'access/sounds/melodyTop2.mp3', 'access/sounds/melodyTop3.mp3'],
  third: ['access/sounds/third1.mp3', 'access/sounds/third2.mp3', 'access/sounds/third3.mp3'],
  fourth: ['access/sounds/fourth1.mp3', 'access/sounds/fourth2.mp3', 'access/sounds/fourth3.mp3'],
};

// === Telegram: сообщаем, что приложение готово ===
const markAppReady = () => {
  if (window.Telegram?.WebApp?.ready) {
    window.Telegram.WebApp.ready();
    console.log('Telegram WebApp.ready() вызван');
  } else {
    console.warn('Telegram WebApp не определён');
  }
};
markAppReady();

// === Активация AudioContext ===
const activateAudioContext = async () => {
  if (!isAudioContextActivated) {
    await audioContext.resume();
    console.log('AudioContext активирован');
    isAudioContextActivated = true;
  }
};

// === Загрузка изображений ===
async function preloadImages() {
  console.log('preloadImages вызвана');
  const imagePaths = [
    '/access/p/melodyTopButton_normal.png', '/access/p/melodyTopButton_pressed.png',
    '/access/p/kick_button_normal.png', '/access/p/kick_button_pressed.png',
    '/access/p/melody_button_normal.png', '/access/p/melody_button_pressed.png',
    '/access/p/third_button_normal.png', '/access/p/third_button_pressed.png',
    '/access/p/fourth_button_normal.png', '/access/p/fourth_button_pressed.png',
    '/access/p/play_button_normal.png', '/access/p/play_button_pressed.png',
    '/access/p/stop_button_normal.png', '/access/p/stop_button_pressed.png',
    '/access/p/pause_button_normal.png', '/access/p/pause_button_pressed.png'
  ];
  imagePaths.forEach(path => {
    const img = new Image();
    img.src = path;
    imageCache.set(path, img);
  });
}

// === Загрузка и кэширование звуков ===
async function loadSound(src) {
  console.log(`loadSound вызвана для ${src}`);
  if (!audioCache.has(src)) {
    const response = await fetch(src);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const gainNode = audioContext.createGain();
    gainNode.gain.value = 0.5 * appState.volume;
    gainNode.connect(audioContext.destination); // Для слышимости пользователю
    gainNode.connect(destination); // Для записи

    audioCache.set(src, { buffer: audioBuffer, gainNode, activeSources: [] });
    console.log(`Звук ${src} добавлен в кэш как AudioBuffer`);
  }
  return audioCache.get(src);
}

// === Функция воспроизведения звука ===
async function playSound(audioObj, loop = false) {
  console.log('playSound вызвана, loop:', loop);
  const { buffer, gainNode, activeSources } = audioObj;
  await activateAudioContext();

  if (activeSources.length >= 10) {
    const oldestSource = activeSources.shift();
    oldestSource.stop();
    console.log('Остановлен старый источник из-за превышения лимита');
  }

  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.loop = loop;
  source.connect(gainNode);

  source.onended = () => {
    const index = activeSources.indexOf(source);
    if (index !== -1) activeSources.splice(index, 1);
    console.log('Источник завершил воспроизведение и удален');
  };

  source.start(0);
  activeSources.push(source);
  console.log('Звук воспроизводится');
}

// === Пауза и остановка звука ===
function pauseSound(audioObj) {
  console.log('pauseSound вызвана');
  audioObj.activeSources.forEach(source => source.stop());
  audioObj.activeSources = [];
}

function stopSound(audioObj) {
  console.log('stopSound вызвана');
  audioObj.activeSources.forEach(source => source.stop());
  audioObj.activeSources = [];
}

// === Загрузка всех звуков ===
async function preloadAllSounds() {
  console.log('preloadAllSounds вызвана');
  const allSounds = Object.values(soundPaths).flat();
  const totalSounds = allSounds.length;
  let loadedSounds = 0;

  window.Telegram.WebApp.MainButton.setText(`Загрузка звуков (0/${totalSounds})`);
  window.Telegram.WebApp.MainButton.show();
  window.Telegram.WebApp.MainButton.showProgress();

  for (const src of allSounds) {
    try {
      await loadSound(src);
      loadedSounds++;
      window.Telegram.WebApp.MainButton.setText(`Загрузка звуков (${loadedSounds}/${totalSounds})`);
      console.log(`Звук ${src} полностью загружен`);
    } catch (err) {
      console.error(`Не удалось загрузить ${src}:`, err);
    }
  }

  isAudioLoaded = true;
  window.Telegram.WebApp.MainButton.hideProgress();
  window.Telegram.WebApp.MainButton.hide();
  markAppReady();
}

// === Запрос разрешения на доступ к аудиопотоку ===
async function requestMicPermission() {
  try {
    mediaRecorder = new MediaRecorder(destination.stream);
    mediaRecorder.ondataavailable = (event) => {
      console.log('ondataavailable, размер данных:', event.data.size);
      if (event.data.size > 0) {
        chunks.push(event.data);
      } else {
        console.warn('Получены пустые данные от mediaRecorder');
      }
    };
    mediaRecorder.onstop = async () => {
      console.log('mediaRecorder остановлен, chunks:', chunks.length);
      await handleRecordingStop();
    };
    mediaRecorder.onstart = () => {
      console.log('mediaRecorder начал запись');
    };
    console.log('Доступ к аудиопотоку приложения получен');
  } catch (err) {
    console.error('Ошибка доступа к аудиопотоку:', err);
    window.Telegram.WebApp.showAlert('Ошибка записи аудио.');
  }
}

// === Обработка остановки записи ===
async function handleRecordingStop() {
  console.log('handleRecordingStop вызвана');
  if (chunks.length === 0) {
    console.log('Запись пуста, нет данных');
    window.Telegram.WebApp.showAlert('Запись пуста. Убедитесь, что звуки воспроизводятся во время записи.');
    return;
  }

  const blob = new Blob(chunks, { type: 'audio/wav' });
  console.log('WAV Blob создан, размер:', blob.size);
  if (blob.size === 0) {
    console.log('Ошибка: Blob пустой');
    window.Telegram.WebApp.showAlert('Запись не содержит данных.');
    return;
  }

  chunks = [];
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const channelData = audioBuffer.getChannelData(0);

    try {
      worker = new Worker('worker.js');
    } catch (err) {
      window.Telegram.WebApp.showAlert('Ошибка: worker.js не найден');
      return;
    }

    worker.postMessage({
      channelData: Float32Array.from(channelData).map(x => x * 32767),
      sampleRate: audioBuffer.sampleRate,
    });

    worker.onmessage = async (e) => {
      const mp3Blob = e.data;
      console.log('MP3 Blob получен, размер:', mp3Blob.size);
      if (mp3Blob.size === 0) {
        console.log('Ошибка: MP3 Blob пустой');
        return;
      }

      const chatId = window.Telegram.WebApp.initDataUnsafe.user?.id;
      if (!chatId) {
        console.log('Ошибка: chat_id отсутствует');
        return;
      }

      const formData = new FormData();
      formData.append('audio', mp3Blob, 'recording.mp3');
      formData.append('chat_id', chatId);

      window.Telegram.WebApp.MainButton.setText('Отправка...');
      window.Telegram.WebApp.MainButton.show();
      window.Telegram.WebApp.MainButton.showProgress();

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch('/.netlify/functions/send-audio', {
          method: 'POST',
          body: formData,
          headers: { 'Accept': 'application/json' },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        const text = await response.text();
        console.log('Ответ сервера:', response.status, text);
        if (!response.ok) throw new Error(text);
        console.log('Аудио отправлено успешно');
      } catch (error) {
        console.error('Ошибка отправки аудио:', error.message);
        window.Telegram.WebApp.showAlert(`Ошибка отправки: ${error.message}`);
      } finally {
        window.Telegram.WebApp.MainButton.hideProgress();
        window.Telegram.WebApp.MainButton.hide();
      }
    };
  } catch (error) {
    console.error('Ошибка в handleRecordingStop:', error.message);
    window.Telegram.WebApp.showAlert(`Ошибка: ${error.message}`);
  } finally {
    appState.isRecording = false;
  }
}

// === Функция переключения изображения кнопки ===
function toggleButtonImage(button, isPressed) {
  console.log('toggleButtonImage, isPressed:', isPressed);
  const baseSrc = button.dataset.baseSrc;
  if (!baseSrc) {
    console.error('dataset.baseSrc не задан для кнопки:', button);
    return;
  }
  const newSrc = isPressed ? `${baseSrc}_pressed.png` : `${baseSrc}_normal.png`;
  button.src = imageCache.has(newSrc) ? imageCache.get(newSrc).src : newSrc;
}

// === Обработка DOMContentLoaded и инициализация интерфейса ===
document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOMContentLoaded вызван');
  markAppReady();

  await Promise.all([preloadAllSounds(), preloadImages()]);
  await requestMicPermission();

  const soundButtons = document.querySelectorAll('.container .pressable:not(.downButton):not([id^="melodyTopButton"]):not(#cassette)');
  const melodyTopButtons = document.querySelectorAll('.container .pressable[id^="melodyTopButton"]');
  const cassette = document.getElementById('cassette');
  const recordButton = document.getElementById('recordButton');
  const playButton = document.getElementById('playButton');
  const stopButton = document.getElementById('stopButton');
  const pauseButton = document.getElementById('pauseButton');
  const beatTrackElement = document.getElementById('beatTrack');

  console.log('soundButtons найдено:', soundButtons.length);
  console.log('melodyTopButtons найдено:', melodyTopButtons.length);
  console.log('cassette:', cassette ? 'найден' : 'не найден');
  console.log('recordButton:', recordButton ? 'найден' : 'не найден');
  console.log('playButton:', playButton ? 'найден' : 'не найден');
  console.log('stopButton:', stopButton ? 'найден' : 'не найден');
  console.log('pauseButton:', pauseButton ? 'найден' : 'не найден');

  // === Обработка нажатий по кнопкам звуков ===
  soundButtons.forEach((button, index) => {
    const soundType = button.id.replace(/\d+$/, '').replace('Button', '').toLowerCase();
    const soundIndex = index % 3;

    button.dataset.sound = soundType;
    button.dataset.soundIndex = soundIndex;

    button.addEventListener(eventType, (e) => {
      e.preventDefault();
      if (!isAudioLoaded) {
        console.log('Звуки ещё не загружены, подождите...');
        return;
      }
      console.log(`Кнопка нажата, soundType: ${soundType}, soundIndex: ${soundIndex}`);
      try {
        const soundSrc = soundPaths[soundType][soundIndex];
        const sound = audioCache.get(soundSrc);
        if (!sound) {
          console.error(`Звук ${soundSrc} не найден в кэше`);
          return;
        }
        playSound(sound, false);

        const currentTime = appState.isPlaying && !appState.isPaused 
          ? (performance.now() - appState.trackStartTime) % appState.trackDuration
          : 0;
        const timeInSeconds = currentTime / 1000;
        const uniqueId = `${soundType}-${soundIndex}-${Date.now()}`;
        appState.beatTrack.push({ 
          sound, type: soundType, time: timeInSeconds, id: uniqueId, hasPlayedInCycle: false 
        });

        const marker = document.createElement('div');
        marker.classList.add('beat-marker', soundType);
        marker.style.left = `${(timeInSeconds / (appState.trackDuration / 1000)) * 100}%`;
        marker.dataset.id = uniqueId;
        beatTrackElement.appendChild(marker);

        toggleButtonImage(button, true);
        setTimeout(() => toggleButtonImage(button, false), 100);
      } catch (err) {
        console.error(`Ошибка воспроизведения ${soundType}${soundIndex}:`, err);
      }
    });
  });

  // === Обработка нажатий для кнопок мелодии верхнего ряда ===
  melodyTopButtons.forEach((button, index) => {
    button.dataset.sound = 'melodytop';
    button.dataset.soundIndex = index;

    button.addEventListener(eventType, async (e) => {
      e.preventDefault();
      if (!isAudioLoaded) return;
      const isPressed = !button.classList.contains('pressed');

      melodyTopButtons.forEach(otherButton => {
        if (otherButton !== button) {
          otherButton.classList.remove('pressed');
          toggleButtonImage(otherButton, false);
        }
      });

      if (appState.activeMelody) {
        stopSound(appState.activeMelody);
        appState.activeMelody = null;
        appState.activeMelodyIndex = null;
      }

      if (isPressed) {
        button.classList.add('pressed');
        toggleButtonImage(button, true);
        try {
          const soundSrc = soundPaths['melodytop'][index];
          const sound = audioCache.get(soundSrc);
          if (!sound) {
            console.error(`Звук ${soundSrc} не найден в кэше`);
            return;
          }
          appState.activeMelody = sound;
          appState.activeMelodyIndex = index;
          await playSound(sound, true);
        } catch (err) {
          console.error(`Ошибка мелодии melodyTop ${index + 1}:`, err);
        }
      }
    });
  });

  // === Обработка кнопки "кассета" (запись) ===
  cassette?.addEventListener(eventType, async (e) => {
    e.preventDefault();
    if (!isAudioLoaded) return;
    console.log('cassette нажата, isRecording:', appState.isRecording);
    if (appState.isRecording) {
      appState.isRecording = false;
      mediaRecorder?.stop();
    } else {
      await requestMicPermission();
      if (!mediaRecorder) return;
      if (mediaRecorder.state === 'recording') mediaRecorder.stop();
      appState.isRecording = true;
      chunks = [];
      mediaRecorder.start();
    }
  });

  // === Обработка кнопки "record" ===
  recordButton?.addEventListener(eventType, async (e) => {
    e.preventDefault();
    if (!isAudioLoaded) return;
    console.log('recordButton нажата, isRecording:', appState.isRecording);

    if (appState.isRecording) {
      appState.isRecording = false;
      mediaRecorder?.stop();
    } else {
      await requestMicPermission();
      if (!mediaRecorder) return;
      if (mediaRecorder.state === 'recording') {
        console.warn('mediaRecorder уже записывает, принудительная остановка');
        mediaRecorder.stop();
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      appState.isRecording = true;
      chunks = [];
      mediaRecorder.start();
      console.log('Запись начата');
    }
  });

  // === Обработка кнопки "play" ===
  playButton?.addEventListener(eventType, async (e) => {
    e.preventDefault();
    if (!isAudioLoaded) return;
    console.log('playButton нажата, isPlaying:', appState.isPlaying);
    if (!appState.isPlaying) {
      await activateAudioContext();
      appState.isPlaying = true;
      appState.isPaused = false;
      appState.trackStartTime = performance.now();
      requestAnimationFrame(updateBeatTrack);
      if (appState.activeMelody) await playSound(appState.activeMelody, true);
    }
  });

  // === Обработка кнопки "stop" ===
  stopButton?.addEventListener(eventType, (e) => {
    e.preventDefault();
    if (!isAudioLoaded) return;
    console.log('stopButton нажата');
    appState.isPlaying = false;
    appState.isPaused = false;
    appState.beatTrack = [];
    beatTrackElement.innerHTML = '<div class="progress-bar" id="progressBar"></div>';
    if (appState.activeMelody) {
      stopSound(appState.activeMelody);
      appState.activeMelody = null;
      appState.activeMelodyIndex = null;
    }
    pauseButton.classList.remove('pressed');
  });

  // === Обработка кнопки "pause" ===
  pauseButton?.addEventListener(eventType, (e) => {
    e.preventDefault();
    if (!isAudioLoaded) return;

    console.log('pauseButton нажата, isPlaying:', appState.isPlaying, 'isPaused:', appState.isPaused);

    if (appState.isPlaying && !appState.isPaused) {
      appState.isPaused = true;
      appState.pauseTime = performance.now();

      if (appState.activeMelody) {
        pauseSound(appState.activeMelody);
      }

      pauseButton.classList.add('pressed');
      toggleButtonImage(pauseButton, true);
    } else if (appState.isPaused) {
      appState.isPaused = false;
      const pausedDuration = performance.now() - appState.pauseTime;
      appState.trackStartTime += pausedDuration;

      if (appState.activeMelody) {
        playSound(appState.activeMelody, true);
      }

      requestAnimationFrame(updateBeatTrack);

      pauseButton.classList.remove('pressed');
      toggleButtonImage(pauseButton, false);
    }
  });

  // === Функция обновления beatTrack ===
  function updateBeatTrack(timestamp) {
    if (!appState.trackStartTime) appState.trackStartTime = timestamp;
    const elapsed = timestamp - appState.trackStartTime;
    const cycleDuration = appState.trackDuration;
    const currentCycle = Math.floor(elapsed / cycleDuration);
    const cycleTime = elapsed % cycleDuration;

    document.getElementById('progressBar').style.width = `${(cycleTime / cycleDuration) * 100}%`;

    if (currentCycle !== appState.currentCycle) {
      appState.currentCycle = currentCycle;
      appState.beatTrack.forEach(entry => {
        entry.hasPlayedInCycle = false;
      });
    }

    appState.beatTrack.forEach(entry => {
      const expectedTime = entry.time * 1000;
      if (!entry.hasPlayedInCycle && Math.abs(cycleTime - expectedTime) < 50) {
        playSound(entry.sound, false);
        entry.hasPlayedInCycle = true;
      }
    });

    if (appState.isPlaying && !appState.isPaused) {
      requestAnimationFrame(updateBeatTrack);
    }
  }
});