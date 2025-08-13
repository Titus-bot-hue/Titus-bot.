// botManager.js
import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  generateRegistrationCode
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import QRCode from 'qrcode';
import dotenv from 'dotenv';

dotenv.config();

// === FOLDERS ===
const authFolder = './auth';
const publicFolder = join(process.cwd(), 'public');
if (!existsSync(authFolder)) mkdirSync(authFolder);
if (!existsSync(publicFolder)) mkdirSync(publicFolder);

// === FILES ===
const usersPath = './users.json';
let users = existsSync(usersPath) ? JSON.parse(readFileSync(usersPath)) : [];

// === FEATURES TOGGLES ===
let features = {
  autoread: true,
  autoview: true,
  faketyping: true,
  weather: true,
  quotes: true
};

// === SAVE USERS FUNCTION ===
function saveUsers() {
  writeFileSync(usersPath, JSON.stringify(users, null, 2));
}

// === START SESSION ===
export async function startSession(sessionId, usePairingCode = false) {
  const { state, saveCreds } = await useMultiFileAuthState(join(authFolder, sessionId));
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    browser: ['DansBot', 'Chrome', '122']
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr && !usePairingCode) {
      const qrPath = join(publicFolder, `${sessionId}_qr.png`);
      QRCode.toFile(qrPath, qr, (err) => {
        if (err) console.error(`❌ QR save error for ${sessionId}:`, err);
        else console.log(`✅ QR saved: ${qrPath}`);
      });
    }

    if (connection === 'open') {
      console.log(`✅ Session "${sessionId}" connected`);
      if (!users.includes(sessionId)) {
        users.push(sessionId);
        saveUsers();
      }
      setupListeners(sock, sessionId);
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error instanceof Boom
        ? lastDisconnect.error.output.statusCode
        : 'unknown';
      console.log(`❌ Session "${sessionId}" closed. Code: ${code}`);
      if (code !== DisconnectReason.loggedOut) {
        console.log(`🔁 Reconnecting "${sessionId}"...`);
        startSession(sessionId, usePairingCode);
      }
    }
  });

  if (usePairingCode) {
    try {
      const code = await generateRegistrationCode(sock, process.env.ADMIN_PHONE || '');
      console.log(`📲 Pairing code for ${sessionId}: ${code}`);
    } catch (err) {
      console.error('❌ Pairing code error:', err);
    }
  }
}

// === FEATURES ===
async function handleIncomingMessage(sock, msg) {
  const sender = msg.key.remoteJid;
  const text = msg.message?.conversation || '';
  const command = text.trim().toLowerCase();

  // Commands
  const commands = {
    '.ping': '🏓 Pong!',
    '.alive': '✅ DansBot is alive!',
    '.menu': `📜 Menu:
• .ping
• .alive
• .quote
• .weather <city>
• .menu`
  };

  if (command in commands) {
    await sock.sendMessage(sender, { text: commands[command] });
    return;
  }

  if (command === '.quote' && features.quotes) {
    await sock.sendMessage(sender, { text: '💡 "Coming soon inspirational quote feature!"' });
  }

  if (command.startsWith('.weather') && features.weather) {
    await sock.sendMessage(sender, { text: '🌦️ "Weather feature coming soon!"' });
  }

  // Autoread
  if (features.autoread) {
    try {
      await sock.readMessages([msg.key]);
      console.log(`👁️ Read message from ${sender}`);
    } catch (err) {
      console.error('❌ Autoread error:', err);
    }
  }

  // Faketyping
  if (features.faketyping) {
    await sock.sendPresenceUpdate('composing', sender);
    await new Promise(res => setTimeout(res, 2000));
    await sock.sendPresenceUpdate('paused', sender);
  }
}

// === STATUS VIEWING ===
async function autoviewStatus(sock) {
  if (!features.autoview) return;
  console.log('👁️ Autoview status — Coming soon in new Baileys update');
}

// === ONLINE KEEP ALIVE ===
function stayOnline(sock) {
  setInterval(() => {
    sock.sendPresenceUpdate('available');
    console.log('🟢 Staying online...');
  }, 30000);
}

// === LISTENERS ===
function setupListeners(sock, sessionId) {
  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      if (!msg.key.fromMe) {
        await handleIncomingMessage(sock, msg);
      }
    }
  });

  setInterval(() => autoviewStatus(sock), 60000);
  stayOnline(sock);
}

// === LOAD ALL USERS ON STARTUP ===
export function startAllSessions() {
  if (users.length === 0) {
    console.log('⚠️ No saved sessions found. Use QR or pairing code to connect a new one.');
  } else {
    console.log(`🔄 Reloading ${users.length} saved sessions...`);
    users.forEach(sessionId => startSession(sessionId));
  }
}