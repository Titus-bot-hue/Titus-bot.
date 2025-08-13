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

/* -------------------- Paths & Folders -------------------- */
const authFolder = './auth';
const publicFolder = join(process.cwd(), 'public');
if (!existsSync(authFolder)) mkdirSync(authFolder);
if (!existsSync(publicFolder)) mkdirSync(publicFolder);

const pairingFile = join(publicFolder, 'pairing.txt');
const qrFile = join(publicFolder, 'qr.png');

/* -------------------- Feature toggles -------------------- */
let features = { autoread: true, faketyping: true };
const featuresPath = './features.json';
if (existsSync(featuresPath)) {
  try { features = JSON.parse(readFileSync(featuresPath)); } catch {}
}

/* -------------------- Pairing code state -------------------- */
let isConnected = false;
let pairTimer = null;

/** Write the current pairing code (or status) to public/pairing.txt */
function setPairingFile(text) {
  try {
    writeFileSync(pairingFile, `${text}\n`, 'utf8');
  } catch (e) {
    console.error('❌ Failed writing pairing.txt:', e);
  }
}

/** Save QR image to public/qr.png */
async function saveQR(qrData) {
  try {
    await QRCode.toFile(qrFile, qrData);
    console.log(`✅ QR code saved to ${qrFile}`);
  } catch (e) {
    console.error('❌ Failed to save QR code:', e);
  }
}

/** Generate a pairing code (valid ~1 minute) and save it */
async function generatePairingCode(sock) {
  const raw = process.env.PAIRING_NUMBER?.replace(/\D/g, '');
  if (!raw) {
    setPairingFile('Pairing code: (set PAIRING_NUMBER env to enable)');
    return;
  }
  try {
    const code = await sock.requestPairingCode(raw);
    // WhatsApp pairing codes expire quickly (~1 minute)
    setPairingFile(`Pairing code: ${code}  (expires in ~1 minute)`);
    console.log(`🔑 New pairing code: ${code} (valid ~1 minute)`);
  } catch (e) {
    console.error('❌ Failed to generate pairing code:', e);
    setPairingFile('Pairing code: error (check logs)');
  }
}

/** Start/restart a loop to refresh the pairing code while not connected */
function startPairingLoop(sock) {
  // run immediately once
  generatePairingCode(sock);
  // refresh ~every 55s so there’s always a fresh code
  if (pairTimer) clearInterval(pairTimer);
  pairTimer = setInterval(async () => {
    if (isConnected) return;
    await generatePairingCode(sock);
  }, 55_000);
}

/** Stop the pairing loop and mark file as connected */
function stopPairingLoop() {
  if (pairTimer) {
    clearInterval(pairTimer);
    pairTimer = null;
  }
  setPairingFile('Connected ✅');
}

/* -------------------- Main session start -------------------- */
export async function startSession(sessionId) {
  const { state, saveCreds } = await useMultiFileAuthState(join(authFolder, sessionId));
  const { version, isLatest } = await fetchLatestBaileysVersion();

  console.log(`📦 Baileys v${version.join('.')}, latest: ${isLatest}`);

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false, // we manage QR ourselves
    browser: ['DansBot', 'Chrome', '122']
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr) {
      await saveQR(qr);
      // When QR appears, also kick off pairing-code loop (if enabled)
      if (!isConnected) startPairingLoop(sock);
    }

    if (connection === 'open') {
      isConnected = true;
      console.log(`✅ WhatsApp session "${sessionId}" connected`);
      stopPairingLoop();
      setupListeners(sock);
    }

    if (connection === 'close') {
      isConnected = false;

      const code = lastDisconnect?.error instanceof Boom
        ? lastDisconnect.error.output.statusCode
        : 'unknown';
      console.log(`❌ Disconnected. Code: ${code}`);

      // show “waiting” status & (re)start pairing loop so UI always has a fresh code
      setPairingFile('Waiting to connect…');
      startPairingLoop(sock);

      if (code !== DisconnectReason.loggedOut) {
        console.log('🔁 Reconnecting...');
        startSession(sessionId);
      }
    }

    // If we’re neither open nor closing, ensure the pairing loop is running
    if (!isConnected && !pairTimer) {
      startPairingLoop(sock);
    }
  });
}

/* -------------------- Message handling -------------------- */
async function handleIncomingMessage(sock, msg) {
  const chatId = msg.key.remoteJid;

  const text =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption ||
    '';

  const command = text.trim().toLowerCase();

  // Basic commands
  const commands = {
    '.ping': '🏓 Pong!',
    '.alive': '✅ DansBot is alive!',
    '.status': `📊 Features:\n${Object.entries(features)
      .map(([k, v]) => `• ${k}: ${v ? '✅' : '❌'}`)
      .join('\n')}`,
    '.menu':
      `📜 Menu\n` +
      `• .ping — latency check\n` +
      `• .alive — bot status\n` +
      `• .status — feature toggles\n` +
      `• (Login page shows both QR & Pairing Code)\n` +
      `• .weather <city> — coming soon\n` +
      `• .quote — coming soon`
  };

  if (commands[command]) {
    await sock.sendMessage(chatId, { text: commands[command] }, { quoted: msg });
    return;
  }

  // Unknown dot-commands helper
  if (command.startsWith('.')) {
    await sock.sendMessage(
      chatId,
      { text: `❓ Unknown command: ${command}\nType .menu to see available commands.` },
      { quoted: msg }
    );
    return;
  }

  // Lightweight UX sugar
  try {
    if (features.autoread) {
      await sock.readMessages([msg.key]);
      console.log(`👁️ Read message from ${chatId}`);
    }
  } catch (e) {
    console.error('❌ Autoread failed:', e);
  }

  if (features.faketyping) {
    try {
      await sock.sendPresenceUpdate('composing', chatId);
      await new Promise((r) => setTimeout(r, 1500));
      await sock.sendPresenceUpdate('paused', chatId);
    } catch (e) {
      console.error('❌ Typing failed:', e);
    }
  }
}

/* -------------------- Keep-alive & listeners -------------------- */
function stayOnline(sock) {
  setInterval(() => {
    sock.sendPresenceUpdate('available').catch(() => {});
    console.log('🟢 Bot is online');
  }, 30_000);
}

function setupListeners(sock) {
  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      if (!msg.key.fromMe) {
        await handleIncomingMessage(sock, msg);
      }
    }
  });

  stayOnline(sock);
}