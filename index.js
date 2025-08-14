import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { startSession } from './botManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const publicPath = path.join(process.cwd(), 'public');

// Ensure public folder exists
if (!existsSync(publicPath)) mkdirSync(publicPath);

// Serve static files from public
app.use(express.static(publicPath));

// Main page → QR code + pairing code
app.get('/', (req, res) => {
  let pairingCode = '';
  const pairingFile = path.join(publicPath, 'pairing.txt');

  // ✅ Ensure pairing.txt exists (prevents "Generating..." forever)
  if (!existsSync(pairingFile)) {
    writeFileSync(pairingFile, '⌛ Generating... refresh in a moment');
  } else {
    pairingCode = readFileSync(pairingFile, 'utf8').trim();
  }

  res.send(`
    <html>
      <head>
        <meta http-equiv="refresh" content="5"> <!-- Auto refresh every 5s until code shows -->
      </head>
      <body style="text-align:center; padding:40px; font-family: Arial, sans-serif;">
        <h1>🟢 DansBot Connection</h1>
        <p>Use either method below to link your WhatsApp:</p>
        
        <div style="margin-bottom:40px;">
          <h2>📷 Scan QR Code</h2>
          <img src="/qr.png" width="300" style="border:1px solid #ccc;">
        </div>

        <div style="margin-bottom:40px;">
          <h2>🔢 Pairing Code</h2>
          <p style="font-size:24px; font-weight:bold; color:green;">
            ${pairingCode}
          </p>
          <p style="color:gray;">Open WhatsApp → Linked Devices → Link with phone number → Enter this code</p>
        </div>
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
  startSession('main'); // Start bot session
});