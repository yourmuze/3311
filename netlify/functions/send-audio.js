const fetch = require('node-fetch');
const Busboy = require('busboy');
const BOT_TOKEN = '8053491578:AAGSIrd3qdvzGh-ZU4SmTJjsKOMHmcKNr3c';
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

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

    // Обрабатываем поля
    busboy.on('field', (name, value) => {
      if (name === 'chat_id') {
        chatId = value;
        console.log('Chat ID:', chatId);
      }
    });

    // Обрабатываем файл
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

    // Ожидаем завершения парсинга
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

    // Передаём bodyBuffer в busboy
    busboy.end(bodyBuffer);

    // Ждём завершения парсинга
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

    const formData = new FormData();
    formData.append('chat_id', parsedChatId);
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