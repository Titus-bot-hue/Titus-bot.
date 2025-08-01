import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } from '@whiskeysockets/baileys'; import { Boom } from '@hapi/boom'; import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'; import { join } from 'path'; import QRCode from 'qrcode'; import dotenv from 'dotenv';

dotenv.config();

const authFolder = './auth'; const publicFolder = join(process.cwd(), 'public'); if (!existsSync(authFolder)) mkdirSync(authFolder); if (!existsSync(publicFolder)) mkdirSync(publicFolder);

const adminNumber = process.env.ADMIN_NUMBER; const blocklistPath = './blocklist.json'; const featuresPath = './features.json';

let blocklist = existsSync(blocklistPath) ? JSON.parse(readFileSync(blocklistPath)) : [];

let features = existsSync(featuresPath) ? JSON.parse(readFileSync(featuresPath)) : { autoreact: true, autoview: true, faketyping: true };

let statusCache = {};

export async function startSession(sessionId) { const { state, saveCreds } = await useMultiFileAuthState(join(authFolder, sessionId)); const { version, isLatest } = await fetchLatestBaileysVersion();

console.log(📦 Baileys v${version.join('.')}, latest: ${isLatest});

const sock = makeWASocket({ version, auth: state, browser: ['DansBot', 'Chrome', '122'] });

sock.ev.on('creds.update', saveCreds);

sock.ev.on('connection.update', (update) => { const { connection, qr, lastDisconnect } = update;

if (qr) {
  const qrPath = join(publicFolder, 'qr.png');
  QRCode.toFile(qrPath, qr, (err) => {
    if (err) console.error('❌ Failed to save QR code:', err);
    else console.log(`✅ QR code saved to ${qrPath}`);
  });
}

if (connection === 'open') {
  console.log(`🟢 [Debug] Connection open. Setting up listeners...`);
  setupListeners(sock);
  console.log(`✅ Listeners attached`);
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

}); }

async function handleIncomingMessage(sock, msg) { const sender = msg.key.remoteJid; const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || msg.message?.imageMessage?.caption || ''; const command = text.trim().toLowerCase(); const isAdmin = sender === adminNumber;

console.log(📥 Message received from ${sender}: ${command});

if (blocklist.includes(sender)) { console.log(⛔ Blocked user tried to message: ${sender}); return; }

const commands = { '.ping': '🏓 Pong!', '.alive': '✅ DansBot is alive!', '.status': 📊 Status:\n${Object.entries(features).map(([k, v]) => • ${k}: ${v ? '✅' : '❌'}).join('\n')}, '.menu': 📜 Menu:\n• .ping\n• .alive\n• .status\n• .menu\n• .shutdown (admin)\n• .broadcast <msg> (admin)\n• .block <number> (admin)\n• .unblock <number> (admin)\n• .toggle <feature> (admin) };

if (command in commands) { await sock.sendMessage(sender, { text: commands[command] }, { quoted: msg }); return; }

// Admin-only features (shutdown, block, toggle, etc.) remain unchanged here // ✂️ (Your previous code for these is assumed to be below this comment)

try { await sock.readMessages([msg.key]); console.log(👁️ Read message from ${sender}); } catch (err) { console.error('❌ Autoread failed:', err); }

if (features.autoreact) { try { await sock.sendMessage(sender, { react: { text: '❤️', key: msg.key } }); console.log(💬 Reacted to ${sender}); } catch (err) { console.error('❌ Autoreact failed:', err); } }

if (features.faketyping) { try { await sock.sendPresenceUpdate('composing', sender); await new Promise(res => setTimeout(res, 3000)); await sock.sendPresenceUpdate('paused', sender); } catch (err) { console.error('❌ Typing failed:', err); } } }

async function autoviewStatus(sock) { if (!features.autoview) return; try { const statusList = await sock.getStatus(); for (const status of statusList) { for (const story of status.status) { await sock.readStatus(status.id, story.timestamp); console.log(👁️ Viewed status from ${status.id}); } } } catch (err) { console.error('❌ Autoview failed:', err); } }

function stayOnline(sock) { setInterval(() => { sock.sendPresenceUpdate('available'); console.log('🟢 Bot is online'); }, 30000); }

function setupListeners(sock) { console.log('🛠️ Running setupListeners()...');

sock.ev.on('messages.upsert', async ({ messages }) => { for (const msg of messages) { if (!msg.key.fromMe) { await handleIncomingMessage(sock, msg); } } });

sock.ev.on('messages.update', async updates => { for (const update of updates) { if (update.messageStubType === 8 && update.key) { const chatId = update.key.remoteJid; const messageId = update.key.id; try { const originalMsg = await sock.loadMessage(chatId, messageId); if (originalMsg?.message) { await sock.sendMessage(chatId, { text: 🚨 Antidelete:\n${JSON.stringify(originalMsg.message, null, 2)} }); console.log(🛡️ Restored deleted message in ${chatId}); } } catch (err) { console.error('❌ Failed to restore deleted message:', err); } } } });

setInterval(() => autoviewStatus(sock), 60000); stayOnline(sock); }

