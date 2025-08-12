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
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

// Folders for auth and QR
const authFolder = './auth';
const publicFolder = join(process.cwd(), 'public');
if (!existsSync(authFolder)) mkdirSync(authFolder);
if (!existsSync(publicFolder)) mkdirSync(publicFolder);

const blocklistPath = './blocklist.json';
const featuresPath = './features.json';

// Load blocklist
let blocklist = existsSync(blocklistPath)
  ? JSON.parse(readFileSync(blocklistPath))
  : [];

// Load feature toggles
let features = existsSync(featuresPath)
  ? JSON.parse(readFileSync(featuresPath))
  : {
      autoview: true,
      faketyping: true
    };

let statusCache = {};

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

  if (blocklist.includes(sender)) {
    console.log(`⛔ Blocked user: ${sender}`);
    return;
  }

  // Weather command
  if (command.startsWith('.weather')) {
    const city = command.replace('.weather', '').trim();
    if (!city) {
      return await sock.sendMessage(sender, { text: '⚠️ Provide a city name. Example: `.weather Nairobi`' }, { quoted: msg });
    }
    try {
      const apiKey = process.env.WEATHER_API_KEY;
      const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric`);
      const data = await res.json();
      if (data.cod !== 200) {
        return await sock.sendMessage(sender, { text: `❌ City not found.` }, { quoted: msg });
      }
      const reply = `🌤 Weather in ${data.name}:\n🌡 Temp: ${data.main.temp}°C\n💧 Humidity: ${data.main.humidity}%\n💨 Wind: ${data.wind.speed} m/s\n☁ Condition: ${data.weather[0].description}`;
      await sock.sendMessage(sender, { text: reply }, { quoted: msg });
    } catch (err) {
      console.error(err);
      await sock.sendMessage(sender, { text: '❌ Failed to fetch weather.' }, { quoted: msg });
    }
    return;
  }

  // Shutdown bot
  if (command === '.shutdown') {
    await sock.sendMessage(sender, { text: '🛑 Shutting down...' }, { quoted: msg });
    process.exit(0);
  }

  // Broadcast message
  if (command.startsWith('.broadcast')) {
    const message = command.replace('.broadcast', '').trim();
    if (!message) return await sock.sendMessage(sender, { text: '⚠️ Provide a message.' }, { quoted: msg });

    const chats = await sock.groupFetchAllParticipating();
    for (const id of Object.keys(chats)) {
      await sock.sendMessage(id, { text: `📢 Broadcast:\n${message}` });
    }
    await sock.sendMessage(sender, { text: '✅ Broadcast sent.' }, { quoted: msg });
  }

  // Block user
  if (command.startsWith('.block')) {
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

  // Unblock user
  if (command.startsWith('.unblock')) {
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

  // Toggle feature
  if (command.startsWith('.toggle')) {
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

  // Menu
  const commands = {
    '.ping': '🏓 Pong!',
    '.alive': '✅ DansBot is alive!',
    '.status': `📊 Status:\n${Object.entries(features).map(([k, v]) => `• ${k}: ${v ? '✅' : '❌'}`).join('\n')}`,
    '.menu': `📜 Menu:
• .ping
• .alive
• .status
• .menu
• .shutdown
• .broadcast <msg>
• .block <number>
• .unblock <number>
• .toggle <feature>
• .weather <city>
• .quote (coming soon)
• .tiktok <url> (coming soon)
• .youtube <url> (coming soon)
• .image <query> (coming soon)
• .news (coming soon)`
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

async function autoviewStatus(sock) {
  if (!features.autoview) return;
  console.log('👁️ Autoview feature is enabled, but actual viewing is not implemented in current Baileys API.');
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

  setInterval(() => autoviewStatus(sock), 60000);
  stayOnline(sock);
}