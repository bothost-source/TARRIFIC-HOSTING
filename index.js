/*
 * TARRIFIC HOSTING BOT - RAILWAY VERSION (FIXED)
 * Fixed: editMessageText on photo, referral logic
 */

const { Telegraf, Markup } = require('telegraf');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const express = require('express');

// ========== EXPRESS WEB SERVER ==========
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  const db = getBots();
  const runningBots = Object.values(db.bots).filter(b => b.status === 'running').length;
  res.json({
    status: 'online',
    bot: config.botName,
    uptime: process.uptime(),
    hostedBots: runningBots,
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', bot: config.botName });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[WEB SERVER] Running on port ${PORT}`);
});

// ========== RESOURCE LIMITS ==========
const RESOURCE_LIMITS = {
  maxUserBots: 25,
  ramPerBot: 256,
  idleTimeout: 2 * 60 * 60 * 1000,
  crashLimit: 3,
  checkInterval: 5 * 60 * 1000
};

// ========== DIRECTORIES ==========
const DB_DIR = path.join(__dirname, 'database');
const BOTS_DIR = path.join(__dirname, 'hosted_bots');
const LOGS_DIR = path.join(__dirname, 'logs');

[DB_DIR, BOTS_DIR, LOGS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ========== DATABASE HELPERS ==========
const USERS_FILE = path.join(DB_DIR, 'users.json');
const BOTS_FILE = path.join(DB_DIR, 'bots.json');
const REFERRALS_FILE = path.join(DB_DIR, 'referrals.json');
const PREMIUM_FILE = path.join(DB_DIR, 'premium.json');
const PENDING_REFS_FILE = path.join(DB_DIR, 'pending_refs.json');

function loadJSON(file, fallback = {}) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {}
  return fallback;
}

function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function getUsers() { return loadJSON(USERS_FILE, { users: {} }); }
function saveUsers(data) { saveJSON(USERS_FILE, data); }
function getBots() { return loadJSON(BOTS_FILE, { bots: {} }); }
function saveBots(data) { saveJSON(BOTS_FILE, data); }
function getReferrals() { return loadJSON(REFERRALS_FILE, { referrals: {} }); }
function saveReferrals(data) { saveJSON(REFERRALS_FILE, data); }
function getPremium() { return loadJSON(PREMIUM_FILE, { premium: {} }); }
function savePremium(data) { saveJSON(PREMIUM_FILE, data); }
function getPendingRefs() { return loadJSON(PENDING_REFS_FILE, { pending: {} }); }
function savePendingRefs(data) { saveJSON(PENDING_REFS_FILE, data); }

// ========== USER MANAGEMENT ==========
function getUser(userId) {
  const db = getUsers();
  return db.users[userId] || null;
}

function createUser(userId, username, firstName, referrer = null) {
  const db = getUsers();
  if (!db.users[userId]) {
    db.users[userId] = {
      id: userId,
      username: username || '',
      firstName: firstName || 'User',
      joinedAt: Date.now(),
      referrals: [],
      referralCount: 0,
      botsHosted: 0,
      maxBots: 1,
      isPremium: false,
      premiumExpiry: null,
      referrer: referrer,
      hasJoined: false
    };
    saveUsers(db);
  }
  return db.users[userId];
}

function markUserJoined(userId) {
  const db = getUsers();
  if (db.users[userId]) {
    db.users[userId].hasJoined = true;
    saveUsers(db);
  }
}

function addReferral(referrerId, referredId) {
  const refDB = getReferrals();
  const userDB = getUsers();

  if (!refDB.referrals[referrerId]) refDB.referrals[referrerId] = [];
  if (refDB.referrals[referrerId].includes(referredId)) return false;

  refDB.referrals[referrerId].push(referredId);
  saveReferrals(refDB);

  if (userDB.users[referrerId]) {
    userDB.users[referrerId].referrals.push(referredId);
    userDB.users[referrerId].referralCount = userDB.users[referrerId].referrals.length;
    saveUsers(userDB);
  }
  return true;
}

function hasEnoughReferrals(userId) {
  const user = getUser(userId);
  if (!user) return false;
  if (user.isPremium) return true;
  return user.referralCount >= config.requiredReferrals;
}

function getReferralLink(userId) {
  return `https://t.me/${config.botUsername}?start=ref_${userId}`;
}

// ========== PREMIUM MANAGEMENT ==========
function addPremium(userId, slots, days = 30) {
  const db = getPremium();
  const users = getUsers();
  const expiry = Date.now() + (days * 24 * 60 * 60 * 1000);

  db.premium[userId] = {
    slots: slots,
    expiry: expiry,
    addedAt: Date.now()
  };
  savePremium(db);

  if (users.users[userId]) {
    users.users[userId].isPremium = true;
    users.users[userId].maxBots = slots;
    users.users[userId].premiumExpiry = expiry;
    saveUsers(users);
  }
}

function removePremium(userId) {
  const db = getPremium();
  const users = getUsers();
  delete db.premium[userId];
  savePremium(db);

  if (users.users[userId]) {
    users.users[userId].isPremium = false;
    users.users[userId].maxBots = 1;
    users.users[userId].premiumExpiry = null;
    saveUsers(users);
  }
}

function isPremium(userId) {
  const db = getPremium();
  const p = db.premium[userId];
  if (!p) return false;
  if (Date.now() > p.expiry) {
    removePremium(userId);
    return false;
  }
  return true;
}

// ========== SYSTEM MONITORING ==========
const os = require('os');
const { execSync } = require('child_process');

