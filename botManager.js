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

  // Listen for .pairme from admin
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages?.[0];
    if (!msg || !msg.message || msg.key.fromMe) return;

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      '';

    const sender = msg.key.remoteJid;
    const adminNumber = process.env.ADMIN_NUMBER;

    console.log(`📨 Message from ${sender}: ${text}`);

    if (text.trim().toLowerCase() === '.pairme' && sender.includes(adminNumber)) {
      const pairingCode = Math.floor(100000 + Math.random() * 900000);
      await sock.sendMessage(sender, {
        text: `🔐 Pairing Code: ${pairingCode}`
      });
      console.log(`📬 Sent pairing code to admin: ${adminNumber}`);
    }
  });
}