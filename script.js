// script.js

// Глобальные настройки
const BPM = 120;
const beatDuration = (60 / BPM) * 1000;
const loopDuration = beatDuration * 4;

let isPlaying = false;
let globalTimer = null;
const activeSounds = {};
let currentVolume = 1; // Громкость по умолчанию

// Карта аудио и путей
const audioMap = {
    kickButton1: null,
    kickButton2: null,
    kickButton3: null,
    melodyButton1: null,
    melodyButton2: null,
    melodyButton3: null,
    melodyTopButton1: null,
    melodyTopButton2: null,
    melodyTopButton3: null,
    thirdButton1: null,
    thirdButton2: null,
    thirdButton3: null,
    fourthButton1: null,
    fourthButton2: null,
    fourthButton3: null
};

const audioPaths = {
    kickButton1: '/3311/access/sounds/kick1.mp3',
    kickButton2: '/3311/access/sounds/kick2.mp3',
    kickButton3: '/3311/access/sounds/kick3.mp3',
    melodyButton1: '/3311/access/sounds/melody1.mp3',
    melodyButton2: '/3311/access/sounds/melody2.mp3',
    melodyButton3: '/3311/access/sounds/melody3.mp3',
    melodyTopButton1: '/3311/access/sounds/melody1.mp3',
    melodyTopButton2: '/3311/access/sounds/melody2.mp3',
    melodyTopButton3: '/3311/access/sounds/melody3.mp3',
    thirdButton1: '/3311/access/sounds/third1.mp3',
    thirdButton2: '/3311/access/sounds/third2.mp3',
    thirdButton3: '/3311/access/sounds/third3.mp3',
    fourthButton1: '/3311/access/sounds/fourth1.mp3',
    fourthButton2: '/3311/access/sounds/fourth2.mp3',
    fourthButton3: '/3311/access/sounds/fourth3.mp3'
};

// Настройка записи
const audioContext = new (window.AudioContext || window.webkitAudioContext)();
const destination = audioContext.createMediaStreamDestination();
const mediaRecorder = new MediaRecorder(destination.stream);
let chunks = [];
const sources = {};

function loadAudio(buttonId) {
    if (!audioMap[buttonId]) {
        audioMap[buttonId] = new Audio(audioPaths[buttonId]);
        audioMap[buttonId].load();
        audioMap[buttonId].volume = currentVolume;
        const source = audioContext.createMediaElementSource(audioMap[buttonId]);
        source.connect(destination);
        source.connect(audioContext.destination);
        sources[buttonId] = source;
    }
}

mediaRecorder.ondataavailable = function(e) {
    chunks.push(e.data);
};

mediaRecorder.onstop = function() {
    const blob = new Blob(chunks, { type: 'audio/wav' });
    chunks = [];
    sendAudioToUser(blob);
};

// Отправка в Telegram
function sendAudioToUser(blob) {
    const chatId = window.Telegram.WebApp.initDataUnsafe.user.id;
    const botToken = '8053491578:AAGSIrd3qdvzGh-ZU4SmTJjsKOMHmcKNr3c'; // Замените на ваш токен

    const formData = new FormData();
    formData.append('chat_id', chatId);
    formData.append('audio', blob, 'recording.wav');

    fetch(`https://api.telegram.org/bot${botToken}/sendAudio`, {
        method: 'POST',
        body: formData
    })
        .then(response => response.json())
        .then(data => {
            if (data.ok) {
                console.log('Audio sent!');
                Telegram.WebApp.showAlert('Recording sent!');
            } else {
                console.error('Error:', data);
                Telegram.WebApp.showAlert('Error sending recording');
            }
        })
        .catch(error => {
            console.error('Fetch error:', error);
            Telegram.WebApp.showAlert('Error sending recording');
        });
}

// Управление глобальным таймером
function startGlobalTimer() {
    if (!isPlaying) {
        isPlaying = true;
        globalTimer = setInterval(() => {
            playActiveSounds();
        }, loopDuration);
    }
}

