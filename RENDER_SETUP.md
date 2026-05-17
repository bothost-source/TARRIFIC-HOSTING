# 🚀 TARRIFIC HOSTING BOT - RENDER SETUP GUIDE

## Step 1: Create Render Account
1. Go to https://render.com
2. Sign up with GitHub or email (NO credit card needed for free tier!)

## Step 2: Create New Web Service
1. Click **"New +"** → **"Web Service"**
2. Connect your GitHub repo OR use **"Deploy from Git URL"**

## Step 3: Configure Settings
| Setting | Value |
|---------|-------|
| **Name** | tarrific-hosting-bot |
| **Environment** | Node |
| **Region** | Choose closest to you |
| **Branch** | main (or your branch) |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Plan** | Free |

## Step 4: Environment Variables (IMPORTANT!)
Go to **Environment** tab and add:
```
BOT_TOKEN=8757914022:AABPV-B0_v1LHQnnuoIIQ_QF3ApxBDCvc8o
```

> ⚠️ **SECURITY NOTE**: It's better to set the token as an env var instead of hardcoding in config.js. To do this, modify config.js line 7 to:
> ```js
> botToken: process.env.BOT_TOKEN || 'YOUR_TOKEN_HERE',
> ```

## Step 5: Deploy!
Click **"Create Web Service"**

Render will:
- Install dependencies (`npm install`)
- Start your bot (`npm start`)
- Provide a URL like `https://tarrific-hosting-bot.onrender.com`

## Step 6: Keep Alive (IMPORTANT!)
Render free tier **sleeps after 15 min of inactivity**.

### Option A: Use UptimeRobot (Free)
1. Go to https://uptimerobot.com
2. Add monitor → HTTP(s)
3. URL: `https://YOUR-RENDER-URL.onrender.com/health`
4. Interval: 5 minutes
5. This pings your bot every 5 min to keep it awake!

### Option B: Use Cron-Job.org (Free)
1. Go to https://cron-job.org
2. Create job → URL: `https://YOUR-RENDER-URL.onrender.com/`
3. Set to every 10 minutes

## ⚠️ IMPORTANT LIMITATIONS ON RENDER FREE TIER

1. **Ephemeral Filesystem**: Files in `database/`, `hosted_bots/`, `logs/` will be **WIPED** on every restart/deploy. Consider using:
   - MongoDB Atlas (free 512MB) for database
   - Or accept that data resets (fine for testing)

2. **Sleeping**: Bot goes to sleep after 15 min idle. UptimeRobot fixes this.

3. **No PM2**: Removed from code. Render manages the process.

4. **User Bot Hosting**: Spawning child processes for user bots is limited on free tier. The main bot works fine, but hosting other bots inside it may be restricted.

## 📁 Files Included
- `index.js` - Main bot (Render-ready with Express server)
- `config.js` - Your configuration
- `package.json` - Dependencies (added Express, removed PM2)
- `media/` - Your welcome image folder

## 🔧 Commands
| Command | Description |
|---------|-------------|
| `/start` | Main menu |
| `/host` | Deploy a bot |
| `/mybots` | Your bots |
| `/referral` | Referral status |
| `/premium` | Premium plans |
| `/server` | Server stats |
| `/addpremium <id> <slots> <days>` | Admin only |
| `/broadcast <msg>` | Admin only |

## 🆘 Troubleshooting

**Bot not responding?**
- Check Render logs (Dashboard → Logs)
- Verify BOT_TOKEN is correct
- Make sure bot is started with @BotFather

**"Failed to bind to port"?**
- The Express server handles this automatically. Should not happen.

**Database keeps resetting?**
- This is normal on Render free tier. Upgrade to paid or use external DB.

---
**Good luck! 🎉**
