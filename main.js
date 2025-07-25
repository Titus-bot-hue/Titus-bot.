import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { startSession } from '../botManager.js';
import net from 'net';
import { existsSync, mkdirSync } from 'fs';

const app = express();
const DEFAULT_PORT = process.env.PORT || 10000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure public folder exists for serving QR code
const publicFolder = path.join(process.cwd(), 'public');
if (!existsSync(publicFolder)) mkdirSync(publicFolder);

// Serve static files from public folder
app.use(express.static(publicFolder));

// Home route to display QR code
app.get('/', (req, res) => {
  res.send(`
    <h1>🟢 DansBot QR Code</h1>
    <p>Scan this with WhatsApp Business to activate your bot</p>
    <img src="/qr.png" style="width:300px; border:1px solid #ccc;">
  `);
});

// Check if port is free, or find a new one
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

// Start server with available port
findAvailablePort(Number(DEFAULT_PORT))
  .then(port => {
    app.listen(port, () => {
      console.log(`🌐 Server is running on port ${port}`);
      startSession('main'); // This will now save QR to /public/qr.png
    });
  })
  .catch(err => {
    console.error(err.message);
    process.exit(1);
  });