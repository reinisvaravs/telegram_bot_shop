import "dotenv/config";
import { Bot } from "grammy";

const botToken = process.env.BOT_TOKEN;

if (!botToken) {
  throw new Error("BOT_TOKEN is missing from .env");
}

const bot = new Bot(botToken);

bot.command("start", async (ctx) => {
  await ctx.reply(
    `Welcome to our shop!

Before ordering:
• Delivery is available only within our local area.
• You will need to share your address and location.
• Payment is made before the order is accepted.
• An administrator will manually verify the location and payment.

Press the button below to begin.`,
  );
});

bot.start({
  onStart: (botInfo) => {
    console.log(`Connected as @${botInfo.username}`);
  },
});