function stopGlobalTimer() {
    if (isPlaying) {
        isPlaying = false;
        clearInterval(globalTimer);
        globalTimer = null;
    }
}

function playActiveSounds() {
    Object.keys(activeSounds).forEach(buttonId => {
        if (activeSounds[buttonId]) {
            const sound = audioMap[buttonId];
            if (sound) {
                sound.currentTime = 0;
                sound.play().catch(error => console.error(`Error playing ${buttonId}:`, error));
            }
        }
    });
}

// Переключение изображений
function toggleButtonImage(button) {
    const isPressed = button.classList.contains('pressed');
    const baseSrc = button.src.split('_')[0];
    button.src = isPressed ? `${baseSrc}_pressed.png` : `${baseSrc}_normal.png`;
}

// Плавное затухание
function fadeOutSound(sound, duration = 500) {
    if (!sound) return;
    let volume = sound.volume;
    const step = volume / (duration / 50);
    const fadeInterval = setInterval(() => {
        volume -= step;
        if (volume <= 0) {
            sound.pause();
            sound.currentTime = 0;
            sound.volume = currentVolume;
            clearInterval(fadeInterval);
        } else {
            sound.volume = volume;
        }
    }, 50);
}

// Обновление громкости
function updateVolume() {
    Object.values(audioMap).forEach(sound => {
        if (sound) sound.volume = currentVolume;
    });
}

// Обработчик клика
function buttonClickHandler(event) {
    const button = event.currentTarget;
    const buttonId = button.id;

    const controlButtons = ["recordButton", "playButton", "stopButton"];
    if (controlButtons.includes(buttonId)) {
        if (buttonId === "recordButton") {
            button.classList.toggle('pressed');
            if (button.classList.contains('pressed')) {
                mediaRecorder.start();
                console.log("Recording started");
            } else {
                mediaRecorder.stop();
                console.log("Recording stopped");
            }
        } else if (buttonId === "playButton") {
            startGlobalTimer();
        } else if (buttonId === "stopButton") {
            stopGlobalTimer();
            Object.keys(activeSounds).forEach(id => {
                const btn = document.getElementById(id);
                if (btn) {
                    btn.classList.remove('pressed');
                    toggleButtonImage(btn);
                }
                activeSounds[id] = false;
                const sound = audioMap[id];
                if (sound) fadeOutSound(sound);
            });
            if (mediaRecorder.state === 'recording') {
                mediaRecorder.stop();
                const recordBtn = document.getElementById('recordButton');
                if (recordBtn) {
                    recordBtn.classList.remove('pressed');
                    toggleButtonImage(recordBtn);
                }
            }
        }
        return;
    }

    button.classList.toggle('pressed');
    toggleButtonImage(button);
    activeSounds[buttonId] = button.classList.contains('pressed');

    if (!isPlaying && activeSounds[buttonId]) {
        startGlobalTimer();
    }

    if (!Object.values(activeSounds).some(state => state)) {
        stopGlobalTimer();
    }

    if (activeSounds[buttonId]) {
        loadAudio(buttonId);
        const sound = audioMap[buttonId];
        if (sound) {
            sound.currentTime = 0;
            sound.play().catch(error => console.error(`Error playing ${buttonId}:`, error));
        }
    } else {
        const sound = audioMap[buttonId];
        fadeOutSound(sound);
    }
}

// Инициализация
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
            currentVolume = this.value / 100;
            updateVolume();
        });
    }

    if (window.Telegram && window.Telegram.WebApp) {
        console.log("Telegram Web App SDK loaded!");
        Telegram.WebApp.ready();
        Telegram.WebApp.expand();
        const user = Telegram.WebApp.initDataUnsafe.user;
        if (user) {
            console.log("User:", user.first_name, user.id);
        }
    }
});
