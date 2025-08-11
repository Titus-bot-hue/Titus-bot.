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
import fetch from 'node-fetch';
import { randomBytes } from 'crypto';

dotenv.config();

// --- Folders / files ---
const authFolder = './auth';
const publicFolder = join(process.cwd(), 'public');
const blocklistPath = './blocklist.json';
const featuresPath = './features.json';
const usersPath = './users.json';

if (!existsSync(authFolder)) mkdirSync(authFolder);
if (!existsSync(publicFolder)) mkdirSync(publicFolder);

// --- Configs ---
const adminNumber = process.env.ADMIN_NUMBER; // must be like: 2547xxxxxxx@s.whatsapp.net

// --- Load persistent data ---
let blocklist = existsSync(blocklistPath) ? JSON.parse(readFileSync(blocklistPath)) : [];
let features = existsSync(featuresPath)
  ? JSON.parse(readFileSync(featuresPath))
  : { autoview: true, faketyping: true };
let users = existsSync(usersPath) ? JSON.parse(readFileSync(usersPath)) : []; // [{ code: 'abc123', linked: ['2547...@s.whatsapp.net'] }]

function saveUsers() {
  writeFileSync(usersPath, JSON.stringify(users, null, 2));
}
function saveBlocklist() {
  writeFileSync(blocklistPath, JSON.stringify(blocklist, null, 2));
}
function saveFeatures() {
  writeFileSync(featuresPath, JSON.stringify(features, null, 2));
}

// --- Helpers for linking ---
function generateUniqueCode() {
  // 6-digit numeric code (as string)
  let code;
  do {
    code = Math.floor(100000 + Math.random() * 900000).toString();
  } while (users.find(u => u.code === code));
  return code;
}
function findLinkEntryByCode(code) {
  return users.find(u => u.code === code);
}
function isLinked(jid) {
  return users.some(u => u.linked && u.linked.includes(jid));
}

// --- Exported startSession ---
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
        // small delay to avoid hot-loop
        setTimeout(() => startSession(sessionId), 1500);
      }
    }
  });
}

