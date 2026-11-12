import { type Bot } from "grammy";
import {
  addProductToOrder,
  discardDraftOrder,
  getOrCreateDraftOrder,
  getOrderItems,
  InventoryStockError,
} from "../db.js";
import {
  resetCartMessageTracking,
  sendFreshCartMessage,
  updateCartMessage,
} from "../views/cart-view.js";

export function registerCartHandlers(bot: Bot) {
  bot.on("callback_query:data", async (ctx, next) => {
    if (!ctx.callbackQuery.data.startsWith("checkout:")) {
      await next();
      return;
    }

    await ctx.answerCallbackQuery();
    await ctx.reply("Checkout is not supported yet.");
  });

  bot.on("callback_query:data", async (ctx, next) => {
    const data = ctx.callbackQuery.data;

    if (!data.startsWith("discard:")) {
      await next();
      return;
    }

    try {
      await ctx.answerCallbackQuery();
    } catch {
      console.warn("Ignored an expired button press");
      return;
    }

    const orderId = Number(data.split(":")[1]);

    if (!Number.isSafeInteger(orderId)) {
      await ctx.reply("Invalid order.");
      return;
    }

    try {
      const deletedOrder = await discardDraftOrder(orderId, ctx.from.id);

      if (!deletedOrder) {
        await ctx.reply("This cart could not be discarded.");
        return;
      }

      resetCartMessageTracking(ctx.chat?.id ?? ctx.from.id);

      await ctx.editMessageText(
        "<b>🛒 Cart:</b>\n\nYour cart is empty.",
        { parse_mode: "HTML" },
      );
    } catch (error) {
      await ctx.reply("Something went wrong.");
      console.error(error);
    }
  });

  bot.command("cart", async (ctx) => {
    try {
      if (!ctx.from) {
        return;
      }

      const draftOrder = await getOrCreateDraftOrder(ctx.from.id);
      const orderId = Number(draftOrder.id);
      const cartItems = await getOrderItems(orderId);

      if (cartItems.length === 0) {
        await ctx.reply("Your cart is empty.");
        return;
      }

      await sendFreshCartMessage(ctx, orderId, cartItems);
    } catch (error) {
      await ctx.reply("Something went wrong.");
      console.error(error);
    }
  });

  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;

    if (!data.startsWith("add_to_cart:")) {
      return;
    }

    try {
      await ctx.answerCallbackQuery();
    } catch {
      console.warn("Ignored an expired button press");
      return;
    }

    try {
      const productIdText = data.split(":")[1];

      if (!productIdText) {
        await ctx.reply("Invalid product.");
        return;
      }

      const draftOrder = await getOrCreateDraftOrder(ctx.from.id);
      const productId = Number(productIdText);
      const orderId = Number(draftOrder.id);

      if (!Number.isSafeInteger(productId)) {
        await ctx.reply("Invalid product.");
        return;
      }

      await addProductToOrder(orderId, productId);

      const updatedCart = await getOrderItems(orderId);

      await updateCartMessage(ctx, orderId, updatedCart);
    } catch (error) {
      if (error instanceof InventoryStockError) {
        await ctx.reply(error.message);
        return;
      }

      await ctx.reply("Something went wrong.");
      console.error(error);
    }
  });
}
