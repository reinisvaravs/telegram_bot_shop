import { type Context, InlineKeyboard } from "grammy";
import { escapeHtml } from "../helper.js";

export type CartItem = {
  name: string;
  quantity: number;
  line_total: string;
};

const cartMessageIds = new Map<number, number>();
const cartFlashTimers = new Map<number, ReturnType<typeof setTimeout>>();

export function resetCartMessageTracking(chatId: number) {
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
  return new InlineKeyboard()
    .text("Checkout", `checkout:${orderId}`)
    .text("Discard", `discard:${orderId}`);
}

export async function sendFreshCartMessage(
  ctx: Context,
  orderId: number,
  cartItems: CartItem[],
) {
  const chatId = ctx.chatId;

  if (chatId === undefined) {
    return;
  }

  const cartMessage = buildCartMessage(cartItems, false);
  const cartKeyboard = buildCartKeyboard(orderId);

  resetCartMessageTracking(chatId);

  const sentMessage = await ctx.api.sendMessage(chatId, cartMessage, {
    parse_mode: "HTML",
    reply_markup: cartKeyboard,
  });

  cartMessageIds.set(chatId, sentMessage.message_id);
}

export async function updateCartMessage(
  ctx: Context,
  orderId: number,
  cartItems: CartItem[],
) {
  const chatId = ctx.chatId;

  if (chatId === undefined) {
    return;
  }

  const cartKeyboard = buildCartKeyboard(orderId);
  const normalCartMessage = buildCartMessage(cartItems, false);
  const updatedCartMessage = buildCartMessage(cartItems, true);
  const existingTimer = cartFlashTimers.get(chatId);

  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  let cartMessageId = cartMessageIds.get(chatId);

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
      cartMessageIds.delete(chatId);
      cartMessageId = undefined;
    }
  }

  if (!cartMessageId) {
    const sentMessage = await ctx.api.sendMessage(chatId, updatedCartMessage, {
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
}
