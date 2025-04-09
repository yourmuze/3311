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
  maxPolyphony: 8, // Максимум одновременно звучащих семплов
  voicePool: new Map(), // Пул голосов для каждого звука
};

// === Аудио ===
const audioContext = new (window.AudioContext || window.webkitAudioContext)();
const destination = audioContext.createMediaStreamDestination();

// Мастер-компрессор
const compressor = audioContext.createDynamicsCompressor();
compressor.threshold.value = -20;
compressor.knee.value = 10;
compressor.ratio.value = 4;
compressor.attack.value = 0.1;
compressor.release.value = 0.25;
compressor.connect(audioContext.destination);
compressor.connect(destination);

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

// === Загрузка и кэширование звуков с нормализацией ===
async function loadSound(src) {
  console.log(`loadSound вызвана для ${src}`);
  if (!audioCache.has(src)) {
    const audio = new Audio(src);
    await new Promise((resolve, reject) => {
      audio.onloadedmetadata = resolve;
      audio.onerror = () => reject(new Error(`Failed to load audio: ${src}`));
    });

    // Анализ громкости
    const sourceNode = audioContext.createMediaElementSource(audio);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    sourceNode.connect(analyser);
    analyser.connect(audioContext.destination);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);
    
    let max = 0;
    for (let i = 0; i < bufferLength; i++) {
      const value = Math.abs(dataArray[i] - 128) / 128;
      if (value > max) max = value;
    }

    const volumeCorrection = Math.min(1.5, 0.7 / Math.max(max, 0.01));

    const gainNode = audioContext.createGain();
    gainNode.gain.value = volumeCorrection * 0.7 * appState.volume;
    
    sourceNode.disconnect(analyser);
    sourceNode.connect(gainNode);
    gainNode.connect(compressor);

    audioCache.set(src, { audio, gainNode, volumeCorrection });
    console.log(`Звук ${src} добавлен в кэш с коррекцией ${volumeCorrection.toFixed(2)}`);
  }
  return audioCache.get(src);
}

// === Функция воспроизведения звука с управлением полифонией ===
async function playSound(audioObj, loop = false, resetTime = true) {
  const { audio, gainNode } = audioObj;
  
  if (!appState.voicePool.has(audio.src)) {
    appState.voicePool.set(audio.src, []);
  }

  const pool = appState.voicePool.get(audio.src);
  let voice = pool.find(v => v.paused || v.ended);

  if (!voice && pool.length < appState.maxPolyphony) {
    voice = audio.cloneNode(true);
    pool.push(voice);
  }

  if (!voice) {
    console.warn('Polyphony limit reached for', audio.src);
    return;
  }

  await activateAudioContext();
  if (resetTime) voice.currentTime = 0;
  voice.volume = gainNode.gain.value;
  voice.loop = loop;
  
  try {
    await voice.play();
    voice.onended = () => voice.pause();
  } catch(err) {
    console.error('Play error:', err);
  }
}

// === Пауза и остановка звука ===
function pauseSound(audioObj) {
  if (audioObj?.audio) audioObj.audio.pause();
}

function stopSound(audioObj) {
  if (audioObj?.audio) {
    audioObj.audio.pause();
    audioObj.audio.currentTime = 0;
  }
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
    } catch (err) {
      console.error(`Не удалось загрузить ${src}:`, err);
    }
  }

  isAudioLoaded = true;
  window.Telegram.WebApp.MainButton.hideProgress();
  window.Telegram.WebApp.MainButton.hide();
  markAppReady();
}

// === Инициализация записи ===
async function requestMicPermission() {
  try {
    mediaRecorder = new MediaRecorder(destination.stream);
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    mediaRecorder.onstop = handleRecordingStop;
  } catch (err) {
    console.error('Ошибка записи:', err);
    window.Telegram.WebApp.showAlert('Ошибка записи аудио.');
  }
}

// === Обработка остановки записи ===
async function handleRecordingStop() {
  if (chunks.length === 0) return;

  const blob = new Blob(chunks, { type: 'audio/wav' });
  chunks = [];

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
      const chatId = window.Telegram.WebApp.initDataUnsafe.user?.id;
      if (!chatId) return;

      const formData = new FormData();
      formData.append('audio', mp3Blob, 'recording.mp3');
      formData.append('chat_id', chatId);

      window.Telegram.WebApp.MainButton.setText('Отправка...');
      window.Telegram.WebApp.MainButton.show();
      window.Telegram.WebApp.MainButton.showProgress();

      try {
        const response = await fetch('/.netlify/functions/send-audio', {
          method: 'POST',
          body: formData,
          headers: { 'Accept': 'application/json' },
        });
        console.log('Ответ сервера:', response.status);
      } catch (error) {
        console.error('Ошибка отправки:', error);
        window.Telegram.WebApp.showAlert(`Ошибка отправки: ${error.message}`);
      } finally {
        window.Telegram.WebApp.MainButton.hideProgress();
        window.Telegram.WebApp.MainButton.hide();
      }
    };
  } catch (error) {
    console.error('Ошибка обработки:', error);
    window.Telegram.WebApp.showAlert(`Ошибка: ${error.message}`);
  } finally {
    appState.isRecording = false;
  }
}

// === Функция переключения изображения кнопки ===
function toggleButtonImage(button, isPressed) {
  const baseSrc = button.dataset.baseSrc;
  if (!baseSrc) return;
  const newSrc = isPressed ? `${baseSrc}_pressed.png` : `${baseSrc}_normal.png`;
  button.src = imageCache.has(newSrc) ? imageCache.get(newSrc).src : newSrc;
}

