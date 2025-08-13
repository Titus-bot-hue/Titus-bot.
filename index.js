import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { startSession } from './botManager.js'; // ✅ Make sure this path is correct

// Emulate __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Setup
const app = express();
const PORT = process.env.PORT || 3000;
const publicPath = path.join(process.cwd(), 'public');

// Ensure public folder exists
if (!existsSync(publicPath)) mkdirSync(publicPath);

// Serve static files (QR code image, etc.)
app.use(express.static(publicPath));

// Home page with both QR code & pairing code
app.get('/', (req, res) => {
  let pairingCode = '';
  const pairingPath = path.join(publicPath, 'pairing.txt');

  if (existsSync(pairingPath)) {
    pairingCode = readFileSync(pairingPath, 'utf8').trim();
  }

  res.send(`
    <html>
      <head>
        <meta http-equiv="refresh" content="10">
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 40px; }
          img { border: 1px solid #ccc; margin-top: 20px; }
          .pairing { margin-top: 20px; font-size: 18px; color: #333; }
          .code-box {
            display: inline-block;
            background: #f4f4f4;
            padding: 10px 20px;
            border-radius: 8px;
            font-weight: bold;
            font-size: 20px;
          }
        </style>
      </head>
      <body>
        <h1>🟢 DansBot WhatsApp Connection</h1>
        <p>Scan this QR Code or use the pairing code below to link your WhatsApp.</p>
        <img src="/qr.png" width="300" alt="QR Code">
        <div class="pairing">
          <p>🔑 Pairing Code:</p>
          <div class="code-box">${pairingCode || 'Not generated yet'}</div>
        </div>
        <p style="margin-top:30px; color:gray;">This page auto-refreshes every 10 seconds.</p>
      </body>
    </html>
  `);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start everything
app.listen(PORT, () => {
  console.log(`🌐 Server running at http://localhost:${PORT}`);
  startSession('main'); // ✅ Connect to WhatsApp & generate QR/Pairing Code
});