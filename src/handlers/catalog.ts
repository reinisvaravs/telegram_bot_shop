import { type Bot, InlineKeyboard } from "grammy";
import {
  getAvailable,
  getOrCreateDraftOrder,
  getOrderItems,
} from "../db.js";
import { escapeHtml } from "../helper.js";
import { sendFreshCartMessage } from "../views/cart-view.js";

export function registerCatalogHandlers(bot: Bot) {
  bot.callbackQuery("continue", async (ctx) => {
    try {
      await ctx.answerCallbackQuery();
    } catch {
      console.warn("Ignored an expired button press");
      return;
    }

    try {
      const available = await getAvailable();

      if (available.length === 0) {
        await ctx.reply("Everything is sold out.");
        return;
      }

      const productLines = available.map((product) => {
        const name = escapeHtml(String(product.name));

        return `<b>${name}</b>
Stock: ${product.stock_quantity}
Price: €${product.price}`;
      });

      const availableMessage =
        "<b>Available:</b>\n\n" + productLines.join("\n\n");
      const productKeyboard = new InlineKeyboard();

      for (const product of available) {
        productKeyboard
          .text(`+ ${product.name}`, `add_to_cart:${product.id}`)
          .row();
      }

      await ctx.reply(availableMessage, {
        reply_markup: productKeyboard,
        parse_mode: "HTML",
      });

      const draftOrder = await getOrCreateDraftOrder(ctx.from.id);
      const orderId = Number(draftOrder.id);
      const cartItems = await getOrderItems(orderId);

      if (cartItems.length > 0) {
        await sendFreshCartMessage(ctx, orderId, cartItems);
      }
    } catch (error) {
      await ctx.reply("Something went wrong.");
      console.error(error);
    }
  });
}
