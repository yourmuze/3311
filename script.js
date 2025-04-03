// Карта аудио для кнопок
const audioMap = {
    kickButton1: new Audio('./access/sounds/kick1.mp3'),
    kickButton2: new Audio('./access/sounds/kick2.mp3'),
    kickButton3: new Audio('./access/sounds/kick3.mp3'),
    melodyButton1: new Audio('./access/sounds/melody1.mp3'),
    melodyButton2: new Audio('./access/sounds/melody2.mp3'),
    melodyButton3: new Audio('./access/sounds/melody3.mp3'),
    melodyTopButton1: new Audio('./access/sounds/melodyTop1.wav'),
    melodyTopButton2: new Audio('./access/sounds/melodyTop2.wav'),
    melodyTopButton3: new Audio('./access/sounds/melodyTop3.wav'),
    thirdButton1: new Audio('./access/sounds/third1.wav'),
    thirdButton2: new Audio('./access/sounds/third2.wav'),
    thirdButton3: new Audio('./access/sounds/third3.wav'),
    fourthButton1: new Audio('./access/sounds/fourth1.wav'),
    fourthButton2: new Audio('./access/sounds/fourth2.wav'),
    fourthButton3: new Audio('./access/sounds/fourth3.wav')
  };
  
  // Объект для хранения интервалов
  const intervals = {};
  
  // Глобальная переменная для громкости (0–1)
  let currentVolume = 0.5;
  
  // Переменные для записи звука приложения (без микрофона)
  let audioContext;
  let destination;
  let mediaRecorder;
  let recordedChunks = [];
  
  // Функция воспроизведения звука
  function playSound(buttonId) {
    const sound = audioMap[buttonId];
    if (sound) {
      console.log(`Воспроизведение звука для ${buttonId}, src: ${sound.src}`);
      sound.volume = currentVolume;
      sound.currentTime = 0;
      sound.play()
        .then(() => console.log(`Звук ${buttonId} успешно воспроизведён`))
        .catch(error => console.error(`Ошибка воспроизведения ${buttonId}:`, error));
    } else {
      console.log(`Звук для ${buttonId} не найден`);
    }
  }
  
  // Обновление громкости для всех звуков
  function updateVolume() {
    Object.values(audioMap).forEach(sound => {
      sound.volume = currentVolume;
    });
  }
  
  // Переключение изображения кнопки
  function toggleButtonImage(button) {
    const noImageToggle = ["recordButton", "playButton", "pauseButton", "stopButton"];
    if (noImageToggle.includes(button.id)) return;
    
    let currentSrc = button.getAttribute('src');
    if (currentSrc.includes('_normal')) {
      button.setAttribute('src', currentSrc.replace('_normal', '_pressed'));
    } else if (currentSrc.includes('_pressed')) {
      button.setAttribute('src', currentSrc.replace('_pressed', '_normal'));
    }
  }
  
  // Очистка группы кнопок: для всех кнопок группы, кроме выбранной,
  // сбрасываем состояние, меняем изображение, останавливаем интервалы и (для melodyTop) останавливаем звук.
  function clearGroup(group, exceptButton) {
    const buttons = document.querySelectorAll(`[data-group="${group}"]`);
    buttons.forEach(btn => {
      if (btn !== exceptButton) {
        btn.classList.remove('pressed');
        let src = btn.getAttribute('src');
        if (src.includes('_pressed')) {
          btn.setAttribute('src', src.replace('_pressed', '_normal'));
        }
        btn.style.opacity = '1';
        if (intervals[btn.id]) {
          clearInterval(intervals[btn.id]);
          delete intervals[btn.id];
        }
        // Если группа melodyTop – останавливаем воспроизведение звука
        if (group === "melodyTop" && audioMap[btn.id]) {
           audioMap[btn.id].pause();
           audioMap[btn.id].currentTime = 0;
        }
      }
    });
  }
  
  // Запуск интервалов для всех активных (нажатых) кнопок (каждые 4 секунды)
  // При этом сразу же воспроизводится звук для каждой нажатой кнопки.
  function startAllIntervals() {
    const pressedButtons = document.querySelectorAll(
      '.pressable.pressed:not([id="recordButton"]):not([id="playButton"]):not([id="pauseButton"]):not([id="stopButton"])'
    );
    pressedButtons.forEach(button => {
      if (!intervals[button.id]) {
        playSound(button.id); // Запускаем звук сразу
        intervals[button.id] = setInterval(() => {
          playSound(button.id);
        }, 4000);
      }
    });
  }
  
  // Приостановка всех интервалов и остановка воспроизведения звуков (для кнопки пауза)
  function pauseAllIntervals() {
    Object.keys(intervals).forEach(id => {
      clearInterval(intervals[id]);
    });
    // Остановка воспроизведения всех звуков
    Object.values(audioMap).forEach(sound => {
      if (!sound.paused) {
        sound.pause();
        sound.currentTime = 0;
      }
    });
  }
  
  // Остановка всех интервалов и сброс состояния кнопок (для кнопки стоп)
  function stopAllIntervals() {
    pauseAllIntervals();
    const pressedButtons = document.querySelectorAll('.pressable.pressed');
    pressedButtons.forEach(button => {
      button.classList.remove('pressed');
      toggleButtonImage(button);
      button.style.opacity = '1';
    });
    Object.values(audioMap).forEach(sound => {
      sound.pause();
      sound.currentTime = 0;
    });
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      console.log("Запись остановлена при нажатии stopButton");
    }
    for (let key in intervals) {
      delete intervals[key];
    }
  }
  
  // Инициализация записи приложения (запись воспроизводимых звуков без микрофона)
  function initAudioRecording() {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      destination = audioContext.createMediaStreamDestination();
      Object.values(audioMap).forEach(audio => {
        let source = audioContext.createMediaElementSource(audio);
        source.connect(destination);
        source.connect(audioContext.destination);
      });
    }
  }
  
  // Запуск записи (записываем звук, воспроизводимый в приложении)
  function startRecording() {
    initAudioRecording();
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(destination.stream);
    mediaRecorder.ondataavailable = event => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };
    mediaRecorder.onstop = saveRecording;
    mediaRecorder.start();
    console.log('Запись приложения началась');
  }
  
  // Остановка записи
  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      console.log('Запись приложения остановлена');
    }
  }
  
  // Сохранение записи
  function saveRecording() {
    const blob = new Blob(recordedChunks, { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'recording.wav';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
  
  // Обработчик клика по кнопке
  function buttonClickHandler(event) {
    const button = event.currentTarget;
    const controlButtons = ["recordButton", "playButton", "pauseButton", "stopButton"];
    
    console.log(`Клик по кнопке ${button.id}`);
    
    if (controlButtons.includes(button.id)) {
      if (button.id === "recordButton") {
        button.classList.toggle('pressed');
        button.style.opacity = button.classList.contains('pressed') ? '0.7' : '1';
        if (button.classList.contains('pressed')) {
          startRecording();
        } else {
          stopRecording();
        }
      } else if (button.id === "playButton") {
        // При нажатии "плей" возобновляем воспроизведение для всех активных кнопок
        startAllIntervals();
      } else if (button.id === "pauseButton") {
        pauseAllIntervals();
      } else if (button.id === "stopButton") {
        stopAllIntervals();
      }
      setTimeout(() => {
        button.style.opacity = button.classList.contains('pressed') ? '0.7' : '1';
      }, 100);
      return;
    }
    
    // Если кнопка принадлежит группе, сбрасываем состояние остальных в этой группе
    const group = button.getAttribute('data-group');
    if (group) {
      clearGroup(group, button);
    }
    
    button.classList.toggle('pressed');
    toggleButtonImage(button);
    button.style.opacity = button.classList.contains('pressed') ? '0.7' : '1';
    
    if (button.classList.contains('pressed')) {
      playSound(button.id);
      intervals[button.id] = setInterval(() => {
        playSound(button.id);
      }, 4000);
    } else {
      if (intervals[button.id]) {
        clearInterval(intervals[button.id]);
        delete intervals[button.id];
      }
    }
  }
  
  // Инициализация приложения
  document.addEventListener('DOMContentLoaded', function() {
    const buttons = document.querySelectorAll('.pressable');
    buttons.forEach(button => {
      if (button.id) {
        button.addEventListener('click', buttonClickHandler);
      }
    });
    
    const volumeSlider = document.getElementById('volumeSlider');
    if (volumeSlider) {
      volumeSlider.addEventListener('input', function() {
        currentVolume = volumeSlider.value / 100;
        updateVolume();
        console.log(`Громкость изменена на ${currentVolume}`);
      });
    }
  });
  