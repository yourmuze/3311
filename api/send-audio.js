import fetch from 'node-fetch';
import { Readable } from 'stream';
import FormData from 'form-data';

export default async (req, res) => {
  try {
    // 1. Получаем данные
    const buffer = await req.arrayBuffer();
    const chatId = req.headers['chat-id'];
    
    // 2. Проверки
    if (!buffer.byteLength) {
      return res.status(400).json({ error: "Пустой файл" });
    }
    if (!chatId) {
      return res.status(400).json({ error: "Не указан chat_id" });
    }

    // 3. Создаем поток
    const audioStream = new Readable();
    audioStream.push(Buffer.from(buffer));
    audioStream.push(null);

    // 4. Формируем запрос
    const form = new FormData();
    form.append('chat_id', chatId);
    form.append('audio', audioStream, {
      filename: 'recording.mp3',
      contentType: 'audio/mpeg',
    });

    // 5. Отправляем в Telegram
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
    console.error('Ошибка сервера:', error);
    res.status(500).json({ error: error.message });
  }
};