const TelegramBot = require('node-telegram-bot-api');

// Экспортируем функцию для Netlify
exports.handler = async (event, context) => {
  try {
    // Инициализируем бота с токеном из переменных окружения
    const bot = new TelegramBot(process.env.BOT_TOKEN);

    // Устанавливаем вебхук для бота (выполняется один раз при деплое)
    const webhookUrl = `https://creatmy.netlify.app/.netlify/functions/telegram-bot`;
    await bot.setWebHook(webhookUrl);

    // Парсим входящее событие от Telegram
    const body = JSON.parse(event.body);

    // Проверяем, что это команда /start
    if (body.message && body.message.text === '/start') {
      const chatId = body.message.chat.id;

      // Приветственное сообщение с инструкцией
      const welcomeMessage = `
🎵 *Добро пожаловать в Music App!* 🎵

Это приложение позволяет создавать крутые биты и мелодии прямо в Telegram! Вот как начать:

1. Нажмите на кнопку ниже, чтобы открыть приложение.
2. Выберите мелодию с помощью верхних кнопок.
3. Добавляйте звуки (Kick, Melody и другие) на дорожку, нажимая на центральные кнопки.
4. Используйте нижние кнопки для записи, воспроизведения, паузы и остановки.
5. Запишите свой трек и отправьте его в чат!

Нажмите кнопку ниже, чтобы начать творить! 👇
      `;

      // Кнопка для открытия Mini App
      const options = {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🎧 Открыть Music App',
                url: `https://t.me/testsupertestpupertest_bot/creatmy`,
              },
            ],
          ],
        },
        parse_mode: 'Markdown',
      };

      // Отправляем сообщение
      await bot.sendMessage(chatId, welcomeMessage, options);

      return {
        statusCode: 200,
        body: JSON.stringify({ status: 'Message sent' }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ status: 'No action' }),
    };
  } catch (error) {
    console.error('Error in Telegram bot:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};