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

const audioContext = new (window.AudioContext || window.webkitAudioContext)();
const destination = audioContext.createMediaStreamDestination();
let mediaRecorder = null; // Инициализируем позже
let audioCache = new Map();
let imageCache = new Map();
let chunks = [];
let isAudioContextActivated = false;
let isAudioLoaded = false;
let worker;

const isMobile = /Mobi|Android/i.test(navigator.userAgent);
const eventType = isMobile ? 'touchstart' : 'click';
console.log('Устройство мобильное:', isMobile, 'eventType:', eventType);

const soundPaths = {
  kick: ['access/sounds/kick1.mp3', 'access/sounds/kick2.mp3', 'access/sounds/kick3.mp3'],
  melody: ['access/sounds/melody1.mp3', 'access/sounds/melody2.mp3', 'access/sounds/melody3.mp3'],
  melodytop: ['access/sounds/melodyTop1.mp3', 'access/sounds/melodyTop2.mp3', 'access/sounds/melodyTop3.mp3'],
  third: ['access/sounds/third1.mp3', 'access/sounds/third2.mp3', 'access/sounds/third3.mp3'],
  fourth: ['access/sounds/fourth1.mp3', 'access/sounds/fourth2.mp3', 'access/sounds/fourth3.mp3'],
};

const activateAudioContext = async () => {
  if (!isAudioContextActivated) {
    await audioContext.resume();
    console.log('AudioContext активирован');
    isAudioContextActivated = true;
  }
};

async function preloadImages() {
  console.log('preloadImages вызвана');
  const imagePaths = [
    '/access/p/melodyTopButton_normal.png',
    '/access/p/melodyTopButton_pressed.png',
    '/access/p/kick_button_normal.png',
    '/access/p/kick_button_pressed.png',
    '/access/p/melody_button_normal.png',
    '/access/p/melody_button_pressed.png',
    '/access/p/third_button_normal.png',
    '/access/p/third_button_pressed.png',
    '/access/p/fourth_button_normal.png',
    '/access/p/fourth_button_pressed.png',
    '/access/p/record_button_normal.png',
    '/access/p/record_button_pressed.png',
    '/access/p/play_button_normal.png',
    '/access/p/play_button_pressed.png',
    '/access/p/stop_button_normal.png',
    '/access/p/stop_button_pressed.png',
    '/access/p/pause_button_normal.png',
    '/access/p/pause_button_pressed.png',
  ];

  imagePaths.forEach(path => {
    const img = new Image();
    img.src = path;
    imageCache.set(path, img);
  });
}

async function loadSound(src) {
  console.log(`loadSound вызвана для ${src}`);
  if (!audioCache.has(src)) {
    try {
      const audio = new Audio(src);
      await new Promise((resolve, reject) => {
        audio.onloadedmetadata = () => {
          console.log(`Метаданные для ${src} загружены`);
          resolve();
        };
        audio.oncanplaythrough = () => {
          console.log(`Звук ${src} готов к воспроизведению`);
          resolve();
        };
        audio.onerror = () => reject(new Error(`Failed to load audio: ${src}`));
        // Тайм-аут 10 секунд
        setTimeout(() => reject(new Error(`Timeout loading audio: ${src}`)), 10000);
      });
      const source = audioContext.createMediaElementSource(audio);
      const gainNode = audioContext.createGain();
      gainNode.gain.value = 0.5 * appState.volume;
      source.connect(gainNode);
      gainNode.connect(destination);
      gainNode.connect(audioContext.destination);
      audioCache.set(src, { audio, gainNode });
      console.log(`Звук ${src} добавлен в кэш`);
    } catch (err) {
      console.error(`Ошибка загрузки звука ${src}:`, err);
      throw err;
    }
  }
  return audioCache.get(src);
}

async function playSound(audioObj, loop = false, resetTime = true) {
  console.log('playSound вызвана, loop:', loop, 'resetTime:', resetTime);
  const { audio, gainNode } = audioObj;
  await activateAudioContext();
  if (resetTime) audio.currentTime = 0;
  gainNode.gain.value = 0.5 * appState.volume;
  audio.loop = loop;
  audio.play().catch(err => console.error('Play error:', err));
  console.log('Звук воспроизводится:', audio.src);
}

