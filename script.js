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

// Проверка, является ли устройство мобильным
const isMobile = /Mobi|Android/i.test(navigator.userAgent);
const eventType = isMobile ? 'touchstart' : 'click';
console.log('Устройство мобильное:', isMobile);

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
  if (audioContext.state !== 'running') {
    await audioContext.resume();
    console.log('AudioContext активирован в playSound');
  }
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
  const newSrc = isPressed ? `${baseSrc}_pressed.png` : `${baseSrc}_normal.png`;
  button.src = imageCache.has(newSrc) ? imageCache.get(newSrc).src : newSrc;
}

function updateBeatTrack(timestamp) {
  if (!appState.trackStartTime) appState.trackStartTime = timestamp;
  const elapsed = timestamp - appState.trackStartTime;
  
  // Обновляем прогресс-бар
  document.getElementById('progressBar').style.width = 
    `${(elapsed % appState.trackDuration) / appState.trackDuration * 100}%`;
  
  // Воспроизводим звуки в нужные моменты
  appState.beatTrack.forEach(entry => {
    const expectedTime = entry.time * 1000; // Переводим время в миллисекунды
    if (Math.abs(elapsed - expectedTime) < 50) {
      playSound(entry.sound, false, true);
    }
  });
  
  if (appState.isPlaying) {
    requestAnimationFrame(updateBeatTrack); // Продолжаем анимацию
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
        'Accept': 'application/json', // Явные заголовки для Netlify
      },
      signal: abortController.signal,
    }).catch(error => {
      console.error('Network Error:', error); // Логируем сетевые ошибки
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
  window.Telegram.WebApp.ready(); // Уведомляем Telegram, что приложение готово
}

// Запрос разрешения на микрофон
async function requestMicPermission() {
  if (navigator.mediaDevices) {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('Доступ к микрофону получен');
    } catch (err) {
      console.error('Ошибка доступа к микрофону:', err);
      window.Telegram.WebApp.showAlert('Ошибка доступа к микрофону. Разрешите доступ в настройках.');
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
    worker = new Worker('worker.js'); // Используем один воркер
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

      // Уведомление о готовности записи
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

  // Разворачиваем Telegram Web App на полный экран
  if (window.Telegram && window.Telegram.WebApp) {
    window.Telegram.WebApp.expand();
    console.log('Telegram.WebApp.expand() вызван');
  } else {
    console.log('Telegram Web App не доступен');
  }

  // Предзагрузка звуков и изображений
  await Promise.all([preloadAllSounds(), preloadImages()]);

  // Добавляем обработчики для активации AudioContext
  document.querySelectorAll('button, .pressable').forEach(element => {
    element.addEventListener('touchstart', activateAudioContext);
  });

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
  console.log('beatTrackElement:', beatTrackElement);
  console.log('cassette:', cassette);
  console.log('cassetteContainer:', cassetteContainer);
  console.log('stopButton:', stopButton);
  console.log('pauseButton:', pauseButton);
  console.log('playButton:', playButton);
  console.log('recordButton:', recordButton);
  console.log('sendMelodyButton:', sendMelodyButton);

  if (!playButton || !stopButton || !recordButton) {
    console.error('Одна из кнопок нижней панели не найдена');
    window.Telegram.WebApp.showAlert('Ошибка: кнопки Play, Stop или Record не найдены. Проверьте HTML.');
    return;
  }

  cassette.addEventListener(eventType, async () => {
    console.log('cassette clicked, isRecording:', appState.isRecording);
    if (!appState.isRecording) {
      await requestMicPermission(); // Запрашиваем разрешение на микрофон
      mediaRecorder.start();
      chunks = []; // Очищаем массив для новой записи
      console.log('Recording STARTED');
    } else {
      mediaRecorder.stop(); 
      console.log('Recording STOPPED');
    }
    appState.isRecording = !appState.isRecording; // Переключаем состояние
  });

  recordButton.addEventListener(eventType, async () => {
    console.log('recordButton clicked, isRecording:', appState.isRecording);
    const isPressed = !recordButton.classList.contains('pressed');
    recordButton.classList.toggle('pressed', isPressed);
    appState.isRecording = isPressed;
    if (isPressed) {
      await requestMicPermission(); // Запрашиваем разрешение на микрофон
      mediaRecorder.start();
      chunks = []; // Очищаем массив для новой записи
      console.log('Recording STARTED');
    } else {
      mediaRecorder.stop(); 
      console.log('Recording STOPPED');
    }
  });

  playButton.addEventListener(eventType, async () => {
    console.log('playButton clicked, isPlaying:', appState.isPlaying, 'isPaused:', appState.isPaused);
    if (!appState.isPlaying) {
      await activateAudioContext(); // Активируем AudioContext
      appState.isPlaying = true;
      appState.isPaused = false;
      appState.trackStartTime = performance.now(); // Запускаем отсчёт времени
      requestAnimationFrame(updateBeatTrack); // Запускаем анимацию бит-дорожки
      
      if (appState.activeMelody) {
        await playSound(appState.activeMelody, true, true); // Воспроизводим мелодию
      } else {
        window.Telegram.WebApp.showAlert('Выберите мелодию!');
      }
    }
  });

  stopButton.addEventListener(eventType, () => {
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
    appState.trackStartTime = null; // Сбрасываем время трека
    pauseButton.classList.remove('pressed');
  });

  pauseButton.addEventListener(eventType, () => {
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