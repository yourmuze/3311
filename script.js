const appState = {
  isPlaying: false,
  isPaused: false,
  isRecording: false,
  bpm: 120,
  volume: 1.0,
  activeMelody: null,
  activeSounds: new Map(),
  beatTrack: [],
  trackDuration: 6000,
  trackStartTime: null,
  pauseTime: null,
  lastSoundTime: 0,
};

const audioContext = new (window.AudioContext || window.webkitAudioContext)();
const destination = audioContext.createMediaStreamDestination();
let mediaRecorder = new MediaRecorder(destination.stream);
let audioCache = new Map();
let chunks = [];
let abortController = null;
let stream = null; // Для getUserMedia

const soundPaths = {
  kick: ['access/sounds/kick1.mp3', 'access/sounds/kick2.mp3', 'access/sounds/kick3.mp3'],
  melody: ['access/sounds/melody1.mp3', 'access/sounds/melody2.mp3', 'access/sounds/melody3.mp3'],
  melodytop: ['access/sounds/melodyTop1.mp3', 'access/sounds/melodyTop2.mp3', 'access/sounds/melodyTop3.mp3'],
  third: ['access/sounds/third1.mp3', 'access/sounds/third2.mp3', 'access/sounds/third3.mp3'],
  fourth: ['access/sounds/fourth1.mp3', 'access/sounds/fourth2.mp3', 'access/sounds/fourth3.mp3'],
};

// Проверка, является ли устройство мобильным
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
console.log('Устройство мобильное:', isMobile);

async function loadSound(src) {
  if (!audioCache.has(src)) {
    try {
      const audio = new Audio(src);
      await new Promise((resolve, reject) => {
        audio.onloadedmetadata = resolve;
        audio.onerror = () => reject(new Error(`Failed to load audio: ${src}`));
      });
      const source = audioContext.createMediaElementSource(audio);
      const gainNode = audioContext.createGain();
      gainNode.gain.value = 0.5 * appState.volume;
      source.connect(gainNode);
      gainNode.connect(destination);
      gainNode.connect(audioContext.destination);
      audioCache.set(src, { audio, gainNode });
    } catch (err) {
      console.error(`Ошибка загрузки звука ${src}:`, err);
      throw err;
    }
  }
  return audioCache.get(src);
}

function playSound(audioObj, loop = false, resetTime = true) {
  const { audio, gainNode } = audioObj;
  if (resetTime) audio.currentTime = 0;
  gainNode.gain.value = 0.5 * appState.volume;
  audio.loop = loop;
  audio.play().catch(err => console.error('Play error:', err));
}

function pauseSound(audioObj) {
  audioObj.audio.pause();
}

function stopSound(audioObj) {
  const { audio } = audioObj;
  audio.pause();
  audio.currentTime = 0;
}

function toggleButtonImage(button, isPressed) {
  const baseSrc = button.dataset.baseSrc;
  button.src = isPressed ? `${baseSrc}_pressed.png` : `${baseSrc}_normal.png`;
}

function updateBeatTrack(timestamp) {
  if (!appState.isPlaying || appState.isPaused) return;

  if (!appState.trackStartTime) appState.trackStartTime = timestamp;
  const elapsed = timestamp - appState.trackStartTime;

  const progress = (elapsed % appState.trackDuration) / appState.trackDuration * 100;
  document.getElementById('progressBar').style.width = `${progress}%`;

  appState.beatTrack.forEach(entry => {
    const soundTime = entry.time * 1000;
    const timeInCycle = elapsed % appState.trackDuration;
    const timeSinceLastSound = timestamp - appState.lastSoundTime;
    if (Math.abs(timeInCycle - soundTime) < 100 && timeSinceLastSound > 100) {
      playSound(entry.sound, false, true);
      appState.lastSoundTime = timestamp;
    }
  });

  if (elapsed >= appState.trackDuration) appState.trackStartTime = timestamp;
  requestAnimationFrame(updateBeatTrack);
}