function getSystemStats() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  const cpus = os.cpus();
  const loadAvg = os.loadavg();
  const cpuCount = cpus.length;
  const cpuPercent = Math.min(100, Math.round((loadAvg[0] / cpuCount) * 100));

  let diskUsed = 0, diskTotal = 0, diskPercent = 0;
  try {
    const df = execSync('df -k / | tail -1', { encoding: 'utf8' }).trim().split(/\s+/);
    diskTotal = parseInt(df[1]) * 1024;
    diskUsed = parseInt(df[2]) * 1024;
    diskPercent = Math.round((diskUsed / diskTotal) * 100);
  } catch (e) {}

  const db = getBots();
  const totalBots = Object.keys(db.bots).length;
  const runningBots = Object.values(db.bots).filter(b => b.status === 'running').length;

  return {
    cpuPercent,
    cpuCount,
    memUsed: formatBytes(usedMem),
    memTotal: formatBytes(totalMem),
    memPercent: Math.round((usedMem / totalMem) * 100),
    diskUsed: formatBytes(diskUsed),
    diskTotal: formatBytes(diskTotal),
    diskPercent,
    uptime: formatUptime(os.uptime()),
    platform: os.platform(),
    hostname: os.hostname(),
    totalBots,
    runningBots,
    maxBots: RESOURCE_LIMITS.maxUserBots
  };
}

function getBotStats(botId) {
  const db = getBots();
  const bot = db.bots[botId];
  if (!bot) return null;

  const botDir = path.join(BOTS_DIR, botId);
  const logFile = path.join(LOGS_DIR, `${botId}.log`);

  let processStats = null;
  if (bot.pid && bot.status === 'running') {
    try {
      const psOutput = execSync(`ps -p ${bot.pid} -o pid,ppid,pcpu,pmem,etime,comm --no-headers`, { encoding: 'utf8' }).trim();
      const parts = psOutput.split(/\s+/);
      processStats = {
        pid: parts[0],
        cpu: parts[2] + '%',
        memory: parts[3] + '%',
        uptime: parts[4]
      };
    } catch (e) {}
  }

  let logSize = 0;
  try {
    if (fs.existsSync(logFile)) {
      const stats = fs.statSync(logFile);
      logSize = formatBytes(stats.size);
    }
  } catch (e) {}

  let dirSize = '0 B';
  try {
    const du = execSync(`du -sb ${botDir} 2>/dev/null || echo 0`, { encoding: 'utf8' }).trim().split('\t')[0];
    dirSize = formatBytes(parseInt(du));
  } catch (e) {}

  let isActuallyRunning = false;
  if (bot.pid) {
    try {
      process.kill(bot.pid, 0);
      isActuallyRunning = true;
    } catch (e) {
      isActuallyRunning = false;
    }
  }

  let lastError = null;
  try {
    if (fs.existsSync(logFile)) {
      const logs = fs.readFileSync(logFile, 'utf8');
      const errorLines = logs.split('\n').filter(line =>
        line.toLowerCase().includes('error') ||
        line.toLowerCase().includes('fatal') ||
        line.toLowerCase().includes('uncaught') ||
        line.toLowerCase().includes('exception')
      );
      if (errorLines.length > 0) {
        lastError = errorLines.slice(-3).join('\n');
      }
    }
  } catch (e) {}

  return {
    ...bot,
    processStats,
    logSize,
    dirSize,
    isActuallyRunning,
    lastError,
    botDir,
    logFile
  };
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  return parts.join(' ') || '0m';
}

function progressBar(percent, length = 10) {
  const filled = Math.round((percent / 100) * length);
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, length - filled));
}

// ========== SMART RESOURCE MANAGER ==========
function enforceResourceLimits() {
  const db = getBots();
  const now = Date.now();
  let stopped = 0;
  let deleted = 0;

  Object.values(db.bots).forEach(bot => {
    if (bot.status === 'running' && bot.lastPing) {
      const idleTime = now - bot.lastPing;
      if (idleTime > RESOURCE_LIMITS.idleTimeout) {
        console.log(`[RESOURCE MGR] Stopping idle bot ${bot.id} (${formatUptime(idleTime/1000)} idle)`);
        stopBot(bot.id);
        stopped++;
      }
    }

    if (bot.status === 'crashed') {
      const crashCount = bot.crashCount || 0;
      if (crashCount >= RESOURCE_LIMITS.crashLimit) {
        console.log(`[RESOURCE MGR] Deleting crashed bot ${bot.id} (${crashCount} crashes)`);
        deleteBot(bot.id);
        deleted++;
      }
    }
  });

  const runningBots = Object.values(db.bots).filter(b => b.status === 'running');
  if (runningBots.length > RESOURCE_LIMITS.maxUserBots) {
    const sorted = runningBots.sort((a, b) => (a.lastPing || 0) - (b.lastPing || 0));
    const toStop = sorted.slice(0, runningBots.length - RESOURCE_LIMITS.maxUserBots);
    toStop.forEach(bot => {
      console.log(`[RESOURCE MGR] Stopping bot ${bot.id} (limit exceeded)`);
      stopBot(bot.id);
      stopped++;
    });
  }

  if (stopped > 0 || deleted > 0) {
    console.log(`[RESOURCE MGR] Stopped: ${stopped}, Deleted: ${deleted}`);
  }
}

setInterval(enforceResourceLimits, RESOURCE_LIMITS.checkInterval);

setInterval(() => {
  const db = getBots();
  Object.values(db.bots).forEach(bot => {
    if (bot.status === 'running' && bot.pid) {
      try {
        process.kill(bot.pid, 0);
        bot.lastPing = Date.now();
        saveBots(db);
      } catch (e) {
        bot.status = 'crashed';
        bot.crashedAt = Date.now();
        bot.crashCount = (bot.crashCount || 0) + 1;
        saveBots(db);
      }
    }
  });
}, 30000);

// ========== BOT DEPLOYMENT ==========
function getNextPort() {
  const db = getBots();
  const ports = Object.values(db.bots).map(b => b.port);
  let port = config.startPort;
  while (ports.includes(port)) port++;
  return port;
}

function getFileExtension(filename) {
  return path.extname(filename).toLowerCase();
}

