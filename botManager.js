import makeWASocket from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { writeFileSync } from 'fs';
import { useSingleFileAuthState } from '@whiskeysockets/baileys';

export async function startSession(sessionId) {
  const { state, saveState } = useSingleFileAuthState(`./auth_info_${sessionId}.json`);

  const socket = makeWASocket({
    printQRInTerminal: true,
    auth: state
  });

  socket.ev.on('connection.update', (update) => {
    const { connection, qr } = update;
    if (qr) {
      writeFileSync('./qr.png', qr);
      console.log('📸 QR code saved as qr.png');
    }
    if (connection === 'open') {
      console.log(`✅ WhatsApp session "${sessionId}" connected`);
    }
  });

  socket.ev.on('messages.upsert', async (msg) => {
    const message = msg.messages[0];
    if (!message?.message?.conversation) return;

    const sender = message.key.remoteJid;
    const text = message.message.conversation;

    console.log(`📨 Message from ${sender}: ${text}`);

    if (text === '.pairme' && sender.includes(process.env.ADMIN_NUMBER)) {
      const pairingCode = Math.floor(100000 + Math.random() * 900000);
      await socket.sendMessage(sender, { text: `🔐 Pairing Code: ${pairingCode}` });
      console.log('📬 Pairing code sent to admin.');
    }
  });
}
