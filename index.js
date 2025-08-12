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

// Serve QR image and other static files
app.use(express.static(publicPath));

// Main page: Show QR and Pairing Code
app.get('/', async (req, res) => {
  let code = '';
  try {
    code = await generateLinkingCode();
  } catch (err) {
    console.error('❌ Error generating pairing code:', err);
    code = 'Error generating code';
  }

  res.send(`
    <html>
      <head>
        <title>DansBot WhatsApp Login</title>
      </head>
      <body style="text-align:center; padding:40px; font-family: Arial;">
        <h1>🟢 DansBot WhatsApp Login</h1>
        <p>Scan QR Code below or use the Pairing Code:</p>
        <img src="/qr.png" width="300" style="border:1px solid #ccc;"><br><br>
        <h2 style="color:green;">Pairing Code: ${code}</h2>
        <p><small>Code expires in 1 minute</small></p>
        <hr>
        <p style="color:gray;">Keep this page open until connection is successful.</p>
      </body>
    </html>
  `);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start server + bot
app.listen(PORT, () => {
  console.log(`🌐 Server running at http://localhost:${PORT}`);
  startSession('main'); // ✅ Start WhatsApp bot session
});