function detectRuntime(filename) {
  const ext = getFileExtension(filename);
  const runtimes = {
    '.js': { cmd: 'node', name: 'Node.js' },
    '.py': { cmd: 'python3', name: 'Python 3' },
    '.py2': { cmd: 'python2', name: 'Python 2' },
    '.sh': { cmd: 'bash', name: 'Bash' },
    '.rb': { cmd: 'ruby', name: 'Ruby' },
    '.php': { cmd: 'php', name: 'PHP' },
    '.go': { cmd: 'go run', name: 'Go' }
  };
  return runtimes[ext] || { cmd: 'node', name: 'Unknown (defaulting to Node.js)' };
}

async function deployBot(userId, filename, fileContent, envVars = {}) {
  const db = getBots();
  const runningCount = Object.values(db.bots).filter(b => b.status === 'running').length;
  if (runningCount >= RESOURCE_LIMITS.maxUserBots) {
    throw new Error(`Server at capacity (${RESOURCE_LIMITS.maxUserBots} bots max). Please try again later or upgrade to premium.`);
  }

  const port = getNextPort();
  const botId = `bot_${userId}_${Date.now()}`;
  const botDir = path.join(BOTS_DIR, botId);
  const botFile = path.join(botDir, filename);

  fs.mkdirSync(botDir, { recursive: true });
  fs.writeFileSync(botFile, fileContent);

  if (Object.keys(envVars).length > 0) {
    const envContent = Object.entries(envVars).map(([k, v]) => `${k}=${v}`).join('\n');
    fs.writeFileSync(path.join(botDir, '.env'), envContent);
  }

  const runtime = detectRuntime(filename);
  const logFile = path.join(LOGS_DIR, `${botId}.log`);

  const pm2Name = `host_${botId}`;

  return new Promise((resolve, reject) => {
    exec(`pm2 start ${botFile} --name ${pm2Name} --log ${logFile} --time --max-memory-restart ${RESOURCE_LIMITS.ramPerBot}M`, (err, stdout, stderr) => {
      if (err) {
        const out = fs.openSync(logFile, 'a');
        const err_fd = fs.openSync(logFile, 'a');
        const newProcess = spawn(runtime.cmd, [botFile], {
          cwd: botDir,
          detached: true,
          stdio: ['ignore', out, err_fd],
          env: { ...process.env, PORT: port, ...envVars }
        });
        newProcess.unref();

        db.bots[botId] = {
          id: botId,
          userId: userId,
          filename: filename,
          port: port,
          runtime: runtime.name,
          status: 'running',
          pid: newProcess.pid,
          pm2Name: null,
          deployedAt: Date.now(),
          lastPing: Date.now(),
          crashCount: 0
        };
        saveBots(db);
        resolve(db.bots[botId]);
      } else {
        db.bots[botId] = {
          id: botId,
          userId: userId,
          filename: filename,
          port: port,
          runtime: runtime.name,
          status: 'running',
          pid: null,
          pm2Name: pm2Name,
          deployedAt: Date.now(),
          lastPing: Date.now(),
          crashCount: 0
        };
        saveBots(db);
        resolve(db.bots[botId]);
      }
    });
  });
}

function stopBot(botId) {
  const db = getBots();
  const bot = db.bots[botId];
  if (!bot) return false;

  if (bot.pm2Name) {
    exec(`pm2 stop ${bot.pm2Name} && pm2 delete ${bot.pm2Name}`, (err) => {
      if (err) console.error(`[PM2 STOP ERROR] ${bot.pm2Name}:`, err.message);
    });
  } else if (bot.pid) {
    try { process.kill(bot.pid, 'SIGTERM'); } catch (e) {}
  }

  bot.status = 'stopped';
  bot.stoppedAt = Date.now();
  saveBots(db);
  return true;
}

function deleteBot(botId) {
  const db = getBots();
  const bot = db.bots[botId];
  if (!bot) return false;

  stopBot(botId);

  const botDir = path.join(BOTS_DIR, botId);
  if (fs.existsSync(botDir)) {
    fs.rmSync(botDir, { recursive: true, force: true });
  }

  delete db.bots[botId];
  saveBots(db);

  const users = getUsers();
  if (users.users[bot.userId]) {
    users.users[bot.userId].botsHosted = Math.max(0, users.users[bot.userId].botsHosted - 1);
    saveUsers(users);
  }

  return true;
}

function getUserBots(userId) {
  const db = getBots();
  return Object.values(db.bots).filter(b => b.userId === userId);
}

// ========== FORCE JOIN CHECK ==========
async function checkForceJoin(ctx, userId) {
  try {
    for (const channel of config.forceJoinChannels) {
      const member = await ctx.telegram.getChatMember(channel, userId);
      if (!['creator', 'administrator', 'member'].includes(member.status)) {
        return false;
      }
    }
    return true;
  } catch (e) {
    return false;
  }
}

// ========== INITIALIZE BOT ==========
const bot = new Telegraf(config.botToken);

bot.catch((err, ctx) => {
  console.error('Bot error:', err);
  try {
    ctx.reply('An error occurred. Please try again.').catch(() => {});
  } catch (e) {}
});

// ========== START COMMAND ==========
bot.start(async (ctx) => {
  const userId = ctx.from.id.toString();
  const username = ctx.from.username || '';
  const firstName = ctx.from.first_name || 'User';

  // Check for referral payload FIRST
  const payload = ctx.payload;
  let referrer = null;
  let pendingRef = false;

  if (payload && payload.startsWith('ref_')) {
    referrer = payload.replace('ref_', '');
    if (referrer !== userId) {
      // Store as PENDING referral — will only count after force join
      const pendingDB = getPendingRefs();
      pendingDB.pending[userId] = {
        referrer: referrer,
        timestamp: Date.now()
      };
      savePendingRefs(pendingDB);
      pendingRef = true;
    }
  }

  // Create/get user
  const user = createUser(userId, username, firstName, referrer);

  // Check force join
  const joined = await checkForceJoin(ctx, userId);
  if (!joined) {
    return sendForceJoin(ctx, pendingRef);
  }

  // User has joined — process any pending referral
  await processPendingReferral(ctx, userId, firstName);

  // Send welcome
  await sendWelcome(ctx, user);
});

