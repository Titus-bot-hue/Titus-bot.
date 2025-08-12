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
import readline from 'readline';
import fetch from 'node-fetch';

dotenv.config();

// === Folder setup ===
const authFolder = './auth';
const publicFolder = join(process.cwd(), 'public');
if (!existsSync(authFolder)) mkdirSync(authFolder);
if (!existsSync(publicFolder)) mkdirSync(publicFolder);

const blocklistPath = './blocklist.json';
const featuresPath = './features.json';
const usersPath = './users.json';

let blocklist = existsSync(blocklistPath)
  ? JSON.parse(readFileSync(blocklistPath))
  : [];

let features = existsSync(featuresPath)
  ? JSON.parse(readFileSync(featuresPath))
  : {
      autoview: true,
      faketyping: true
    };

if (!existsSync(usersPath)) writeFileSync(usersPath, JSON.stringify({}));

let statusCache = {};

// === Prompt helper ===
function askConsole(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans.trim());
  }));
}

// === Main Start Function ===
export async function startSession(sessionId) {
  const { state, saveCreds } = await useMultiFileAuthState(join(authFolder, sessionId));
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false
  });

  sock.ev.on('creds.update', saveCreds);

  // First time setup
  if (!state.creds.registered) {
    const method = await askConsole("Choose connection method:\n1 - QR Code\n2 - Pairing Code\n> ");
    if (method === '1') {
      sock.ev.on('connection.update', ({ qr }) => {
        if (qr) {
          const qrPath = join(publicFolder, 'qr.png');
          QRCode.toFile(qrPath, qr, err => {
            if (err) console.error("❌ QR save error:", err);
            else console.log(`✅ QR saved to ${qrPath}`);
          });
        }
      });
    } else if (method === '2') {
      const phoneNumber = await askConsole("Enter your phone number with country code (e.g. 2547xxxxxxx): ");
      const code = await sock.requestPairingCode(phoneNumber);
      console.log(`📱 Your WhatsApp pairing code: ${code}`);
    }
  }

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'open') {
      console.log(`✅ WhatsApp connected`);
      setupListeners(sock);
    }
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error instanceof Boom
        ? lastDisconnect.error.output.statusCode
        : 'unknown';
      console.log(`❌ Disconnected. Code: ${statusCode}`);
      if (statusCode !== DisconnectReason.loggedOut) {
        startSession(sessionId);
      }
    }
  });
}

// === Handlers ===
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
    '.alive': '✅ Bot is alive!',
    '.status': `📊 Status:\n${Object.entries(features).map(([k, v]) => `• ${k}: ${v ? '✅' : '❌'}`).join('\n')}`,
    '.menu': `📜 Menu:\n• .ping\n• .alive\n• .status\n• .menu\n• .quote\n• .weather <city>\n• .broadcast <msg>\n• .block <number>\n• .unblock <number>\n• .toggle <feature>\n• .shutdown`
  };

  if (commands[command]) {
    await sock.sendMessage(sender, { text: commands[command] }, { quoted: msg });
    return;
  }

  if (command.startsWith('.quote')) {
    try {
      const res = await fetch("https://api.quotable.io/random");
      const data = await res.json();
      await sock.sendMessage(sender, { text: `💡 ${data.content} — ${data.author}` }, { quoted: msg });
    } catch (err) {
      await sock.sendMessage(sender, { text: '❌ Failed to get quote.' }, { quoted: msg });
    }
    return;
  }

  if (command.startsWith('.weather')) {
    const city = command.replace('.weather', '').trim();
    if (!city) return sock.sendMessage(sender, { text: '⚠️ Please enter a city name.' }, { quoted: msg });
    try {
      const apiKey = process.env.WEATHER_API_KEY;
      const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}&units=metric`);
      const data = await res.json();
      if (data.cod !== 200) throw new Error();
      await sock.sendMessage(sender, { text: `🌤 Weather in ${data.name}:\n${data.weather[0].description}\n🌡 Temp: ${data.main.temp}°C` }, { quoted: msg });
    } catch {
      await sock.sendMessage(sender, { text: '❌ Failed to fetch weather.' }, { quoted: msg });
    }
    return;
  }

  // Admin-like commands (now open to all)
  if (command.startsWith('.broadcast')) {
    const message = command.replace('.broadcast', '').trim();
    if (!message) return;
    const chats = await sock.groupFetchAllParticipating();
    for (const id of Object.keys(chats)) {
      await sock.sendMessage(id, { text: `📢 Broadcast:\n${message}` });
    }
    return;
  }

  if (command.startsWith('.block')) {
    const number = command.replace('.block', '').trim();
    const jid = `${number}@s.whatsapp.net`;
    if (!blocklist.includes(jid)) {
      blocklist.push(jid);
      writeFileSync(blocklistPath, JSON.stringify(blocklist, null, 2));
    }
    return;
  }

  if (command.startsWith('.unblock')) {
    const number = command.replace('.unblock', '').trim();
    const jid = `${number}@s.whatsapp.net`;
    blocklist = blocklist.filter(b => b !== jid);
    writeFileSync(blocklistPath, JSON.stringify(blocklist, null, 2));
    return;
  }

  if (command.startsWith('.toggle')) {
    const feature = command.replace('.toggle', '').trim();
    if (!features.hasOwnProperty(feature)) return;
    features[feature] = !features[feature];
    writeFileSync(featuresPath, JSON.stringify(features, null, 2));
    return;
  }

  if (command === '.shutdown') process.exit(0);

  // Auto actions
  try {
    await sock.readMessages([msg.key]);
    console.log(`👁️ Read message from ${sender}`);
  } catch {}

  if (features.faketyping) {
    try {
      await sock.sendPresenceUpdate('composing', sender);
      await new Promise(res => setTimeout(res, 3000));
      await sock.sendPresenceUpdate('paused', sender);
    } catch {}
  }
}

async function autoviewStatus(sock) {
  if (!features.autoview) return;
  try {
    const statuses = await sock.getStatus();
    for (const status of statuses) {
      for (const story of status.status) {
        await sock.readStatus(status.id, story.timestamp);
      }
    }
  } catch (err) {
    console.error("❌ Autoview failed:", err.message);
  }
}

function setupListeners(sock) {
  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      if (!msg.key.fromMe) await handleIncomingMessage(sock, msg);
    }
  });

  setInterval(() => autoviewStatus(sock), 60000);
  setInterval(() => sock.sendPresenceUpdate('available'), 30000);
}