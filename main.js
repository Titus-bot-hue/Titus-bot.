import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { startSession } from '../botManager.js';

const app = express();
const port = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve QR code from root
app.use('/qr.png', express.static(path.join(__dirname, '../qr.png')));

// Home route to display QR code
app.get('/', (req, res) => {
  res.send(`
    <h1>🟢 DansBot QR Code</h1>
    <p>Scan this with WhatsApp Business to activate your bot</p>
    <img src="/qr.png" style="width:300px; border:1px solid #ccc;">
  `);
});

// Start server and WhatsApp session
app.listen(port, () => {
  console.log(`🌐 Server is running on port ${port}`);
  startSession('main');
});