async function sendMelodyToChat(melodySrc, chatId) {
  console.log('sendMelodyToChat вызвана с melodySrc:', melodySrc, 'chatId:', chatId);
  try {
    const response = await fetch(melodySrc);
    const melodyBlob = await response.blob();
    console.log('Размер мелодии:', melodyBlob.size);

    if (melodyBlob.size === 0) {
      throw new Error('Файл мелодии пустой');
    }

    const formData = new FormData();
    formData.append('audio', melodyBlob, melodySrc.split('/').pop());
    formData.append('chat_id', chatId);

    window.Telegram.WebApp.MainButton.setText('Отправка мелодии...');
    window.Telegram.WebApp.MainButton.show();
    window.Telegram.WebApp.MainButton.showProgress();

    abortController = new AbortController();

    const sendResponse = await fetch('/.netlify/functions/send-audio', {
      method: 'POST',
      body: formData,
      signal: abortController.signal,
    });
    const text = await sendResponse.text();
    console.log('Ответ сервера:', sendResponse.status, text);

    if (sendResponse.ok) {
      window.Telegram.WebApp.showAlert('🎵 Мелодия отправлена в чат!');
    } else {
      console.error('Ошибка сервера:', sendResponse.status, text);
      window.Telegram.WebApp.showAlert(`Ошибка отправки: ${text}`);
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      window.Telegram.WebApp.showAlert('Отправка отменена');
    } else {
      console.error('Ошибка соединения:', error.message);
      window.Telegram.WebApp.showAlert(`Сбой сети: ${error.message}`);
    }
  } finally {
    window.Telegram.WebApp.MainButton.hideProgress();
    window.Telegram.WebApp.MainButton.hide();
    abortController = null;
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
      await loadSound(src);
      loadedSounds++;
      window.Telegram.WebApp.MainButton.setText(`Загрузка звуков (${loadedSounds}/${totalSounds})`);
      console.log(`Звук ${src} загружен`);
    } catch (err) {
      console.error(`Не удалось загрузить ${src}:`, err);
      window.Telegram.WebApp.showAlert(`Не удалось загрузить звук: ${src}`);
    }
  }

  window.Telegram.WebApp.MainButton.hideProgress();
  window.Telegram.WebApp.MainButton.hide();
  window.Telegram.WebApp.showAlert('Все звуки загружены! Можно начинать.');
}

// Запасной вариант для записи на телефоне через getUserMedia
async function setupMediaRecorder() {
  console.log('setupMediaRecorder вызвана');
  if (isMobile) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('getUserMedia успешно, stream:', stream);
      mediaRecorder = new MediaRecorder(stream);
      console.log('mediaRecorder создан с getUserMedia');
    } catch (err) {
      console.error('Ошибка getUserMedia:', err);
      window.Telegram.WebApp.showAlert('Не удалось получить доступ к микрофону. Разрешите доступ в настройках.');
      // Падём обратно на AudioContext
      mediaRecorder = new MediaRecorder(destination.stream);
    }
  }
}

mediaRecorder.ondataavailable = (event) => {
  console.log('mediaRecorder.ondataavailable вызвана');
  if (event.data.size > 0) {
    chunks.push(event.data);
    console.log('Данные записи добавлены в chunks, размер:', event.data.size);
  } else {
    console.log('Получены пустые данные от mediaRecorder');
  }
};