function pauseSound(audioObj) {
  console.log('pauseSound вызвана');
  audioObj.audio.pause();
}

function stopSound(audioObj) {
  console.log('stopSound вызвана');
  const { audio } = audioObj;
  audio.pause();
  audio.currentTime = 0;
}

function toggleButtonImage(button, isPressed) {
  console.log('toggleButtonImage вызвана, isPressed:', isPressed);
  const baseSrc = button.dataset.baseSrc;
  if (!baseSrc) {
    console.error('dataset.baseSrc не задан для кнопки:', button);
    return;
  }
  const newSrc = isPressed ? `${baseSrc}_pressed.png` : `${baseSrc}_normal.png`;
  button.src = imageCache.has(newSrc) ? imageCache.get(newSrc).src : newSrc;
}

function updateBeatTrack(timestamp) {
  if (!appState.trackStartTime) appState.trackStartTime = timestamp;
  const elapsed = timestamp - appState.trackStartTime;

  const cycleDuration = appState.trackDuration;
  const currentCycle = Math.floor(elapsed / cycleDuration);
  const cycleTime = elapsed % cycleDuration;

  document.getElementById('progressBar').style.width = 
    `${(cycleTime / cycleDuration) * 100}%`;

  if (currentCycle !== appState.currentCycle) {
    appState.currentCycle = currentCycle;
    appState.beatTrack.forEach(entry => {
      entry.hasPlayedInCycle = false;
    });
  }

  appState.beatTrack.forEach(entry => {
    const expectedTime = entry.time * 1000;
    if (!entry.hasPlayedInCycle && Math.abs(cycleTime - expectedTime) < 50) {
      playSound(entry.sound, false, true);
      entry.hasPlayedInCycle = true;
    }
  });

  if (appState.isPlaying) {
    requestAnimationFrame(updateBeatTrack);
  }
}

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
      await loadSound(src); // loadSound уже проверяет oncanplaythrough
      loadedSounds++;
      window.Telegram.WebApp.MainButton.setText(`Загрузка звуков (${loadedSounds}/${totalSounds})`);
      console.log(`Звук ${src} полностью загружен и готов к воспроизведению`);
    } catch (err) {
      console.error(`Не удалось загрузить ${src}:`, err);
      loadedSounds++; // Продолжаем, чтобы не блокировать
    }
  }

  window.Telegram.WebApp.MainButton.hideProgress();
  window.Telegram.WebApp.MainButton.hide();
  console.log('Все звуки загружены');
  isAudioLoaded = true;
  window.Telegram.WebApp.ready();
}

async function requestMicPermission() {
  if (navigator.mediaDevices) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('Доступ к микрофону получен');
      // Инициализируем mediaRecorder только после получения доступа
      if (!mediaRecorder) {
        mediaRecorder = new MediaRecorder(destination.stream);
        mediaRecorder.ondataavailable = (event) => {
          console.log('mediaRecorder.ondataavailable вызвана');
          if (event.data.size > 0) {
            chunks.push(event.data);
            console.log('Данные записи добавлены в chunks, размер:', event.data.size);
          } else {
            console.log('Получены пустые данные от mediaRecorder');
          }
        };
        mediaRecorder.onstop = handleMediaRecorderStop;
      }
      return stream;
    } catch (err) {
      console.error('Ошибка доступа к микрофону:', err);
      window.Telegram.WebApp.showAlert('Ошибка доступа к микрофону. Разрешите доступ в настройках.');
      throw err;
    }
  }
}

