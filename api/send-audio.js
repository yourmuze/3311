import fetch from 'node-fetch';

export default async (req, res) => {
  try {
    // Получаем аудио и chat_id из запроса
    const audioBlob = await req.blob();
    const chatId = req.headers.get('chat-id');

    // Формируем запрос к Telegram API
    const formData = new FormData();
    formData.append('chat_id', chatId);
    formData.append('audio', audioBlob, 'recording.webm');

    const response = await fetch(
      `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendAudio`,
      {
        method: 'POST',
        body: formData,
      }
    );

    const result = await response.json();
    res.status(200).json(result);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};