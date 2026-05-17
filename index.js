/*
 * TARRIFIC HOSTING BOT - RENDER READY VERSION
 * Deploy user bots (JS, Python, etc.) with referral system
 * Modified for Render.com deployment
 */

const { Telegraf, Markup } = require('telegraf');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const express = require('express');

// ========== EXPRESS WEB SERVER (Required for Render) ==========
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({
    status: 'online',
    bot: config.botName,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', bot: config.botName });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[WEB SERVER] Running on port ${PORT}`);
});

// ========== DIRECTORIES ==========
const DB_DIR = path.join(__dirname, 'database');
const BOTS_DIR = path.join(__dirname, 'hosted_bots');
const LOGS_DIR = path.join(__dirname, 'logs');

// Ensure directories exist (Render has ephemeral filesystem)
[DB_DIR, BOTS_DIR, LOGS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ========== DATABASE HELPERS ==========
const USERS_FILE = path.join(DB_DIR, 'users.json');
const BOTS_FILE = path.join(DB_DIR, 'bots.json');
const REFERRALS_FILE = path.join(DB_DIR, 'referrals.json');
const PREMIUM_FILE = path.join(DB_DIR, 'premium.json');

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
      referrer: referrer
    };
    saveUsers(db);
  }
  return db.users[userId];
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
    hostname: os.hostname()
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

// ========== BOT STATUS CHECKER ==========
setInterval(() => {
  const db = getBots();
  Object.values(db.bots).forEach(bot => {
    if (bot.status === 'running' && bot.pid) {
      try {
        process.kill(bot.pid, 0);
        bot.lastPing = Date.now();
      } catch (e) {
        bot.status = 'crashed';
        bot.crashedAt = Date.now();
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

  // NOTE: PM2 removed - Render manages processes. Using direct spawn.
  const out = fs.openSync(logFile, 'a');
  const err = fs.openSync(logFile, 'a');
  const newProcess = spawn(runtime.cmd, [botFile], {
    cwd: botDir,
    detached: true,
    stdio: ['ignore', out, err],
    env: { ...process.env, PORT: port, ...envVars }
  });
  newProcess.unref();

  const db = getBots();
  db.bots[botId] = {
    id: botId,
    userId: userId,
    filename: filename,
    port: port,
    runtime: runtime.name,
    status: 'running',
    pid: newProcess.pid,
    deployedAt: Date.now(),
    lastPing: Date.now()
  };
  saveBots(db);

  const users = getUsers();
  if (users.users[userId]) {
    users.users[userId].botsHosted++;
    saveUsers(users);
  }

  return db.bots[botId];
}

function stopBot(botId) {
  const db = getBots();
  const bot = db.bots[botId];
  if (!bot) return false;

  if (bot.pid) {
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

  const payload = ctx.payload;
  let referrer = null;
  if (payload && payload.startsWith('ref_')) {
    referrer = payload.replace('ref_', '');
    if (referrer !== userId) {
      addReferral(referrer, userId);

      try {
        const refUser = getUser(referrer);
        if (refUser) {
          const refCount = refUser.referralCount;
          const needed = Math.max(0, config.requiredReferrals - refCount);

          await ctx.telegram.sendMessage(referrer,
            `New referral! ${firstName} joined using your link.\n\nProgress: ${refCount}/${config.requiredReferrals}\n${needed > 0 ? `Need ${needed} more to unlock hosting!` : 'You can now host bots!'}`
          );

          if (refCount === config.requiredReferrals) {
            try {
              await ctx.telegram.sendMessage(config.proofChannel,
                `Proof of Referral\n\nUser: ${refUser.firstName}\nID: <code>${referrer}</code>\nCompleted: ${config.requiredReferrals} referrals\nStatus: Hosting unlocked`,
                { parse_mode: 'HTML' }
              );
            } catch (e) {}
          }
        }
      } catch (e) {}
    }
  }

  const user = createUser(userId, username, firstName, referrer);

  const joined = await checkForceJoin(ctx, userId);
  if (!joined) {
    return sendForceJoin(ctx);
  }

  const caption = `Welcome to ${config.botName}, ${firstName}!\n\nThis bot lets you deploy your own bots (JS, Python, and more).\n\nFree Plan: 1 bot\nPremium: Unlimited bots\n\nYour referral link: ${getReferralLink(userId)}\nReferrals: ${user.referralCount}/${config.requiredReferrals}\n\nUse /host to deploy a bot`;

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
});

// ========== KEYBOARDS ==========
function mainMenuKeyboard(user) {
  const buttons = [
    [Markup.button.callback('Deploy Bot', 'deploy_menu')],
    [Markup.button.callback('My Bots', 'my_bots')],
    [Markup.button.callback('Referrals', 'referral_status')],
    [Markup.button.callback('Premium', 'premium_menu')],
    [Markup.button.callback('Help', 'help_menu')]
  ];

  if (config.adminIds.includes(user.id)) {
    buttons.push([Markup.button.callback('Admin Panel', 'admin_panel')]);
  }

  return Markup.inlineKeyboard(buttons);
}

function deployMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Upload Bot File', 'upload_bot')],
    [Markup.button.callback('Back', 'main_menu')]
  ]);
}

function premiumMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Buy Premium (Stars)', 'buy_premium_stars')],
    [Markup.button.callback('Buy Premium (Manual)', 'buy_premium_manual')],
    [Markup.button.callback('Back', 'main_menu')]
  ]);
}

function adminMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('All Bots', 'admin_bots')],
    [Markup.button.callback('All Users', 'admin_users')],
    [Markup.button.callback('Add Premium', 'admin_add_premium')],
    [Markup.button.callback('Stop Bot', 'admin_stop_bot')],
    [Markup.button.callback('Broadcast', 'admin_broadcast')],
    [Markup.button.callback('Back', 'main_menu')]
  ]);
}

// ========== FORCE JOIN ==========
async function sendForceJoin(ctx) {
  const channels = config.forceJoinChannels.map((ch, i) => {
    const name = config.channelNames[i] || `Channel ${i+1}`;
    return [{ text: `Join ${name}`, url: ch.replace('@', 'https://t.me/') }];
  });

  channels.push([Markup.button.callback('I Have Joined', 'check_join')]);

  await ctx.reply(
    `You must join our channels to use this bot.\n\nJoin all channels below, then click "I Have Joined".`,
    Markup.inlineKeyboard(channels)
  );
}

bot.action('check_join', async (ctx) => {
  const joined = await checkForceJoin(ctx, ctx.from.id);
  if (joined) {
    await ctx.answerCbQuery('Verified!');
    await ctx.deleteMessage();
    await ctx.reply('Welcome! Use /start to continue.');
  } else {
    await ctx.answerCbQuery('You have not joined all channels!', { show_alert: true });
  }
});

// ========== DEPLOYMENT ==========
const pendingUploads = new Map();

bot.action('deploy_menu', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id.toString();
  const user = getUser(userId);

  if (!hasEnoughReferrals(userId) && !user.isPremium) {
    return ctx.editMessageText(
      `You need ${config.requiredReferrals} referrals to host bots.\n\nYour progress: ${user.referralCount}/${config.requiredReferrals}\n\nReferral link: ${getReferralLink(userId)}`,
      Markup.inlineKeyboard([
        [Markup.button.callback('My Referrals', 'referral_status')],
        [Markup.button.callback('Buy Premium', 'premium_menu')],
        [Markup.button.callback('Back', 'main_menu')]
      ])
    );
  }

  const userBots = getUserBots(userId);
  const maxBots = user.maxBots;

  if (userBots.length >= maxBots) {
    return ctx.editMessageText(
      `You have reached your limit of ${maxBots} bot(s).\n\nUpgrade to premium for more slots.`,
      premiumMenuKeyboard()
    );
  }

  ctx.editMessageText(
    `Deploy Your Bot\n\nSupported: .js (Node.js), .py (Python), .sh (Bash), and more.\n\nClick "Upload Bot File" to send your file.`,
    deployMenuKeyboard()
  );
});

