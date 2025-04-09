// recorder.js
export async function requestMicPermission() {
    console.log('requestMicPermission вызвана');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.error('navigator.mediaDevices не поддерживается. Проверьте, используется ли HTTPS.');
      window.Telegram.WebApp.showAlert('Ошибка: доступ к микрофону не поддерживается. Используйте HTTPS.');
      return false;
    }
  
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('Доступ к микрофону получен');
      return true;
    } catch (err) {
      console.error('Ошибка доступа к микрофону:', err);
      window.Telegram.WebApp.showAlert('Ошибка доступа к микрофону. Разрешите доступ в настройках.');
      return false;
    }
  }
  
  export function setupRecorder(mediaRecorder, chunks, appState, audioContext, sendMelodyToChat) {
    let worker;
    let abortController = null;
  
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
      chunks.length = 0; // Очищаем chunks
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
        worker = new Worker('worker.js');
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
  }
  
  export async function sendMelodyToChat(melodySrc, chatId) {
    console.log('sendMelodyToChat вызвана с melodySrc:', melodySrc, 'chatId:', chatId);
    let abortController = null;
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
          'Accept': 'application/json',
        },
        signal: abortController.signal,
      }).catch(error => {
        console.error('Network Error:', error);
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