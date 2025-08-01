import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';
import { startSession } from '../botManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const publicFolder = path.join(process.cwd(), 'public');
if (!existsSync(publicFolder)) mkdirSync(publicFolder);

// Serve static files like qr.png
app.use(express.static(publicFolder));

// Web page to show QR
app.get('/', (req, res) => {
  const qrPath = path.join(publicFolder, 'qr.png');
  const qrExists = existsSync(qrPath);

  res.send(`
    <html>
      <body style="text-align:center;padding:40px;">
        <h1>🟢 DansBot QR Code</h1>
        <p>${qrExists ? 'Scan this QR Code to activate your WhatsApp bot' : 'QR code not yet generated. Please wait...'}</p>
        ${qrExists ? '<img src="/qr.png" width="300" style="border:1px solid #ccc;">' : '<p>⏳ Waiting for QR code...</p>'}
      </body>
    </html>
  `);
});

// Start WhatsApp session
startSession('main');

// Start Express server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🌐 QR server running on http://localhost:${PORT}`);
});