bot.action('upload_bot', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id.toString();
  pendingUploads.set(userId, { step: 'waiting_file' });

  ctx.editMessageText(
    `Please send your bot file now.\n\nSupported formats:\n- .js (Node.js)\n- .py (Python 3)\n- .sh (Bash)\n- .rb (Ruby)\n- .php (PHP)\n- .go (Go)\n\nMax file size: 10MB`,
    Markup.inlineKeyboard([[Markup.button.callback('Cancel', 'main_menu')]])
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
    return ctx.reply(`Unsupported file type: ${ext}\n\nAllowed: ${allowedExts.join(', ')}`);
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
    `File received: ${filename}\n\nDo you need to set environment variables? (TOKEN, API_KEY, etc.)\n\nReply with variables in format:\nKEY=value\nKEY2=value2\n\nOr reply "skip" to continue without env vars.`,
    Markup.inlineKeyboard([[Markup.button.callback('Skip', 'skip_env')]])
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
  const deployingMsg = await ctx.reply('Deploying your bot... Please wait.');

  try {
    const botInfo = await deployBot(userId, filename, content, envVars);

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      deployingMsg.message_id,
      null,
      `Bot Deployed Successfully!\n\n` +
      `ID: <code>${botInfo.id}</code>\n` +
      `File: ${botInfo.filename}\n` +
      `Runtime: ${botInfo.runtime}\n` +
      `Port: ${botInfo.port}\n` +
      `Status: ${botInfo.status}\n\n` +
      `Use /mybots to manage your bots.`,
      { parse_mode: 'HTML', ...Markup.inlineKeyboard([
        [Markup.button.callback('My Bots', 'my_bots')],
        [Markup.button.callback('View Logs', `logs_${botInfo.id}`)],
        [Markup.button.callback('Main Menu', 'main_menu')]
      ])}
    );
  } catch (err) {
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      deployingMsg.message_id,
      null,
      `Deployment Failed!\n\nError: ${err.message}`,
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
    return ctx.editMessageText(
      'You have no deployed bots.\n\nUse /host to deploy one.',
      Markup.inlineKeyboard([[Markup.button.callback('Deploy Bot', 'deploy_menu')], [Markup.button.callback('Back', 'main_menu')]])
    );
  }

  const sysStats = getSystemStats();
  let text = `📊 SERVER OVERVIEW\n`;
  text += `┌─────────────────────────────┐\n`;
  text += `│ CPU: ${sysStats.cpuPercent}% ${progressBar(sysStats.cpuPercent)}\n`;
  text += `│ RAM: ${sysStats.memUsed} / ${sysStats.memTotal} (${sysStats.memPercent}%)\n`;
  text += `│ Disk: ${sysStats.diskUsed} / ${sysStats.diskTotal} (${sysStats.diskPercent}%)\n`;
  text += `│ Uptime: ${sysStats.uptime}\n`;
  text += `└─────────────────────────────┘\n\n`;

  text += `🤖 YOUR BOTS (${bots.length}):\n\n`;

  const buttons = [];

  for (const bot of bots) {
    const stats = getBotStats(bot.id);
    const statusEmoji = stats.isActuallyRunning ? '🟢' : (stats.status === 'crashed' ? '🔴' : '🟡');

    text += `${statusEmoji} <b>${bot.filename}</b>\n`;
    text += `   ID: <code>${bot.id}</code>\n`;
    text += `   Port: ${bot.port} | Runtime: ${bot.runtime}\n`;
    text += `   Status: <b>${stats.status.toUpperCase()}</b>\n`;

    if (stats.processStats) {
      text += `   CPU: ${stats.processStats.cpu} | RAM: ${stats.processStats.memory}\n`;
      text += `   Process Uptime: ${stats.processStats.uptime}\n`;
    }

    text += `   Size: ${stats.dirSize} | Logs: ${stats.logSize}\n`;

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

  ctx.editMessageText(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
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
  ctx.reply(`Bot <code>${botId}</code> stopped.`, { parse_mode: 'HTML' });
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

  ctx.reply(`Last logs for <code>${botId}</code>:\n\n<pre>${truncated}</pre>`, { parse_mode: 'HTML' });
});

// ========== REFERRALS ==========
bot.action('referral_status', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id.toString();
  const user = getUser(userId);

  if (!user) return ctx.reply('User not found. Use /start first.');

  const refDB = getReferrals();
  const referredList = refDB.referrals[userId] || [];

  let text = `Your Referral Status\n\n`;
  text += `Link: ${getReferralLink(userId)}\n`;
  text += `Progress: ${user.referralCount}/${config.requiredReferrals}\n`;
  text += `Status: ${hasEnoughReferrals(userId) ? 'Unlocked' : 'Locked'}\n\n`;

  if (referredList.length > 0) {
    text += `Referred Users (${referredList.length}):\n`;
    referredList.forEach((id, i) => {
      text += `${i+1}. <code>${id}</code>\n`;
    });
  }

  ctx.editMessageText(text, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('Copy Link', 'copy_ref_link')],
      [Markup.button.callback('Back', 'main_menu')]
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
  ctx.editMessageText(
    `Premium Plans\n\n` +
    `Free: 1 bot slot\n` +
    `Premium: Unlimited bots\n\n` +
    `Pricing:\n` +
    `1. Telegram Stars (in-app)\n` +
    `2. Manual payment (contact admin)\n\n` +
    `Contact: @${config.ownerUsername}`,
    premiumMenuKeyboard()
  );
});

