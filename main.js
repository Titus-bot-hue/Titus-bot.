import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';
import { startSession } from '../botManager.js';

// Resolve directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Create /public folder if missing
const publicFolder = path.join(process.cwd(), 'public');
if (!existsSync(publicFolder)) mkdirSync(publicFolder);

// Serve static files (like qr.png)
app.use(express.static(publicFolder));

// Serve the QR display page
app.get('/', (req, res) => {
  const qrPath = path.join(publicFolder, 'qr.png');
  const qrExists = existsSync(qrPath);

  res.send(`
    <html>
      <head>
        <title>TITUS-BOT QR Code</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
      </head>
      <body style="text-align:center; padding:40px; font-family:sans-serif; background-color:#f9f9f9;">
        <h1 style="color:#0a84ff;">🟢 TITUS BOT OT QR Code</h1>
        <p>${qrExists
          ? 'Scan this QR Code to link your WhatsApp to TITUS-BOT Quantum Edition.'
          : 'QR code not yet generated. Please wait...'}</p>
        ${
          qrExists
            ? '<img src="/qr.png" width="300" style="border:1px solid #ccc; border-radius:10px;">'
            : '<p>⏳ Waiting for QR code...</p>'
        }
      </body>
    </html>
  `);
});

// Start WhatsApp session
startSession('main');

// Start Express server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🌐 TITUS-BOT QR server running at http://localhost:${PORT}`);
});
