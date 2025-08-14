import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { startSession, generatePairingCode } from './botManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const publicPath = path.join(process.cwd(), 'public');

// Ensure public folder exists
if (!existsSync(publicPath)) mkdirSync(publicPath);

// Serve static files
app.use(express.static(publicPath));
app.use(express.urlencoded({ extended: true }));

// Main page → QR code + pairing code + number input
app.get('/', (req, res) => {
  let pairingCode = '';
  const pairingFile = path.join(publicPath, 'pairing.txt');
  if (existsSync(pairingFile)) {
    pairingCode = readFileSync(pairingFile, 'utf8').trim();
  }

  res.send(`
    <html>
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
            ${pairingCode || '⌛ Not generated yet'}
          </p>
          <p style="color:gray;">Open WhatsApp → Linked Devices → Link with phone number → Enter this code</p>
        </div>

        <div style="margin-bottom:40px;">
          <h2>📱 Get Pairing Code by Number</h2>
          <form method="POST" action="/generate-code">
            <input type="text" name="number" placeholder="Enter WhatsApp number (e.g. 2547...)" required 
              style="padding:10px; font-size:16px; width:250px;">
            <button type="submit" style="padding:10px; font-size:16px;">Generate Code</button>
          </form>
        </div>
      </body>
    </html>
  `);
});

// Handle number-based pairing code request
app.post('/generate-code', async (req, res) => {
  const number = req.body.number;
  if (!number) {
    return res.send('❌ Please provide a valid number.');
  }

  try {
    const code = await generatePairingCode(number);
    writeFileSync(path.join(publicPath, 'pairing.txt'), code);
    res.redirect('/');
  } catch (err) {
    console.error('❌ Failed to generate pairing code:', err);
    res.send('❌ Failed to generate pairing code.');
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`🌐 Server running at http://localhost:${PORT}`);
  startSession('main'); // Start bot session
});