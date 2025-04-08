const fetch = require('node-fetch');
const Busboy = require('busboy');
const FormData = require('form-data');
const BOT_TOKEN = '8053491578:AAGSIrd3qdvzGh-ZU4SmTJjsKOMHmcKNr3c';
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const MAX_FILE_SIZE = 50 * 1024 * 1024;

exports.handler = async (event) => {
  console.log('Функция send-audio вызвана');
  console.log('Event:', event);

  try {
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

    const bodyBuffer = Buffer.from(event.body, 'base64');
    const busboy = Busboy({ headers: { 'content-type': contentType } });

    let chatId;
    const audioChunks = [];

    busboy.on('field', (name, value) => {
      if (name === 'chat_id') {
        chatId = value;
        console.log('Chat ID:', chatId);
      }
    });

    busboy.on('file', (name, file, info) => {
      if (name === 'audio') {
        console.log('Обнаружен файл:', info);
        file.on('data', (data) => {
          audioChunks.push(data);
        });
        file.on('end', () => {
          console.log('Файл полностью получен');
        });
      }
    });

    const parsePromise = new Promise((resolve, reject) => {
      busboy.on('finish', () => {
        const audioBuffer = Buffer.concat(audioChunks);
        console.log('Размер аудиофайла:', audioBuffer.length);
        console.log('Первые 10 байт аудиофайла:', audioBuffer.slice(0, 10).toString('hex'));
        resolve({ chatId, audioBuffer });
      });
      busboy.on('error', (error) => {
        console.error('Ошибка парсинга busboy:', error);
        reject(error);
      });
    });

    busboy.end(bodyBuffer);

    const { chatId: parsedChatId, audioBuffer } = await parsePromise;

    if (!parsedChatId) {
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

    if (audioBuffer.length > MAX_FILE_SIZE) {
      console.log('Файл слишком большой:', audioBuffer.length);
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: `Файл слишком большой (${(audioBuffer.length / 1024 / 1024).toFixed(2)} МБ). Максимум 50 МБ.` }),
      };
    }

    const formData = new FormData();
    formData.append('chat_id', parsedChatId);
    formData.append('audio', audioBuffer, { filename: 'recording.mp3', contentType: 'audio/mp3' });

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
      let errorMessage = result.description;
      if (result.description.includes('wrong file type')) {
        errorMessage = 'Неправильный формат файла. Попробуйте записать более длинное аудио или использовать WAV.';
      } else if (result.description.includes('file is too big')) {
        errorMessage = 'Файл слишком большой. Максимум 50 МБ.';
      }
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: `Ошибка Telegram: ${errorMessage}` }),
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