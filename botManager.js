import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import NodeCache from 'node-cache';
import path from 'path';
import fs from 'fs';

// Session cache
const sessionCache = new NodeCache();

// Start a new WhatsApp session
export async function startSession(sessionId = 'default') {
  const sessionDir = path.join('./sessions', sessionId);

  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
    syncFullHistory: false,
    markOnlineOnConnect: true,
    connectTimeoutMs: 60_000,
    defaultQueryTimeoutMs: 60_000,
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log(`📱 Scan this QR for session "${sessionId}":`);
      qrcode.generate(qr, { small: true });
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

// Send a message using a session
export async function sendMessage(sessionId, jid, message) {
  const sock = sessionCache.get(sessionId);
  if (!sock) throw new Error(`Session "${sessionId}" not found`);

  await sock.sendMessage(jid, { text: message });
  console.log(`📤 Message sent to ${jid} via session "${sessionId}"`);
}

// List active sessions
export function listSessions() {
  return sessionCache.keys();
}
