// centerPanel.js
export function setupCenterPanel(appState, soundPaths, eventType, audioCache, imageCache, playSound, stopSound, toggleButtonImage, sendMelodyToChat) {
    const soundButtons = document.querySelectorAll('.container .pressable:not([id^="melodyTopButton"])');
    const melodyTopButtons = document.querySelectorAll('.pressable[id^="melodyTopButton"]');
    const beatTrackElement = document.getElementById('beatTrack');
  
    console.log('soundButtons найдено:', soundButtons.length);
    console.log('melodyTopButtons найдено:', melodyTopButtons.length);
    console.log('beatTrackElement:', beatTrackElement ? 'найден' : 'не найден');
  
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
          const sound = audioCache.get(soundSrc) || await loadSound(soundSrc, audioContext, audioCache, appState, destination);
  
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
            const sound = audioCache.get(soundSrc) || await loadSound(soundSrc, audioContext, audioCache, appState, destination);
  
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
  }