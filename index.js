import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';
import { startSession, generateLinkingCode } from './botManager.js';

// Emulate __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const publicPath = path.join(process.cwd(), 'public');

// Ensure public folder exists
if (!existsSync(publicPath)) mkdirSync(publicPath);

// Serve static files like qr.png
app.use(express.static(publicPath));

// Homepage - QR + Auto-Refreshing Link Code
app.get('/', async (req, res) => {
  try {
    // Always generate a fresh code when someone opens the page
    const linkCode = await generateLinkingCode('main');

    res.send(`
      <html>
        <head>
          <title>DansBot WhatsApp Connect</title>
          <meta http-equiv="refresh" content="30"> <!-- Auto-refresh page every 30 seconds -->
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 30px; }
            img { border: 1px solid #ccc; margin-top: 10px; }
            .code-box { font-size: 20px; background: #f1f1f1; padding: 10px; display: inline-block; margin-top: 10px; }
          </style>
        </head>
        <body>
          <h1>🟢 DansBot WhatsApp Connection</h1>
          <p>Scan this QR Code using WhatsApp Linked Devices:</p>
          <img src="/qr.png" width="300">
          
          <h2>OR</h2>
          <p>Enter this Linking Code in WhatsApp Linked Devices:</p>
          <div class="code-box">${linkCode}</div>

          <p style="margin-top: 20px; color: gray; font-size: 14px;">
            Page refreshes every 30 seconds to keep codes valid.
          </p>
        </body>
      </html>
    `);
  } catch (err) {
    console.error('❌ Error generating link code:', err);
    res.status(500).send("❌ Failed to generate link code. Check server logs.");
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start server and WhatsApp session
app.listen(PORT, () => {
  console.log(`🌐 Server running at http://localhost:${PORT}`);
  startSession('main');
});