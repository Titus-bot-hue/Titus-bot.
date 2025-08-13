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

const authFolder = './auth';
if (!existsSync(authFolder)) mkdirSync(authFolder);

const blocklistPath = './blocklist.json';
const featuresPath = './features.json';

let blocklist = existsSync(blocklistPath)
  ? JSON.parse(readFileSync(blocklistPath))
  : [];

let features = existsSync(featuresPath)
  ? JSON.parse(readFileSync(featuresPath))
  : {
      autoview: true,
      faketyping: true
    };

let statusCache = {};

/**
 * Start a WhatsApp session
 */
export async function startSession(sessionId) {
  const sessionPath = join(authFolder, sessionId);
  if (!existsSync(sessionPath)) mkdirSync(sessionPath);

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: ['DansBot', 'Chrome', '122']
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr) {
      const qrPath = join('public', 'qr.png');
      QRCode.toFile(qrPath, qr, (err) => {
        if (err) console.error('❌ Failed to save QR:', err);
        else console.log(`✅ QR saved to ${qrPath}`);
      });
    }

    if (connection === 'open') {
      console.log(`✅ WhatsApp session "${sessionId}" connected`);
      setupListeners(sock);
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error instanceof Boom
        ? lastDisconnect.error.output.statusCode
        : 'unknown';
      console.log(`❌ Disconnected (${code})`);

      if (code !== DisconnectReason.loggedOut) {
        console.log('🔁 Reconnecting...');
        startSession(sessionId);
      }
    }
  });
}

/**
 * Generate a pairing code for a user session
 */
export async function getPairingCode(sessionId) {
  const sessionPath = join(authFolder, sessionId);
  if (!existsSync(sessionPath)) mkdirSync(sessionPath);

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: ['DansBot', 'Chrome', '122']
  });

  // Just get pairing code and close connection
  return new Promise((resolve) => {
    sock.ev.on('connection.update', async (update) => {
      if (update.pairingCode) {
        resolve(update.pairingCode);
        sock.ws.close();
      }
    });

    sock.ev.on('creds.update', saveCreds);
  });
}

/**
 * Handle incoming messages
 */
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
    '.status': `📊 Status:\n${Object.entries(features)
      .map(([k, v]) => `• ${k}: ${v ? '✅' : '❌'}`)
      .join('\n')}`,
    '.menu': `📜 Menu:\n• .ping\n• .alive\n• .status\n• .menu\n• .quote (coming soon)\n• .weather (coming soon)\n• .tiktok (coming soon)\n• .ai (coming soon)`
  };

  if (commands[command]) {
    await sock.sendMessage(sender, { text: commands[command] }, { quoted: msg });
    return;
  }

  try {
    await sock.readMessages([msg.key]);
  } catch (err) {
    console.error('❌ Autoread failed:', err);
  }

  if (features.faketyping) {
    try {
      await sock.sendPresenceUpdate('composing', sender);
      await new Promise((res) => setTimeout(res, 2000));
      await sock.sendPresenceUpdate('paused', sender);
    } catch (err) {
      console.error('❌ Typing failed:', err);
    }
  }
}

/**
 * Auto view WhatsApp statuses
 */
async function autoviewStatus(sock) {
  if (!features.autoview) return;
  try {
    const statusList = await sock.getStatus();
    for (const status of statusList) {
      for (const story of status.status) {
        await sock.readStatus(status.id, story.timestamp);
        console.log(`👁️ Viewed status from ${status.id}`);
      }
    }
  } catch (err) {
    console.error('❌ Autoview failed:', err);
  }
}

/**
 * Monitor statuses for new ones
 */
async function monitorStatus(sock) {
  try {
    const statusList = await sock.getStatus();
    for (const status of statusList) {
      const jid = status.id;
      const stories = status.status;
      if (!statusCache[jid]) statusCache[jid] = [];

      for (const story of stories) {
        if (!statusCache[jid].some((s) => s.timestamp === story.timestamp)) {
          statusCache[jid].push(story);
        }
      }
    }
  } catch (err) {
    console.error('❌ Monitor status failed:', err);
  }
}

/**
 * Keep bot online
 */
function stayOnline(sock) {
  setInterval(() => {
    sock.sendPresenceUpdate('available');
  }, 30000);
}

/**
 * Set up listeners
 */
function setupListeners(sock) {
  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      if (!msg.key.fromMe) {
        await handleIncomingMessage(sock, msg);
      }
    }
  });

  setInterval(() => autoviewStatus(sock), 60000);
  setInterval(() => monitorStatus(sock), 60000);
  stayOnline(sock);
}