// --- Message handler ---
async function handleIncomingMessage(sock, msg) {
  try {
    if (!msg || !msg.message) return;
    const from = msg.key.remoteJid; // chat (group or private)
    const senderJid = msg.key.participant || msg.key.remoteJid; // actual person who sent
    const quoted = msg;
    const text =
      (msg.message.conversation) ||
      (msg.message.extendedTextMessage?.text) ||
      (msg.message?.imageMessage?.caption) ||
      '';
    const commandRaw = text.trim();
    if (!commandRaw) return;
    const command = commandRaw.split(' ')[0].toLowerCase();
    const args = commandRaw.split(' ').slice(1).join(' ').trim();

    const isAdmin = senderJid === adminNumber;
    const linked = isLinked(senderJid);

    // If not admin and not linked, allow only .link, .menu and .help
    if (!isAdmin && !linked) {
      if (command === '.link' || command === '.menu' || command === '.help') {
        // continue to allow these
      } else {
        await sock.sendMessage(from, { text: '⚠️ You are not linked. Ask the admin for a link code and use `.link <code>` to connect.' }, { quoted });
        return;
      }
    }

    // Blocklist
    if (blocklist.includes(senderJid)) {
      console.log(`⛔ Blocked user attempted action: ${senderJid}`);
      return;
    }

    // ---------- Linking commands ----------
    if (command === '.getlink' && isAdmin) {
      const code = generateUniqueCode();
      users.push({ code, linked: [] });
      saveUsers();
      await sock.sendMessage(from, { text: `🔗 Link code generated: *${code}*\nShare this code with the user you want to allow. They should send: \`.link ${code}\`` }, { quoted });
      return;
    }

    if (command === '.link') {
      const code = args;
      if (!code) {
        await sock.sendMessage(from, { text: '⚠️ Usage: .link <code>' }, { quoted });
        return;
      }
      const entry = findLinkEntryByCode(code);
      if (!entry) {
        await sock.sendMessage(from, { text: '❌ Invalid or expired code.' }, { quoted });
        return;
      }
      if (!entry.linked.includes(senderJid)) {
        entry.linked.push(senderJid);
        saveUsers();
        await sock.sendMessage(from, { text: '✅ Linked successfully! You can now use the bot.' }, { quoted });
      } else {
        await sock.sendMessage(from, { text: '⚠️ You are already linked.' }, { quoted });
      }
      return;
    }

    if (command === '.unlink') {
      // remove sender from linked lists
      let removed = false;
      for (const e of users) {
        const idx = e.linked.indexOf(senderJid);
        if (idx !== -1) {
          e.linked.splice(idx, 1);
          removed = true;
        }
      }
      if (removed) {
        saveUsers();
        await sock.sendMessage(from, { text: '✅ You have been unlinked.' }, { quoted });
      } else {
        await sock.sendMessage(from, { text: '⚠️ You were not linked.' }, { quoted });
      }
      return;
    }

    // ---------- Admin commands ----------
    if (command === '.shutdown' && isAdmin) {
      await sock.sendMessage(from, { text: '🛑 Shutting down...' }, { quoted });
      process.exit(0);
    }

    if (command === '.broadcast' && isAdmin) {
      const message = args;
      if (!message) {
        await sock.sendMessage(from, { text: '⚠️ Provide a message: .broadcast <message>' }, { quoted });
        return;
      }
      const chats = await sock.groupFetchAllParticipating();
      for (const id of Object.keys(chats)) {
        try { await sock.sendMessage(id, { text: `📢 Broadcast:\n${message}` }); } catch (e) { /* ignore */ }
      }
      await sock.sendMessage(from, { text: '✅ Broadcast sent.' }, { quoted });
      return;
    }

    if (command === '.block' && isAdmin) {
      const number = args;
      if (!number) { await sock.sendMessage(from, { text: '⚠️ Provide number: .block 2547xxxxxxx' }, { quoted }); return; }
      const jid = `${number}@s.whatsapp.net`;
      if (!blocklist.includes(jid)) {
        blocklist.push(jid);
        saveBlocklist();
        await sock.sendMessage(from, { text: `✅ Blocked ${number}` }, { quoted });
      } else {
        await sock.sendMessage(from, { text: '⚠️ Already blocked.' }, { quoted });
      }
      return;
    }

    if (command === '.unblock' && isAdmin) {
      const number = args;
      if (!number) { await sock.sendMessage(from, { text: '⚠️ Provide number: .unblock 2547xxxxxxx' }, { quoted }); return; }
      const jid = `${number}@s.whatsapp.net`;
      const idx = blocklist.indexOf(jid);
      if (idx !== -1) {
        blocklist.splice(idx, 1);
        saveBlocklist();
        await sock.sendMessage(from, { text: `✅ Unblocked ${number}` }, { quoted });
      } else {
        await sock.sendMessage(from, { text: '⚠️ Number not blocked.' }, { quoted });
      }
      return;
    }

    if (command === '.toggle' && isAdmin) {
      const feature = args;
      if (!feature) { await sock.sendMessage(from, { text: '⚠️ Usage: .toggle <feature>' }, { quoted }); return; }
      if (!features.hasOwnProperty(feature)) {
        await sock.sendMessage(from, { text: `❌ Unknown feature: ${feature}` }, { quoted });
        return;
      }
      features[feature] = !features[feature];
      saveFeatures();
      await sock.sendMessage(from, { text: `🔁 ${feature} is now ${features[feature] ? 'enabled' : 'disabled'}` }, { quoted });
      return;
    }

    // ---------- Utility/simple commands ----------
    if (command === '.ping') {
      await sock.sendMessage(from, { text: '🏓 Pong!' }, { quoted });
      return;
    }
    if (command === '.alive') {
      await sock.sendMessage(from, { text: '✅ DansBot is alive!' }, { quoted });
      return;
    }
    if (command === '.status') {
      const s = Object.entries(features).map(([k, v]) => `• ${k}: ${v ? '✅' : '❌'}`).join('\n');
      await sock.sendMessage(from, { text: `📊 Status:\n${s}` }, { quoted });
      return;
    }

    // ---------- Quote & Joke (working) ----------
    if (command === '.quote') {
      const q = await getQuote();
      await sock.sendMessage(from, { text: q }, { quoted });
      return;
    }
    if (command === '.joke') {
      const j = await getJoke();
      await sock.sendMessage(from, { text: j }, { quoted });
      return;
    }

    // ---------- TikTok downloader (basic) ----------
    if (command === '.tiktok' || command === '.tt') {
      const url = args;
      if (!url) { await sock.sendMessage(from, { text: '⚠️ Usage: .tiktok <tiktok_url>' }, { quoted }); return; }

      await sock.sendMessage(from, { text: '⏳ Downloading TikTok video...' }, { quoted });
      try {
        // NOTE: This endpoint is third-party; reliability varies.
        const apiURL = `https://tikcdn.io/ssstik/${encodeURIComponent(url)}`;
        const res = await fetch(apiURL);
        if (!res.ok) throw new Error('Downloader API returned non-OK');
        const arrayBuffer = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        await sock.sendMessage(from, {
          video: buffer,
          caption: '🎥 Here is your TikTok video'
        }, { quoted });

      } catch (err) {
        console.error('TikTok download error:', err);
        await sock.sendMessage(from, { text: '❌ Failed to download TikTok video. The third-party service may be down or the URL is invalid.' }, { quoted });
      }
      return;
    }

    // ---------- Instagram / YouTube / AI / Weather etc. (coming soon) ----------
    if (command === '.weather') { await sock.sendMessage(from, { text: '⚠️ Feature coming soon: .weather <city>' }, { quoted }); return; }
    if (command === '.time') { await sock.sendMessage(from, { text: '⚠️ Feature coming soon: .time <city>' }, { quoted }); return; }
    if (command === '.convert') { await sock.sendMessage(from, { text: '⚠️ Feature coming soon: .convert <amount> <from> <to>' }, { quoted }); return; }
    if (command === '.translate') { await sock.sendMessage(from, { text: '⚠️ Feature coming soon: .translate <lang> <text>' }, { quoted }); return; }
    if (command === '.ask') { await sock.sendMessage(from, { text: '⚠️ Feature coming soon: .ask <question>' }, { quoted }); return; }
    if (command === '.image') { await sock.sendMessage(from, { text: '⚠️ Feature coming soon: .image <description>' }, { quoted }); return; }
    if (command === '.yt') { await sock.sendMessage(from, { text: '⚠️ Feature coming soon: .yt <link>' }, { quoted }); return; }
    if (command === '.ig') { await sock.sendMessage(from, { text: '⚠️ Feature coming soon: .ig <link>' }, { quoted }); return; }

    // ---------- Menu (full) ----------
    if (command === '.menu' || command === '.help') {
      const menu = `📜 *DansBot Menu*
• .ping
• .alive
• .status
• .quote
• .joke
• .tiktok <url>
• .tt <url>
• .weather <city> (coming soon)
• .time <city> (coming soon)
• .convert <amt> <from> <to> (coming soon)
• .translate <lang> <text> (coming soon)
• .ask <question> (coming soon)
• .image <description> (coming soon)
• .yt <link> (coming soon)
• .ig <link> (coming soon)

Admin commands:
• .shutdown
• .broadcast <msg>
• .block <number>
• .unblock <number>
• .toggle <feature>
• .getlink
User linking:
• .link <code>
• .unlink
`;
      await sock.sendMessage(from, { text: menu }, { quoted });
      return;
    }

    // ---------- Default: do nothing ----------
    // You may want to add auto-reply rules here.

    // Mark message as read (if available)
    try { await sock.readMessages([msg.key]); } catch (e) { /* ignore */ }

    // Fake typing (if enabled)
    if (features.faketyping) {
      try {
        await sock.sendPresenceUpdate('composing', from);
        await new Promise(r => setTimeout(r, 1200));
        await sock.sendPresenceUpdate('paused', from);
      } catch (e) { /* ignore */ }
    }

  } catch (err) {
    console.error('handleIncomingMessage error:', err);
  }
}