// ========== PROCESS PENDING REFERRAL ==========
async function processPendingReferral(ctx, userId, firstName) {
  const pendingDB = getPendingRefs();
  const pending = pendingDB.pending[userId];

  if (!pending) return;

  const referrer = pending.referrer;
  delete pendingDB.pending[userId];
  savePendingRefs(pendingDB);

  if (referrer === userId) return;

  const success = addReferral(referrer, userId);
  if (!success) return; // Already referred

  try {
    const refUser = getUser(referrer);
    if (refUser) {
      const refCount = refUser.referralCount;
      const needed = Math.max(0, config.requiredReferrals - refCount);

      await ctx.telegram.sendMessage(referrer,
        `🎉 New referral! ${firstName} joined using your link.\n\n📊 Progress: ${refCount}/${config.requiredReferrals}\n${needed > 0 ? `⏳ Need ${needed} more to unlock hosting!` : '✅ You can now host bots!'}`
      );

      if (refCount === config.requiredReferrals) {
        try {
          await ctx.telegram.sendMessage(config.proofChannel,
            `📋 Proof of Referral\n\n👤 User: ${refUser.firstName}\n🆔 ID: <code>${referrer}</code>\n✅ Completed: ${config.requiredReferrals} referrals\n🔓 Status: Hosting unlocked`,
            { parse_mode: 'HTML' }
          );
        } catch (e) {}
      }
    }
  } catch (e) {}
}

// ========== FORCE JOIN ==========
async function sendForceJoin(ctx, hasPendingRef = false) {
  const channels = config.forceJoinChannels.map((ch, i) => {
    const name = config.channelNames[i] || `Channel ${i+1}`;
    return [{ text: `📢 Join ${name}`, url: ch.replace('@', 'https://t.me/') }];
  });

  channels.push([Markup.button.callback('✅ I Have Joined', 'check_join')]);

  let text = `👋 Welcome!\n\n`;
  text += `You must join our channels to use this bot.\n\n`;
  text += `Join all channels below, then click "✅ I Have Joined".\n`;
  if (hasPendingRef) {
    text += `\n🎁 Someone referred you! Join to claim your referral.\n`;
  }

  await ctx.reply(text, Markup.inlineKeyboard(channels));
}

bot.action('check_join', async (ctx) => {
  const joined = await checkForceJoin(ctx, ctx.from.id);
  if (joined) {
    await ctx.answerCbQuery('✅ Verified!');
    await ctx.deleteMessage();

    // Process pending referral
    await processPendingReferral(ctx, ctx.from.id.toString(), ctx.from.first_name || 'User');

    // Mark user as joined
    markUserJoined(ctx.from.id.toString());

    // Send welcome
    const user = getUser(ctx.from.id.toString());
    await sendWelcome(ctx, user);
  } else {
    await ctx.answerCbQuery('❌ You have not joined all channels!', { show_alert: true });
  }
});

// ========== WELCOME MESSAGE ==========
async function sendWelcome(ctx, user) {
  const firstName = ctx.from.first_name || 'User';
  const caption = `🎉 Welcome to ${config.botName}, ${firstName}!\n\n🤖 This bot lets you deploy your own bots (JS, Python, and more).\n\n📋 Plans:\n🆓 Free: 1 bot\n⭐ Premium: 5 bots\n👑 VIP: Unlimited\n\n🔗 Your referral link: ${getReferralLink(user.id)}\n👥 Referrals: ${user.referralCount}/${config.requiredReferrals}\n\n🚀 Use /host to deploy a bot`;

  try {
    if (fs.existsSync(config.welcomeImage)) {
      await ctx.replyWithPhoto({ source: config.welcomeImage }, {
        caption: caption,
        parse_mode: 'HTML',
        ...mainMenuKeyboard(user)
      });
    } else {
      await ctx.reply(caption, {
        parse_mode: 'HTML',
        ...mainMenuKeyboard(user)
      });
    }
  } catch (err) {
    console.error('Welcome error:', err);
    await ctx.reply(caption, {
      parse_mode: 'HTML',
      ...mainMenuKeyboard(user)
    });
  }
}

// ========== KEYBOARDS ==========
function mainMenuKeyboard(user) {
  const buttons = [
    [Markup.button.callback('🚀 Deploy Bot', 'deploy_menu')],
    [Markup.button.callback('🤖 My Bots', 'my_bots')],
    [Markup.button.callback('👥 Referrals', 'referral_status')],
    [Markup.button.callback('⭐ Premium', 'premium_menu')],
    [Markup.button.callback('❓ Help', 'help_menu')]
  ];

  if (config.adminIds.includes(user.id)) {
    buttons.push([Markup.button.callback('🔧 Admin Panel', 'admin_panel')]);
  }

  return Markup.inlineKeyboard(buttons);
}

function deployMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📤 Upload Bot File', 'upload_bot')],
    [Markup.button.callback('⬅️ Back', 'main_menu')]
  ]);
}

function premiumMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('⭐ Buy Premium', 'buy_premium_stars')],
    [Markup.button.callback('💬 Contact Admin', 'buy_premium_manual')],
    [Markup.button.callback('⬅️ Back', 'main_menu')]
  ]);
}

function adminMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📊 All Bots', 'admin_bots')],
    [Markup.button.callback('👥 All Users', 'admin_users')],
    [Markup.button.callback('➕ Add Premium', 'admin_add_premium')],
    [Markup.button.callback('⏹️ Stop Bot', 'admin_stop_bot')],
    [Markup.button.callback('📢 Broadcast', 'admin_broadcast')],
    [Markup.button.callback('⬅️ Back', 'main_menu')]
  ]);
}

// ========== DEPLOYMENT ==========
const pendingUploads = new Map();