bot.action('buy_premium_stars', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.editMessageText(
    `Premium via Telegram Stars\n\n` +
    `5 slots - 500 Stars\n` +
    `10 slots - 900 Stars\n` +
    `Unlimited - 1500 Stars\n\n` +
    `Click below to pay:`,
    Markup.inlineKeyboard([
      [Markup.button.callback('5 Slots (500)', 'stars_5_500')],
      [Markup.button.callback('10 Slots (900)', 'stars_10_900')],
      [Markup.button.callback('Unlimited (1500)', 'stars_unli_1500')],
      [Markup.button.callback('Back', 'premium_menu')]
    ])
  );
});

bot.action('buy_premium_manual', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.editMessageText(
    `Manual Payment\n\n` +
    `Contact @${config.ownerUsername} directly.\n\n` +
    `Send your User ID: <code>${ctx.from.id}</code>\n` +
    `And mention how many slots you want.`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('Back', 'premium_menu')]]) }
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
  ctx.reply(`Premium added for <code>${targetId}</code>\nSlots: ${slots}\nDays: ${days}`, { parse_mode: 'HTML' });

  try {
    await ctx.telegram.sendMessage(targetId,
      `Premium Activated!\n\nSlots: ${slots}\nExpires: ${new Date(Date.now() + days*86400000).toLocaleDateString()}\n\nUse /host to deploy more bots.`
    );
  } catch (e) {}
});

// ========== ADMIN PANEL ==========
bot.action('admin_panel', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id.toString();
  if (!config.adminIds.includes(userId)) return ctx.answerCbQuery('Admin only!', { show_alert: true });

  ctx.editMessageText('Admin Panel', adminMenuKeyboard());
});

bot.action('admin_bots', async (ctx) => {
  await ctx.answerCbQuery();
  const db = getBots();
  const bots = Object.values(db.bots);

  let text = `All Hosted Bots (${bots.length})\n\n`;
  bots.forEach(b => {
    text += `<code>${b.id}</code> | ${b.filename} | Port ${b.port} | ${b.status}\n`;
  });

  ctx.editMessageText(text || 'No bots hosted.', { parse_mode: 'HTML', ...adminMenuKeyboard() });
});

bot.action('admin_users', async (ctx) => {
  await ctx.answerCbQuery();
  const db = getUsers();
  const users = Object.values(db.users);

  let text = `All Users (${users.length})\n\n`;
  users.slice(0, 50).forEach(u => {
    text += `<code>${u.id}</code> | ${u.firstName} | Refs: ${u.referralCount} | Bots: ${u.botsHosted}\n`;
  });

  ctx.editMessageText(text || 'No users.', { parse_mode: 'HTML', ...adminMenuKeyboard() });
});

bot.action('admin_add_premium', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.editMessageText(
    'Use command:\n/addpremium <userId> <slots> <days>',
    adminMenuKeyboard()
  );
});

bot.action('admin_stop_bot', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.editMessageText(
    'Reply with bot ID to stop:\n/stopbot <botId>',
    adminMenuKeyboard()
  );
});

bot.command('stopbot', async (ctx) => {
  if (!config.adminIds.includes(ctx.from.id.toString())) return;
  const botId = ctx.message.text.split(' ')[1];
  if (!botId) return ctx.reply('Usage: /stopbot <botId>');

  stopBot(botId);
  ctx.reply(`Bot <code>${botId}</code> stopped.`, { parse_mode: 'HTML' });
});

