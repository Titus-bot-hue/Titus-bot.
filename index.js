import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';
import { startSession, getPairingCode } from './botManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const publicPath = path.join(process.cwd(), 'public');

if (!existsSync(publicPath)) mkdirSync(publicPath);

// Serve public files (QR code images, etc.)
app.use(express.static(publicPath));

// Store pairing codes and expire them after 1 min
let pairingCodes = {};

// Home page: show QR + pairing code
app.get('/', async (req, res) => {
  const sessionId = `user-${Date.now()}`;
  const code = await getPairingCode(sessionId);

  pairingCodes[sessionId] = {
    code,
    expires: Date.now() + 60 * 1000 // 1 minute expiry
  };

  res.send(`
    <html>
      <body style="text-align:center; padding:40px;">
        <h1>🟢 DansBot Multi-User Login</h1>
        <h3>Scan the QR Code OR use the Pairing Code below:</h3>
        <img src="/qr.png" width="300" style="border:1px solid #ccc;"><br><br>
        <p style="font-size:20px;"><b>Pairing Code:</b> ${code}</p>
        <p style="color:red;">Expires in 1 minute!</p>
      </body>
    </html>
  `);
});

// Endpoint to check if a code is valid
app.get('/validate/:sessionId/:code', (req, res) => {
  const { sessionId, code } = req.params;
  const record = pairingCodes[sessionId];

  if (!record) {
    return res.status(400).json({ valid: false, message: 'Code not found or expired.' });
  }

  if (Date.now() > record.expires) {
    delete pairingCodes[sessionId];
    return res.status(400).json({ valid: false, message: 'Code expired.' });
  }

  if (record.code === code) {
    delete pairingCodes[sessionId];
    startSession(sessionId);
    return res.json({ valid: true, message: 'Session started!' });
  } else {
    return res.status(400).json({ valid: false, message: 'Invalid code.' });
  }
});

// Health check for UptimeRobot
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`🌐 Server running at http://localhost:${PORT}`);
});