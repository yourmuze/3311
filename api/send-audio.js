import fetch from 'node-fetch';
import { Readable } from 'stream';
import FormData from 'form-data';

export default async (req, res) => {
  try {
    // Получаем данные из запроса
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const audioBuffer = Buffer.concat(chunks);
    const chatId = req.headers['chat-id'];

    // Создаем поток для аудио
    const audioStream = new Readable();
    audioStream.push(audioBuffer);
    audioStream.push(null);

    // Формируем FormData
    const form = new FormData();
    form.append('chat_id', chatId);
    form.append('audio', audioStream, {
      filename: 'recording.webm',
      contentType: 'audio/webm',
    });

    // Отправляем в Telegram API
    const response = await fetch(
      `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendAudio`,
      {
        method: 'POST',
        body: form,
        headers: form.getHeaders(),
      }
    );

    const result = await response.json();
    console.log('Ответ Telegram API:', result); // Добавьте эту строку
    res.status(200).json(result);

  } catch (error) {
    console.error('Ошибка:', error);
    res.status(500).json({ 
      error: error.message,
      stack: error.stack 
    });
  }
};