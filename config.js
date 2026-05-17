/*
 * TARRIFIC HOSTING BOT - CONFIG
 * Edit these values before starting
 */

module.exports = {
  // Bot Token (get from @BotFather)
  botToken: process.env.BOT_TOKEN || 'fallback_token_here',

  // Bot username (without @)
  botUsername: 'TARRIFICFREEHOSTINGBOT',

  // Bot name displayed to users
  botName: 'TARRIFIC FREE HOSTING',

  // Owner Telegram ID
  ownerId: '7680286319',

  // Owner username (without @)
  ownerUsername: 'LORDTARRIFIC',

  // Admin IDs (array of strings)
  adminIds: ['7680286319'],

  // Force join channels (format: @channelusername or https://t.me/channel)
  forceJoinChannels: [
    '@HOSTINGPROOF',
    '@lonerterritorybackagain'
  ],

  // Channel display names (for buttons)
  channelNames: [
    'Main Channel',
    'Backup Channel'
  ],

  // Proof channel (where referral proofs are sent)
  proofChannel: '@HOSTINGPROOF',

  // Welcome image path (relative to bot folder)
  welcomeImage: './media/welcome.jpg',

  // Required referrals to unlock hosting (free tier)
  requiredReferrals: 5,

  // Starting port for hosted bots
  startPort: 45600,

  // Use PM2 for process management (DISABLED for Render - managed by platform)
  usePM2: false,

  // Max file size for uploads (in bytes)
  maxFileSize: 10485760, // 10MB

  // Premium pricing (Stars)
  starPrices: {
    slots5: 500,
    slots10: 900,
    unlimited: 1500
  }
};
