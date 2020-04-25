const TelegramBot = require('node-telegram-bot-api');
const config = require('./config')
const fs = require('fs')
const bot = new TelegramBot(config.token, { polling: true })
bot.on('message', async (msg) => {
    const chatId = msg.chat.id
    //if (!!msg.channel_post) await bot.deleteMessage(msg.chat.id, msg.message_id)
    console.log(msg)
    if (msg.from.id === config.botOwner && !!msg.video) {
        //console.log(msg)
        //let thumb = await bot.sendPhoto(msg.chat.id, 'bot.jpg')
        //console.log(thumb)
        bot.sendVideo(config.botTargetChan, msg.video.file_id, {
            caption: msg.caption,
            //thumb: thumb.photo[thumb.photo.length - 1].file_id,
        })
        //bot.deleteMessage(msg.chat.id, msg.message_id)
        //bot.deleteMessage(msg.chat.id, thumb.message_id)
    }
    // send a message to the chat acknowledging receipt of their message
})