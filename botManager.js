import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import QRCode from 'qrcode'; // ✅ Needed to convert QR text to image

// Prepare folder for auth sessions
const authFolder = './auth';
if (!existsSync(authFolder)) mkdirSync(authFolder);

// Prepare folder for public assets (QR code)
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

  // Save new auth states on any credential update
  socket.ev.on('creds.update', saveCreds);

  // Handle connection updates
  socket.ev.on('connection.update', (update) => {
    const { connection, qr, lastDisconnect } = update;

    // ✅ Convert QR string into PNG image using qrcode package
    if (qr) {
      const qrPath = join(publicFolder, 'qr.png');
      QRCode.toFile(qrPath, qr, (err) => {
        if (err) {
          console.error('❌ Failed to save QR code:', err);
        } else {
          console.log(`📸 QR code saved at ${qrPath}`);
        }
      });
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

  // Handle messages (e.g., `.pairme`)
  socket.ev.on('messages.upsert', async (msg) => {
    const message = msg.messages?.[0];
    if (!message?.message?.conversation) return;

    const sender = message.key.remoteJid;
    const text = message.message.conversation?.trim();

    console.log(`📨 Message from ${sender}: ${text}`);

    const admin = process.env.ADMIN_NUMBER || '';

    if (text === '.pairme' && sender.includes(admin)) {
      const pairingCode = Math.floor(100000 + Math.random() * 900000);
      await socket.sendMessage(sender, { text: `🔐 Pairing Code: ${pairingCode}` });
      console.log('📬 Pairing code sent to admin.');
    }
  });
}