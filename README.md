# 🚂 TARRIFIC HOSTING BOT - RAILWAY SETUP GUIDE

## Why Railway?
- ✅ **No credit card** needed (email/GitHub signup)
- ✅ **$5 free credit** at signup
- ✅ **No sleep/idle timeout** (bot stays awake 24/7)
- ✅ **Persistent filesystem** (database & files stay!)
- ✅ **Full process control** (can spawn child processes = user bot hosting works!)
- ✅ **25 bot limit** with smart auto-management

---

## Step 1: Sign Up (No Credit Card!)
1. Go to **https://railway.app**
2. Click **"Start a New Project"** or **"Login"**
3. Sign up with:
   - **GitHub** (recommended), OR
   - **Email** (no card needed!)
4. You get **$5 free credit** instantly

---

## Step 2: Create a New Project
1. Click **"New Project"**
2. Select **"Deploy from GitHub repo"** (if you have one)
   OR **"Empty project"** (if uploading files manually)

---

## Step 3: Upload Your Bot Files

### Option A: Using GitHub (Recommended)
1. Create a GitHub repo
2. Upload these files:
   - `index.js` (Railway version)
   - `config.js`
   - `package.json` (Railway version)
   - `media/` folder (welcome image)
3. Connect repo to Railway

### Option B: Manual Upload (No GitHub)
1. In Railway, click **"New"** → **"Service"** → **"Empty Service"**
2. Name it `tarrific-bot`
3. Go to **"Settings"** tab
4. Under **"Deploy"** section, click **"Upload"**
5. Upload your files as a ZIP

---

## Step 4: Set Environment Variables
1. Go to your service → **"Variables"** tab
2. Click **"New Variable"**
3. Add:
   ```
   BOT_TOKEN = your_bot_token_from_botfather
   ```
4. (Optional) Add any other env vars your bot needs

---

## Step 5: Configure Build & Start Commands
1. Go to **"Settings"** tab
2. Under **"Build"**:
   - Build command: `npm install`
3. Under **"Deploy"**:
   - Start command: `npm start`
4. Railway auto-detects Node.js, so this might already be set

---

## Step 6: Deploy!
1. Click **"Deploy"** button
2. Watch the logs in the **"Deploy"** tab
3. Wait for: `[HOSTING BOT] @YourBotUsername started`
4. **Done!** Your bot is live 24/7

---

## Step 7: Add a Domain (Optional)
1. Go to **"Settings"** → **"Networking"**
2. Click **"Generate Domain"**
3. Railway gives you a free URL like `tarrific-bot.up.railway.app`
4. This is your webhook/health check URL

---

## 📊 Resource Limits on Railway Free Tier

| Resource | Limit | Your Bot Usage |
|----------|-------|----------------|
| **CPU** | Shared | Low for Telegram bot |
| **RAM** | 512MB-1GB | Main bot ~100MB, each user bot ~50-100MB |
| **Disk** | 1GB | Database + logs + user bot files |
| **Bandwidth** | 100GB/month | Plenty for bot |
| **Credit** | $5 then $1/month | See below |

---

## 💰 Cost Breakdown (Important!)

**Your $5 credit lasts:**
- Main bot only: ~10 months
- Main + 5 user bots: ~2-3 months
- Main + 20 user bots: ~3-4 weeks

**After $5 runs out:**
- Railway gives **$1/month free** forever
- With $1: Main bot + 2-3 user bots max
- **To host 20 bots sustainably: You need ~$5-10/month**

### 🎯 Monetization Strategy
Use your **referral + premium system** to earn:
- Free users: 1 bot (costs you ~$0.20/month)
- Premium users: 5 bots (charge 500 Stars = ~$5)
- VIP users: Unlimited (charge 1500 Stars = ~$15)

**Break-even: 1-2 premium users per month covers all costs!**

---

## 🔧 Managing Your Bot on Railway

### View Logs
- Railway Dashboard → your service → **"Logs"** tab
- Real-time logs from your bot

### Restart Bot
- Go to **"Deploy"** tab → click **"Redeploy"**
- Or click **"Restart"** in service settings

### Update Files
- GitHub: Push new code → auto-deploys
- Manual: Re-upload ZIP in Settings

### Add Database (Optional)
- Click **"New"** → **"Database"** → **"Add PostgreSQL"**
- Railway gives free PostgreSQL
- Better than JSON files for production

---

## ⚠️ Important Notes

1. **$5 credit is one-time** — use wisely, earn from users before it runs out
2. **Auto-stop is built-in** — idle bots stop after 2 hours to save credit
3. **25 bot hard limit** — prevents overloading and unexpected charges
4. **Persistent files** — database survives restarts (unlike Render!)
5. **No sleep** — bot stays awake 24/7 (unlike Render!)

---

## 🆘 Troubleshooting

**Bot not starting?**
- Check logs for "BOOT ERROR"
- Verify BOT_TOKEN is set in Variables
- Make sure `package.json` has correct dependencies

**"Out of memory" error?**
- Too many user bots running
- Railway free tier has RAM limits
- Auto-stop will kick in

**Database lost?**
- Shouldn't happen on Railway (persistent disk)
- But always backup: Download `database/` folder periodically

---

## 🚀 Next Steps
1. **Sign up at railway.app** (takes 2 minutes)
2. **Upload your bot files**
3. **Set BOT_TOKEN variable**
4. **Deploy and test**
5. **Share your bot** and start earning from referrals/premium!

**Good luck! 🎉**
