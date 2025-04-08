const fetch = require('node-fetch');
const formidable = require('formidable');
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

    // Парсим multipart/form-data с помощью formidable
    const form = new formidable.IncomingForm();
    const bodyBuffer = Buffer.from(event.body, 'base64');

    const { fields, files } = await new Promise((resolve, reject) => {
      form.parse(bodyBuffer, (err, fields, files) => {
        if (err) reject(err);
        else resolve({ fields, files });
      });
    });

    console.log('Fields:', fields);
    console.log('Files:', files);

    const chatId = fields.chat_id?.[0];
    const audioFile = files.audio?.[0];

    if (!chatId) {
      console.log('chat_id отсутствует');
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'chat_id не передан' }),
      };
    }

    if (!audioFile || !audioFile.filepath) {
      console.log('Аудиофайл не передан');
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Аудиофайл не передан' }),
      };
    }

    // Читаем файл из временного пути, созданного formidable
    const fs = require('fs').promises;
    const audioBuffer = await fs.readFile(audioFile.filepath);
    console.log('Размер аудиофайла:', audioBuffer.length);

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