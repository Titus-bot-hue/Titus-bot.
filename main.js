import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { startSession } from '../botManager.js';

const app = express();
const PORT = process.env.PORT || 10001; // Changed fallback port to avoid 3000 conflicts

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
app.listen(PORT, () => {
  console.log(`🌐 Server is running on port ${PORT}`);
  startSession('main');
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use. Try a different one.`);
    process.exit(1);
  } else {
    console.error(`❌ Server error:`, err);
  }
});