import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { startSession } from './botManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const publicPath = path.join(process.cwd(), 'public');

// Ensure public folder exists
if (!existsSync(publicPath)) mkdirSync(publicPath);

// Middleware to parse form data
app.use(express.urlencoded({ extended: true }));

// Serve static files (QR image & pairing.txt)
app.use(express.static(publicPath));

// Home page
app.get('/', (req, res) => {
  let pairingCode = '';
  const pairingFile = path.join(publicPath, 'pairing.txt');
  if (existsSync(pairingFile)) {
    pairingCode = readFileSync(pairingFile, 'utf8').trim();
  }

  res.send(`
    <html>
      <body style="text-align:center; padding:40px; font-family: Arial, sans-serif;">
        <h1>🟢 DansBot WhatsApp Connection</h1>
        <p>Use any method below to link your WhatsApp:</p>

        <div style="margin-bottom:40px;">
          <h2>📷 Scan QR Code</h2>
          <img src="/qr.png" width="300" style="border:1px solid #ccc;">
        </div>

        <div style="margin-bottom:40px;">
          <h2>🔢 Pairing Code</h2>
          <p style="font-size:24px; font-weight:bold; color:green;">
            ${pairingCode || '⌛ No pairing code yet'}
          </p>
        </div>

        <div>
          <h2>📱 Generate Pairing Code by Phone Number</h2>
          <form method="POST" action="/generate">
            <input type="text" name="phone" placeholder="e.g. 254712345678" style="padding:8px;" required>
            <button type="submit" style="padding:8px 16px;">Generate</button>
          </form>
        </div>
      </body>
    </html>
  `);
});

// Handle pairing code generation
app.post('/generate', (req, res) => {
  const phoneNumber = req.body.phone.trim();
  if (!phoneNumber) {
    return res.send('<p>❌ Please provide a phone number.</p><a href="/">Go back</a>');
  }
  startSession('main', phoneNumber);
  res.redirect('/');
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`🌐 Server running at http://localhost:${PORT}`);
  startSession('main'); // Start bot without pairing code initially
});