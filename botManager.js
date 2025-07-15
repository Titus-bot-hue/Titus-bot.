import baileys from '@whiskeysockets/baileys';
import qrcode from 'qrcode';
import NodeCache from 'node-cache';
import path from 'path';
import fs from 'fs';

const {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} = baileys;

const sessionCache = new NodeCache();

// Save QR code as image
async function saveQRImage(buffer, filename = 'qr.png') {
  const qrPath = path.join('./', filename);
  fs.writeFileSync(qrPath, buffer);
  console.log(`📸 QR code saved as ${qrPath}`);
}

// Start a WhatsApp session
export async function startSession(sessionId = 'default') {
  const sessionDir = path.join('./sessions', sessionId);
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: true,
    connectTimeoutMs: 60_000,
    defaultQueryTimeoutMs: 60_000,
    msgRetryCount: 3,
    getMessage: async () => undefined,
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, qr } = update;

    if (qr) {
      const qrImage = await qrcode.toBuffer(qr);
      await saveQRImage(qrImage); // Save QR to file
      sessionCache.set(`${sessionId}_qr`, qrImage);
    }

    if (connection === 'open') {
      console.log(`✅ WhatsApp session "${sessionId}" connected`);
      sessionCache.set(sessionId, sock);
    }

    if (connection === 'close') {
      console.log(`❌ WhatsApp session "${sessionId}" disconnected`);
      sessionCache.del(sessionId);
    }
  });

  sock.ev.on('creds.update', saveCreds);
}
