import "dotenv/config";
import { bot } from "./bot.js";
import { initDB } from "./db.js";

// init db tables
try {
  await initDB();
} catch (error) {
  throw new Error("Failed to connect to database");
}

bot.start({
  onStart: (botInfo) => {
    console.log(`Connected as @${botInfo.username}`);
  },
});
