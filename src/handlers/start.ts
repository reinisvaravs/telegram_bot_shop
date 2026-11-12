import { type Bot, InlineKeyboard } from "grammy";
import { resetCartMessageTracking } from "../views/cart-view.js";

const welcomeKeyboard = new InlineKeyboard().text("Continue", "continue");

export function registerStartHandler(bot: Bot) {
  bot.command("start", async (ctx) => {
    resetCartMessageTracking(ctx.chat.id);

    await ctx.reply(
      `Welcome to our shop!

Before ordering:
• Delivery is available only in Jelgava and Ozolnieki.
• You will need to share your address.
• Payment is made in cash.`,
      {
        reply_markup: welcomeKeyboard,
      },
    );
  });
}
