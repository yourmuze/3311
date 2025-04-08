const fetch = require('node-fetch');
const FormData = require('form-data');

module.exports = async (req, res) => {
  try {
    const buffer = await req.arrayBuffer();
    const chatId = req.headers['chat-id'];
    
    if (!buffer.byteLength) return res.status(400).json({ error: "Пустой файл" });
    if (!chatId) return res.status(400).json({ error: "Не указан chat_id" });

    const form = new FormData();
    form.append('chat_id', chatId);
    form.append('audio', Buffer.from(buffer), {
      filename: 'recording.mp3',
      contentType: 'audio/mpeg',
    });

    const response = await fetch(
      `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendAudio`,
      {
        method: 'POST',
        body: form,
        headers: form.getHeaders(),
      }
    );

    const result = await response.json();
    res.status(200).json(result);

  } catch (error) {
    console.error('Ошибка:', error);
    res.status(500).json({ error: error.message });
  }
};