import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { startSession } from '../botManager.js';

const app = express();
const port = 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve QR code from root
app.use('/qr.png', express.static(path.join(__dirname, '../qr.png')));

app.get('/', (req, res) => {
  res.send(`<h1>DansBot QR Code</h1><img src="/qr.png" style="width:300px;">`);
});

app.listen(port, () => {
  console.log(`🌐 Server listening on port ${port}`);
  startSession('main');
});
