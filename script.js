// script.js
import { preloadImages, toggleButtonImage } from './images.js';
import { loadSound, playSound, pauseSound, stopSound, activateAudioContext } from './audio.js';
import { requestMicPermission, setupRecorder, sendMelodyToChat } from './recorder.js';
import { setupCenterPanel } from './centerPanel.js';
import { setupLowerPanel } from './lowerPanel.js';
import { updateBeatTrack } from './beatTrack.js';

// Глобальные переменные
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

// Проверка, является ли устройство мобильным
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

// Инициализация приложения
document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOMContentLoaded вызван');

  if (window.Telegram && window.Telegram.WebApp) {
    window.Telegram.WebApp.expand();
    console.log('Telegram.WebApp.expand() вызван');
  } else {
    console.log('Telegram Web App не доступен');
  }

  // Запрашиваем доступ к микрофону при открытии приложения
  await requestMicPermission();

  // Загружаем звуки и изображения
  await Promise.all([preloadAllSounds(), preloadImages()]);

  // Добавляем обработчики для активации AudioContext
  document.querySelectorAll('button, .pressable').forEach(element => {
    element.addEventListener('touchstart', activateAudioContext);
  });

  // Инициализируем модули
  setupCenterPanel(appState, soundPaths, eventType, audioCache, imageCache, playSound, stopSound, toggleButtonImage, sendMelodyToChat);
  setupLowerPanel(appState, soundPaths, eventType, audioCache, imageCache, playSound, pauseSound, stopSound, toggleButtonImage, sendMelodyToChat, updateBeatTrack, mediaRecorder, chunks, requestMicPermission);
  setupRecorder(mediaRecorder, chunks, appState, audioContext, sendMelodyToChat);
});

// Функция для предзагрузки всех звуков
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
      await loadSound(src, audioContext, audioCache, appState, destination);
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