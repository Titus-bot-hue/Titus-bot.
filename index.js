import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';
import { startSession, generateLinkingCode } from './botManager.js'; // ✅ Updated import

// Emulate __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Setup
const app = express();
const PORT = process.env.PORT || 3000;
const publicPath = path.join(process.cwd(), 'public');

// Ensure public folder exists
if (!existsSync(publicPath)) mkdirSync(publicPath);

// Serve static files like qr.png
app.use(express.static(publicPath));

// Homepage - shows QR + Link Code
app.get('/', async (req, res) => {
  try {
    const linkCode = await generateLinkingCode('main'); // generate link code
    res.send(`
      <html>
        <head>
          <title>DansBot WhatsApp Connect</title>
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
        </body>
      </html>
    `);
  } catch (err) {
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