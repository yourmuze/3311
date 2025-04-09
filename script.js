// === Глобальное состояние ===
const appState = {
  isPlaying: false,
  isPaused: false,
  isRecording: false,
  bpm: 120,
  volume: 0.8,
  activeMelody: null,
  activeMelodyIndex: null,
  beatTrack: [],
  trackDuration: 6000,
  trackStartTime: null,
  pauseTime: null,
  currentCycle: 0,
};

// === Аудио система ===
let audioContext;
let destination;
let compressor;
let mediaRecorder = null;
let audioCache = new Map();
let imageCache = new Map();
let chunks = [];
let worker = null;

const isMobile = /Mobi|Android/i.test(navigator.userAgent);
const eventType = isMobile ? 'touchstart' : 'click';
let audioUnlocked = false;

// === Инициализация аудио ===
function initAudioSystem() {
  if (!audioContext) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioContext();
    destination = audioContext.createMediaStreamDestination();
    
    compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.knee.value = 10;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.1;
    compressor.release.value = 0.25;
    compressor.connect(audioContext.destination);
    compressor.connect(destination);
  }
}

// === Разблокировка аудио (мобильный хак) ===
function unlockAudio() {
  if (audioUnlocked) return;
  
  // Создаем невидимый аудиоэлемент
  const buffer = document.createElement('audio');
  buffer.volume = 0.001;
  buffer.innerHTML = `
    <source src="data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBIAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=" type="audio/wav">
  `;
  
  document.body.appendChild(buffer);
  
  const playPromise = buffer.play();
  if (playPromise !== undefined) {
    playPromise
      .then(() => buffer.pause())
      .catch(e => console.log('Audio unlocked'));
  }
  
  buffer.remove();
  audioUnlocked = true;
}

// === Загрузка звуков ===
async function loadSound(src) {
  if (audioCache.has(src)) return audioCache.get(src);
  
  try {
    // Для мобильных - через Web Audio API
    if (isMobile) {
      const response = await fetch(src);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      const audioObj = { 
        buffer: audioBuffer,
        play: () => {
          const source = audioContext.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(compressor);
          source.start(0);
          return source;
        }
      };
      
      audioCache.set(src, audioObj);
      return audioObj;
    }
    
    // Для десктопа - HTML5 Audio
    const audio = new Audio(src);
    await new Promise((resolve) => {
      audio.onloadedmetadata = resolve;
      audio.load();
    });
    
    const source = audioContext.createMediaElementSource(audio);
    const gainNode = audioContext.createGain();
    gainNode.gain.value = appState.volume;
    source.connect(gainNode);
    gainNode.connect(compressor);
    
    const audioObj = {
      audio,
      gainNode,
      play: async () => {
        audio.currentTime = 0;
        await audio.play();
        return audio;
      }
    };
    
    audioCache.set(src, audioObj);
    return audioObj;
    
  } catch (err) {
    console.error(`Ошибка загрузки ${src}:`, err);
    throw err;
  }
}

// === Воспроизведение звука ===
async function playSound(soundObj) {
  if (!audioUnlocked) unlockAudio();
  if (!audioContext) initAudioSystem();
  
  try {
    return await soundObj.play();
  } catch (err) {
    console.error('Ошибка воспроизведения:', err);
    
    // Fallback для iOS
    if (isMobile && soundObj.buffer) {
      const source = audioContext.createBufferSource();
      source.buffer = soundObj.buffer;
      source.connect(compressor);
      source.start(0);
      return source;
    }
    
    throw err;
  }
}

// === Telegram WebApp ===
function setupTelegram() {
  if (window.Telegram?.WebApp?.ready) {
    window.Telegram.WebApp.ready();
    window.Telegram.WebApp.expand();
  }
}

// === Загрузка всех звуков ===
async function preloadSounds() {
  const soundTypes = ['kick', 'melody', 'melodytop', 'third', 'fourth'];
  const promises = [];
  
  soundTypes.forEach(type => {
    soundPaths[type].forEach(src => {
      promises.push(loadSound(src).catch(console.error));
    });
  });
  
  await Promise.all(promises);
}

// === Запись аудио ===
async function startRecording() {
  if (!mediaRecorder) {
    mediaRecorder = new MediaRecorder(destination.stream);
    mediaRecorder.ondataavailable = e => chunks.push(e.data);
    mediaRecorder.onstop = processRecording;
  }
  
  chunks = [];
  mediaRecorder.start();
  appState.isRecording = true;
}

async function stopRecording() {
  if (mediaRecorder?.state === 'recording') {
    mediaRecorder.stop();
    appState.isRecording = false;
  }
}

async function processRecording() {
  const blob = new Blob(chunks, { type: 'audio/wav' });
  // Здесь обработка и отправка записи
}

// === Инициализация интерфейса ===
function initUI() {
  // Кнопки звуков
  document.querySelectorAll('.sound-btn').forEach(btn => {
    btn.addEventListener(eventType, async () => {
      const soundType = btn.dataset.sound;
      const soundIndex = btn.dataset.index;
      const soundObj = audioCache.get(soundPaths[soundType][soundIndex]);
      
      if (soundObj) {
        await playSound(soundObj);
        
        // Добавляем в beat track
        if (appState.isPlaying) {
          const time = (performance.now() - appState.trackStartTime) % appState.trackDuration;
          appState.beatTrack.push({
            sound: soundObj,
            time: time / 1000,
            type: soundType
          });
        }
      }
    });
  });
  
  // Кнопки управления
  document.getElementById('playBtn').addEventListener(eventType, startPlayback);
  document.getElementById('stopBtn').addEventListener(eventType, stopPlayback);
  document.getElementById('recordBtn').addEventListener(eventType, toggleRecording);
}

// === Управление воспроизведением ===
function startPlayback() {
  if (!appState.isPlaying) {
    appState.isPlaying = true;
    appState.isPaused = false;
    appState.trackStartTime = performance.now();
    updatePlayback();
  }
}

function stopPlayback() {
  appState.isPlaying = false;
  appState.isPaused = false;
  appState.beatTrack = [];
}

function toggleRecording() {
  if (appState.isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
}

function updatePlayback() {
  if (!appState.isPlaying || appState.isPaused) return;
  
  const currentTime = performance.now();
  const elapsed = currentTime - appState.trackStartTime;
  const cycleTime = elapsed % appState.trackDuration;
  
  // Воспроизведение beat track
  appState.beatTrack.forEach(item => {
    const itemTime = item.time * 1000;
    if (Math.abs(cycleTime - itemTime) < 50) {
      playSound(item.sound);
    }
  });
  
  requestAnimationFrame(updatePlayback);
}

// === Запуск приложения ===
document.addEventListener('DOMContentLoaded', async () => {
  setupTelegram();
  initAudioSystem();
  
  // Разблокировка аудио по первому касанию
  document.body.addEventListener(eventType, unlockAudio, { once: true });
  
  // Кнопка для ручной разблокировки
  const unlockBtn = document.createElement('button');
  unlockBtn.textContent = 'Активировать звук';
  unlockBtn.className = 'unlock-btn';
  unlockBtn.onclick = unlockAudio;
  document.body.appendChild(unlockBtn);
  
  await preloadSounds();
  initUI();
  
  console.log('Приложение инициализировано');
});

// === Стили для кнопки разблокировки ===
const style = document.createElement('style');
style.textContent = `
.unlock-btn {
  position: fixed;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  padding: 8px 16px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 14px;
}
`;
document.head.appendChild(style);