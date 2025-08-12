import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';
import {
  startSession,
  generateLinkingCode,
  listSessions,
  getUserQrPath
} from './botManager.js';

// Emulate __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Setup
const app = express();
const PORT = process.env.PORT || 3000;
const publicPath = path.join(process.cwd(), 'public');

// Ensure public folder exists
if (!existsSync(publicPath)) mkdirSync(publicPath);

// Serve static files (QR images, etc.)
app.use(express.static(publicPath));

/**
 * Root page - asks for username
 */
app.get('/', (req, res) => {
  res.send(`
    <html>
      <body style="font-family:sans-serif; text-align:center; padding:40px;">
        <h1>🟢 DansBot Multi-User Login</h1>
        <form action="/login" method="get">
          <input name="user" placeholder="Enter username" style="padding:10px;font-size:16px;">
          <button type="submit" style="padding:10px 20px;font-size:16px;">Login</button>
        </form>
        <p>Active sessions: ${listSessions().join(', ') || 'none'}</p>
      </body>
    </html>
  `);
});

/**
 * Login page for a given username
 * Shows QR code + pairing code
 */
app.get('/login', async (req, res) => {
  const user = (req.query.user || '').trim();
  if (!user) {
    return res.redirect('/');
  }

  try {
    // Start session if not already started
    await startSession(user);

    const qrPath = getUserQrPath(user);
    const pairingCode = await generateLinkingCode(user);

    res.send(`
      <html>
        <body style="font-family:sans-serif; text-align:center; padding:40px;">
          <h1>🟢 DansBot Login: ${user}</h1>
          <p>Scan QR code or use pairing code to link WhatsApp:</p>
          <div style="margin:20px;">
            <img src="${qrPath}?t=${Date.now()}" width="300" style="border:1px solid #ccc;">
          </div>
          <p><b>Pairing code (valid 1 minute):</b> <span id="paircode">${pairingCode || 'Error'}</span></p>
          <button onclick="refreshPairCode()" style="padding:8px 16px;">Get New Code</button>
          <br><br>
          <a href="/">⬅ Back</a>
          <script>
            async function refreshPairCode() {
              const r = await fetch('/paircode?user=${user}');
              const j = await r.json();
              document.getElementById('paircode').innerText = j.code || 'Error';
            }
            // Auto-refresh every 10s
            setInterval(refreshPairCode, 10000);
          </script>
        </body>
      </html>
    `);
  } catch (err) {
    console.error(err);
    res.status(500).send(`❌ Error starting session for ${user}: ${err.message}`);
  }
});

/**
 * Pairing code endpoint - returns JSON with new code
 */
app.get('/paircode', async (req, res) => {
  const user = (req.query.user || '').trim();
  if (!user) {
    return res.status(400).json({ error: 'user required' });
  }
  try {
    const code = await generateLinkingCode(user);
    res.json({ code });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', sessions: listSessions() });
});

// Start everything
app.listen(PORT, () => {
  console.log(`🌐 Server running at http://localhost:${PORT}`);
});