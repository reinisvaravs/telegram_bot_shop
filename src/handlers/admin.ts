import { type Bot, InlineKeyboard } from "grammy";
import { createInventoryProduct, getInventory } from "../db.js";
import { escapeHtml } from "../helper.js";

const adminKeyboard = new InlineKeyboard()
  .text("View products", "admin:view_products")
  .row()
  .text("Add product", "admin:add_product");

type AddProductDraft =
  | { step: "name" }
  | { step: "category"; name: string }
  | { step: "price"; name: string; category: string | null }
  | {
      step: "stock";
      name: string;
      category: string | null;
      price: string;
    };

const addProductDrafts = new Map<number, AddProductDraft>();

export function registerAdminHandlers(bot: Bot) {
  bot.command("admin", async (ctx) => {
    await ctx.reply("<b>Inventory management</b>", {
      parse_mode: "HTML",
      reply_markup: adminKeyboard,
    });
  });

  bot.command("cancel", async (ctx) => {
    if (!ctx.from) {
      return;
    }

    if (!addProductDrafts.delete(ctx.from.id)) {
      await ctx.reply("There is nothing to cancel.");
      return;
    }

    await ctx.reply("Product creation cancelled.", {
      reply_markup: adminKeyboard,
    });
  });

  bot.callbackQuery("admin:view_products", async (ctx) => {
    try {
      await ctx.answerCallbackQuery();
    } catch {
      console.warn("Ignored an expired button press");
      return;
    }

    try {
      const products = await getInventory();

      if (products.length === 0) {
        await ctx.reply("There are no products in the inventory yet.");
        return;
      }

      const productLines = products.map((product) => {
        const name = escapeHtml(String(product.name));
        const category = product.category
          ? escapeHtml(String(product.category))
          : "Uncategorized";
        const availability =
          product.stock_quantity > 0 ? "Available" : "Out of stock";

        return `<b>${name}</b> (ID: ${product.id})
Category: ${category}
Price: €${product.price}
Stock: ${product.stock_quantity}
Status: ${availability}`;
      });

      await ctx.reply(
        "<b>All products</b>\n\n" + productLines.join("\n\n"),
        { parse_mode: "HTML" },
      );
    } catch (error) {
      await ctx.reply("Could not load the inventory.");
      console.error(error);
    }
  });

  bot.callbackQuery("admin:add_product", async (ctx) => {
    try {
      await ctx.answerCallbackQuery();
    } catch {
      console.warn("Ignored an expired button press");
      return;
    }

    addProductDrafts.set(ctx.from.id, { step: "name" });
    await ctx.reply(
      "What is the product name?\n\nSend /cancel to stop at any time.",
    );
  });

  bot.on("message:text", async (ctx, next) => {
    const draft = addProductDrafts.get(ctx.from.id);

    if (!draft) {
      await next();
      return;
    }

    const input = ctx.message.text.trim();

    if (draft.step === "name") {
      if (input.length < 1 || input.length > 100) {
        await ctx.reply("Enter a product name between 1 and 100 characters.");
        return;
      }

      addProductDrafts.set(ctx.from.id, {
        step: "category",
        name: input,
      });
      await ctx.reply(
        "What category is it in? Send - if it has no category.",
      );
      return;
    }

    if (draft.step === "category") {
      if (input.length > 100) {
        await ctx.reply("Enter a category no longer than 100 characters.");
        return;
      }

      addProductDrafts.set(ctx.from.id, {
        step: "price",
        name: draft.name,
        category: input === "-" || input === "" ? null : input,
      });
      await ctx.reply("What is the price in euros? For example: 5.99");
      return;
    }

    if (draft.step === "price") {
      const normalizedPrice = input.replace(",", ".");

      if (
        !/^\d{1,8}(\.\d{1,2})?$/.test(normalizedPrice) ||
        Number(normalizedPrice) <= 0
      ) {
        await ctx.reply(
          "Enter a valid price greater than zero with up to two decimal places.",
        );
        return;
      }

      addProductDrafts.set(ctx.from.id, {
        step: "stock",
        name: draft.name,
        category: draft.category,
        price: Number(normalizedPrice).toFixed(2),
      });
      await ctx.reply("What is the initial stock quantity? For example: 10");
      return;
    }

    if (!/^\d+$/.test(input)) {
      await ctx.reply("Enter stock as a whole number of zero or more.");
      return;
    }

    const stockQuantity = Number(input);

    if (!Number.isSafeInteger(stockQuantity) || stockQuantity > 1_000_000) {
      await ctx.reply("Enter a stock quantity between 0 and 1,000,000.");
      return;
    }

    try {
      const product = await createInventoryProduct(
        draft.name,
        draft.category,
        draft.price,
        stockQuantity,
      );

      addProductDrafts.delete(ctx.from.id);

      const name = escapeHtml(String(product.name));
      const category = product.category
        ? escapeHtml(String(product.category))
        : "Uncategorized";

      await ctx.reply(
        `<b>Product added ✅</b>\n\n<b>${name}</b> (ID: ${product.id})\nCategory: ${category}\nPrice: €${product.price}\nStock: ${product.stock_quantity}`,
        {
          parse_mode: "HTML",
          reply_markup: adminKeyboard,
        },
      );
    } catch (error) {
      await ctx.reply(
        "Could not add the product. Try the stock quantity again or send /cancel.",
      );
      console.error(error);
    }
  });
}
