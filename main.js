import { startSession } from './botManager.js';

console.log("✅ DansDans bot started successfully!");

async function runBot() {
  console.log("🤖 Starting WhatsApp bot...");

  try {
    await startSession('main'); // This is your main bot session
  } catch (err) {
    console.error(`❌ Failed to start bot: ${err.message}`);
  }
}

runBot();
