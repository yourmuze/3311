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
const mediaRecorder = new MediaRecorder(destination.stream);
let audioCache = new Map();
let imageCache = new Map();
let chunks = [];
let abortController = null;
let isAudioContextActivated = false;
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
    'access/images/melodyTop1_normal.png',
    'access/images/melodyTop1_pressed.png',
    'access/images/melodyTop2_normal.png',
    'access/images/melodyTop2_pressed.png',
    'access/images/melodyTop3_normal.png',
    'access/images/melodyTop3_pressed.png',
    'access/images/send_normal.png',
    'access/images/send_pressed.png',
    // Добавьте пути для центральных кнопок
    'access/images/kick1_normal.png',
    'access/images/kick1_pressed.png',
    'access/images/melody1_normal.png',
    'access/images/melody1_pressed.png',
    // и т.д. для всех кнопок
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
        audio.onloadedmetadata = () => resolve();
        audio.onerror = () => reject(new Error(`Failed to load audio: ${src}`));
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
  document.getElementById('progressBar').style.width = 
    `${(elapsed % appState.trackDuration) / appState.trackDuration * 100}%`;
  appState.beatTrack.forEach(entry => {
    const expectedTime = entry.time * 1000;
    if (Math.abs(elapsed - expectedTime) < 50) {
      playSound(entry.sound, false, true);
    }
  });
  if (appState.isPlaying) {
    requestAnimationFrame(updateBeatTrack);
  }
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
      headers: { 'Accept': 'application/json' },
      signal: abortController.signal,
    });

    const text = await sendResponse.text();
    console.log('Ответ сервера:', sendResponse.status, text);

    if (sendResponse.ok) {
      console.log('Мелодия отправлена в чат');
    } else {
      console.error('Ошибка сервера:', sendResponse.status, text);
      window.Telegram.WebApp.showAlert(`Ошибка отправки: ${text}`);
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('Отправка отменена');
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
    }
  }

  window.Telegram.WebApp.MainButton.hideProgress();
  window.Telegram.WebApp.MainButton.hide();
  console.log('Все звуки загружены');
  window.Telegram.WebApp.ready();
}

