// botManager.js
import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import QRCode from 'qrcode';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

// --- Folders & paths ---
const AUTH_ROOT = './auth';
const PUBLIC_ROOT = join(process.cwd(), 'public');

if (!existsSync(AUTH_ROOT)) mkdirSync(AUTH_ROOT, { recursive: true });
if (!existsSync(PUBLIC_ROOT)) mkdirSync(PUBLIC_ROOT, { recursive: true });

// --- In-memory stores ---
/**
 * sessions = {
 *   <userId>: {
 *     sock, // Baileys socket instance
 *     features: { autoview: true, faketyping: true, autoreact: false },
 *     blocklist: [ '1234@s.whatsapp.net', ... ],
 *     statusCache: { ... },
 *     activePairCodes: { code: expiresAtTimestamp }
 *   }
 * }
 */
const sessions = {};

// Helper: ensure per-user storage files exist and return paths
function ensureUserFiles(userId) {
  const userAuth = join(AUTH_ROOT, userId);
  if (!existsSync(userAuth)) mkdirSync(userAuth, { recursive: true });

  const userBlocklist = join(userAuth, 'blocklist.json');
  const userFeatures = join(userAuth, 'features.json');

  if (!existsSync(userBlocklist)) writeFileSync(userBlocklist, JSON.stringify([]), 'utf8');
  if (!existsSync(userFeatures)) writeFileSync(userFeatures, JSON.stringify({
    autoview: true,
    faketyping: true,
    autoreact: false
  }), 'utf8');

  return { userAuth, userBlocklist, userFeatures };
}

// Helper to load per-user config
function loadUserConfig(userId) {
  const { userBlocklist, userFeatures } = ensureUserFiles(userId);
  let blocklist = [];
  let features = { autoview: true, faketyping: true, autoreact: false };

  try { blocklist = JSON.parse(readFileSync(userBlocklist, 'utf8')); } catch (e) {}
  try { features = JSON.parse(readFileSync(userFeatures, 'utf8')); } catch (e) {}

  return { blocklist, features, userBlocklist, userFeatures };
}

// Helper to save per-user config
function saveUserConfig(userId, { blocklist, features }) {
  const { userBlocklist, userFeatures } = ensureUserFiles(userId);
  try { writeFileSync(userBlocklist, JSON.stringify(blocklist, null, 2), 'utf8'); } catch (e) {}
  try { writeFileSync(userFeatures, JSON.stringify(features, null, 2), 'utf8'); } catch (e) {}
}

// --- Start a session for a user ---
export async function startSession(userId) {
  if (!userId) throw new Error('startSession requires userId');

  // If already running, just return
  if (sessions[userId] && sessions[userId].sock) {
    console.log(`♻ session already exists for "${userId}"`);
    return;
  }

  const { userAuth } = ensureUserFiles(userId);
  const { state, saveCreds } = await useMultiFileAuthState(userAuth);
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`📦 Baileys v${version.join('.')}, latest: ${isLatest} — starting session for "${userId}"`);

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: ['DansBot', 'Chrome', '122']
  });

  // Setup session container
  const { blocklist, features } = loadUserConfig(userId);
  sessions[userId] = {
    sock,
    features,
    blocklist,
    statusCache: {},
    activePairCodes: {}
  };

  // Persist credentials updates
  sock.ev.on('creds.update', saveCreds);

  // Connection updates: QR saving, open/close handling
  sock.ev.on('connection.update', (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr) {
      try {
        const qrPath = join(PUBLIC_ROOT, `${userId}-qr.png`);
        QRCode.toFile(qrPath, qr, (err) => {
          if (err) console.error(`❌ Failed to save QR for ${userId}:`, err);
          else console.log(`✅ QR saved for ${userId} -> ${qrPath}`);
        });
      } catch (e) {
        console.error('❌ QR save error:', e);
      }
    }

    if (connection === 'open') {
      console.log(`✅ ${userId} connected`);
      try { setupListeners(userId); } catch (e) { console.error(e); }
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error instanceof Boom ? lastDisconnect.error.output.statusCode : 'unknown';
      console.log(`❌ ${userId} disconnected (code ${code})`);
      if (code !== DisconnectReason.loggedOut) {
        // try reconnect
        setTimeout(() => startSession(userId).catch(err => console.error(err)), 2000);
      } else {
        console.log(`🗑️ Removing session for ${userId} (logged out)`);
        delete sessions[userId];
      }
    }
  });

  // Basic logs for socket readiness
  sock.ev.on('connection.phone_change', info => {
    console.log(`⚠ phone change for ${userId}:`, info);
  });

  return;
}

