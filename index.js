import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { startSession, requestPairingCodeForNumber } from './botManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const publicPath = path.join(process.cwd(), 'public');

// Middleware for parsing form data
app.use(express.urlencoded({ extended: true }));

// Ensure public folder exists
if (!existsSync(publicPath)) mkdirSync(publicPath);

// Serve static files from public
app.use(express.static(publicPath));

// Homepage → ask for number
app.get('/', (req, res) => {
  let pairingCode = '';
  const pairingFile = path.join(publicPath, 'pairing.txt');
  if (existsSync(pairingFile)) {
    pairingCode = readFileSync(pairingFile, 'utf8').trim();
  }

  res.send(`
    <html>
      <body style="text-align:center; padding:40px; font-family: Arial;">
        <h1>🟢 DansBot Connection</h1>
        <form action="/generate-code" method="post" style="margin-bottom:30px;">
          <input name="number" type="text" placeholder="Enter WhatsApp number (e.g. 2547...)" required
                 style="padding:10px; width:250px; font-size:16px;">
          <button type="submit" style="padding:10px 20px; font-size:16px;">Generate Code</button>
        </form>

        ${pairingCode ? `
          <h2>🔢 Pairing Code</h2>
          <p style="font-size:24px; font-weight:bold; color:green;">${pairingCode}</p>
        ` : '<p>Enter your number to generate a code.</p>'}
      </body>
    </html>
  `);
});

// Handle pairing code generation
app.post('/generate-code', async (req, res) => {
  const number = req.body.number;
  if (!number) return res.send('⚠️ Please enter a number.');

  const code = await requestPairingCodeForNumber(number);
  writeFileSync(path.join(publicPath, 'pairing.txt'), code);

  res.redirect('/');
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`🌐 Server running at http://localhost:${PORT}`);
  startSession('main');
});