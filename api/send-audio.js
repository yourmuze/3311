const FormData = require('form-data');
const fetch = require('node-fetch');

const BOT_TOKEN = '8053491578:AAGSIrd3qdvzGh-ZU4SmTJjsKOMHmcKNr3c';
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const chatId = req.body.chat_id;
  const audioBuffer = Buffer.from(req.files.audio.data);

  const formData = new FormData();
  formData.append('chat_id', chatId);
  formData.append('audio', audioBuffer, 'recording.mp3');

  try {
    const response = await fetch(`${TELEGRAM_API}/sendAudio`, {
      method: 'POST',
      body: formData,
    });
    const result = await response.json();
    if (result.ok) {
      res.status(200).send('Мелодия отправлена');
    } else {
      res.status(500).send(`Ошибка Telegram: ${result.description}`);
    }
  } catch (error) {
    res.status(500).send(`Ошибка сервера: ${error.message}`);
    console.error(error);
  }
};