import { startSession } from '../botManager.js';

console.log("✅ DansDans bot started successfully!");

async function runBot() {
  console.log("🤖 Starting main WhatsApp session...");

  try {
    await startSession('main'); // This connects YOUR WhatsApp account
  } catch (err) {
    console.error(`❌ Failed to start main session: ${err.message}`);
  }
}

runBot();
