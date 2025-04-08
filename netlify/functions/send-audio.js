const fetch = require('node-fetch');
const BOT_TOKEN = '8053491578:AAGSIrd3qdvzGh-ZU4SmTJjsKOMHmcKNr3c';
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

exports.handler = async (event) => {
  console.log('Функция send-audio вызвана');
  console.log('Event:', event);

  try {
    // Проверяем Content-Type
    const contentType = event.headers['content-type'];
    console.log('Content-Type:', contentType);
    if (!contentType || !contentType.includes('multipart/form-data')) {
      console.log('Неправильный Content-Type');
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Ожидается multipart/form-data' }),
      };
    }

    // Декодируем тело запроса из base64
    const bodyBuffer = Buffer.from(event.body, 'base64');
    const boundary = `--${contentType.split('boundary=')[1]}`;
    
    // Разделяем тело на части по границе
    const parts = bodyBuffer.toString('binary').split(boundary);
    let chatId, audioBuffer;

    for (let part of parts) {
      if (!part || part.trim() === '--') continue; // Пропускаем пустые части

      // Ищем chat_id
      if (part.includes('name="chat_id"')) {
        const match = part.match(/name="chat_id"\r\n\r\n(.+?)\r\n/);
        if (match) {
          chatId = match[1].trim();
          console.log('Chat ID:', chatId);
        }
      }

      // Ищем audio
      if (part.includes('name="audio"')) {
        // Извлекаем заголовки и тело
        const lines = part.split('\r\n');
        let dataStartIndex = -1;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i] === '') {
            dataStartIndex = i + 1;
            break;
          }
        }

        if (dataStartIndex === -1) {
          console.log('Не удалось найти начало данных файла');
          continue;
        }

        // Извлекаем двоичные данные файла
        const rawDataLines = lines.slice(dataStartIndex).join('\r\n');
        const dataEndIndex = rawDataLines.lastIndexOf('\r\n--');
        const rawData = dataEndIndex !== -1 ? rawDataLines.substring(0, dataEndIndex) : rawDataLines;

        // Преобразуем в Buffer
        audioBuffer = Buffer.from(rawData, 'binary');
        console.log('Размер аудиофайла:', audioBuffer.length);
      }
    }

    if (!chatId) {
      console.log('chat_id отсутствует');
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'chat_id не передан' }),
      };
    }
    if (!audioBuffer || audioBuffer.length === 0) {
      console.log('Аудиофайл не передан или пустой');
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Аудиофайл не передан или пустой' }),
      };
    }

    const formData = new FormData();
    formData.append('chat_id', chatId);
    formData.append('audio', audioBuffer, 'recording.mp3');

    console.log('Отправка в Telegram API...');
    const response = await fetch(`${TELEGRAM_API}/sendAudio`, {
      method: 'POST',
      body: formData,
    });
    const result = await response.json();
    console.log('Ответ Telegram API:', result);

    if (result.ok) {
      console.log('Успешная отправка в Telegram');
      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ message: 'Мелодия отправлена в Telegram' }),
      };
    } else {
      console.log('Ошибка Telegram:', result.description);
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: `Ошибка Telegram: ${result.description}` }),
      };
    }
  } catch (error) {
    console.error('Ошибка сервера:', error.stack);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: `Ошибка сервера: ${error.message}` }),
    };
  }
};