bot.action('deploy_menu', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id.toString();
  const user = getUser(userId);

  if (!hasEnoughReferrals(userId) && !user.isPremium) {
    return ctx.reply(
      `🔒 You need ${config.requiredReferrals} referrals to host bots.\n\n📊 Your progress: ${user.referralCount}/${config.requiredReferrals}\n\n🔗 Referral link: ${getReferralLink(userId)}`,
      Markup.inlineKeyboard([
        [Markup.button.callback('👥 My Referrals', 'referral_status')],
        [Markup.button.callback('⭐ Buy Premium', 'premium_menu')],
        [Markup.button.callback('⬅️ Back', 'main_menu')]
      ])
    );
  }

  const userBots = getUserBots(userId);
  const maxBots = user.maxBots;

  if (userBots.length >= maxBots) {
    return ctx.reply(
      `⚠️ You have reached your limit of ${maxBots} bot(s).\n\nUpgrade to premium for more slots.`,
      premiumMenuKeyboard()
    );
  }

  const db = getBots();
  const runningCount = Object.values(db.bots).filter(b => b.status === 'running').length;
  if (runningCount >= RESOURCE_LIMITS.maxUserBots) {
    return ctx.reply(
      `⚠️ Server is at capacity (${runningCount}/${RESOURCE_LIMITS.maxUserBots} bots running).\n\nPlease try again later or contact admin.`,
      Markup.inlineKeyboard([[Markup.button.callback('⬅️ Back', 'main_menu')]])
    );
  }

  ctx.reply(
    `🚀 Deploy Your Bot\n\nSupported: .js (Node.js), .py (Python), .sh (Bash), and more.\n\nClick "Upload Bot File" to send your file.`,
    deployMenuKeyboard()
  );
});

bot.action('upload_bot', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id.toString();
  pendingUploads.set(userId, { step: 'waiting_file' });

  ctx.reply(
    `📤 Please send your bot file now.\n\nSupported formats:\n- .js (Node.js)\n- .py (Python 3)\n- .sh (Bash)\n- .rb (Ruby)\n- .php (PHP)\n- .go (Go)\n\nMax file size: 10MB`,
    Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'main_menu')]])
  );
});

bot.on('document', async (ctx) => {
  const userId = ctx.from.id.toString();
  const pending = pendingUploads.get(userId);
  if (!pending || pending.step !== 'waiting_file') return;

  const doc = ctx.message.document;
  const filename = doc.file_name;
  const ext = getFileExtension(filename);

  const allowedExts = ['.js', '.py', '.sh', '.rb', '.php', '.go', '.ts'];
  if (!allowedExts.includes(ext)) {
    return ctx.reply(`❌ Unsupported file type: ${ext}\n\nAllowed: ${allowedExts.join(', ')}`);
  }

  const fileLink = await ctx.telegram.getFileLink(doc.file_id);
  const response = await fetch(fileLink);
  const content = await response.text();

  pendingUploads.set(userId, {
    step: 'waiting_env',
    filename: filename,
    content: content
  });

  ctx.reply(
    `📄 File received: ${filename}\n\nDo you need to set environment variables? (TOKEN, API_KEY, etc.)\n\nReply with variables in format:\nKEY=value\nKEY2=value2\n\nOr reply "skip" to continue without env vars.`,
    Markup.inlineKeyboard([[Markup.button.callback('⏭️ Skip', 'skip_env')]])
  );
});

bot.action('skip_env', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id.toString();
  const pending = pendingUploads.get(userId);
  if (!pending) return;

  await deployAndNotify(ctx, userId, pending.filename, pending.content, {});
  pendingUploads.delete(userId);
});

bot.on('text', async (ctx, next) => {
  const userId = ctx.from.id.toString();
  const pending = pendingUploads.get(userId);
  if (!pending || pending.step !== 'waiting_env') return next();

  const text = ctx.message.text.trim();
  let envVars = {};

  if (text.toLowerCase() !== 'skip') {
    const lines = text.split('\n');
    for (const line of lines) {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        envVars[key.trim()] = valueParts.join('=').trim();
      }
    }
  }

  await deployAndNotify(ctx, userId, pending.filename, pending.content, envVars);
  pendingUploads.delete(userId);
});

async function deployAndNotify(ctx, userId, filename, content, envVars) {
  const deployingMsg = await ctx.reply('🚀 Deploying your bot... Please wait.');

  try {
    const botInfo = await deployBot(userId, filename, content, envVars);

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      deployingMsg.message_id,
      null,
      `✅ Bot Deployed Successfully!\n\n` +
      `🆔 ID: <code>${botInfo.id}</code>\n` +
      `📄 File: ${botInfo.filename}\n` +
      `⚙️ Runtime: ${botInfo.runtime}\n` +
      `🔌 Port: ${botInfo.port}\n` +
      `📊 Status: ${botInfo.status}\n\n` +
      `⚠️ Bots auto-stop after 2 hours of inactivity to save resources.\n\n` +
      `Use /mybots to manage your bots.`,
      { parse_mode: 'HTML', ...Markup.inlineKeyboard([
        [Markup.button.callback('🤖 My Bots', 'my_bots')],
        [Markup.button.callback('📋 View Logs', `logs_${botInfo.id}`)],
        [Markup.button.callback('🏠 Main Menu', 'main_menu')]
      ])}
    );
  } catch (err) {
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      deployingMsg.message_id,
      null,
      `❌ Deployment Failed!\n\nError: ${err.message}`,
      { parse_mode: 'HTML' }
    );
  }
}

