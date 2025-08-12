import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import QRCode from 'qrcode';
import dotenv from 'dotenv';

dotenv.config();

// Folders
const authFolder = './auth';
const publicFolder = join(process.cwd(), 'public');
if (!existsSync(authFolder)) mkdirSync(authFolder);
if (!existsSync(publicFolder)) mkdirSync(publicFolder);

// Config
const blocklistPath = './blocklist.json';
const featuresPath = './features.json';
let blocklist = existsSync(blocklistPath) ? JSON.parse(readFileSync(blocklistPath)) : [];
let features = existsSync(featuresPath)
  ? JSON.parse(readFileSync(featuresPath))
  : { autoview: true, faketyping: true };

let statusCache = {};
let sock;
let activePairCodes = {}; // Store pairing codes

export async function startSession(sessionId) {
  const { state, saveCreds } = await useMultiFileAuthState(join(authFolder, sessionId));
  const { version } = await fetchLatestBaileysVersion();

  console.log(`📦 Baileys v${version.join('.')}`);

  sock = makeWASocket({
    version,
    auth: state,
    browser: ['DansBot', 'Chrome', '122'],
    printQRInTerminal: true
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr) {
      const qrPath = join(publicFolder, 'qr.png');
      QRCode.toFile(qrPath, qr, (err) => {
        if (err) console.error('❌ Failed to save QR code:', err);
        else console.log(`✅ QR code saved to ${qrPath}`);
      });
    }

    if (connection === 'open') {
      console.log(`✅ WhatsApp session "${sessionId}" connected`);
      setupListeners(sock);
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error instanceof Boom
        ? lastDisconnect.error.output.statusCode
        : 'unknown';
      console.log(`❌ Disconnected. Code: ${statusCode}`);
      if (statusCode !== DisconnectReason.loggedOut) {
        console.log('🔁 Reconnecting...');
        startSession(sessionId);
      }
    }
  });
}

// Generate pairing code (expires in 1 minute)
export async function generateLinkingCode() {
  if (!sock) throw new Error('WhatsApp socket not initialized');

  try {
    const code = await sock.requestPairingCode(process.env.ADMIN_NUMBER || '');
    const expiresAt = Date.now() + 60000; // 1 minute expiry
    activePairCodes[code] = { expiresAt };

    setTimeout(() => {
      delete activePairCodes[code];
      console.log(`⛔ Pairing code expired: ${code}`);
    }, 60000);

    console.log(`🔑 New pairing code generated: ${code} (expires in 1 min)`);
    return code;
  } catch (err) {
    console.error('❌ Failed to generate pairing code:', err);
    throw err;
  }
}

async function handleIncomingMessage(sock, msg) {
  const sender = msg.key.remoteJid;
  const text =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    '';
  const command = text.trim().toLowerCase();

  if (blocklist.includes(sender)) return;

  const commands = {
    '.ping': '🏓 Pong!',
    '.alive': '✅ DansBot is alive!',
    '.status': `📊 Status:\n${Object.entries(features).map(([k, v]) => `• ${k}: ${v ? '✅' : '❌'}`).join('\n')}`,
    '.menu': `📜 Menu:\n• .ping\n• .alive\n• .status\n• .menu\n• .shutdown\n• .broadcast <msg>\n• .block <number>\n• .unblock <number>\n• .toggle <feature>`
  };

  if (commands[command]) {
    await sock.sendMessage(sender, { text: commands[command] }, { quoted: msg });
    return;
  }

  // Auto-read
  try {
    await sock.readMessages([msg.key]);
    console.log(`👁️ Read message from ${sender}`);
  } catch (err) {
    console.error('❌ Autoread failed:', err);
  }

  // Fake typing
  if (features.faketyping) {
    try {
      await sock.sendPresenceUpdate('composing', sender);
      await new Promise(res => setTimeout(res, 3000));
      await sock.sendPresenceUpdate('paused', sender);
    } catch (err) {
      console.error('❌ Typing failed:', err);
    }
  }
}

// Auto-view status
async function autoviewStatus(sock) {
  if (!features.autoview) return;
  try {
    console.log('👀 Auto-view status feature called (Baileys does not support getStatus in new API)');
  } catch (err) {
    console.error('❌ Autoview failed:', err);
  }
}

function stayOnline(sock) {
  setInterval(() => {
    sock.sendPresenceUpdate('available');
    console.log('🟢 Bot is online');
  }, 30000);
}

function setupListeners(sock) {
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
