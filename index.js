import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { startSession, generateLinkingCode } from './botManager.js'; // ✅ Make sure generateLinkingCode is exported

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

// Homepage with both login methods
app.get('/', (req, res) => {
  res.send(`
    <html>
      <body style="text-align:center; padding:40px; font-family:sans-serif;">
        <h1>🟢 DansBot Connection</h1>
        <p><strong>Option 1:</strong> Scan this QR Code using WhatsApp Linked Devices</p>
        <img src="/qr.png" width="300" style="border:1px solid #ccc;"><br><br>
        <p><strong>Option 2:</strong> Link with Code</p>
        <a href="/link-code" style="display:inline-block; padding:10px 20px; background:#4CAF50; color:white; text-decoration:none; border-radius:5px;">Get Linking Code</a>
      </body>
    </html>
  `);
});

// Generate linking code
app.get('/link-code', async (req, res) => {
  try {
    const code = await generateLinkingCode('main'); // sessionId 'main'
    res.send(`
      <html>
        <body style="text-align:center; padding:40px; font-family:sans-serif;">
          <h1>🔗 Your Linking Code</h1>
          <p>Enter this code in WhatsApp: <strong style="font-size:2em;">${code}</strong></p>
          <p><a href="/">⬅ Back</a></p>
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send(`<p>❌ Failed to generate code: ${err.message}</p>`);
  }
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