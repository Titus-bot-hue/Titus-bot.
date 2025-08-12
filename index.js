import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';
import { startSession, generateLinkingCode } from './botManager.js';

// Emulate __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Setup
const app = express();
const PORT = process.env.PORT || 3000;
const publicPath = path.join(process.cwd(), 'public');

// Ensure public folder exists
if (!existsSync(publicPath)) mkdirSync(publicPath);

// Serve QR and static files
app.use(express.static(publicPath));

// Login page for any user
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>DansBot Multi-Login</title></head>
      <body style="text-align:center; font-family: Arial;">
        <h1>🟢 DansBot Multi-Login</h1>
        <form method="get" action="/login">
          <input type="text" name="user" placeholder="Enter your username" required
          style="padding:8px; width:200px;">
          <button type="submit" style="padding:8px 16px;">Login</button>
        </form>
      </body>
    </html>
  `);
});

// Generate QR + Pairing Code for a specific user
app.get('/login', async (req, res) => {
  const user = req.query.user;
  if (!user) {
    return res.redirect('/');
  }

  let code = '';
  try {
    code = await generateLinkingCode(user);
  } catch (err) {
    console.error(`❌ Error generating pairing code for ${user}:`, err);
    code = 'Error generating code';
  }

  res.send(`
    <html>
      <head><title>DansBot Login - ${user}</title></head>
      <body style="text-align:center; font-family: Arial;">
        <h1>Login for: ${user}</h1>
        <p>Scan this QR Code or enter the pairing code below in WhatsApp:</p>
        <img src="/${user}-qr.png" width="300" style="border:1px solid #ccc;"><br><br>
        <h2 style="color:green;">Pairing Code: ${code}</h2>
        <p><small>Code expires in 1 minute</small></p>
        <hr>
        <a href="/">⬅ Back</a>
      </body>
    </html>
  `);

  // Start WhatsApp session for this user
  startSession(user);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🌐 Server running at http://localhost:${PORT}`);
});