// === Инициализация приложения ===
document.addEventListener('DOMContentLoaded', async () => {
  markAppReady();
  await Promise.all([preloadAllSounds(), preloadImages()]);

  // Инициализация элементов
  const soundButtons = document.querySelectorAll('.container .pressable:not(.downButton):not([id^="melodyTopButton"]):not(#cassette)');
  const melodyTopButtons = document.querySelectorAll('.container .pressable[id^="melodyTopButton"]');
  const cassette = document.getElementById('cassette');
  const recordButton = document.getElementById('recordButton');
  const playButton = document.getElementById('playButton');
  const stopButton = document.getElementById('stopButton');
  const pauseButton = document.getElementById('pauseButton');
  const beatTrackElement = document.getElementById('beatTrack');

  // Обработчики кнопок звуков
  soundButtons.forEach((button, index) => {
    const soundType = button.id.replace(/\d+$/, '').replace('Button', '').toLowerCase();
    const soundIndex = index % 3;

    button.dataset.sound = soundType;
    button.dataset.soundIndex = soundIndex;

    button.addEventListener(eventType, (e) => {
      e.preventDefault();
      if (!isAudioLoaded) return;

      const soundSrc = soundPaths[soundType][soundIndex];
      const sound = audioCache.get(soundSrc);
      if (!sound) return;

      playSound(sound, false, true);

      const currentTime = appState.isPlaying && !appState.isPaused 
        ? (performance.now() - appState.trackStartTime) % appState.trackDuration
        : 0;
      
      const uniqueId = `${soundType}-${soundIndex}-${Date.now()}`;
      appState.beatTrack.push({ 
        sound, 
        type: soundType, 
        time: currentTime / 1000, 
        id: uniqueId, 
        hasPlayedInCycle: false 
      });

      const marker = document.createElement('div');
      marker.classList.add('beat-marker', soundType);
      marker.style.left = `${(currentTime / appState.trackDuration) * 100}%`;
      marker.dataset.id = uniqueId;
      beatTrackElement.appendChild(marker);

      toggleButtonImage(button, true);
      setTimeout(() => toggleButtonImage(button, false), 100);
    });
  });

  // Обработчики кнопок мелодий
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
      }

      if (isPressed) {
        button.classList.add('pressed');
        toggleButtonImage(button, true);
        const soundSrc = soundPaths['melodytop'][index];
        const sound = audioCache.get(soundSrc);
        if (sound) {
          appState.activeMelody = sound;
          await playSound(sound, true, true);
        }
      }
    });
  });

  // Обработчики управления
  cassette?.addEventListener(eventType, async (e) => {
    e.preventDefault();
    if (!isAudioLoaded) return;
    
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

  recordButton?.addEventListener(eventType, async (e) => {
    e.preventDefault();
    if (!isAudioLoaded) return;
    
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

  playButton?.addEventListener(eventType, async (e) => {
    e.preventDefault();
    if (!isAudioLoaded) return;
    
    if (!appState.isPlaying) {
      await activateAudioContext();
      appState.isPlaying = true;
      appState.isPaused = false;
      appState.trackStartTime = performance.now();
      requestAnimationFrame(updateBeatTrack);
      if (appState.activeMelody) await playSound(appState.activeMelody, true, true);
    }
  });

  stopButton?.addEventListener(eventType, (e) => {
    e.preventDefault();
    if (!isAudioLoaded) return;
    
    appState.isPlaying = false;
    appState.isPaused = false;
    appState.beatTrack = [];
    beatTrackElement.innerHTML = '<div class="progress-bar" id="progressBar"></div>';
    
    if (appState.activeMelody) {
      stopSound(appState.activeMelody);
      appState.activeMelody = null;
    }
    
    pauseButton?.classList.remove('pressed');
  });

  pauseButton?.addEventListener(eventType, (e) => {
    e.preventDefault();
    if (!isAudioLoaded) return;
    
    if (appState.isPlaying && !appState.isPaused) {
      appState.isPaused = true;
      appState.pauseTime = performance.now();
      if (appState.activeMelody) pauseSound(appState.activeMelody);
      pauseButton.classList.add('pressed');
    } else if (appState.isPaused) {
      appState.isPaused = false;
      appState.trackStartTime += performance.now() - appState.pauseTime;
      if (appState.activeMelody) appState.activeMelody.audio.play();
      requestAnimationFrame(updateBeatTrack);
      pauseButton.classList.remove('pressed');
    }
  });

  // Функция обновления трека
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

    // Автоматическая регулировка громкости
    const activeCount = appState.beatTrack.filter(e => !e.hasPlayedInCycle).length;
    const autoGain = Math.min(1.0, 1.0 / Math.sqrt(activeCount + 1));
    
    appState.beatTrack.forEach(entry => {
      const expectedTime = entry.time * 1000;
      if (!entry.hasPlayedInCycle && Math.abs(cycleTime - expectedTime) < 50) {
        if (entry.sound.gainNode) {
          entry.sound.gainNode.gain.value = 
            entry.sound.volumeCorrection * autoGain * appState.volume;
        }
        
        // Ducking для мелодии при ударах
        if (entry.type === 'kick' && appState.activeMelody?.gainNode) {
          appState.activeMelody.gainNode.gain.setValueAtTime(
            0.7 * appState.volume,
            audioContext.currentTime
          );
          appState.activeMelody.gainNode.gain.linearRampToValueAtTime(
            appState.volume,
            audioContext.currentTime + 0.2
          );
        }
        
        playSound(entry.sound, false, true);
        entry.hasPlayedInCycle = true;
      }
    });

    if (appState.isPlaying && !appState.isPaused) {
      requestAnimationFrame(updateBeatTrack);
    }
  }
});