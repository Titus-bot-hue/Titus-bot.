import fs from 'fs';
import path from 'path';
import axios from 'axios';
import http from 'http';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Emulate __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Local paths
const baseDir = path.join(__dirname, 'modules');
const mainModule = 'main.js';
const filePath = path.join(baseDir, mainModule);
const fileUrl = 'https://raw.githubusercontent.com/Dans3101/Dans-dan/main/main.js';

// Ensure modules directory exists
if (!fs.existsSync(baseDir)) {
  fs.mkdirSync(baseDir);
}

// Download and save the main module
async function downloadAndSave(url, filepath) {
  try {
    const response = await axios.get(url);
    fs.writeFileSync(filepath, response.data);
    console.log(`✅ Saved ${filepath}`);
  } catch (error) {
    console.error(`❌ Failed to download ${url}:`, error.message);
  }
}

// Load the module and start the bot
(async () => {
  await downloadAndSave(fileUrl, filePath);

  if (fs.existsSync(filePath)) {
    const moduleUrl = `file://${filePath}`;
    try {
      const mod = await import(moduleUrl);
      console.log('✅ Main module loaded');
    } catch (err) {
      console.error('❌ Failed to import main module:', err.message);
    }
  } else {
    console.error('❌ Main module not found.');
  }
})();

// Minimal server to keep Render alive
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('DansDans bot is running');
}).listen(process.env.PORT || 3000, () => {
  console.log(`🌐 Server listening on port ${process.env.PORT || 3000}`);
});
