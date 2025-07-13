import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Emulate __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Local paths
const baseDir = path.join(__dirname, 'modules');
const mainModule = 'main.js';

if (!fs.existsSync(baseDir)) {
  fs.mkdirSync(baseDir);
}

// Download and save a file
async function downloadAndSave(url, filepath) {
  try {
    const response = await axios.get(url);
    fs.writeFileSync(filepath, response.data);
    console.log(`✅ Saved ${filepath}`);
  } catch (error) {
    console.error(`❌ Failed to download ${url}`, error.message);
  }
}

(async () => {
  const filePath = path.join(baseDir, mainModule);
  const fileUrl = 'https://raw.githubusercontent.com/Dans3101/Dans-dan/main/main.js';

  await downloadAndSave(fileUrl, filePath);

  if (fs.existsSync(filePath)) {
    const moduleUrl = `file://${filePath}`;
    const mod = await import(moduleUrl);
    console.log('✅ Main module loaded');
  } else {
    console.error('❌ Main module not found.');
  }
})();
