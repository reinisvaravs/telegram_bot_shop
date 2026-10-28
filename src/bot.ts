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

type CartItem = {
  name: string;
  quantity: number;
  line_total: string;
};

function resetCartMessageTracking(chatId: number) {
  const existingTimer = cartFlashTimers.get(chatId);

  if (existingTimer) {
    clearTimeout(existingTimer);
    cartFlashTimers.delete(chatId);
  }

  cartMessageIds.delete(chatId);
}

function buildCartMessage(cartItems: CartItem[], showUpdated: boolean) {
  const cartLines = cartItems
    .map((item) => {
      const name = escapeHtml(String(item.name));

      return `<b>${name}</b>
Quantity: ${item.quantity}
Price: €${item.line_total}`;
    })
    .join("\n\n");

  let cartTotal = 0;

  cartItems.forEach((item) => {
    cartTotal += Number(item.line_total);
  });

  const header = showUpdated
    ? "<b>🛒 Cart: Updated ✅</b>"
    : "<b>🛒 Cart:</b>";
  const footer = `<b>Total: €${cartTotal.toFixed(2)}</b>`;

  return header + "\n\n" + cartLines + "\n\n" + footer;
}

function buildCartKeyboard(orderId: number) {
  return new InlineKeyboard().text("Order", `checkout:${orderId}`);
}

const welcomeKeyboard = new InlineKeyboard().text("Continue", "continue"); // Define the Continue btn

bot.command("start", async (ctx) => {
  resetCartMessageTracking(ctx.chat.id);

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

    const chatId = ctx.chat.id;
    const cartMessage = buildCartMessage(cartItems, false);
    const cartKeyboard = buildCartKeyboard(orderId);

    resetCartMessageTracking(chatId);

    const sentMessage = await ctx.reply(cartMessage, {
      parse_mode: "HTML",
      reply_markup: cartKeyboard,
    });

    cartMessageIds.set(chatId, sentMessage.message_id);
  } catch (error) {
    await ctx.reply("Something went wrong.");
    console.error(error);
  }
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

    const availableMessage = "<b>Available:</b>\n\n" + productLines.join("\n\n");

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
      const chatId = ctx.chatId;

      if (chatId === undefined) {
        return;
      }

      const cartMessage = buildCartMessage(cartItems, false);
      const cartKeyboard = buildCartKeyboard(orderId);

      resetCartMessageTracking(chatId);

      const sentMessage = await ctx.reply(cartMessage, {
        parse_mode: "HTML",
        reply_markup: cartKeyboard,
      });

      cartMessageIds.set(chatId, sentMessage.message_id);
    }
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

    const cartKeyboard = buildCartKeyboard(orderId);

    await addProductToOrder(orderId, productId);

    // reply with new cart
    const updatedCart = await getOrderItems(orderId);

    const normalCartMessage = buildCartMessage(updatedCart, false);
    const updatedCartMessage = buildCartMessage(updatedCart, true);

    const chatId = ctx.chatId;

    if (chatId === undefined) {
      return;
    }

    let cartMessageId = cartMessageIds.get(chatId);
    const existingTimer = cartFlashTimers.get(chatId);

    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    if (cartMessageId) {
      try {
        await ctx.api.editMessageText(
          chatId,
          cartMessageId,
          updatedCartMessage,
          {
            parse_mode: "HTML",
            reply_markup: cartKeyboard,
          },
        );
      } catch {
        // The previously saved cart message may have been deleted.
        cartMessageIds.delete(chatId);
        cartMessageId = undefined;
      }
    }

    if (!cartMessageId) {
      const sentMessage = await ctx.reply(updatedCartMessage, {
        parse_mode: "HTML",
        reply_markup: cartKeyboard,
      });

      cartMessageId = sentMessage.message_id;
      cartMessageIds.set(chatId, cartMessageId);
    }

    const activeCartMessageId = cartMessageId;

    const timer = setTimeout(() => {
      void ctx.api
        .editMessageText(chatId, activeCartMessageId, normalCartMessage, {
          parse_mode: "HTML",
          reply_markup: cartKeyboard,
        })
        .catch((error) => {
          if (cartMessageIds.get(chatId) === activeCartMessageId) {
            cartMessageIds.delete(chatId);
          }

          console.error("Could not edit cart message:", error);
        });

      cartFlashTimers.delete(chatId);
    }, 1000);

    cartFlashTimers.set(chatId, timer);
  } catch (error) {
    await ctx.reply("Something went wrong.");
    console.error(error);
  }
});