// --- Generate pairing code for a user (1 minute expiry) ---
/**
 * generateLinkingCode(userId)
 * returns: { code: string, expiresAt: timestamp } or throws
 */
export async function generateLinkingCode(userId) {
  if (!userId) throw new Error('generateLinkingCode requires userId');

  // If session exists and socket supports requestPairingCode use it
  const sess = sessions[userId];
  if (sess && sess.sock && typeof sess.sock.requestPairingCode === 'function') {
    try {
      const code = await sess.sock.requestPairingCode(userId);
      const expiresAt = Date.now() + 60_000;
      sess.activePairCodes[code] = expiresAt;
      // schedule expiry
      setTimeout(() => {
        if (sessions[userId]) delete sessions[userId].activePairCodes[code];
        console.log(`⏳ pairing code expired for ${userId}: ${code}`);
      }, 60_000);
      console.log(`🔑 pairing code (existing sock) for ${userId}: ${code}`);
      return code;
    } catch (err) {
      console.warn(`⚠ failed requestPairingCode on existing sock for ${userId}:`, err?.message || err);
      // fallthrough to make a temporary socket
    }
  }

  // Otherwise create a temporary socket to request pairing code (doesn't save creds)
  const { userAuth } = ensureUserFiles(userId);
  const { state } = await useMultiFileAuthState(userAuth);
  const { version } = await fetchLatestBaileysVersion();

  const tmpSock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: ['DansBot', 'TempPair', '1.0']
  });

  try {
    if (typeof tmpSock.requestPairingCode !== 'function') {
      tmpSock.ws.close();
      throw new Error('requestPairingCode not supported by this Baileys version.');
    }
    const code = await tmpSock.requestPairingCode(userId);
    const expiresAt = Date.now() + 60_000;

    // store in sessions map so index.js or consumers can check
    if (!sessions[userId]) sessions[userId] = { activePairCodes: {}, statusCache: {}, blocklist: [], features: {} };
    sessions[userId].activePairCodes = sessions[userId].activePairCodes || {};
    sessions[userId].activePairCodes[code] = expiresAt;

    setTimeout(() => {
      if (sessions[userId]) delete sessions[userId].activePairCodes[code];
      console.log(`⏳ pairing code expired for ${userId}: ${code}`);
    }, 60_000);

    // close temporary socket after short delay
    setTimeout(() => {
      try { tmpSock.ws.close(); } catch (e) {}
    }, 3000);

    console.log(`🔑 pairing code (temp sock) for ${userId}: ${code}`);
    return code;
  } catch (err) {
    try { tmpSock.ws.close(); } catch (e) {}
    throw err;
  }
}

// --- Internal: format menu text ---
function getMenuText(features) {
  return `📜 Menu:
• .ping
• .alive
• .status
• .menu
• .broadcast <msg>
• .block <number>
• .unblock <number>
• .toggle <feature>
• .paircode
• .pairme
• .quote
• .weather <city>`;
}

// --- Setup listeners for an already-started session userId ---
function setupListeners(userId) {
  const sess = sessions[userId];
  if (!sess || !sess.sock) throw new Error(`No sock for ${userId}`);

  const sock = sess.sock;

  // messages.upsert
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    for (const msg of messages) {
      if (!msg.message) continue;
      if (msg.key && msg.key.fromMe) continue;

      // handle
      try { await handleIncomingMessage(userId, msg); } catch (e) { console.error(e); }
    }
  });

  // antidelete: messages.update (messageStubType === 8 is deleted)
  sock.ev.on('messages.update', async updates => {
    for (const u of updates) {
      try {
        if (u.messageStubType === 8 && u.key) {
          const chatId = u.key.remoteJid;
          const msgId = u.key.id;
          try {
            const original = await sock.loadMessage(chatId, msgId).catch(() => null);
            if (original?.message) {
              await sock.sendMessage(chatId, { text: `🚨 Antidelete:\n${JSON.stringify(original.message, null, 2)}` });
              console.log(`🛡 antidelete restored message for ${userId} in ${chatId}`);
            }
          } catch (e) {
            // not critical
          }
        }
      } catch (e) { /* ignore */ }
    }
  });

  // presence / keep-alive
  setInterval(() => {
    try { sock.sendPresenceUpdate('available'); } catch (e) {}
  }, 30_000);

  // autoview & monitor placeholders (every minute)
  setInterval(() => {
    try { autoviewStatus(userId); } catch (e) {}
  }, 60_000);
}

