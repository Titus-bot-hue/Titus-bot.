import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import qrcode from 'qrcode';

// Create folders
const authFolder = './auth';
if (!existsSync(authFolder)) mkdirSync(authFolder);

const publicFolder = join(process.cwd(), 'public');
if (!existsSync(publicFolder)) mkdirSync(publicFolder);

export async function startSession(sessionId) {
  const { state, saveCreds } = await useMultiFileAuthState(join(authFolder, sessionId));
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`📦 Using Baileys v${version.join('.')}, latest: ${isLatest}`);

  const socket = makeWASocket({
    version,
    printQRInTerminal: true,
    auth: state,
    browser: ['DansBot', 'Chrome', '122']
  });

  socket.ev.on('creds.update', saveCreds);

  socket.ev.on('connection.update', async (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr) {
      const qrPath = join(publicFolder, 'qr.png');
      try {
        await qrcode.toFile(qrPath, qr);
        console.log(`📸 QR code saved to ${qrPath}`);
      } catch (err) {
        console.error('❌ Failed to generate QR image:', err.message);
      }
    }

    if (connection === 'open') {
      console.log(`✅ WhatsApp session "${sessionId}" connected`);
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error instanceof Boom
        ? lastDisconnect.error.output.statusCode
        : 'unknown';
      console.log(`❌ Disconnected from WhatsApp. Status Code: ${code}`);
    }
  });

  socket.ev.on('messages.upsert', async (msg) => {
    const message = msg.messages?.[0];
    if (!message?.message?.conversation) return;

    const sender = message.key.remoteJid;
    const text = message.message.conversation.trim();

    console.log(`📨 Message from ${sender}: ${text}`);

    const admin = process.env.ADMIN_NUMBER || '';

    if (text === '.pairme' && sender.includes(admin)) {
      const pairingCode = Math.floor(100000 + Math.random() * 900000);
      await socket.sendMessage(sender, { text: `🔐 Pairing Code: ${pairingCode}` });
      console.log('📬 Pairing code sent to admin.');
    }
  });
}