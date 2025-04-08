const multer = require('multer');
const fetch = require('node-fetch');

const upload = multer({ storage: multer.memoryStorage() });
const BOT_TOKEN = '8053491578:AAGSIrd3qdvzGh-ZU4SmTJjsKOMHmcKNr3c';
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const runMiddleware = (req, res, fn) => {
  return new Promise((resolve, reject) => {
    fn(req, res, (result) => {
      if (result instanceof Error) return reject(result);
      return resolve(result);
    });
  });
};

module.exports = async (req, res) => {
  try {
    console.log('Начало обработки /api/send-audio');
    console.log('req.headers:', req.headers);

    await runMiddleware(req, res, upload.single('audio'));
    console.log('После multer. req.body:', req.body);
    console.log('req.file:', req.file);

    const chatId = req.body?.chat_id;
    if (!chatId) {
      console.error('chat_id отсутствует');
      return res.status(400).send('Ошибка: chat_id не передан');
    }

    if (!req.file || !req.file.buffer) {
      console.error('Файл не получен');
      return res.status(400).send('Ошибка: аудиофайл не передан');
    }

    console.log('Размер файла:', req.file.buffer.length);

    const formData = new FormData();
    formData.append('chat_id', chatId);
    formData.append('audio', req.file.buffer, 'recording.mp3'); // Теперь MP3

    console.log('Отправка в Telegram API...');
    const response = await fetch(`${TELEGRAM_API}/sendAudio`, {
      method: 'POST',
      body: formData,
    });
    const result = await response.json();
    console.log('Ответ Telegram API:', result);

    if (result.ok) {
      res.status(200).send('Мелодия отправлена в Telegram');
    } else {
      console.error('Ошибка Telegram:', result.description);
      res.status(500).send(`Ошибка Telegram: ${result.description}`);
    }
  } catch (error) {
    console.error('Ошибка сервера:', error.stack);
    res.status(500).send(`Ошибка сервера: ${error.message}`);
  }
};