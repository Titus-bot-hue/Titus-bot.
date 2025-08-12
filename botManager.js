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

// Paths
const authFolder = './auth';
const publicFolder = join(process.cwd(), 'public');
if (!existsSync(authFolder)) mkdirSync(authFolder);
if (!existsSync(publicFolder)) mkdirSync(publicFolder);

const blocklistPath = './blocklist.json';
const featuresPath = './features.json';

// Data storage
let blocklist = existsSync(blocklistPath) ? JSON.parse(readFileSync(blocklistPath)) : [];
let features = existsSync(featuresPath)
  ? JSON.parse(readFileSync(featuresPath))
  : { autoreact: false, autoview: true, faketyping: true };

let sockInstance = null;

// Start WhatsApp session
export async function startSession(sessionId) {
  const { state, saveCreds } = await useMultiFileAuthState(join(authFolder, sessionId));
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`📦 Baileys v${version.join('.')}, latest: ${isLatest}`);

  sockInstance = makeWASocket({
    version,
    auth: state,
    browser: ['DansBot', 'Chrome', '122']
  });

  sockInstance.ev.on('creds.update', saveCreds);

  sockInstance.ev.on('connection.update', async (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr) {
      const qrPath = join(publicFolder, 'qr.png');
      QRCode.toFile(qrPath, qr, (err) => {
        if (err) console.error('❌ Failed to save QR:', err);
        else console.log(`✅ QR code saved at ${qrPath}`);
      });
    }

    if (connection === 'open') {
      console.log(`✅ WhatsApp connected for session "${sessionId}"`);
      setupListeners(sockInstance);
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

// Generate pairing code for linking without QR
export async function generateLinkingCode() {
  if (!sockInstance) throw new Error('Session not started yet.');
  try {
    const code = await sockInstance.requestPairingCode(process.env.ADMIN_NUMBER);
    console.log(`🔑 Pairing code: ${code}`);
    return code;
  } catch (err) {
    console.error('❌ Failed to generate pairing code:', err);
    throw err;
  }
}

// Handle incoming messages
async function handleIncomingMessage(sock, msg) {
  const sender = msg.key.remoteJid;
  const text =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    '';
  const command = text.trim().toLowerCase();

  if (blocklist.includes(sender)) {
    console.log(`⛔ Blocked user: ${sender}`);
    return;
  }

  // Command list
  const commands = {
    '.ping': '🏓 Pong!',
    '.alive': '✅ DansBot is alive!',
    '.status': `📊 Features:\n${Object.entries(features).map(([k, v]) => `• ${k}: ${v ? '✅' : '❌'}`).join('\n')}`,
    '.menu': `📜 Menu:
• .ping
• .alive
• .status
• .menu
• .broadcast <msg>
• .block <number>
• .unblock <number>
• .toggle <feature>
• .paircode (get pairing code)`
  };

  // Pairing code command
  if (command === '.paircode') {
    try {
      const code = await generateLinkingCode();
      await sock.sendMessage(sender, { text: `🔑 Your pairing code: ${code}` });
    } catch {
      await sock.sendMessage(sender, { text: '❌ Failed to generate code.' });
    }
    return;
  }

  // Simple commands
  if (commands[command]) {
    await sock.sendMessage(sender, { text: commands[command] });
    return;
  }

  // Broadcast
  if (command.startsWith('.broadcast ')) {
    const message = command.replace('.broadcast', '').trim();
    const chats = await sock.groupFetchAllParticipating();
    for (const id of Object.keys(chats)) {
      await sock.sendMessage(id, { text: `📢 Broadcast:\n${message}` });
    }
    await sock.sendMessage(sender, { text: '✅ Broadcast sent.' });
    return;
  }

  // Block user
  if (command.startsWith('.block ')) {
    const number = command.replace('.block', '').trim();
    const jid = `${number}@s.whatsapp.net`;
    if (!blocklist.includes(jid)) {
      blocklist.push(jid);
      writeFileSync(blocklistPath, JSON.stringify(blocklist, null, 2));
      await sock.sendMessage(sender, { text: `✅ Blocked ${number}` });
    }
    return;
  }

  // Unblock user
  if (command.startsWith('.unblock ')) {
    const number = command.replace('.unblock', '').trim();
    const jid = `${number}@s.whatsapp.net`;
    blocklist = blocklist.filter(u => u !== jid);
    writeFileSync(blocklistPath, JSON.stringify(blocklist, null, 2));
    await sock.sendMessage(sender, { text: `✅ Unblocked ${number}` });
    return;
  }

  // Toggle features
  if (command.startsWith('.toggle ')) {
    const feature = command.replace('.toggle', '').trim();
    if (features.hasOwnProperty(feature)) {
      features[feature] = !features[feature];
      writeFileSync(featuresPath, JSON.stringify(features, null, 2));
      await sock.sendMessage(sender, {
        text: `🔁 ${feature} is now ${features[feature] ? 'enabled' : 'disabled'}`
      });
    }
    return;
  }

  // Auto-read
  try {
    await sock.readMessages([msg.key]);
    console.log(`👁️ Read message from ${sender}`);
  } catch (err) {
    console.error('❌ Autoread failed:', err);
  }

  // Auto-react
  if (features.autoreact) {
    try {
      await sock.sendMessage(sender, { react: { text: '❤️', key: msg.key } });
      console.log(`💬 Reacted to ${sender}`);
    } catch (err) {
      console.error('❌ Autoreact failed:', err);
    }
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

// Autoview placeholder (Baileys removed getStatus)
async function autoviewStatus() {
  if (!features.autoview) return;
  console.log('👁️ Autoview placeholder - getStatus not available in Baileys.');
}

// Keep bot online
function stayOnline(sock) {
  setInterval(() => {
    sock.sendPresenceUpdate('available');
    console.log('🟢 Bot is online');
  }, 30000);
}

// Setup event listeners
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
