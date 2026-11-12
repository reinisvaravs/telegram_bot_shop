import { type Context, type MiddlewareFn } from "grammy";

const adminTelegramId = Number(process.env.ADMIN_TELEGRAM_ID);

if (!Number.isSafeInteger(adminTelegramId) || adminTelegramId <= 0) {
  throw new Error("ADMIN_TELEGRAM_ID must be a valid Telegram user ID");
}

export const adminOnly: MiddlewareFn<Context> = async (ctx, next) => {
  if (ctx.from?.id !== adminTelegramId) {
    if (ctx.chat) {
      await ctx.reply("This bot is currently private.");
    }

    return;
  }

  await next();
};
