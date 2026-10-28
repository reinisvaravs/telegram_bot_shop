import { Bot, InlineKeyboard } from "grammy";
import {
  addProductToOrder,
  getAvailable,
  getOrCreateDraftOrder,
  getOrderItems,
} from "./db.js";
import { escapeHtml } from "./helper.js";

const botToken = process.env.BOT_TOKEN;

if (!botToken) {
  throw new Error("BOT_TOKEN is missing from .env");
}

export const bot = new Bot(botToken);

const cartMessageIds = new Map<number, number>();
const cartFlashTimers = new Map<number, ReturnType<typeof setTimeout>>();

const welcomeKeyboard = new InlineKeyboard().text("Continue", "continue"); // Define the Continue btn

bot.command("start", async (ctx) => {
  await ctx.reply(
    `Welcome to our shop!

Before ordering:
• Delivery is available only in Jelgava and Ozolnieki.
• You will need to share your address.
• Payment is made in cash.`,
    {
      reply_markup: welcomeKeyboard, // Show the Continue button below this message
    },
  );
});

bot.callbackQuery("continue", async (ctx) => {
  try {
    await ctx.answerCallbackQuery(); // Acknowledge the button press
  } catch {
    console.warn("Ignored an expired button press");
    return;
  }

  // get available product
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

    const availableMessage = "Available:\n\n" + productLines.join("\n\n");

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
  const telegramUserId = ctx.from.id;

  // get cart
  try {
    const draftOrder = await getOrCreateDraftOrder(telegramUserId);

    // add to cart
    const productIdText = data.split(":")[1];

    if (!productIdText) {
      await ctx.reply("Invalid product.");
      return;
    }

    const productId = Number(productIdText);
    const orderId = Number(draftOrder.id);

    const cartKeyboard = new InlineKeyboard().text(
      "Order",
      `checkout:${orderId}`,
    );

    await addProductToOrder(orderId, productId);

    // reply with new cart
    const updatedCart = await getOrderItems(orderId);

    const cartLines = updatedCart
      .map((item) => {
        const name = escapeHtml(item.name);

        return `<b>${name}</b>
Quantity: ${item.quantity}
Price: €${item.line_total}`;
      })
      .join("\n\n");

    let cartTotal = 0;

    updatedCart.forEach((item) => {
      cartTotal += Number(item.line_total);
    });

    const normalHeader = "<b>🛒 Cart:</b>";
    const updatedHeader = "<b>🛒 Cart: Updated ✅</b>";
    const footer = `<b>Total: €${cartTotal.toFixed(2)}</b>`;
    const separator = "\n\n";

    const normalCartMessage =
      normalHeader + separator + cartLines + separator + footer;
    const updatedCartMessage =
      updatedHeader + separator + cartLines + separator + footer;

    const chatId = ctx.chatId;

    if (chatId === undefined) {
      return;
    }

    const existingMessageId = cartMessageIds.get(chatId);
    const existingTimer = cartFlashTimers.get(chatId);

    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    let cartMessageId: number;

    if (existingMessageId) {
      await ctx.api.editMessageText(
        chatId,
        existingMessageId,
        updatedCartMessage,
        {
          parse_mode: "HTML",
          reply_markup: cartKeyboard,
        },
      );

      cartMessageId = existingMessageId;
    } else {
      const sentMessage = await ctx.reply(updatedCartMessage, {
        parse_mode: "HTML",
        reply_markup: cartKeyboard,
      });

      cartMessageId = sentMessage.message_id;
      cartMessageIds.set(chatId, cartMessageId);
    }

    const timer = setTimeout(() => {
      void ctx.api
        .editMessageText(chatId, cartMessageId, normalCartMessage, {
          parse_mode: "HTML",
          reply_markup: cartKeyboard,
        })
        .catch((error) => {
          console.error("Failed to remove cart update indicator:", error);
        });

      cartFlashTimers.delete(chatId);
    }, 1000);

    cartFlashTimers.set(chatId, timer);
  } catch (error) {
    await ctx.reply("Something went wrong.");
    console.error(error);
  }
});
