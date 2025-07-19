import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { startSession } from '../botManager.js'; // FIXED path

const app = express();
const port = 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve QR image
app.use('/qr.png', express.static(path.join(__dirname, '../qr.png'))); // FIXED path

app.get('/', (req, res) => {
  res.send(`<h1>DansBot QR Code</h1><img src="/qr.png" style="width:300px;">`);
});

app.listen(port, () => {
  console.log(`🌐 Web server running at http://localhost:${port}`);
  startSession('main');
});