async function handleMediaRecorderStop() {
  console.log('mediaRecorder.onstop вызвана');
  console.log('Состояние mediaRecorder:', mediaRecorder.state);

  if (!appState.isRecording) {
    console.log('Запись не активна, игнорируем onstop');
    return;
  }

  if (chunks.length === 0) {
    console.log('Ошибка: chunks пустой');
    return;
  }

  const blob = new Blob(chunks, { type: 'audio/wav' });
  chunks = [];
  console.log('Запись завершена. Размер WAV Blob:', blob.size);

  if (blob.size === 0) {
    console.log('Ошибка: WAV Blob пустой');
    return;
  }

  try {
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const channelData = audioBuffer.getChannelData(0);

    // Проверяем доступность worker.js
    try {
      worker = new Worker('worker.js');
    } catch (err) {
      console.error('Ошибка загрузки worker.js:', err);
      window.Telegram.WebApp.showAlert('Ошибка: не удалось загрузить worker.js. Запись не может быть конвертирована.');
      return;
    }

    worker.postMessage({
      channelData: Float32Array.from(channelData).map(x => x * 32767),
      sampleRate: audioBuffer.sampleRate,
    });

    worker.onmessage = async (e) => {
      const mp3Blob = e.data;
      console.log('Конвертация завершена. Размер MP3 Blob:', mp3Blob.size);

      if (mp3Blob.size === 0) {
        console.log('Ошибка: MP3 Blob пустой');
        return;
      }

      console.log('Запись готова к отправке');
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

      let retries = 3;
      for (let i = 0; i < retries; i++) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);

          const response = await fetch('/.netlify/functions/send-audio', {
            method: 'POST',
            body: formData,
            headers: { 'Accept': 'application/json' },
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          const text = await response.text();
          console.log('Ответ сервера:', response.status, text);

          if (response.ok) {
            console.log('Аудио отправлено в чат');
            break;
          } else {
            throw new Error(`Ошибка сервера: ${text}`);
          }
        } catch (error) {
          if (error.name === 'AbortError') {
            window.Telegram.WebApp.showAlert('Ошибка: запрос на отправку превысил время ожидания (10 секунд).');
            break;
          }
          if (i === retries - 1) {
            window.Telegram.WebApp.showAlert(`Ошибка отправки после ${retries} попыток: ${error.message}`);
          } else {
            console.log(`Попытка ${i + 1} не удалась, повтор через 2 секунды...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }
    };
  } catch (error) {
    console.error('Ошибка в mediaRecorder.onstop:', error.message);
    window.Telegram.WebApp.showAlert(`Ошибка: ${error.message}`);
  } finally {
    window.Telegram.WebApp.MainButton.hideProgress();
    window.Telegram.WebApp.MainButton.hide();
    appState.isRecording = false;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOMContentLoaded вызван');

  if (window.Telegram && window.Telegram.WebApp) {
    window.Telegram.WebApp.expand();
    console.log('Telegram.WebApp.expand() вызван');
  } else {
    console.log('Telegram Web App не доступен');
  }

  appState.isRecording = false;
  chunks = [];

  await Promise.all([preloadAllSounds(), preloadImages()]);

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

  soundButtons.forEach((button, index) => {
    const soundType = button.id.replace(/\d+$/, '').replace('Button', '').toLowerCase();
    const soundIndex = (index % 3);

    button.dataset.sound = soundType;
    button.dataset.soundIndex = soundIndex;

    button.addEventListener(eventType, async (e) => {
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
        await playSound(sound, false, true);

        const currentTime = appState.isPlaying && !appState.isPaused 
          ? (performance.now() - appState.trackStartTime) % appState.trackDuration 
          : 0;
        const timeInSeconds = currentTime / 1000;
        const uniqueId = `${soundType}-${soundIndex}-${Date.now()}`;
        appState.beatTrack.push({ 
          sound, 
          type: soundType, 
          time: timeInSeconds, 
          id: uniqueId,
          hasPlayedInCycle: false
        });

        const marker = document.createElement('div');
        marker.classList.add('beat-marker', soundType);
        marker.style.left = `${(timeInSeconds / (appState.trackDuration / 1000)) * 100}%`;
        marker.dataset.id = uniqueId;
        beatTrackElement.appendChild(marker);

        toggleButtonImage(button, true);
        setTimeout(() => toggleButtonImage(button, false), 100);
      } catch (err) {
        console.error(`Ошибка звука ${soundType}${soundIndex}:`, err);
      }
    });
  });

  melodyTopButtons.forEach((button, index) => {
    button.dataset.sound = 'melodytop';
    button.dataset.soundIndex = index;

    button.addEventListener(eventType, async (e) => {
      e.preventDefault();
      if (!isAudioLoaded) {
        console.log('Звуки ещё не загружены, подождите...');
        return;
      }
      console.log('melodyTopButton нажата, index:', index);
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
      } else {
        button.classList.remove('pressed');
        toggleButtonImage(button, false);
      }

      try {
        const soundSrc = soundPaths['melodytop'][index];
        const sound = audioCache.get(soundSrc);
        if (!sound) {
          console.error(`Звук ${soundSrc} не найден в кэше`);
          return;
        }

        if (isPressed) {
          appState.activeMelody = sound;
          appState.activeMelodyIndex = index;
          await playSound(sound, true, true);
        } else {
          stopSound(sound);
          appState.activeMelody = null;
          appState.activeMelodyIndex = null;
        }
      } catch (err) {
        console.error(`Ошибка мелодии melodyTop${index + 1}:`, err);
      }
    });
  });

  cassette.addEventListener(eventType, async (e) => {
    e.preventDefault();
    if (!isAudioLoaded) {
      console.log('Звуки ещё не загружены, подождите...');
      return;
    }
    console.log('cassette нажата, isRecording:', appState.isRecording);
    if (appState.isRecording) {
      console.log('Останавливаем запись');
      appState.isRecording = false;
      mediaRecorder.stop();
      toggleButtonImage(cassette, false);
    } else {
      console.log('Начинаем запись');
      await requestMicPermission();
      if (mediaRecorder.state === 'recording') {
        console.log('mediaRecorder уже записывает, останавливаем');
        mediaRecorder.stop();
      }
      appState.isRecording = true;
      chunks = [];
      mediaRecorder.start();
      toggleButtonImage(cassette, true);
    }
  });

  recordButton.addEventListener(eventType, async (e) => {
    e.preventDefault();
    if (!isAudioLoaded) {
      console.log('Звуки ещё не загружены, подождите...');
      return;
    }
    console.log('recordButton нажата, isRecording:', appState.isRecording);
    if (appState.isRecording) {
      console.log('Останавливаем запись');
      appState.isRecording = false;
      mediaRecorder.stop();
      recordButton.classList.remove('pressed');
      toggleButtonImage(recordButton, false);
    } else {
      console.log('Начинаем запись');
      await requestMicPermission();
      if (mediaRecorder.state === 'recording') {
        console.log('mediaRecorder уже записывает, останавливаем');
        mediaRecorder.stop();
      }
      appState.isRecording = true;
      chunks = [];
      mediaRecorder.start();
      recordButton.classList.add('pressed');
      toggleButtonImage(recordButton, true);
    }
  });

  playButton.addEventListener(eventType, async (e) => {
    e.preventDefault();
    if (!isAudioLoaded) {
      console.log('Звуки ещё не загружены, подождите...');
      return;
    }
    console.log('playButton нажата, isPlaying:', appState.isPlaying);
    if (!appState.isPlaying) {
      await activateAudioContext();
      appState.isPlaying = true;
      appState.isPaused = false;
      appState.trackStartTime = performance.now();
      requestAnimationFrame(updateBeatTrack);
      if (appState.activeMelody) {
        await playSound(appState.activeMelody, true, true);
      }
    }
  });

  stopButton.addEventListener(eventType, (e) => {
    e.preventDefault();
    if (!isAudioLoaded) {
      console.log('Звуки ещё не загружены, подождите...');
      return;
    }
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

  pauseButton.addEventListener(eventType, (e) => {
    e.preventDefault();
    if (!isAudioLoaded) {
      console.log('Звуки ещё не загружены, подождите...');
      return;
    }
    console.log('pauseButton нажата, isPlaying:', appState.isPlaying, 'isPaused:', appState.isPaused);
    if (appState.isPlaying && !appState.isPaused) {
      appState.isPaused = true;
      appState.pauseTime = performance.now(); // Исправлено: Wperformance → performance
      if (appState.activeMelody) pauseSound(appState.activeMelody);
      pauseButton.classList.add('pressed');
    } else if (appState.isPaused) {
      appState.isPlaying = true;
      appState.isPaused = false;
      const pausedDuration = performance.now() - appState.pauseTime;
      appState.trackStartTime += pausedDuration;
      if (appState.activeMelody) {
        appState.activeMelody.audio.play();
      }
      requestAnimationFrame(updateBeatTrack);
      pauseButton.classList.remove('pressed');
    }
  });
});