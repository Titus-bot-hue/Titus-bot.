import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';
import { startSession } from './botManager.js'; // ✅ Make sure path is correct

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

// Show QR code in browser
app.get('/', (req, res) => {
  res.send(`
    <html>
      <body style="text-align:center; padding:40px;">
        <h1>🟢 DansBot WhatsApp QR</h1>
        <p>Scan this QR Code using WhatsApp Linked Devices</p>
        <img src="/qr.png" width="300" style="border:1px solid #ccc;">
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
  startSession('main'); // ✅ Connect to WhatsApp & generate QR
});