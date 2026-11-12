import { type Bot, InlineKeyboard } from "grammy";
import { getInventory } from "../db.js";
import { escapeHtml } from "../helper.js";

const adminKeyboard = new InlineKeyboard()
  .text("View products", "admin:view_products")
  .row()
  .text("Add product", "admin:add_product");

export function registerAdminHandlers(bot: Bot) {
  bot.command("admin", async (ctx) => {
    await ctx.reply("<b>Inventory management</b>", {
      parse_mode: "HTML",
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
    await ctx.answerCallbackQuery();
    await ctx.reply("Adding products is not supported yet.");
  });
}
