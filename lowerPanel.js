// lowerPanel.js
export function setupLowerPanel(appState, soundPaths, eventType, audioCache, imageCache, playSound, pauseSound, stopSound, toggleButtonImage, sendMelodyToChat, updateBeatTrack, mediaRecorder, chunks, requestMicPermission) {
    const cassette = document.getElementById('cassette');
    const cassetteContainer = document.getElementById('cassette-container');
    const stopButton = document.getElementById('stopButton');
    const pauseButton = document.getElementById('pauseButton');
    const playButton = document.getElementById('playButton');
    const recordButton = document.getElementById('recordButton');
    const sendMelodyButton = document.getElementById('sendMelodyButton');
    const beatTrackElement = document.getElementById('beatTrack');
    const melodyTopButtons = document.querySelectorAll('.pressable[id^="melodyTopButton"]');
  
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
  
    sendMelodyButton.addEventListener(eventType, (e) => {
      e.preventDefault();
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
  
    cassette.addEventListener(eventType, async (e) => {
      e.preventDefault();
      console.log('cassette clicked, isRecording:', appState.isRecording);
      if (!appState.isRecording) {
        const permissionGranted = await requestMicPermission();
        if (!permissionGranted) return;
        try {
          mediaRecorder.start();
          chunks.length = 0; // Очищаем chunks
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
  
    recordButton.addEventListener(eventType, async (e) => {
      e.preventDefault();
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
          chunks.length = 0; // Очищаем chunks
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
          window.Telegram.WebApp.showAlert('Выберите мелодию!');
          appState.isPlaying = false;
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
        appState.activeMelodyIndex = null;
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
  }