# TARRIFIC HOSTING BOT

Deploy user bots (JS, Python, etc.) via Telegram with referral system.

## Features

- **File Upload**: Users upload .js, .py, .sh, .rb, .php, .go files
- **Auto Deploy**: Automatically starts on assigned port
- **Referral System**: Must invite 5 friends to unlock free hosting
- **Premium**: Buy more slots via Telegram Stars or manual payment
- **Force Join**: Users must join channels to use bot
- **Proof Channel**: Sends proof when referrals complete
- **Admin Panel**: Manage all bots, users, broadcast messages
- **Logs**: View bot logs directly in Telegram

## Setup

1. Edit `config.js`:
   - Add your bot token from @BotFather
   - Set your owner ID and admin IDs
   - Set force join channels
   - Set proof channel

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create media folder and add welcome image:
   ```bash
   mkdir media
   # Add welcome.jpg to media/
   ```

4. Start the bot:
   ```bash
   npm start
   # Or with PM2:
   npm run pm2
   ```

## Commands

| Command | Description |
|---------|-------------|
| /start | Main menu with welcome image |
| /host | Deploy a new bot |
| /mybots | View your deployed bots |
| /referral | Check referral status |
| /premium | Buy premium plans |
| /help | Help menu |

## Admin Commands

| Command | Description |
|---------|-------------|
| /addpremium <userId> <slots> <days> | Add premium to user |
| /stopbot <botId> | Stop any bot |
| /broadcast <message> | Message all users |

## User Flow

1. User starts bot → sees welcome image
2. Must join force channels → click "I Have Joined"
3. Need 5 referrals OR buy premium
4. Upload bot file → set env vars (optional)
5. Bot deploys automatically
6. Manage via "My Bots" menu

## Premium Plans

| Plan | Slots | Price (Stars) |
|------|-------|---------------|
| Basic | 5 | 500 |
| Pro | 10 | 900 |
| Unlimited | ∞ | 1500 |

## File Structure

```
hosting_bot/
├── index.js          # Main bot file
├── config.js         # Configuration
├── package.json      # Dependencies
├── database/         # JSON databases
│   ├── users.json
│   ├── bots.json
│   ├── referrals.json
│   └── premium.json
├── hosted_bots/      # User uploaded bots
├── logs/            # Bot logs
└── media/           # Images
    └── welcome.jpg
```

## Support

Contact: @LORDTARRIFIC
