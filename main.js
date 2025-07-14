import { startSession } from './botManager.js';

console.log("✅ DansDans bot started successfully!");

async function runBot() {
  console.log("🤖 Starting WhatsApp session...");

  try {
    // Start a WhatsApp session named "jawad"
    await startSession('jawad');

    // You can start more sessions like this:
    // await startSession('client1');
    // await startSession('client2');

  } catch (err) {
    console.error(`❌ Failed to start WhatsApp session: ${err.message}`);
  }
}

runBot();
