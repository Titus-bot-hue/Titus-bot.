import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeInMemoryStore,
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode';
import NodeCache from 'node-cache';
import path from 'path';
import fs from 'fs';

// Session cache
const sessionCache = new NodeCache();
const store = makeInMemoryStore({});

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

  store.bind(sock.ev);

  sock.ev.on('connection.update', async (update) => {
    const { connection, qr } = update;

    if (qr) {
      const qrImage = await qrcode.toBuffer(qr);
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

  // Listen for .pair command
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    const text = msg.message?.conversation || '';
    const sender = msg.key.remoteJid;

    if (text.startsWith('.pair')) {
      const userSessionId = `user_${sender.replace('@s.whatsapp.net', '')}`;
      await startSession(userSessionId);

      const qrImage = sessionCache.get(`${userSessionId}_qr`);
      if (qrImage) {
        await sock.sendMessage(sender, {
          image: qrImage,
          caption: `📲 Scan this QR to link your WhatsApp account.`,
        });
      } else {
        await sock.sendMessage(sender, {
          text: `⚠️ QR code not available. Try again in a few seconds.`,
        });
      }
    }
  });
}
