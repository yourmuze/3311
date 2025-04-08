const multer = require('multer');
const fetch = require('node-fetch');

const upload = multer({ storage: multer.memoryStorage() });
const BOT_TOKEN = '8053491578:AAGSIrd3qdvzGh-ZU4SmTJjsKOMHmcKNr3c';
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Middleware для обработки FormData
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
    await runMiddleware(req, res, upload.single('audio'));

    console.log('req.body:', req.body); // Отладка
    console.log('req.file:', req.file);

    const chatId = req.body.chat_id;
    if (!chatId) {
      console.error('chat_id не передан');
      return res.status(400).send('Ошибка: chat_id не передан');
    }

    if (!req.file || !req.file.buffer) {
      console.error('Файл не получен');
      return res.status(400).send('Ошибка: аудиофайл не передан');
    }

    const audioBuffer = req.file.buffer;
    console.log('Размер audioBuffer:', audioBuffer.length);

    const formData = new FormData();
    formData.append('chat_id', chatId);
    formData.append('audio', audioBuffer, 'recording.wav');

    const response = await fetch(`${TELEGRAM_API}/sendAudio`, {
      method: 'POST',
      body: formData,
    });
    const result = await response.json();

    if (result.ok) {
      res.status(200).send('Мелодия отправлена в Telegram');
    } else {
      console.error('Ошибка Telegram:', result.description);
      res.status(500).send(`Ошибка Telegram: ${result.description}`);
    }
  } catch (error) {
    console.error('Ошибка сервера:', error.message);
    res.status(500).send(`Ошибка сервера: ${error.message}`);
  }
};