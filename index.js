import fs from 'fs';
import path from 'path';
import axios from 'axios';
import express from 'express';
import dotenv from 'dotenv';
import pino from 'pino';
import QRCode from 'qrcode';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { exec } from 'child_process';

// Load .env
dotenv.config();

// Logger
const logger = pino();

// Emulate __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Setup
const baseDir = join(__dirname, 'modules');
const mainModule = 'main.js';
const filePath = join(baseDir, mainModule);
const fileUrl = process.env.MAIN_MODULE_URL || 'https://raw.githubusercontent.com/Dans3101/Dans-dan/main/main.js';
const PORT = process.env.PORT || 3000;

// Ensure /modules folder exists
if (!fs.existsSync(baseDir)) {
  fs.mkdirSync(baseDir);
  logger.info(`📁 Created directory: ${baseDir}`);
}

// Download and save main module
async function downloadAndSave(url, filepath) {
  const res = await axios.get(url, { responseType: 'text' });
  fs.writeFileSync(filepath, res.data);
  logger.info(`✅ Saved ${filepath}`);
}

// Retry wrapper
async function retry(fn, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      logger.warn(`🔁 Retry ${i + 1}/${retries} failed: ${err.message}`);
      if (i === retries - 1) throw err;
    }
  }
}

// Run main.js
function runMainModule(filepath) {
  exec(`node ${filepath}`, (error, stdout, stderr) => {
    if (error) {
      logger.error(`❌ main.js error: ${error.message}`);
      return;
    }
    if (stderr) logger.warn(`⚠️ stderr: ${stderr}`);
    logger.info(`✅ main.js output:\n${stdout}`);
  });
}

// Generate QR and save to /public
async function generateQRCode() {
  const publicPath = path.join(process.cwd(), 'public');
  if (!fs.existsSync(publicPath)) fs.mkdirSync(publicPath);

  const qrText = 'https://wa.me/254700000000'; // Replace with your WhatsApp link
  const qrDataUrl = await QRCode.toDataURL(qrText);
  const base64 = qrDataUrl.replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync(path.join(publicPath, 'qr.png'), base64, 'base64');
  logger.info('✅ QR code saved to /public/qr.png');
}

// Start everything
(async () => {
  try {
    await retry(() => downloadAndSave(fileUrl, filePath));
    if (fs.existsSync(filePath)) runMainModule(filePath);
    await generateQRCode();
  } catch (err) {
    logger.error(`🚨 Fatal error: ${err.message}`);
  }
})();

// Start Express server
const app = express();
app.use(express.static(path.join(process.cwd(), 'public')));

// Show QR code at home route
app.get('/', (req, res) => {
  res.send(`
    <html>
      <body style="text-align:center; padding:40px;">
        <h1>🟢 DansBot QR Code</h1>
        <p>Scan this QR Code to activate your WhatsApp bot</p>
        <img src="/qr.png" width="300" style="border:1px solid #ccc;">
      </body>
    </html>
  `);
});

// Health check route
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start listening
app.listen(PORT, () => {
  logger.info(`🌐 Server running on port ${PORT}`);
});