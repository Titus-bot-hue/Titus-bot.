import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { startSession } from './botManager.js'; // Make sure path is correct

// Emulate __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Setup
const app = express();
const PORT = process.env.PORT || 3000;
const publicPath = path.join(process.cwd(), 'public');

// Ensure public folder exists
if (!existsSync(publicPath)) mkdirSync(publicPath);

// Serve QR image and other static files
app.use(express.static(publicPath));

app.get('/', (req, res) => {
  let pairingCode = '';
  const pairingFile = path.join(publicPath, 'pairing.txt');

  if (existsSync(pairingFile)) {
    try {
      pairingCode = readFileSync(pairingFile, 'utf8').trim();
    } catch (err) {
      console.error('Error reading pairing code:', err);
    }
  }

  res.send(`
    <html>
      <body style="text-align:center; padding:40px; font-family:sans-serif;">
        <h1>🟢 DansBot WhatsApp Login</h1>
        <p>Scan the QR code or use the pairing code below (expires in 1 min).</p>
        <img src="/qr.png" width="300" style="border:1px solid #ccc; margin-bottom:20px;"><br>
        ${pairingCode 
          ? `<h2>Pairing Code: <span style="color:green">${pairingCode}</span></h2>` 
          : '<p style="color:red">No active pairing code</p>'}
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
  startSession('main'); // Connect to WhatsApp & generate QR + pairing code
});