// --- Incoming message handler for a given userId ---
async function handleIncomingMessage(userId, msg) {
  const sess = sessions[userId];
  if (!sess || !sess.sock) throw new Error(`No session for ${userId}`);

  const sock = sess.sock;
  const { blocklist, features } = sess;

  // resolve text
  const sender = msg.key.remoteJid;
  const text =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    '';

  const command = (text || '').trim();

  // ignore if blocked
  if (blocklist && blocklist.includes(sender)) {
    console.log(`⛔ blocked ${sender} for ${userId}`);
    return;
  }

  console.log(`📨 [${userId}] from ${sender}: ${command}`);

  const lc = command.toLowerCase();

  // Basic commands
  if (lc === '.ping') return await sock.sendMessage(sender, { text: '🏓 Pong!' });
  if (lc === '.alive') return await sock.sendMessage(sender, { text: '✅ Bot is alive!' });
  if (lc === '.menu' || lc === '.help') return await sock.sendMessage(sender, { text: getMenuText(features) });
  if (lc === '.status') return await sock.sendMessage(sender, { text: `📊 Features:\n${Object.entries(features).map(([k, v]) => `• ${k}: ${v ? '✅' : '❌'}`).join('\n')}` });

  // .paircode - bot replies with pairing code
  if (lc === '.paircode') {
    try {
      const code = await generateLinkingCode(userId);
      if (code) await sock.sendMessage(sender, { text: `🔑 Pairing code (valid 1 min): ${code}` });
      else await sock.sendMessage(sender, { text: '❌ Could not generate pairing code.' });
    } catch (err) {
      await sock.sendMessage(sender, { text: `❌ Error generating pairing code.` });
    }
    return;
  }

  // .pairme - sends pairing code to the bot owner? Historically used; here we respond with pair code
  if (lc === '.pairme') {
    try {
      const code = await generateLinkingCode(userId);
      if (code) await sock.sendMessage(sender, { text: `🔑 Pairing code (valid 1 min): ${code}` });
      else await sock.sendMessage(sender, { text: '❌ Could not generate pairing code.' });
    } catch (err) {
      await sock.sendMessage(sender, { text: '❌ Error generating code.' });
    }
    return;
  }

  // .quote (uses quotable)
  if (lc.startsWith('.quote')) {
    try {
      const r = await fetch('https://api.quotable.io/random');
      const j = await r.json();
      await sock.sendMessage(sender, { text: `💡 ${j.content} — ${j.author}` });
    } catch (e) {
      await sock.sendMessage(sender, { text: '❌ Failed to fetch quote.' });
    }
    return;
  }

  // .weather <city>
  if (lc.startsWith('.weather')) {
    const city = command.substring(8).trim();
    if (!city) return await sock.sendMessage(sender, { text: '⚠️ Usage: .weather <city>' });
    try {
      const key = process.env.WEATHER_API_KEY;
      if (!key) return await sock.sendMessage(sender, { text: '⚠️ WEATHER_API_KEY not set.' });
      const resp = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${key}&units=metric`);
      const j = await resp.json();
      if (j?.cod !== 200) return await sock.sendMessage(sender, { text: `❌ Weather error: ${j.message || 'not found'}` });
      await sock.sendMessage(sender, { text: `🌤 ${j.name}: ${j.weather[0].description}\n🌡 Temp: ${j.main.temp}°C\n💧 Humidity: ${j.main.humidity}%` });
    } catch (e) {
      await sock.sendMessage(sender, { text: '❌ Failed to fetch weather.' });
    }
    return;
  }

  // .broadcast <msg>
  if (lc.startsWith('.broadcast ')) {
    const message = command.replace(/\.broadcast\s*/i, '').trim();
    if (!message) return await sock.sendMessage(sender, { text: '⚠️ Provide a message: .broadcast Hello' });
    try {
      const chats = await sock.groupFetchAllParticipating();
      for (const id of Object.keys(chats)) {
        await sock.sendMessage(id, { text: `📢 Broadcast:\n${message}` }).catch(() => {});
      }
      await sock.sendMessage(sender, { text: '✅ Broadcast sent to groups.' });
    } catch (e) {
      await sock.sendMessage(sender, { text: '❌ Broadcast failed.' });
    }
    return;
  }

  // .block <number>
  if (lc.startsWith('.block ')) {
    const number = command.replace(/\.block\s*/i, '').trim();
    if (!number) return await sock.sendMessage(sender, { text: '⚠️ Provide number with country code, e.g. 2547...' });
    const jid = number.includes('@') ? number : `${number}@s.whatsapp.net`;
    if (!sess.blocklist.includes(jid)) {
      sess.blocklist.push(jid);
      saveUserConfig(userId, { blocklist: sess.blocklist, features: sess.features });
      await sock.sendMessage(sender, { text: `✅ Blocked ${jid}` });
    } else {
      await sock.sendMessage(sender, { text: `⚠️ Already blocked.` });
    }
    return;
  }

  // .unblock <number>
  if (lc.startsWith('.unblock ')) {
    const number = command.replace(/\.unblock\s*/i, '').trim();
    const jid = number.includes('@') ? number : `${number}@s.whatsapp.net`;
    sess.blocklist = sess.blocklist.filter(x => x !== jid);
    saveUserConfig(userId, { blocklist: sess.blocklist, features: sess.features });
    await sock.sendMessage(sender, { text: `✅ Unblocked ${jid}` });
    return;
  }

  // .toggle <feature>
  if (lc.startsWith('.toggle ')) {
    const feat = command.replace(/\.toggle\s*/i, '').trim();
    if (!feat || !('features' in sess)) return await sock.sendMessage(sender, { text: '⚠️ Usage: .toggle <feature>' });
    if (!(feat in sess.features)) return await sock.sendMessage(sender, { text: `❌ Unknown feature: ${feat}` });
    sess.features[feat] = !sess.features[feat];
    saveUserConfig(userId, { blocklist: sess.blocklist, features: sess.features });
    await sock.sendMessage(sender, { text: `🔁 ${feat} is now ${sess.features[feat] ? 'enabled' : 'disabled'}` });
    return;
  }

  // Default: autoread & optional autoreact
  try { await sock.readMessages([msg.key]); } catch (e) {}
  if (sess.features.autoreact) {
    try { await sock.sendMessage(sender, { react: { text: '❤️', key: msg.key } }); } catch (e) {}
  }
  // fake typing if enabled
  if (sess.features.faketyping) {
    try {
      await sock.sendPresenceUpdate('composing', sender);
      await new Promise(r => setTimeout(r, 1200));
      await sock.sendPresenceUpdate('paused', sender);
    } catch (e) {}
  }
}

// --- Autoview status placeholder ---
// Many Baileys versions removed getStatus/readStatus APIs; we include a safe placeholder.
async function autoviewStatus(userId) {
  try {
    const sess = sessions[userId];
    if (!sess) return;
    if (!sess.features.autoview) return;

    // If Baileys exposes a status API in your version, implement here.
    // For now we log a placeholder.
    console.log(`👁️ autoview (placeholder) for ${userId}`);
  } catch (e) {
    console.error('❌ autoview error:', e);
  }
}

// --- Exported helper: list active sessions (useful for debugging) ---
export function listSessions() {
  return Object.keys(sessions);
}

// --- Exported helper: get QR filename for user (useful for index.js) ---
export function getUserQrPath(userId) {
  return `/` + `${userId}-qr.png`;
}

// --- Always export startSession, generateLinkingCode, listSessions, getUserQrPath ---
export default {
  startSession,
  generateLinkingCode,
  listSessions,
  getUserQrPath
};