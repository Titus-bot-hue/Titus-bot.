import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import QRCode from 'qrcode';
import dotenv from 'dotenv';

dotenv.config();

// Folders for auth and public QR
const authFolder = './auth';
const publicFolder = join(process.cwd(), 'public');
if (!existsSync(authFolder)) mkdirSync(authFolder);
if (!existsSync(publicFolder)) mkdirSync(publicFolder);

// Cache for status monitoring
let statusCache = {};

// Start WhatsApp session
export async function startSession(sessionId) {
  const { state, saveCreds } = await useMultiFileAuthState(join(authFolder, sessionId));
  const { version, isLatest } = await fetchLatestBaileysVersion();

  console.log(`📦 Baileys v${version.join('.')}, latest: ${isLatest}`);

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
    browser: ['DansBot', 'Chrome', '122']
  });

  // Save updated credentials
  sock.ev.on('creds.update', saveCreds);

  // Connection and QR logic
  sock.ev.on('connection.update', (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr) {
      const qrPath = join(publicFolder, 'qr.png');
      QRCode.toFile(qrPath, qr, (err) => {
        if (err) {
          console.error('❌ Failed to save QR code:', err);
        } else {
          console.log(`✅ WhatsApp QR code saved to ${qrPath}`);
        }
      });
    }

    if (connection === 'open') {
      console.log(`✅ WhatsApp session "${sessionId}" connected successfully`);
      setupListeners(sock); // 🔧 Start automation features
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error instanceof Boom
        ? lastDisconnect.error.output.statusCode
        : 'unknown';
      console.log(`❌ Disconnected from WhatsApp. Code: ${statusCode}`);

      if (statusCode !== DisconnectReason.loggedOut) {
        console.log('🔁 Attempting reconnect...');
        startSession(sessionId); // Auto-reconnect
      }
    }
  });
}

// 🔧 Feature handler for incoming messages
async function handleIncomingMessage(sock, msg) {
  const sender = msg.key.remoteJid;
  const messageId = msg.key.id;

  // Autoread
  try {
    await sock.readMessages([msg.key]);
    console.log(`👁️ Autoread message from ${sender}`);
  } catch (err) {
    console.error('❌ Failed to autoread message:', err);
  }

  // Autoreact
  try {
    await sock.sendMessage(sender, {
      react: {
        text: '❤️',
        key: msg.key
      }
    });
    console.log(`💬 Autoreacted to message from ${sender}`);
  } catch (err) {
    console.error('❌ Failed to autoreact:', err);
  }

  // Fake Typing
  try {
    await sock.sendPresenceUpdate('composing', sender);
    console.log(`⌨️ Fake typing in ${sender}`);
    await new Promise(resolve => setTimeout(resolve, 3000));
    await sock.sendPresenceUpdate('paused', sender);
  } catch (err) {
    console.error('❌ Failed to fake typing:', err);
  }
}

// 👀 Autoview status
async function autoviewStatus(sock) {
  try {
    const statusList = await sock.getStatus();
    for (const status of statusList) {
      const jid = status.id;
      const stories = status.status;
      for (const story of stories) {
        await sock.readStatus(jid, story.timestamp);
        console.log(`👁️ Viewed status from ${jid}`);
      }
    }
  } catch (err) {
    console.error('❌ Failed to autoview status:', err);
  }
}

// 🛡️ Monitor status deletion
async function monitorStatus(sock) {
  try {
    const statusList = await sock.getStatus();
    for (const status of statusList) {
      const jid = status.id;
      const stories = status.status;

      if (!statusCache[jid]) statusCache[jid] = [];

      for (const story of stories) {
        const exists = statusCache[jid].some(s => s.timestamp === story.timestamp);
        if (!exists) {
          statusCache[jid].push(story);
          console.log(`📥 Saved status from ${jid} at ${story.timestamp}`);
        }
      }

      const deleted = statusCache[jid].filter(cached =>
        !stories.some(s => s.timestamp === cached.timestamp)
      );

      for (const removed of deleted) {
        console.log(`🚨 Status deleted by ${jid}:`, removed);
        // Optional: re-send or archive
      }

      statusCache[jid] = stories;
    }
  } catch (err) {
    console.error('❌ Failed to monitor status:', err);
  }
}

// 🌐 Always online
function stayOnline(sock) {
  setInterval(() => {
    sock.sendPresenceUpdate('available');
    console.log('🟢 Bot is online');
  }, 30000);
}

// 🧠 Setup all listeners and periodic features
function setupListeners(sock) {
  // Incoming messages
  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      if (!msg.key.fromMe) {
        await handleIncomingMessage(sock, msg);
      }
    }
  });

  // Antidelete chats
  sock.ev.on('messages.update', async updates => {
    for (const update of updates) {
      if (update.messageStubType === 8 && update.key) {
        const chatId = update.key.remoteJid;
        const messageId = update.key.id;

        try {
          const originalMsg = await sock.loadMessage(chatId, messageId);
          if (originalMsg?.message) {
            await sock.sendMessage(chatId, {
              text: `🚨 Antidelete:\n${JSON.stringify(originalMsg.message, null, 2)}`
            });
            console.log(`🛡️ Restored deleted message in ${chatId}`);
          }
        } catch (err) {
          console.error('❌ Failed to restore deleted message:', err);
        }
      }
    }
  });

  // Periodic features
  setInterval(() => autoviewStatus(sock), 60000);
  setInterval(() => monitorStatus(sock), 60000);
  stayOnline(sock);
}