// ========== MY BOTS ==========
bot.action('my_bots', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id.toString();
  const bots = getUserBots(userId);

  if (bots.length === 0) {
    return ctx.reply(
      'You have no deployed bots.\n\nUse /host to deploy one.',
      Markup.inlineKeyboard([[Markup.button.callback('🚀 Deploy Bot', 'deploy_menu')], [Markup.button.callback('⬅️ Back', 'main_menu')]])
    );
  }

  const sysStats = getSystemStats();
  let text = `📊 SERVER STATUS\n`;
  text += `┌─────────────────────────────┐\n`;
  text += `│ CPU: ${sysStats.cpuPercent}% ${progressBar(sysStats.cpuPercent)}\n`;
  text += `│ RAM: ${sysStats.memUsed} / ${sysStats.memTotal} (${sysStats.memPercent}%)\n`;
  text += `│ Disk: ${sysStats.diskUsed} / ${sysStats.diskTotal} (${sysStats.diskPercent}%)\n`;
  text += `│ Bots: ${sysStats.runningBots}/${sysStats.maxBots} running\n`;
  text += `│ Uptime: ${sysStats.uptime}\n`;
  text += `└─────────────────────────────┘\n\n`;

  text += `🤖 YOUR BOTS (${bots.length}):\n\n`;

  const buttons = [];

  for (const bot of bots) {
    const stats = getBotStats(bot.id);
    const statusEmoji = stats.isActuallyRunning ? '🟢' : (stats.status === 'crashed' ? '🔴' : '🟡');

    text += `${statusEmoji} <b>${bot.filename}</b>\n`;
    text += `   🆔 ID: <code>${bot.id}</code>\n`;
    text += `   🔌 Port: ${bot.port} | ⚙️ ${bot.runtime}\n`;
    text += `   📊 Status: <b>${stats.status.toUpperCase()}</b>\n`;

    if (stats.processStats) {
      text += `   💻 CPU: ${stats.processStats.cpu} | 🧠 RAM: ${stats.processStats.memory}\n`;
      text += `   ⏱️ Uptime: ${stats.processStats.uptime}\n`;
    }

    text += `   📦 Size: ${stats.dirSize} | 📝 Logs: ${stats.logSize}\n`;

    if (stats.lastError) {
      text += `   ⚠️ <b>Last Error:</b>\n   <pre>${stats.lastError.slice(0, 100)}</pre>\n`;
    }

    text += `\n`;

    buttons.push([
      Markup.button.callback(`${stats.isActuallyRunning ? '⏹️ Stop' : '▶️ Start'}`, `${stats.isActuallyRunning ? 'stop_' : 'restart_'}${bot.id}`),
      Markup.button.callback('📊 Stats', `botstats_${bot.id}`),
      Markup.button.callback('📋 Logs', `logs_${bot.id}`)
    ]);
    buttons.push([
      Markup.button.callback('🗑️ Delete', `delete_${bot.id}`)
    ]);
  }

  buttons.push([Markup.button.callback('⬅️ Back', 'main_menu')]);

  ctx.reply(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
});

bot.action(/stop_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const botId = ctx.match[1];
  const bot = getBots().bots[botId];

  if (!bot) return ctx.reply('Bot not found.');
  if (bot.userId !== ctx.from.id.toString() && !config.adminIds.includes(ctx.from.id.toString())) {
    return ctx.reply('Not your bot!');
  }

  stopBot(botId);
  ctx.reply(`⏹️ Bot <code>${botId}</code> stopped.`, { parse_mode: 'HTML' });
});

bot.action(/logs_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const botId = ctx.match[1];
  const logFile = path.join(LOGS_DIR, `${botId}.log`);

  if (!fs.existsSync(logFile)) {
    return ctx.reply('No logs found.');
  }

  const logs = fs.readFileSync(logFile, 'utf8');
  const truncated = logs.slice(-4000);

  ctx.reply(`📝 Last logs for <code>${botId}</code>:\n\n<pre>${truncated}</pre>`, { parse_mode: 'HTML' });
});

// ========== REFERRALS ==========
bot.action('referral_status', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id.toString();
  const user = getUser(userId);

  if (!user) return ctx.reply('User not found. Use /start first.');

  const refDB = getReferrals();
  const referredList = refDB.referrals[userId] || [];

  let text = `📊 Your Referral Status\n\n`;
  text += `🔗 Link: ${getReferralLink(userId)}\n`;
  text += `📈 Progress: ${user.referralCount}/${config.requiredReferrals}\n`;
  text += `🔓 Status: ${hasEnoughReferrals(userId) ? '✅ Unlocked' : '🔒 Locked'}\n\n`;

  if (referredList.length > 0) {
    text += `👥 Referred Users (${referredList.length}):\n`;
    referredList.forEach((id, i) => {
      text += `${i+1}. <code>${id}</code>\n`;
    });
  }

  ctx.reply(text, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('📋 Copy Link', 'copy_ref_link')],
      [Markup.button.callback('⬅️ Back', 'main_menu')]
    ])
  });
});

bot.action('copy_ref_link', async (ctx) => {
  const link = getReferralLink(ctx.from.id);
  await ctx.answerCbQuery(link, { show_alert: true });
});

// ========== PREMIUM ==========
bot.action('premium_menu', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.reply(
    `⭐ Premium Plans\n\n` +
    `🆓 Free: 1 bot slot\n` +
    `⭐ Premium: 5 bot slots\n` +
    `👑 VIP: Unlimited bots\n\n` +
    `💰 Pricing:\n` +
    `• 5 slots - 500 Stars\n` +
    `• 10 slots - 900 Stars\n` +
    `• Unlimited - 1500 Stars\n\n` +
    `💬 Contact: @${config.ownerUsername}`,
    premiumMenuKeyboard()
  );
});

bot.action('buy_premium_stars', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.reply(
    `⭐ Premium via Telegram Stars\n\n` +
    `Choose your plan:\n\n` +
    `🥉 5 Slots - 500 Stars\n` +
    `🥈 10 Slots - 900 Stars\n` +
    `🥇 Unlimited - 1500 Stars\n\n` +
    `Click below to pay:`,
    Markup.inlineKeyboard([
      [Markup.button.callback('🥉 5 Slots (500)', 'stars_5_500')],
      [Markup.button.callback('🥈 10 Slots (900)', 'stars_10_900')],
      [Markup.button.callback('🥇 Unlimited (1500)', 'stars_unli_1500')],
      [Markup.button.callback('⬅️ Back', 'premium_menu')]
    ])
  );
});

