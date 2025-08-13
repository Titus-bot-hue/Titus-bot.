import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { startSession } from './botManager.js';

// Emulate __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Setup
const app = express();
const PORT = process.env.PORT || 3000;
const publicPath = path.join(process.cwd(), 'public');

// Ensure public folder exists
if (!existsSync(publicPath)) mkdirSync(publicPath);

// Serve static files (QR image, pairing.txt)
app.use(express.static(publicPath));

// Homepage — show QR and Pairing Code together
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>DansBot WhatsApp Login</title>
        <meta http-equiv="refresh" content="15"> <!-- auto-refresh every 15s -->
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 20px; }
          img { border: 1px solid #ccc; margin-top: 10px; }
          pre { background: #f5f5f5; padding: 10px; display: inline-block; border-radius: 5px; }
        </style>
      </head>
      <body>
        <h1>🟢 DansBot WhatsApp Login</h1>
        <p>Scan this QR Code OR use the pairing code below to link WhatsApp.</p>
        
        <h2>QR Code Login</h2>
        <img src="/qr.png" width="300" alt="QR Code will appear here">
        
        <h2>Pairing Code Login</h2>
        <pre>${readPairingCode()}</pre>

        <p style="margin-top:20px; font-size: 0.9em; color: gray;">
          This page refreshes every 15 seconds. Pairing codes expire after ~1 minute.
        </p>
      </body>
    </html>
  `);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Helper to read pairing.txt
function readPairingCode() {
  const file = path.join(publicPath, 'pairing.txt');
  if (existsSync(file)) {
    try {
      return readFileSync(file, 'utf8').trim();
    } catch {
      return 'Error reading pairing.txt';
    }
  }
  return 'No pairing code yet — please wait...';
}

// Start server & bot
app.listen(PORT, () => {
  console.log(`🌐 Server running at http://localhost:${PORT}`);
  startSession('main');
});