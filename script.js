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
let chunks = [];

const soundPaths = {
  kick: ['access/sounds/kick1.mp3', 'access/sounds/kick2.mp3', 'access/sounds/kick3.mp3'],
  melody: ['access/sounds/melody1.mp3', 'access/sounds/melody2.mp3', 'access/sounds/melody3.mp3'],
  melodytop: ['access/sounds/melodyTop1.mp3', 'access/sounds/melodyTop2.mp3', 'access/sounds/melodyTop3.mp3'],
  third: ['access/sounds/third1.mp3', 'access/sounds/third2.mp3', 'access/sounds/third3.mp3'],
  fourth: ['access/sounds/fourth1.mp3', 'access/sounds/fourth2.mp3', 'access/sounds/fourth3.mp3'],
};

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
      console.error(err);
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

mediaRecorder.ondataavailable = e => chunks.push(e.data);
mediaRecorder.onstop = async () => {
  const blob = new Blob(chunks, { type: 'audio/wav' });
  chunks = [];

  // Получаем chat_id из Telegram Web App
  const chatId = window.Telegram.WebApp.initDataUnsafe.user?.id || 'DEFAULT_CHAT_ID'; // Замени DEFAULT_CHAT_ID для тестов

  // Отправляем файл на внутренний API Vercel
  const formData = new FormData();
  formData.append('audio', blob, 'recording.wav');
  formData.append('chat_id', chatId);

  try {
    const response = await fetch('/api/send-audio', {
      method: 'POST',
      body: formData,
    });
    if (response.ok) {
      console.log('Мелодия отправлена боту');
      window.Telegram.WebApp.showAlert('Мелодия отправлена в чат!');
    } else {
      console.error('Ошибка сервера:', response.statusText);
      window.Telegram.WebApp.showAlert('Ошибка при отправке мелодии');
    }
  } catch (error) {
    console.error('Ошибка:', error);
    window.Telegram.WebApp.showAlert('Ошибка соединения');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('click', () => audioContext.resume(), { once: true });

  const soundButtons = document.querySelectorAll('.container .pressable:not([id^="melodyTopButton"])');
  const melodyTopButtons = document.querySelectorAll('.pressable[id^="melodyTopButton"]');
  const beatTrackElement = document.getElementById('beatTrack');
  const cassette = document.getElementById('cassette');
  const cassetteContainer = document.getElementById('cassette-container');
  const stopButton = document.getElementById('stopButton');
  const pauseButton = document.getElementById('pauseButton');
  const playButton = document.getElementById('playButton');
  const recordButton = document.getElementById('recordButton');

  cassette.addEventListener('click', () => {
    appState.isRecording = !appState.isRecording;
    cassetteContainer.classList.toggle('recording', appState.isRecording);
    if (appState.isRecording) mediaRecorder.start();
    else mediaRecorder.stop();
  });

  recordButton.addEventListener('click', () => {
    const isPressed = !recordButton.classList.contains('pressed');
    recordButton.classList.toggle('pressed', isPressed);
    if (isPressed) {
      appState.isRecording = true;
      mediaRecorder.start();
    } else {
      appState.isRecording = false;
      mediaRecorder.stop();
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