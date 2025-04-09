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

// Проверка, является ли устройство мобильным
const isMobile = /Mobi|Android/i.test(navigator.userAgent);
const eventType = isMobile ? 'touchstart' : 'click';
const lowerPanelEventType = 'click'; // Используем click для нижней панели
console.log('Устройство мобильное:', isMobile, 'eventType:', eventType, 'lowerPanelEventType:', lowerPanelEventType);

const soundPaths = {
  kick: ['access/sounds/kick1.mp3', 'access/sounds/kick2.mp3', 'access/sounds/kick3.mp3'],
  melody: ['access/sounds/melody1.mp3', 'access/sounds/melody2.mp3', 'access/sounds/melody3.mp3'],
  melodytop: ['access/sounds/melodyTop1.mp3', 'access/sounds/melodyTop2.mp3', 'access/sounds/melodyTop3.mp3'],
  third: ['access/sounds/third1.mp3', 'access/sounds/third2.mp3', 'access/sounds/third3.mp3'],
  fourth: ['access/sounds/fourth1.mp3', 'access/sounds/fourth2.mp3', 'access/sounds/fourth3.mp3'],
};

// Активация AudioContext
const activateAudioContext = async () => {
  if (!isAudioContextActivated) {
    await audioContext.resume();
    console.log('AudioContext активирован');
    isAudioContextActivated = true;
  }
};

