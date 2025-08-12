import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';
import { startSession, generateLinkingCode } from './botManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const publicPath = path.join(process.cwd(), 'public');

if (!existsSync(publicPath)) mkdirSync(publicPath);

app.use(express.static(publicPath));

// Homepage with QR and Pair Code
app.get('/', (req, res) => {
  res.send(`
    <html>
      <body style="text-align:center; padding:40px; font-family:sans-serif;">
        <h1>🟢 DansBot WhatsApp Connection</h1>
        <h2>Method 1: Scan QR Code</h2>
        <p>Open WhatsApp > Linked Devices > Link a Device</p>
        <img src="/qr.png" width="300" style="border:1px solid #ccc;"><br><br>
        
        <h2>Method 2: Use Pairing Code</h2>
        <button style="padding:10px 20px; font-size:16px;" onclick="getPairCode()">Get Pairing Code</button>
        <p id="pairCode" style="font-size:20px; color:green; font-weight:bold;"></p>
        <p id="expiryNote" style="color:red; font-size:14px;"></p>
        
        <script>
          async function getPairCode() {
            document.getElementById('pairCode').innerText = '⏳ Generating...';
            document.getElementById('expiryNote').innerText = '';
            try {
              const res = await fetch('/paircode');
              const data = await res.json();
              if (data.code) {
                document.getElementById('pairCode').innerText = '🔑 ' + data.code;
                document.getElementById('expiryNote').innerText = '⚠️ Code expires in 1 minute!';
                setTimeout(() => {
                  document.getElementById('pairCode').innerText = '⛔ Code expired';
                  document.getElementById('expiryNote').innerText = '';
                }, 60000);
              } else {
                document.getElementById('pairCode').innerText = '❌ Failed to get code.';
              }
            } catch (err) {
              document.getElementById('pairCode').innerText = '❌ Error fetching code.';
            }
          }
        </script>
      </body>
    </html>
  `);
});

// API to generate pair code
app.get('/paircode', async (req, res) => {
  try {
    const code = await generateLinkingCode();
    setTimeout(() => {
      console.log(`⛔ Pairing code expired: ${code}`);
    }, 60000); // expire in 1 minute
    res.json({ code });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate code' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`🌐 Server running at http://localhost:${PORT}`);
  startSession('main');
});