// audio.js
let isAudioContextActivated = false;

export async function activateAudioContext() {
  if (!isAudioContextActivated) {
    await audioContext.resume();
    console.log('AudioContext активирован');
    isAudioContextActivated = true;
  }
}

export async function loadSound(src, audioContext, audioCache, appState, destination) {
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

export async function playSound(audioObj, loop = false, resetTime = true) {
  console.log('playSound вызвана, loop:', loop, 'resetTime:', resetTime);
  const { audio, gainNode } = audioObj;
  await activateAudioContext();
  if (resetTime) audio.currentTime = 0;
  gainNode.gain.value = 0.5 * appState.volume;
  audio.loop = loop;
  audio.play().catch(err => console.error('Play error:', err));
  console.log('Звук воспроизводится:', audio.src);
}

export function pauseSound(audioObj) {
  console.log('pauseSound вызвана');
  audioObj.audio.pause();
}

export function stopSound(audioObj) {
  console.log('stopSound вызвана');
  const { audio } = audioObj;
  audio.pause();
  audio.currentTime = 0;
}