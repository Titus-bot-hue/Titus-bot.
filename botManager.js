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

const authFolder = './auth';
const publicFolder = join(process.cwd(), 'public');
if (!existsSync(authFolder)) mkdirSync(authFolder);
if (!existsSync(publicFolder)) mkdirSync(publicFolder);

const adminNumber = process.env.ADMIN_NUMBER;
const blocklistPath = './blocklist.json';
const featuresPath = './features.json';

let blocklist = existsSync(blocklistPath)
  ? JSON.parse(readFileSync(blocklistPath))
  : [];

let features = existsSync(featuresPath)
  ? JSON.parse(readFileSync(featuresPath))
  : {
      autoview: true,
      faketyping: true
    };

export async function startSession(sessionId) {
  const { state, saveCreds } = await useMultiFileAuthState(join(authFolder, sessionId));
  const { version, isLatest } = await fetchLatestBaileysVersion();

  console.log(`📦 Baileys v${version.join('.')}, latest: ${isLatest}`);

  const sock = makeWASocket({
    version,
    auth: state,
    browser: ['DansBot', 'Chrome', '122']
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr) {
      const qrPath = join(publicFolder, 'qr.png');
      QRCode.toFile(qrPath, qr, (err) => {
        if (err) console.error('❌ Failed to save QR code:', err);
        else console.log(`✅ QR code saved to ${qrPath}`);
      });
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

      if (statusCode !== DisconnectReason.loggedOut) {
        console.log('🔁 Reconnecting...');
        startSession(sessionId);
      }
    }
  });
}

async function handleIncomingMessage(sock, msg) {
  const sender = msg.key.remoteJid;
  const text =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    '';
  const command = text.trim().toLowerCase();
  const isAdmin = sender === adminNumber;

  if (blocklist.includes(sender)) {
    console.log(`⛔ Blocked user: ${sender}`);
    return;
  }

  if (command === '.shutdown' && isAdmin) {
    await sock.sendMessage(sender, { text: '🛑 Shutting down...' }, { quoted: msg });
    process.exit(0);
  }

  if (command.startsWith('.broadcast') && isAdmin) {
    const message = command.replace('.broadcast', '').trim();
    if (!message) return await sock.sendMessage(sender, { text: '⚠️ Provide a message.' }, { quoted: msg });

    const chats = await sock.groupFetchAllParticipating();
    for (const id of Object.keys(chats)) {
      await sock.sendMessage(id, { text: `📢 Broadcast:\n${message}` });
    }
    await sock.sendMessage(sender, { text: '✅ Broadcast sent.' }, { quoted: msg });
  }

  if (command.startsWith('.block') && isAdmin) {
    const number = command.replace('.block', '').trim();
    const jid = `${number}@s.whatsapp.net`;
    if (!blocklist.includes(jid)) {
      blocklist.push(jid);
      writeFileSync(blocklistPath, JSON.stringify(blocklist, null, 2));
      await sock.sendMessage(sender, { text: `✅ Blocked ${number}` }, { quoted: msg });
    } else {
      await sock.sendMessage(sender, { text: `⚠️ Already blocked.` }, { quoted: msg });
    }
  }

  if (command.startsWith('.unblock') && isAdmin) {
    const number = command.replace('.unblock', '').trim();
    const jid = `${number}@s.whatsapp.net`;
    const index = blocklist.indexOf(jid);
    if (index !== -1) {
      blocklist.splice(index, 1);
      writeFileSync(blocklistPath, JSON.stringify(blocklist, null, 2));
      await sock.sendMessage(sender, { text: `✅ Unblocked ${number}` }, { quoted: msg });
    } else {
      await sock.sendMessage(sender, { text: `⚠️ Not blocked.` }, { quoted: msg });
    }
  }

  if (command.startsWith('.toggle') && isAdmin) {
    const feature = command.replace('.toggle', '').trim();
    if (!features.hasOwnProperty(feature)) {
      await sock.sendMessage(sender, { text: `❌ Unknown feature: ${feature}` }, { quoted: msg });
    } else {
      features[feature] = !features[feature];
      writeFileSync(featuresPath, JSON.stringify(features, null, 2));
      await sock.sendMessage(sender, {
        text: `🔁 ${feature} is now ${features[feature] ? 'enabled' : 'disabled'}`
      }, { quoted: msg });
    }
  }

  const commands = {
    '.ping': '🏓 Pong!',
    '.alive': '✅ DansBot is alive!',
    '.status': `📊 Status:\n${Object.entries(features).map(([k, v]) => `• ${k}: ${v ? '✅' : '❌'}`).join('\n')}`,
    '.menu': `📜 Menu:\n• .ping\n• .alive\n• .status\n• .menu\n• .shutdown (admin)\n• .broadcast <msg> (admin)\n• .block <number> (admin)\n• .unblock <number> (admin)\n• .toggle <feature> (admin)`
  };

  if (commands[command]) {
    await sock.sendMessage(sender, { text: commands[command] }, { quoted: msg });
    return;
  }

  if (command.startsWith('.') && !commands[command]) {
    await sock.sendMessage(sender, {
      text: `❓ Unknown command: ${command}\nType .menu to see available commands.`
    }, { quoted: msg });
    return;
  }

  try {
    await sock.readMessages([msg.key]);
    console.log(`👁️ Read message from ${sender}`);
  } catch (err) {
    console.error('❌ Autoread failed:', err);
  }

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

function stayOnline(sock) {
  setInterval(() => {
    sock.sendPresenceUpdate('available');
    console.log('🟢 Bot is online');
  }, 30000);
}

function setupListeners(sock) {
  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      if (!msg.key.fromMe) {
        await handleIncomingMessage(sock, msg);
      }
    }
  });

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
          console.error('❌ Antidelete failed:', err);
        }
      }
    }
  });

  setInterval(() => stayOnline(sock), 60000);
}