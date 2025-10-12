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

// Config paths
const blocklistPath = './blocklist.json';
const featuresPath = './features.json';

// Load blocklist
let blocklist = existsSync(blocklistPath)
  ? JSON.parse(readFileSync(blocklistPath))
  : [];

// Load feature toggles
let features = existsSync(featuresPath)
  ? JSON.parse(readFileSync(featuresPath))
  : {
      autoview: true,
      faketyping: true
    };

// Main function
export async function startSession(sessionId, phoneNumber = null) {
  const { state, saveCreds } = await useMultiFileAuthState(join(authFolder, sessionId));
  const { version } = await fetchLatestBaileysVersion();

  console.log(`📦 Baileys v${version.join('.')}`);

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: ['DansBot', 'Chrome', '122']
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, qr, lastDisconnect } = update;

    // Generate QR image (no phone number)
    if (qr && !phoneNumber) {
      const qrPath = join(publicFolder, 'qr.png');
      try {
        await QRCode.toFile(qrPath, qr);
        console.log(`✅ QR code saved at ${qrPath}`);
        // Keep alive long enough for Render static to serve
        await new Promise(res => setTimeout(res, 10000));
      } catch (err) {
        console.error('❌ Failed to save QR code:', err);
      }
    }

    // Pairing code method (if phone number provided)
    if (phoneNumber && connection === 'connecting') {
      try {
        console.log(`⏳ Requesting pairing code for ${phoneNumber}...`);
        const code = await sock.requestPairingCode(phoneNumber);
        const codePath = join(publicFolder, 'pairing.txt');
        writeFileSync(codePath, code);
        console.log(`🔗 Pairing code for ${phoneNumber}: ${code}`);
      } catch (err) {
        console.error('❌ Failed to generate pairing code:', err.message);
      }
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

      // Automatically reconnect unless logged out
      if (statusCode !== DisconnectReason.loggedOut) {
        console.log('🔁 Reconnecting...');
        setTimeout(() => startSession(sessionId, phoneNumber), 5000);
      } else {
        console.log('🔒 Logged out. Please rescan QR.');
      }
    }
  });
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

  if (blocklist.includes(sender)) return;

  // Commands
  const commands = {
    '.ping': '🏓 Pong!',
    '.alive': '✅ Dans xm Tech is alive!',
    '.status': `📊 Status:\n${Object.entries(features).map(([k, v]) => `• ${k}: ${v ? '✅' : '❌'}`).join('\n')}`,
    '.menu': `📜 Menu:\n• .ping\n• .alive\n• .status\n• .menu`
  };

  if (commands[command]) {
    await sock.sendMessage(sender, { text: commands[command] }, { quoted: msg });
    return;
  }

  if (command.startsWith('.') && !commands[command]) {
    await sock.sendMessage(sender, {
      text: `❓ Unknown command: ${command}\nType .menu to see available commands.`
    }, { quoted: msg });
  }

  // Auto-read messages
  await sock.readMessages([msg.key]);

  // Fake typing effect
  if (features.faketyping) {
    await sock.sendPresenceUpdate('composing', sender);
    await new Promise(res => setTimeout(res, 2000));
    await sock.sendPresenceUpdate('paused', sender);
  }
}

// Event listeners
function setupListeners(sock) {
  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      if (!msg.key.fromMe) await handleIncomingMessage(sock, msg);
    }
  });

  // Keep bot online heartbeat
  setInterval(() => {
    sock.sendPresenceUpdate('available');
    console.log('🟢 Bot is online');
  }, 30000);
}
