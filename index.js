// index.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';
import { startSession, startAllSessions } from './botManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const publicPath = path.join(process.cwd(), 'public');

if (!existsSync(publicPath)) mkdirSync(publicPath);

// Serve static files
app.use(express.static(publicPath));
app.use(express.urlencoded({ extended: true }));

// Home page with QR + Pairing code form
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>DansBot Connection</title>
      </head>
      <body style="font-family: Arial; text-align:center; padding:40px;">
        <h1>🟢 DansBot WhatsApp Connection</h1>
        
        <h2>📸 QR Code Method</h2>
        <p>Scan this QR with WhatsApp Linked Devices:</p>
        <img src="/main_qr.png" width="300" style="border:1px solid #ccc;">
        
        <hr style="margin:40px 0;">
        
        <h2>🔑 Pairing Code Method</h2>
        <form method="POST" action="/pair">
          <label>Enter a Session ID (example: user1):</label><br><br>
          <input type="text" name="sessionId" placeholder="Session name" required>
          <button type="submit">Get Pairing Code</button>
        </form>
      </body>
    </html>
  `);
});

// Handle pairing code request
app.post('/pair', (req, res) => {
  const sessionId = req.body.sessionId.trim();
  if (!sessionId) {
    return res.send('❌ Session ID is required.');
  }

  startSession(sessionId, true); // start with pairing code
  res.send(`
    <html>
      <body style="text-align:center; padding:40px;">
        <h1>✅ Pairing Code Requested</h1>
        <p>Check server logs for the pairing code for session: <b>${sessionId}</b></p>
        <a href="/">⬅ Back</a>
      </body>
    </html>
  `);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`🌐 Server running at http://localhost:${PORT}`);
  startSession('main'); // default QR session
  startAllSessions(); // reload saved sessions
});