import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { startSession } from '../botManager.js'; // ✅ Fixed import path

const app = express();
const port = process.env.PORT || 10000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve the folder where QR code is stored
app.use(express.static(path.join(process.cwd(), 'public')));

// Route to display QR code
app.get('/', (req, res) => {
  res.send(`
    <html>
      <body style="text-align:center;padding:40px;">
        <h1>📲 DansBot WhatsApp QR Code</h1>
        <p>Scan this QR Code using your WhatsApp Linked Devices</p>
        <img src="/qr.png" width="300" style="border:1px solid #ccc;">
      </body>
    </html>
  `);
});

// Start server and bot session
app.listen(port, () => {
  console.log(`🌐 Web server running at http://localhost:${port}`);
  startSession('main'); // 🟢 Launch WhatsApp bot session
});