mediaRecorder.onstop = async () => {
  console.log('mediaRecorder.onstop вызвана');
  console.log('Состояние mediaRecorder:', mediaRecorder.state);

  // Останавливаем поток, если использовали getUserMedia
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
    console.log('Поток getUserMedia остановлен');
  }

  if (chunks.length === 0) {
    console.log('Ошибка: chunks пустой');
    window.Telegram.WebApp.showAlert('Ошибка: нет данных для записи. Попробуйте записать снова.');
    return;
  }

  const blob = isMobile ? new Blob(chunks, { type: 'audio/webm' }) : new Blob(chunks, { type: 'audio/wav' });
  chunks = [];
  console.log('Запись завершена. Размер Blob:', blob.size);

  if (blob.size === 0) {
    console.log('Ошибка: Blob пустой');
    window.Telegram.WebApp.showAlert('Ошибка: записанный файл пустой. Попробуйте записать дольше.');
    return;
  }

  try {
    let mp3Blob;
    if (isMobile) {
      // На мобильных устройствах используем WebM напрямую (Telegram поддерживает WebM)
      mp3Blob = blob;
      console.log('Используем WebM для мобильного устройства');
    } else {
      // На десктопе конвертируем в MP3
      console.log('Чтение WAV Blob в ArrayBuffer...');
      const arrayBuffer = await blob.arrayBuffer();
      console.log('ArrayBuffer получен, размер:', arrayBuffer.byteLength);

      console.log('Декодирование аудио...');
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      console.log('AudioBuffer декодирован, длительность:', audioBuffer.duration);

      if (audioBuffer.duration < 1) {
        console.log('Ошибка: запись слишком короткая');
        window.Telegram.WebApp.showAlert('Запись слишком короткая. Запишите минимум 1 секунду.');
        return;
      }

      const channelData = audioBuffer.getChannelData(0);
      console.log('ChannelData получен, длина:', channelData.length);

      console.log('Конвертация в MP3...');
      const mp3encoder = new lamejs.Mp3Encoder(1, audioBuffer.sampleRate, 128);
      const mp3Data = mp3encoder.encodeBuffer(Float32Array.from(channelData).map(x => x * 32767));
      const mp3End = mp3encoder.flush();
      mp3Blob = new Blob([mp3Data, mp3End], { type: 'audio/mp3' });
      console.log('Конвертация завершена. Размер MP3 Blob:', mp3Blob.size);
    }

    if (mp3Blob.size === 0) {
      console.log('Ошибка: MP3 Blob пустой');
      window.Telegram.WebApp.showAlert('Ошибка: MP3 файл пустой после конвертации.');
      return;
    }

    console.log('Скачивание файла для отладки...');
    const url = URL.createObjectURL(mp3Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = isMobile ? 'test.webm' : 'test.mp3';
    a.click();
    URL.revokeObjectURL(url);

    const chatId = window.Telegram.WebApp.initDataUnsafe.user?.id;
    console.log('Chat ID:', chatId);
    if (!chatId) {
      console.log('Ошибка: chat_id отсутствует');
      window.Telegram.WebApp.showAlert('Ошибка: не удалось определить chat_id. Убедитесь, что вы авторизованы в Telegram.');
      return;
    }

    const formData = new FormData();
    formData.append('audio', mp3Blob, isMobile ? 'recording.webm' : 'recording.mp3');
    formData.append('chat_id', chatId);

    console.log('Показываем индикатор отправки...');
    window.Telegram.WebApp.MainButton.setText('Отправка...');
    window.Telegram.WebApp.MainButton.show();
    window.Telegram.WebApp.MainButton.showProgress();

    abortController = new AbortController();

    console.log('Отправка fetch запроса...');
    let retries = 3;
    let success = false;
    for (let i = 0; i < retries; i++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch('/.netlify/functions/send-audio', {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const text = await response.text();
        console.log('Ответ сервера:', response.status, text);

        if (response.ok) {
          window.Telegram.WebApp.showAlert('🎧 Аудио отправлено! Проверьте чат с ботом.');
          success = true;
          break;
        } else {
          throw new Error(`Ошибка сервера: ${text}`);
        }
      } catch (error) {
        if (error.name === 'AbortError') {
          console.log('Fetch прерван по тайм-ауту');
          window.Telegram.WebApp.showAlert('Ошибка: запрос на отправку превысил время ожидания (10 секунд).');
          break;
        }
        if (i === retries - 1) {
          console.log('Все попытки отправки провалились:', error.message);
          window.Telegram.WebApp.showAlert(`Ошибка отправки после ${retries} попыток: ${error.message}`);
        } else {
          console.log(`Попытка ${i + 1} не удалась, повтор через 2 секунды...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
  } catch (error) {
    console.error('Ошибка в mediaRecorder.onstop:', error.message);
    window.Telegram.WebApp.showAlert(`Ошибка: ${error.message}`);
  } finally {
    console.log('Очистка после отправки...');
    window.Telegram.WebApp.MainButton.hideProgress();
    window.Telegram.WebApp.MainButton.hide();
    abortController = null;
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOMContentLoaded вызван');

  // Активируем AudioContext при первом взаимодействии
  const activateAudioContext = async () => {
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
      console.log('AudioContext активирован');
    } else {
      console.log('AudioContext уже в состоянии:', audioContext.state);
    }
  };

  document.addEventListener('click', activateAudioContext, { once: true });
  document.addEventListener('touchstart', activateAudioContext, { once: true });

  await preloadAllSounds();

  // Настраиваем MediaRecorder для мобильных устройств
  await setupMediaRecorder();

  function adjustButtonSizes() {
    console.log('adjustButtonSizes вызвана');
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const buttons = document.querySelectorAll('.pressable');
    const downButtons = document.querySelectorAll('.downButton');
    const beatTrack = document.querySelector('.beat-track');
    const cassetteContainer = document.querySelector('.cassette-container');
    const container = document.querySelector('.container');
    const melodyTopContainer = document.querySelector('.melody-top-container');
    const containerDown = document.querySelector('.containerdown');

    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.background = '#f0f0f0';
    document.body.style.fontFamily = 'Arial, sans-serif';
    document.body.style.overflowX = 'hidden';

    const containerWidth = Math.min(viewportWidth * 0.9, 600);
    container.style.width = `${containerWidth}px`;
    container.style.margin = '2vh auto';
    container.style.display = 'grid';
    container.style.gridTemplateColumns = 'repeat(3, 1fr)';
    container.style.gap = `${Math.min(viewportWidth * 0.02, 10)}px`;

    melodyTopContainer.style.width = `${containerWidth}px`;
    melodyTopContainer.style.margin = '2vh auto';
    melodyTopContainer.style.display = 'flex';
    melodyTopContainer.style.justifyContent = 'center';
    melodyTopContainer.style.gap = `${Math.min(viewportWidth * 0.02, 10)}px`;

    containerDown.style.width = `${containerWidth}px`;
    containerDown.style.margin = '2vh auto';
    containerDown.style.display = 'flex';
    containerDown.style.alignItems = 'center';
    containerDown.style.justifyContent = 'center';
    containerDown.style.gap = `${Math.min(viewportWidth * 0.02, 10)}px`;

    cassetteContainer.style.width = `${containerWidth}px`;
    cassetteContainer.style.margin = '2vh auto';

    buttons.forEach(button => {
      const size = Math.min(viewportWidth * 0.15, viewportHeight * 0.15, 80);
      button.style.width = `${size}px`;
      button.style.height = `${size}px`;
      button.style.objectFit = 'contain';
      button.style.cursor = 'pointer';
    });

    downButtons.forEach(button => {
      const size = Math.min(viewportWidth * 0.1, viewportHeight * 0.1, 60);
      button.style.width = `${size}px`;
      button.style.height = `${size}px`;
      button.style.objectFit = 'contain';
      button.style.cursor = 'pointer';
    });

    const trackHeight = Math.min(viewportHeight * 0.05, 40);
    beatTrack.style.height = `${trackHeight}px`;
    beatTrack.style.background = '#ddd';
    beatTrack.style.position = 'relative';
    beatTrack.style.borderRadius = '5px';
    beatTrack.style.overflow = 'hidden';
    beatTrack.style.flex = '1';

    const progressBar = document.getElementById('progressBar');
    progressBar.style.height = '100%';
    progressBar.style.background = '#4caf50';
    progressBar.style.position = 'absolute';
    progressBar.style.top = '0';
    progressBar.style.left = '0';
  }

  adjustButtonSizes();
  window.addEventListener('resize', adjustButtonSizes);

  const soundButtons = document.querySelectorAll('.container .pressable:not([id^="melodyTopButton"])');
  const melodyTopButtons = document.querySelectorAll('.pressable[id^="melodyTopButton"]');
  const beatTrackElement = document.getElementById('beatTrack');
  const cassette = document.getElementById('cassette');
  const cassetteContainer = document.getElementById('cassette-container');
  const stopButton = document.getElementById('stopButton');
  const pauseButton = document.getElementById('pauseButton');
  const playButton = document.getElementById('playButton');
  const recordButton = document.getElementById('recordButton');
  const sendMelodyButton = document.getElementById('sendMelodyButton');

  cassette.addEventListener('click', async () => {
    console.log('cassette clicked, isRecording:', appState.isRecording);
    appState.isRecording = !appState.isRecording;
    cassetteContainer.classList.toggle('recording', appState.isRecording);
    if (appState.isRecording) {
      console.log('Начало записи, состояние mediaRecorder:', mediaRecorder.state);
      if (mediaRecorder.state === 'inactive') {
        mediaRecorder.start();
      } else {
        console.log('mediaRecorder уже в состоянии:', mediaRecorder.state);
        mediaRecorder.stop();
        setTimeout(() => {
          mediaRecorder.start();
        }, 100);
      }
    } else {
      console.log('Остановка записи, состояние mediaRecorder:', mediaRecorder.state);
      if (mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
      } else {
        console.log('mediaRecorder уже в состоянии:', mediaRecorder.state);
      }
    }
  });

  recordButton.addEventListener('click', async () => {
    console.log('recordButton clicked');
    const isPressed = !recordButton.classList.contains('pressed');
    recordButton.classList.toggle('pressed', isPressed);
    if (isPressed) {
      appState.isRecording = true;
      console.log('Начало записи с кнопки, состояние mediaRecorder:', mediaRecorder.state);
      if (mediaRecorder.state === 'inactive') {
        mediaRecorder.start();
      } else {
        console.log('mediaRecorder уже в состоянии:', mediaRecorder.state);
        mediaRecorder.stop();
        setTimeout(() => {
          mediaRecorder.start();
        }, 100);
      }
    } else {
      appState.isRecording = false;
      console.log('Остановка записи с кнопки, состояние mediaRecorder:', mediaRecorder.state);
      if (mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
      } else {
        console.log('mediaRecorder уже в состоянии:', mediaRecorder.state);
      }
    }
  });

  soundButtons.forEach((button, index) => {
    const soundType = button.id.replace(/\d+$/, '').replace('Button', '').toLowerCase();
    const soundIndex = (index % 3);

    button.dataset.sound = soundType;
    button.dataset.soundIndex = soundIndex;

    button.addEventListener('click', async () => {
      try {
        const soundSrc = soundPaths[soundType][soundIndex];
        const sound = await loadSound(soundSrc);

        playSound(sound, false, true);

        const currentTime = appState.isPlaying && !appState.isPaused 
          ? (performance.now() - appState.trackStartTime) % appState.trackDuration 
          : 0;
        const timeInSeconds = currentTime / 1000;
        const uniqueId = `${soundType}-${soundIndex}-${Date.now()}`;
        appState.beatTrack.push({ sound, type: soundType, time: timeInSeconds, id: uniqueId });

        const marker = document.createElement('div');
        marker.classList.add('beat-marker', soundType);
        marker.style.left = `${(timeInSeconds / (appState.trackDuration / 1000)) * 100}%`;
        marker.dataset.time = timeInSeconds;
        marker.dataset.type = soundType;
        marker.dataset.id = uniqueId;
        beatTrackElement.appendChild(marker);

        toggleButtonImage(button, true);
        setTimeout(() => toggleButtonImage(button, false), 100);

        marker.addEventListener('click', () => {
          appState.beatTrack = appState.beatTrack.filter(entry => entry.id !== marker.dataset.id);
          marker.remove();
        });
      } catch (err) {
        console.error(`Error handling sound for ${soundType}${soundIndex}:`, err);
      }
    });
  });

  melodyTopButtons.forEach((button, index) => {
    button.dataset.sound = 'melodytop';
    button.dataset.soundIndex = index;

    let pressTimer;

    button.addEventListener('mousedown', () => {
      pressTimer = setTimeout(() => {
        const soundSrc = soundPaths['melodytop'][index];
        const chatId = window.Telegram.WebApp.initDataUnsafe.user?.id || '123456789';
        if (!chatId) {
          window.Telegram.WebApp.showAlert('Ошибка: войдите через Telegram!');
          return;
        }
        sendMelodyToChat(soundSrc, chatId);
      }, 1000);
    });

    button.addEventListener('mouseup', () => {
      clearTimeout(pressTimer);
    });

    button.addEventListener('mouseleave', () => {
      clearTimeout(pressTimer);
    });

    button.addEventListener('click', async () => {
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
        const sound = await loadSound(soundSrc);

        if (isPressed) {
          appState.activeMelody = sound;
          playSound(sound, true, true);
        } else {
          appState.activeMelody = null;
          stopSound(sound);
          if (appState.activeSounds.size === 0 && !appState.activeMelody) {
            appState.isPlaying = false;
          }
        }
      } catch (err) {
        console.error(`Error handling melodyTop${index + 1}:`, err);
      }
    });
  });

  sendMelodyButton.addEventListener('click', () => {
    if (!appState.activeMelody) {
      window.Telegram.WebApp.showAlert('Сначала выберите мелодию!');
      return;
    }

    const chatId = window.Telegram.WebApp.initDataUnsafe.user?.id || '123456789';
    if (!chatId) {
      window.Telegram.WebApp.showAlert('Ошибка: войдите через Telegram!');
      return;
    }

    const melodySrc = soundPaths['melodytop'][appState.activeMelody.audio.src.split('/').pop().replace('.mp3', '') === 'melodyTop1' ? 0 : appState.activeMelody.audio.src.split('/').pop().replace('.mp3', '') === 'melodyTop2' ? 1 : 2];
    sendMelodyToChat(melodySrc, chatId);

    toggleButtonImage(sendMelodyButton, true);
    setTimeout(() => toggleButtonImage(sendMelodyButton, false), 100);
  });

  playButton.addEventListener('click', () => {
    if (!appState.isPlaying && !appState.isPaused) {
      appState.isPlaying = true;
      appState.trackStartTime = null;
      requestAnimationFrame(updateBeatTrack);
      if (appState.activeMelody) {
        playSound(appState.activeMelody, true, true);
      }
    }
  });

  stopButton.addEventListener('click', () => {
    appState.isPlaying = false;
    appState.isPaused = false;
    appState.activeSounds.clear();
    appState.beatTrack = [];
    beatTrackElement.innerHTML = '<div class="progress-bar" id="progressBar"></div>';
    melodyTopButtons.forEach(button => {
      button.classList.remove('pressed');
      toggleButtonImage(button, false);
      const soundIndex = button.dataset.soundIndex;
      const soundSrc = soundPaths['melodytop'][soundIndex];
      if (audioCache.has(soundSrc)) stopSound(audioCache.get(soundSrc));
    });
    if (appState.activeMelody) {
      stopSound(appState.activeMelody);
      appState.activeMelody = null;
    }
    console.log('Stop button clicked, all sounds and markers cleared');
    pauseButton.classList.remove('pressed');
  });

  pauseButton.addEventListener('click', () => {
    if (appState.isPlaying && !appState.isPaused) {
      appState.isPaused = true;
      appState.pauseTime = performance.now();
      appState.activeSounds.forEach(sound => pauseSound(sound));
      if (appState.activeMelody) pauseSound(appState.activeMelody);
      pauseButton.classList.add('pressed');
    } else if (appState.isPaused) {
      appState.isPlaying = true;
      appState.isPaused = false;
      const pausedDuration = performance.now() - appState.pauseTime;
      appState.trackStartTime += pausedDuration;
      if (appState.activeMelody) {
        const { audio } = appState.activeMelody;
        audio.play().catch(err => console.error('Resume melody error:', err));
      }
      requestAnimationFrame(updateBeatTrack);
      pauseButton.classList.remove('pressed');
    }
  });
});