// --- Quote & Joke helpers ---
async function getQuote() {
  try {
    const res = await fetch('https://api.quotable.io/random');
    const d = await res.json();
    return `💬 "${d.content}" — ${d.author}`;
  } catch (e) {
    return '⚠️ Could not fetch a quote right now.';
  }
}

async function getJoke() {
  try {
    const res = await fetch('https://official-joke-api.appspot.com/random_joke');
    const d = await res.json();
    return `😂 ${d.setup}\n${d.punchline}`;
  } catch (e) {
    return '⚠️ Could not fetch a joke right now.';
  }
}

// --- Autoview & monitor (placeholders for now) ---
async function autoviewStatus(sock) {
  if (!features.autoview) return;
  try {
    console.log('👁️ autoview placeholder (Baileys API change).');
    // Implement later when a supported method is available or we use an alternate approach
  } catch (err) {
    console.error('autoview error:', err);
  }
}
async function monitorStatus(sock) {
  try {
    console.log('📊 monitorStatus placeholder.');
  } catch (err) {
    console.error('monitorStatus error:', err);
  }
}

// --- Keep bot presence alive ---
function stayOnline(sock) {
  setInterval(() => {
    try { sock.sendPresenceUpdate('available'); } catch (e) { /* ignore */ }
    console.log('🟢 Bot is online (heartbeat)');
  }, 30000);
}

// --- Setup listeners ---
function setupListeners(sock) {
  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const m of messages) {
      if (!m.key.fromMe) await handleIncomingMessage(sock, m);
    }
  });

  sock.ev.on('messages.update', async updates => {
    for (const update of updates) {
      try {
        if (update.messageStubType === 8 && update.key) {
          const chatId = update.key.remoteJid;
          const messageId = update.key.id;
          const originalMsg = await sock.loadMessage(chatId, messageId);
          if (originalMsg?.message) {
            await sock.sendMessage(chatId, {
              text: `🚨 Antidelete:\n${JSON.stringify(originalMsg.message, null, 2)}`
            });
            console.log(`🛡️ Restored deleted message in ${chatId}`);
          }
        }
      } catch (err) {
        console.error('messages.update handler error:', err);
      }
    }
  });

  setInterval(() => autoviewStatus(sock), 60000);
  setInterval(() => monitorStatus(sock), 60000);
  stayOnline(sock);
}