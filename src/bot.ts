import { Bot } from "grammy";
import { registerCartHandlers } from "./handlers/cart.js";
import { registerCatalogHandlers } from "./handlers/catalog.js";
import { registerStartHandler } from "./handlers/start.js";
import { adminOnly } from "./middleware/admin-only.js";

const botToken = process.env.BOT_TOKEN;

if (!botToken) {
  throw new Error("BOT_TOKEN is missing from .env");
}

export const bot = new Bot(botToken);

bot.use(adminOnly);

registerStartHandler(bot);
registerCatalogHandlers(bot);
registerCartHandlers(bot);