bot.action('admin_broadcast', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.editMessageText(
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
      await ctx.telegram.sendMessage(user.id, `Broadcast:\n\n${msg}`);
      sent++;
    } catch (e) { failed++; }
  }

  ctx.reply(`Broadcast sent! Success: ${sent}, Failed: ${failed}`);
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

  ctx.reply(`Bot <code>${botId}</code> restarted!`, { parse_mode: 'HTML' });
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
  ctx.reply(`Bot <code>${botId}</code> deleted permanently.`, { parse_mode: 'HTML' });
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
  text += `│ ID: <code>${stats.id}</code>\n`;
  text += `│ Port: ${stats.port}\n`;
  text += `│ Runtime: ${stats.runtime}\n`;
  text += `│ Status: <b>${stats.status.toUpperCase()}</b>\n`;
  text += `├────────────────────────────────┤\n`;

  if (stats.processStats) {
    text += `│ Process CPU: ${stats.processStats.cpu}\n`;
    text += `│ Process RAM: ${stats.processStats.memory}\n`;
    text += `│ Process Uptime: ${stats.processStats.uptime}\n`;
  } else {
    text += `│ Process: Not running\n`;
  }

  text += `├────────────────────────────────┤\n`;
  text += `│ Directory Size: ${stats.dirSize}\n`;
  text += `│ Log Size: ${stats.logSize}\n`;
  text += `│ Deployed: ${new Date(stats.deployedAt).toLocaleString()}\n`;

  if (stats.restartedAt) {
    text += `│ Last Restart: ${new Date(stats.restartedAt).toLocaleString()}\n`;
  }

  text += `├────────────────────────────────┤\n`;
  text += `│ Server CPU: ${sysStats.cpuPercent}%\n`;
  text += `│ Server RAM: ${sysStats.memPercent}%\n`;
  text += `│ Server Disk: ${sysStats.diskPercent}%\n`;
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

  text += `CPU (${stats.cpuCount} cores)\n`;
  text += `${progressBar(stats.cpuPercent)} ${stats.cpuPercent}%\n\n`;

  text += `RAM\n`;
  text += `${progressBar(stats.memPercent)} ${stats.memPercent}%\n`;
  text += `${stats.memUsed} / ${stats.memTotal}\n\n`;

  text += `Disk\n`;
  text += `${progressBar(stats.diskPercent)} ${stats.diskPercent}%\n`;
  text += `${stats.diskUsed} / ${stats.diskTotal}\n\n`;

  const db = getBots();
  const totalBots = Object.keys(db.bots).length;
  const runningBots = Object.values(db.bots).filter(b => b.status === 'running').length;
  text += `Hosted Bots: ${totalBots} (${runningBots} running)`;

  ctx.reply(text, { parse_mode: 'HTML' });
});

// ========== HELP ==========
bot.action('help_menu', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.editMessageText(
    `How to Use\n\n` +
    `1. Get ${config.requiredReferrals} referrals or buy premium\n` +
    `2. Use /host to upload your bot file\n` +
    `3. Set environment variables if needed\n` +
    `4. Bot deploys automatically\n` +
    `5. Use /mybots to manage\n\n` +
    `Supported: Node.js, Python, Bash, Ruby, PHP, Go\n\n` +
    `Commands:\n` +
    `/start - Main menu\n` +
    `/host - Deploy bot\n` +
    `/mybots - Your bots\n` +
    `/referral - Referral status\n` +
    `/premium - Premium plans\n` +
    `/help - This menu`,
    Markup.inlineKeyboard([[Markup.button.callback('Back', 'main_menu')]])
  );
});

bot.action('main_menu', async (ctx) => {
  await ctx.answerCbQuery();
  const user = getUser(ctx.from.id.toString());
  const caption = `Welcome back, ${ctx.from.first_name}!\n\nUse the buttons below.`;

  if (fs.existsSync(config.welcomeImage)) {
    await ctx.editMessageMedia(
      { type: 'photo', media: { source: config.welcomeImage }, caption: caption, parse_mode: 'HTML' },
      { ...mainMenuKeyboard(user) }
    );
  } else {
    await ctx.editMessageText(caption, { parse_mode: 'HTML', ...mainMenuKeyboard(user) });
  }
});

// ========== LAUNCH ==========
async function launch() {
  try {
    const me = await bot.telegram.getMe();
    console.log(`[HOSTING BOT] @${me.username} started`);
    await bot.launch();
  } catch (err) {
    console.error('[BOOT ERROR]', err);
    process.exit(1);
  }
}

launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
