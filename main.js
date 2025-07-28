import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';
import { startSession } from '../botManager.js'; // ✅ Make sure path is correct

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const publicFolder = path.join(process.cwd(), 'public');
if (!existsSync(publicFolder)) mkdirSync(publicFolder);

// Serve static files like qr.png
app.use(express.static(publicFolder));

// Web page to show QR
app.get('/', (req, res) => {
  res.send(`
    <html>
      <body style="text-align:center;padding:40px;">
        <h1>🟢 DansBot QR Code</h1>
        <p>Scan this QR Code to activate your WhatsApp bot</p>
        <img src="/qr.png" width="300" style="border:1px solid #ccc;">
      </body>
    </html>
  `);
});

// Start session without opening another port (Render already does this)
startSession('main'); // ✅ Will handle QR and WhatsApp logic

// Start Express only once
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🌐 QR server running on http://localhost:${PORT}`);
});