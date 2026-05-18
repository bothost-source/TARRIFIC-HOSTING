/*
 * CLOUD BRIDGE - Runs FREE on Railway/Render
 * Just holds messages when your phone is offline
 */

const { Telegraf } = require('telegraf');
const express = require('express');

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();
app.use(express.json());

// Store messages in memory (Railway restarts daily, but that's okay)
let messageQueue = [];

// When someone messages your bot
bot.on('message', async (ctx) => {
  const msg = {
    userId: ctx.from.id,
    username: ctx.from.username || '',
    firstName: ctx.from.first_name || 'User',
    text: ctx.message.text || '',
    messageId: ctx.message.message_id,
    chatId: ctx.chat.id,
    time: Date.now()
  };

  messageQueue.push(msg);

  // Keep only last 100 messages to save memory
  if (messageQueue.length > 100) messageQueue.shift();

  console.log(`[QUEUED] ${msg.firstName}: ${msg.text}`);

  // Tell user their message is saved
  await ctx.reply('⏳ Bot owner is currently offline. Your message will be delivered when they come online.\n\n💡 Tip: Use /mybots to manage your bots anytime.');
});

// Your phone calls this to get messages
app.get('/get-messages', (req, res) => {
  const messages = [...messageQueue];
  messageQueue = []; // Clear after sending
  console.log(`[SENT] ${messages.length} messages to phone`);
  res.json({ messages, count: messages.length });
});

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'cloud-bridge-online',
    queuedMessages: messageQueue.length,
    uptime: process.uptime()
  });
});

// Start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[CLOUD BRIDGE] Running on port ${PORT}`);
  console.log(`[CLOUD BRIDGE] Webhook: /webhook`);
  console.log(`[CLOUD BRIDGE] Phone endpoint: /get-messages`);
});

// Webhook for Telegram
app.use(bot.webhookCallback('/webhook'));

// Set webhook (run once, or use polling locally)
const WEBHOOK_URL = process.env.WEBHOOK_URL; // e.g., https://your-app.railway.app/webhook
if (WEBHOOK_URL) {
  bot.telegram.setWebhook(WEBHOOK_URL);
  console.log(`[WEBHOOK SET] ${WEBHOOK_URL}`);
} else {
  // Fallback to polling for local testing
  bot.launch();
  console.log('[POLLING MODE] No webhook URL set');
}
