import json
import os
import logging
from telegram import Bot, Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Dispatcher, CommandHandler

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Получаем токен бота из переменных окружения
BOT_TOKEN = os.getenv("8053491578:AAGSIrd3qdvzGh-ZU4SmTJjsKOMHmcKNr3c")

# Инициализируем бота
bot = Bot(token=BOT_TOKEN)
dispatcher = Dispatcher(bot, None, workers=0)

# Функция для обработки команды /start
def start(update: Update, context):
    logger.info("Получена команда /start")
    chat_id = update.message.chat_id

    # Приветственное сообщение
    welcome_message = (
        "🎵 *Добро пожаловать в Music App!* 🎵\n\n"
        "Это приложение позволяет создавать крутые биты и мелодии прямо в Telegram! Вот как начать:\n\n"
        "1. Нажмите на кнопку ниже, чтобы открыть приложение.\n"
        "2. Выберите мелодию с помощью верхних кнопок.\n"
        "3. Добавляйте звуки (Kick, Melody и другие) на дорожку, нажимая на центральные кнопки.\n"
        "4. Используйте нижние кнопки для записи, воспроизведения, паузы и остановки.\n"
        "5. Запишите свой трек и отправьте его в чат!\n\n"
        "Нажмите кнопку ниже, чтобы начать творить! 👇"
    )

    # Кнопка для открытия Mini App
    keyboard = [
        [InlineKeyboardButton("🎧 Открыть Music App", url="https://t.me/testsupertestpupertest_bot/creatmy")]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)

    # Отправляем сообщение
    bot.send_message(
        chat_id=chat_id,
        text=welcome_message,
        parse_mode="Markdown",
        reply_markup=reply_markup
    )
    logger.info(f"Сообщение отправлено в чат {chat_id}")

# Добавляем обработчик команды /start
dispatcher.add_handler(CommandHandler("start", start))

# Основная функция для Netlify
def handler(event, context):
    try:
        logger.info("Получен запрос от Telegram")
        logger.info(f"Event: {event}")

        # Парсим входящий запрос
        body = event.get("body")
        if not body:
            logger.error("Body отсутствует в запросе")
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "No body provided"})
            }

        update = Update.de_json(json.loads(body), bot)
        if not update:
            logger.error("Не удалось распарсить update")
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "Invalid update"})
            }

        # Обрабатываем обновление
        dispatcher.process_update(update)

        return {
            "statusCode": 200,
            "body": json.dumps({"status": "Update processed"})
        }

    except Exception as e:
        logger.error(f"Ошибка в обработке запроса: {str(e)}")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)})
        }