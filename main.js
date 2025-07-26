import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import QRCode from 'qrcode';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import net from 'net';

const app = express();
const DEFAULT_PORT = process.env.PORT || 10000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create "public" folder if it doesn't exist
const publicFolder = path.join(process.cwd(), 'public');
if (!existsSync(publicFolder)) mkdirSync(publicFolder);

// Generate the QR code and save as qr.png
const generateQRCode = async () => {
  const qrText = 'https://wa.me/254700000000'; // Change this to your WhatsApp bot link
  try {
    const qrDataUrl = await QRCode.toDataURL(qrText);
    const base64Data = qrDataUrl.replace(/^data:image\/png;base64,/, '');
    writeFileSync(path.join(publicFolder, 'qr.png'), base64Data, 'base64');
    console.log('✅ QR Code saved to public/qr.png');
  } catch (err) {
    console.error('❌ Failed to generate QR code:', err);
  }
};

// Serve the public folder
app.use(express.static(publicFolder));

// Route to display QR
app.get('/', (req, res) => {
  res.send(`
    <html>
      <body style="text-align:center;padding:40px;">
        <h1>🟢 DansBot QR Code</h1>
        <p>Scan this QR Code to activate your WhatsApp bot</p>
        <img src="/qr.png" width="300" style="border:1px solid #ccc;">
      </body>
    </html>
  `);
});

// Find an available port
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

// Start server and generate QR
findAvailablePort(Number(DEFAULT_PORT))
  .then(async port => {
    await generateQRCode(); // Generate QR before server starts
    app.listen(port, () => {
      console.log(`🌐 Server running at http://localhost:${port}`);
    });
  })
  .catch(err => {
    console.error(err.message);
    process.exit(1);
  });