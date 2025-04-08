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

    // Декодируем тело запроса из base64 (Netlify передаёт body в base64)
    const bodyBuffer = Buffer.from(event.body, 'base64');
    const boundary = contentType.split('boundary=')[1];
    const parts = bodyBuffer.toString('binary').split(`--${boundary}`);

    let chatId, audioBuffer;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part.includes('name="chat_id"')) {
        chatId = part.split('\r\n\r\n')[1]?.split('\r\n')[0]?.trim();
        console.log('Chat ID:', chatId);
      }
      if (part.includes('name="audio"')) {
        // Извлекаем заголовки и данные
        const [header, ...dataParts] = part.split('\r\n\r\n');
        const dataEnd = dataParts.join('\r\n\r\n').lastIndexOf('\r\n--');
        const rawData = dataEnd !== -1 ? dataParts.join('\r\n\r\n').substring(0, dataEnd) : dataParts.join('\r\n\r\n');
        
        // Двоичные данные файла
        audioBuffer = Buffer.from(rawData, 'binary');
        console.log('Размер аудиофайла:', audioBuffer?.length);
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
    if (!audioBuffer) {
      console.log('Аудиофайл не передан');
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Аудиофайл не передан' }),
      };
    }

    const formData = new FormData();
    formData.append('chat_id', chatId);
    // Передаём audioBuffer как Buffer (node-fetch преобразует его в Blob)
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