bot.action('buy_premium_manual', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.reply(
    `💬 Manual Payment\n\n` +
    `Contact @${config.ownerUsername} directly.\n\n` +
    `Send your User ID: <code>${ctx.from.id}</code>\n` +
    `And mention how many slots you want.`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Back', 'premium_menu')]]) }
  );
});

bot.command('addpremium', async (ctx) => {
  const userId = ctx.from.id.toString();
  if (!config.adminIds.includes(userId)) return ctx.reply('Admin only.');

  const args = ctx.message.text.split(' ');
  const targetId = args[1];
  const slots = parseInt(args[2]) || 5;
  const days = parseInt(args[3]) || 30;

  if (!targetId) return ctx.reply('Usage: /addpremium <userId> [slots] [days]');

  addPremium(targetId, slots, days);
  ctx.reply(`✅ Premium added for <code>${targetId}</code>\nSlots: ${slots}\nDays: ${days}`, { parse_mode: 'HTML' });

  try {
    await ctx.telegram.sendMessage(targetId,
      `⭐ Premium Activated!\n\nSlots: ${slots}\nExpires: ${new Date(Date.now() + days*86400000).toLocaleDateString()}\n\nUse /host to deploy more bots.`
    );
  } catch (e) {}
});

// ========== ADMIN PANEL ==========
bot.action('admin_panel', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id.toString();
  if (!config.adminIds.includes(userId)) return ctx.answerCbQuery('Admin only!', { show_alert: true });

  ctx.reply('🔧 Admin Panel', adminMenuKeyboard());
});

bot.action('admin_bots', async (ctx) => {
  await ctx.answerCbQuery();
  const db = getBots();
  const bots = Object.values(db.bots);

  let text = `📊 All Hosted Bots (${bots.length})\n\n`;
  bots.forEach(b => {
    text += `<code>${b.id}</code> | ${b.filename} | Port ${b.port} | ${b.status}\n`;
  });

  ctx.reply(text || 'No bots hosted.', { parse_mode: 'HTML', ...adminMenuKeyboard() });
});

bot.action('admin_users', async (ctx) => {
  await ctx.answerCbQuery();
  const db = getUsers();
  const users = Object.values(db.users);

  let text = `👥 All Users (${users.length})\n\n`;
  users.slice(0, 50).forEach(u => {
    text += `<code>${u.id}</code> | ${u.firstName} | Refs: ${u.referralCount} | Bots: ${u.botsHosted}\n`;
  });

  ctx.reply(text || 'No users.', { parse_mode: 'HTML', ...adminMenuKeyboard() });
});

bot.action('admin_add_premium', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.reply(
    'Use command:\n/addpremium <userId> <slots> <days>',
    adminMenuKeyboard()
  );
});

bot.action('admin_stop_bot', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.reply(
    'Reply with bot ID to stop:\n/stopbot <botId>',
    adminMenuKeyboard()
  );
});

bot.command('stopbot', async (ctx) => {
  if (!config.adminIds.includes(ctx.from.id.toString())) return;
  const botId = ctx.message.text.split(' ')[1];
  if (!botId) return ctx.reply('Usage: /stopbot <botId>');

  stopBot(botId);
  ctx.reply(`⏹️ Bot <code>${botId}</code> stopped.`, { parse_mode: 'HTML' });
});

bot.action('admin_broadcast', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.reply(
    'Reply with message to broadcast:\n/broadcast <message>',
    adminMenuKeyboard()
  );
});

bot.command('broadcast', async (ctx) => {
  if (!config.adminIds.includes(ctx.from.id.toString())) return;
  const msg = ctx.message.text.split(' ').slice(1).join(' ');
  if (!msg) return ctx.reply('Usage: /broadcast <message>');

  const db = getUsers();
  let sent = 0, failed = 0;

  for (const user of Object.values(db.users)) {
    try {
      await ctx.telegram.sendMessage(user.id, `📢 Broadcast:\n\n${msg}`);
      sent++;
    } catch (e) { failed++; }
  }

  ctx.reply(`Broadcast sent! ✅ Success: ${sent}, ❌ Failed: ${failed}`);
});

// ========== RESTART / DELETE / STATS ==========
bot.action(/restart_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const botId = ctx.match[1];
  const bot = getBots().bots[botId];

  if (!bot) return ctx.reply('Bot not found.');
  if (bot.userId !== ctx.from.id.toString() && !config.adminIds.includes(ctx.from.id.toString())) {
    return ctx.reply('Not your bot!');
  }

  const botDir = path.join(BOTS_DIR, botId);
  const botFile = path.join(botDir, bot.filename);
  const logFile = path.join(LOGS_DIR, `${botId}.log`);
  const runtime = detectRuntime(bot.filename);

  try { fs.writeFileSync(logFile, ''); } catch (e) {}

  const out = fs.openSync(logFile, 'a');
  const err = fs.openSync(logFile, 'a');
  const newProcess = spawn(runtime.cmd, [botFile], {
    cwd: botDir,
    detached: true,
    stdio: ['ignore', out, err],
    env: { ...process.env, PORT: bot.port }
  });
  newProcess.unref();

  bot.pid = newProcess.pid;
  bot.status = 'running';
  bot.restartedAt = Date.now();
  saveBots(getBots());

  ctx.reply(`▶️ Bot <code>${botId}</code> restarted!`, { parse_mode: 'HTML' });
});

bot.action(/delete_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const botId = ctx.match[1];
  const bot = getBots().bots[botId];

  if (!bot) return ctx.reply('Bot not found.');
  if (bot.userId !== ctx.from.id.toString() && !config.adminIds.includes(ctx.from.id.toString())) {
    return ctx.reply('Not your bot!');
  }

  deleteBot(botId);
  ctx.reply(`🗑️ Bot <code>${botId}</code> deleted permanently.`, { parse_mode: 'HTML' });
});

