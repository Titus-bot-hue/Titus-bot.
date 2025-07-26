import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';
import net from 'net';
import { startSession } from './botManager.js';

const app = express();
const DEFAULT_PORT = process.env.PORT || 10000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create public folder if missing
const publicFolder = path.join(process.cwd(), 'public');
if (!existsSync(publicFolder)) mkdirSync(publicFolder);

// Serve the QR code image
app.use(express.static(publicFolder));

// Serve HTML with QR code
app.get('/', (req, res) => {
  res.send(`
    <html>
      <body style="text-align:center;padding:40px;">
        <h1>🟢 DansBot QR Code</h1>
        <p>Scan this QR Code using WhatsApp (Linked Devices)</p>
        <img src="/qr.png" width="300" style="border:1px solid #ccc;">
      </body>
    </html>
  `);
});

// Start the WhatsApp session and web server
function findAvailablePort(startPort, maxAttempts = 10) {
  return new Promise((resolve, reject) => {
    let port = startPort;
    let attempts = 0;

    const tryPort = () => {
      const tester = net.createServer()
        .once('error', () => {
          attempts++;
          port++;
          if (attempts >= maxAttempts) {
            reject(new Error('❌ No available ports found.'));
          } else {
            tryPort();
          }
        })
        .once('listening', () => {
          tester.close();
          resolve(port);
        })
        .listen(port);
    };

    tryPort();
  });
}

// Start everything
findAvailablePort(Number(DEFAULT_PORT))
  .then(async port => {
    // Start Baileys bot session (will save QR to public/qr.png)
    await startSession('main');

    app.listen(port, () => {
      console.log(`🌐 Server running at http://localhost:${port}`);
    });
  })
  .catch(err => {
    console.error(err.message);
    process.exit(1);
  });