// Кэширование изображений
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
        audio.onerror = () => {
          console.error(`Ошибка загрузки ${src}`);
          reject(new Error(`Failed to load audio: ${src}`));
        };
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
      headers: {
        'Accept': 'application/json',
      },
      signal: abortController.signal,
    }).catch(error => {
      console.error('Network Error:', error);
      window.Telegram.WebApp.showAlert('Ошибка сети: проверьте соединение');
      throw error;
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
  window.Telegram.WebApp.ready();
}

async function requestMicPermission() {
  console.log('requestMicPermission вызвана');
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    console.error('navigator.mediaDevices не поддерживается. Проверьте, используется ли HTTPS.');
    window.Telegram.WebApp.showAlert('Ошибка: доступ к микрофону не поддерживается. Используйте HTTPS.');
    return false;
  }

  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log('Доступ к микрофону получен');
    return true;
  } catch (err) {
    console.error('Ошибка доступа к микрофону:', err);
    window.Telegram.WebApp.showAlert('Ошибка доступа к микрофону. Разрешите доступ в настройках.');
    return false;
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
    window.Telegram.WebApp.showAlert('Ошибка: нет данных для записи. Убедитесь, что звук воспроизводится во время записи.');
    return;
  }

  const blob = new Blob(chunks, { type: 'audio/wav' });
  chunks = [];
  console.log('Запись завершена. Размер WAV Blob:', blob.size);

  if (blob.size === 0) {
    console.log('Ошибка: WAV Blob пустой');
    window.Telegram.WebApp.showAlert('Ошибка: записанный файл пустой. Попробуйте записать дольше.');
    return;
  }

  try {
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

    console.log('Конвертация в MP3 с помощью Web Worker...');
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
        window.Telegram.WebApp.showAlert('Ошибка: MP3 файл пустой после конвертации.');
        return;
      }

      window.Telegram.WebApp.showAlert('Запись готова к отправке!');

      const chatId = window.Telegram.WebApp.initDataUnsafe.user?.id;
      console.log('Chat ID:', chatId);
      if (!chatId) {
        console.log('Ошибка: chat_id отсутствует');
        window.Telegram.WebApp.showAlert('Ошибка: не удалось определить chat_id. Убедитесь, что вы авторизованы в Telegram.');
        return;
      }

      const formData = new FormData();
      formData.append('audio', mp3Blob, 'recording.mp3');
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
            headers: {
              'Accept': 'application/json',
            },
            signal: controller.signal,
          }).catch(error => {
            console.error('Network Error:', error);
            window.Telegram.WebApp.showAlert('Ошибка сети: проверьте соединение');
            throw error;
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
    };
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

  // Более подробное логирование для проверки
  console.log('soundButtons найдено:', soundButtons.length);
  console.log('melodyTopButtons найдено:', melodyTopButtons.length);
  console.log('beatTrackElement:', beatTrackElement ? 'найден' : 'не найден');
  console.log('cassette:', cassette ? 'найден' : 'не найден');
  console.log('cassetteContainer:', cassetteContainer ? 'найден' : 'не найден');
  console.log('stopButton:', stopButton ? 'найден' : 'не найден');
  console.log('pauseButton:', pauseButton ? 'найден' : 'не найден');
  console.log('playButton:', playButton ? 'найден' : 'не найден');
  console.log('recordButton:', recordButton ? 'найден' : 'не найден');
  console.log('sendMelodyButton:', sendMelodyButton ? 'найден' : 'не найден');

  if (!playButton || !stopButton || !recordButton || !pauseButton || !sendMelodyButton || !cassette) {
    console.error('Одна из кнопок нижней панели не найдена');
    window.Telegram.WebApp.showAlert('Ошибка: одна из кнопок нижней панели не найдена. Проверьте HTML.');
    return;
  }

  soundButtons.forEach((button, index) => {
    const soundType = button.id.replace(/\d+$/, '').replace('Button', '').toLowerCase();
    const soundIndex = (index % 3);

    button.dataset.sound = soundType;
    button.dataset.soundIndex = soundIndex;

    button.addEventListener(eventType, async () => {
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
        console.error(`Error handling sound for ${soundType}${soundIndex}:`, err);
        window.Telegram.WebApp.showAlert(`Ошибка воспроизведения звука: ${err.message}`);
      }
    });
  });

  melodyTopButtons.forEach((button, index) => {
    button.dataset.sound = 'melodytop';
    button.dataset.soundIndex = index;

    let pressTimer;
    let isLongPress = false;

    button.addEventListener(eventType, async (event) => {
      event.preventDefault();
      console.log('melodyTopButton clicked, index:', index);

      pressTimer = setTimeout(() => {
        isLongPress = true;
        const soundSrc = soundPaths['melodytop'][index];
        const chatId = window.Telegram.WebApp.initDataUnsafe.user?.id || '123456789';
        if (!chatId) {
          window.Telegram.WebApp.showAlert('Ошибка: войдите через Telegram!');
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
          const sound = await loadSound(soundSrc);

          if (isPressed) {
            appState.activeMelody = sound;
            appState.activeMelodyIndex = index;
            await playSound(sound, true, true);
          } else {
            appState.activeMelody = null;
            appState.activeMelodyIndex = null;
            stopSound(sound);
            if (appState.activeSounds.size === 0 && !appState.activeMelody) {
              appState.isPlaying = false;
            }
          }
        } catch (err) {
          console.error(`Error handling melodyTop${index + 1}:`, err);
          window.Telegram.WebApp.showAlert(`Ошибка воспроизведения мелодии: ${err.message}`);
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

  sendMelodyButton.addEventListener(lowerPanelEventType, () => {
    console.log('sendMelodyButton clicked');
    toggleButtonImage(sendMelodyButton, true);
    if (!appState.activeMelody || appState.activeMelodyIndex === null) {
      window.Telegram.WebApp.showAlert('Сначала выберите мелодию!');
      setTimeout(() => toggleButtonImage(sendMelodyButton, false), 100);
      return;
    }

    const chatId = window.Telegram.WebApp.initDataUnsafe.user?.id || '123456789';
    if (!chatId) {
      window.Telegram.WebApp.showAlert('Ошибка: войдите через Telegram!');
      setTimeout(() => toggleButtonImage(sendMelodyButton, false), 100);
      return;
    }

    const melodySrc = soundPaths['melodytop'][appState.activeMelodyIndex];
    sendMelodyToChat(melodySrc, chatId);

    setTimeout(() => toggleButtonImage(sendMelodyButton, false), 100);
  });

  cassette.addEventListener(lowerPanelEventType, async () => {
    console.log('cassette clicked, isRecording:', appState.isRecording);
    if (!appState.isRecording) {
      const permissionGranted = await requestMicPermission();
      if (!permissionGranted) return;
      try {
        mediaRecorder.start();
        chunks = [];
        console.log('Recording STARTED');
        appState.isRecording = true;
      } catch (err) {
        console.error('Ошибка при запуске записи:', err);
        window.Telegram.WebApp.showAlert('Ошибка при запуске записи. Проверьте доступ к микрофону.');
      }
    } else {
      try {
        mediaRecorder.stop();
        console.log('Recording STOPPED');
        appState.isRecording = false;
      } catch (err) {
        console.error('Ошибка при остановке записи:', err);
        window.Telegram.WebApp.showAlert('Ошибка при остановке записи.');
      }
    }
  });

  recordButton.addEventListener(lowerPanelEventType, async () => {
    console.log('recordButton clicked, isRecording:', appState.isRecording);
    const isPressed = !recordButton.classList.contains('pressed');
    recordButton.classList.toggle('pressed', isPressed);
    appState.isRecording = isPressed;
    if (isPressed) {
      const permissionGranted = await requestMicPermission();
      if (!permissionGranted) {
        appState.isRecording = false;
        recordButton.classList.remove('pressed');
        return;
      }
      try {
        mediaRecorder.start();
        chunks = [];
        console.log('Recording STARTED');
      } catch (err) {
        console.error('Ошибка при запуске записи:', err);
        window.Telegram.WebApp.showAlert('Ошибка при запуске записи. Проверьте доступ к микрофону.');
        appState.isRecording = false;
        recordButton.classList.remove('pressed');
      }
    } else {
      try {
        mediaRecorder.stop();
        console.log('Recording STOPPED');
      } catch (err) {
        console.error('Ошибка при остановке записи:', err);
        window.Telegram.WebApp.showAlert('Ошибка при остановке записи.');
      }
    }
  });

  playButton.addEventListener(lowerPanelEventType, async () => {
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
        window.Telegram.WebApp.showAlert('Выберите мелодию!');
        appState.isPlaying = false;
      }
    }
  });

  stopButton.addEventListener(lowerPanelEventType, () => {
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
      appState.activeMelodyIndex = null;
    }
    console.log('Stop button clicked, all sounds and markers cleared');
    appState.trackStartTime = null;
    pauseButton.classList.remove('pressed');
  });

  pauseButton.addEventListener(lowerPanelEventType, () => {
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