bot.action(/botstats_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const botId = ctx.match[1];
  const stats = getBotStats(botId);

  if (!stats) return ctx.reply('Bot not found.');

  const sysStats = getSystemStats();

  let text = `📊 BOT STATISTICS\n`;
  text += `┌────────────────────────────────┐\n`;
  text += `│ Bot: <b>${stats.filename}</b>\n`;
  text += `│ 🆔 ID: <code>${stats.id}</code>\n`;
  text += `│ 🔌 Port: ${stats.port}\n`;
  text += `│ ⚙️ Runtime: ${stats.runtime}\n`;
  text += `│ 📊 Status: <b>${stats.status.toUpperCase()}</b>\n`;
  text += `├────────────────────────────────┤\n`;

  if (stats.processStats) {
    text += `│ 💻 Process CPU: ${stats.processStats.cpu}\n`;
    text += `│ 🧠 Process RAM: ${stats.processStats.memory}\n`;
    text += `│ ⏱️ Process Uptime: ${stats.processStats.uptime}\n`;
  } else {
    text += `│ Process: Not running\n`;
  }

  text += `├────────────────────────────────┤\n`;
  text += `│ 📦 Directory Size: ${stats.dirSize}\n`;
  text += `│ 📝 Log Size: ${stats.logSize}\n`;
  text += `│ 📅 Deployed: ${new Date(stats.deployedAt).toLocaleString()}\n`;

  if (stats.restartedAt) {
    text += `│ 🔄 Last Restart: ${new Date(stats.restartedAt).toLocaleString()}\n`;
  }

  text += `├────────────────────────────────┤\n`;
  text += `│ 🖥️ Server CPU: ${sysStats.cpuPercent}%\n`;
  text += `│ 🧠 Server RAM: ${sysStats.memPercent}%\n`;
  text += `│ 💾 Server Disk: ${sysStats.diskPercent}%\n`;
  text += `│ 🤖 Total Bots: ${sysStats.runningBots}/${sysStats.maxBots}\n`;
  text += `└────────────────────────────────┘\n`;

  if (stats.lastError) {
    text += `\n⚠️ <b>Recent Errors:</b>\n<pre>${stats.lastError}</pre>`;
  }

  ctx.reply(text, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Back', 'my_bots')]])
  });
});

bot.command('server', async (ctx) => {
  const stats = getSystemStats();

  let text = `🖥️ SERVER STATUS\n\n`;
  text += `Platform: ${stats.platform}\n`;
  text += `Hostname: ${stats.hostname}\n`;
  text += `Uptime: ${stats.uptime}\n\n`;

  text += `💻 CPU (${stats.cpuCount} cores)\n`;
  text += `${progressBar(stats.cpuPercent)} ${stats.cpuPercent}%\n\n`;

  text += `🧠 RAM\n`;
  text += `${progressBar(stats.memPercent)} ${stats.memPercent}%\n`;
  text += `${stats.memUsed} / ${stats.memTotal}\n\n`;

  text += `💾 Disk\n`;
  text += `${progressBar(stats.diskPercent)} ${stats.diskPercent}%\n`;
  text += `${stats.diskUsed} / ${stats.diskTotal}\n\n`;

  text += `🤖 Hosted Bots: ${stats.totalBots} (${stats.runningBots} running / ${stats.maxBots} max)`;

  ctx.reply(text, { parse_mode: 'HTML' });
});

// ========== HELP ==========
bot.action('help_menu', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.reply(
    `❓ How to Use\n\n` +
    `1️⃣ Get ${config.requiredReferrals} referrals or buy premium\n` +
    `2️⃣ Use /host to upload your bot file\n` +
    `3️⃣ Set environment variables if needed\n` +
    `4️⃣ Bot deploys automatically\n` +
    `5️⃣ Use /mybots to manage\n\n` +
    `⚠️ Bots auto-stop after 2 hours idle to save resources.\n\n` +
    `Supported: Node.js, Python, Bash, Ruby, PHP, Go\n\n` +
    `Commands:\n` +
    `/start - Main menu\n` +
    `/host - Deploy bot\n` +
    `/mybots - Your bots\n` +
    `/referral - Referral status\n` +
    `/premium - Premium plans\n` +
    `/server - Server stats\n` +
    `/help - This menu`,
    Markup.inlineKeyboard([[Markup.button.callback('⬅️ Back', 'main_menu')]])
  );
});

bot.action('main_menu', async (ctx) => {
  await ctx.answerCbQuery();
  const user = getUser(ctx.from.id.toString());

  const caption = `🏠 Welcome back, ${ctx.from.first_name}!\n\nUse the buttons below.`;

  // FIXED: Use reply instead of editMessageText to avoid photo/text mismatch
  try {
    if (fs.existsSync(config.welcomeImage)) {
      await ctx.replyWithPhoto({ source: config.welcomeImage }, {
        caption: caption,
        parse_mode: 'HTML',
        ...mainMenuKeyboard(user)
      });
    } else {
      await ctx.reply(caption, {
        parse_mode: 'HTML',
        ...mainMenuKeyboard(user)
      });
    }
  } catch (err) {
    console.error('Main menu error:', err);
    await ctx.reply(caption, {
      parse_mode: 'HTML',
      ...mainMenuKeyboard(user)
    });
  }
});

// ========== LAUNCH ==========
async function launch() {
  try {
    const me = await bot.telegram.getMe();
    console.log(`[HOSTING BOT] @${me.username} started`);
    console.log(`[RESOURCE MGR] Max bots: ${RESOURCE_LIMITS.maxUserBots}, RAM/bot: ${RESOURCE_LIMITS.ramPerBot}MB, Idle timeout: ${RESOURCE_LIMITS.idleTimeout/60000}min`);
    await bot.launch();
  } catch (err) {
    console.error('[BOOT ERROR]', err);
    process.exit(1);
  }
}

launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