async function requestMicPermission() {
  if (navigator.mediaDevices) {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('Доступ к микрофону получен');
    } catch (err) {
      console.error('Ошибка доступа к микрофону:', err);
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

    worker = new Worker('worker.js');
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

      abortController = new AbortController();

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
    abortController = null;
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOMContentLoaded вызван');

  if (window.Telegram && window.Telegram.WebApp) {
    window.Telegram.WebApp.expand();
    console.log('Telegram.WebApp.expand() вызван');
  } else {
    console.log('Telegram Web App не доступен');
  }

  await Promise.all([preloadAllSounds(), preloadImages()]);

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

  console.log('soundButtons найдено:', soundButtons.length);
  console.log('melodyTopButtons найдено:', melodyTopButtons.length);

  if (!playButton || !stopButton || !recordButton || !pauseButton || !sendMelodyButton) {
    console.error('Одна из кнопок нижней панели не найдена');
    window.Telegram.WebApp.showAlert('Ошибка: одна из кнопок нижней панели не найдена. Проверьте HTML.');
    return;
  }

  // Обработчики для soundButtons (kick, melody, third, fourth)
  soundButtons.forEach((button, index) => {
    const soundType = button.id.replace(/\d+$/, '').replace('Button', '').toLowerCase();
    const soundIndex = (index % 3);

    button.dataset.sound = soundType;
    button.dataset.soundIndex = soundIndex;

    button.addEventListener(eventType, async (e) => {
      e.preventDefault();
      console.log(`soundButton clicked, soundType: ${soundType}, soundIndex: ${soundIndex}`);
      try {
        const soundSrc = soundPaths[soundType][soundIndex];
        if (!soundSrc) {
          console.error(`Звук для ${soundType}${soundIndex} не найден`);
          return;
        }
        const sound = await loadSound(soundSrc);
        await playSound(sound, false, true);

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

        marker.addEventListener(eventType, () => {
          appState.beatTrack = appState.beatTrack.filter(entry => entry.id !== marker.dataset.id);
          marker.remove();
        });
      } catch (err) {
        console.error(`Ошибка воспроизведения звука ${soundType}${soundIndex}:`, err);
      }
    });
  });

  // Обработчики для melodyTopButtons
  melodyTopButtons.forEach((button, index) => {
    button.dataset.sound = 'melodytop';
    button.dataset.soundIndex = index;

    let pressTimer;
    let isLongPress = false;

    button.addEventListener(eventType, async (e) => {
      e.preventDefault();
      console.log('melodyTopButton clicked, index:', index);

      pressTimer = setTimeout(() => {
        isLongPress = true;
        const soundSrc = soundPaths['melodytop'][index];
        const chatId = window.Telegram.WebApp.initDataUnsafe.user?.id || '123456789';
        if (!chatId) {
          console.log('Ошибка: chat_id отсутствует');
          return;
        }
        sendMelodyToChat(soundSrc, chatId);
      }, 1000);

      const handleShortPress = async () => {
        if (isLongPress) {
          isLongPress = false;
          return;
        }
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
            await playSound(sound, true, true);
          } else {
            appState.activeMelody = null;
            stopSound(sound);
            if (appState.activeSounds.size === 0 && !appState.activeMelody) {
              appState.isPlaying = false;
            }
          }
        } catch (err) {
          console.error(`Ошибка воспроизведения мелодии melodyTop${index + 1}:`, err);
        }
      };

      if (isMobile) {
        button.addEventListener('touchend', () => {
          clearTimeout(pressTimer);
          handleShortPress();
        }, { once: true });
      } else {
        clearTimeout(pressTimer);
        handleShortPress();
      }
    });
  });

  // Обработчик для sendMelodyButton
  sendMelodyButton.addEventListener(eventType, (e) => {
    e.preventDefault();
    console.log('sendMelodyButton clicked');
    toggleButtonImage(sendMelodyButton, true);
    if (!appState.activeMelody) {
      console.log('Сначала выберите мелодию');
      setTimeout(() => toggleButtonImage(sendMelodyButton, false), 100);
      return;
    }

    const chatId = window.Telegram.WebApp.initDataUnsafe.user?.id || '123456789';
    if (!chatId) {
      console.log('Ошибка: chat_id отсутствует');
      setTimeout(() => toggleButtonImage(sendMelodyButton, false), 100);
      return;
    }

    const melodySrc = soundPaths['melodytop'][melodyTopButtons.forEach(button => button.classList.contains('pressed') && button.dataset.soundIndex === '0') ? 0 : melodyTopButtons.forEach(button => button.classList.contains('pressed') && button.dataset.soundIndex === '1') ? 1 : 2];
    sendMelodyToChat(melodySrc, chatId);

    setTimeout(() => toggleButtonImage(sendMelodyButton, false), 100);
  });

  // Обработчики для нижних кнопок (не трогаем функционал, только добавляем e.preventDefault())
  cassette.addEventListener(eventType, async (e) => {
    e.preventDefault();
    console.log('cassette clicked, isRecording:', appState.isRecording);
    if (!appState.isRecording) {
      await requestMicPermission();
      mediaRecorder.start();
      chunks = [];
      console.log('Recording STARTED');
    } else {
      mediaRecorder.stop();
      console.log('Recording STOPPED');
    }
    appState.isRecording = !appState.isRecording;
  });

  recordButton.addEventListener(eventType, async (e) => {
    e.preventDefault();
    console.log('recordButton clicked, isRecording:', appState.isRecording);
    const isPressed = !recordButton.classList.contains('pressed');
    recordButton.classList.toggle('pressed', isPressed);
    appState.isRecording = isPressed;
    if (isPressed) {
      await requestMicPermission();
      mediaRecorder.start();
      chunks = [];
      console.log('Recording STARTED');
    } else {
      mediaRecorder.stop();
      console.log('Recording STOPPED');
    }
  });

  playButton.addEventListener(eventType, async (e) => {
    e.preventDefault();
    console.log('playButton clicked, isPlaying:', appState.isPlaying, 'isPaused:', appState.isPaused);
    if (!appState.isPlaying) {
      await activateAudioContext();
      appState.isPlaying = true;
      appState.isPaused = false;
      appState.trackStartTime = performance.now();
      requestAnimationFrame(updateBeatTrack);
      
      if (appState.activeMelody) {
        await playSound(appState.activeMelody, true, true);
      } else {
        console.log('Выберите мелодию');
      }
    }
  });

  stopButton.addEventListener(eventType, (e) => {
    e.preventDefault();
    console.log('stopButton clicked');
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
    appState.trackStartTime = null;
    pauseButton.classList.remove('pressed');
  });

  pauseButton.addEventListener(eventType, (e) => {
    e.preventDefault();
    console.log('pauseButton clicked, isPlaying:', appState.isPlaying, 'isPaused:', appState.isPaused);
    if (appState.isPlaying && !appState.isPaused) {
      appState.isPaused = true;
      appState.pauseTime = performance.now();
      appState.activeSounds.forEach(sound => pauseSound(sound));
      if (appState.activeMelody) pauseSound(appState.activeMelody);
      pauseButton.classList.add('pressed');
      console.log('Пауза включена');
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
      console.log('Пауза снята');
    }
  });
});