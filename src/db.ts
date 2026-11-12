import pg from "pg";

const DB_PORT = Number(process.env.DB_PORT);

function isValidPort() {
  if (!Number.isInteger(DB_PORT) || DB_PORT < 0 || DB_PORT > 65535) {
    throw new Error("DB_PORT must be an integer between 1 and 65535");
  }

  return DB_PORT;
}

const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST,
  port: isValidPort(),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

export async function initDB() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS inventory (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT,
        stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
        price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS orders (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      telegram_user_id BIGINT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK (
          status IN (
            'draft',
            'awaiting_review',
            'accepted',
            'out_for_delivery',
            'completed',
            'cancelled',
            'rejected'
          )
        ),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS order_items (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      order_id BIGINT NOT NULL
        REFERENCES orders(id) ON DELETE CASCADE,
      product_id BIGINT NOT NULL
        REFERENCES inventory(id) ON DELETE RESTRICT,
      quantity INTEGER NOT NULL DEFAULT 1
        CHECK (quantity > 0),
      unit_price NUMERIC(10, 2) NOT NULL
        CHECK (unit_price >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (order_id, product_id)
    )`,
  );
}

export async function getAvailable() {
  const result = await pool.query(
    `SELECT * FROM inventory
    WHERE stock_quantity > 0`,
  );

  return result.rows;
}

export async function getInventory() {
  const result = await pool.query(
    `SELECT id, name, category, stock_quantity, price, updated_at
     FROM inventory
     ORDER BY id`,
  );

  return result.rows;
}

export async function createInventoryProduct(
  name: string,
  category: string | null,
  price: string,
  stockQuantity: number,
) {
  const result = await pool.query(
    `INSERT INTO inventory (name, category, price, stock_quantity)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, category, price, stock_quantity`,
    [name, category, price, stockQuantity],
  );

  return result.rows[0];
}

export type EditableInventoryField =
  | "name"
  | "category"
  | "price"
  | "stock_quantity";

export async function getInventoryProduct(productId: number) {
  const result = await pool.query(
    `SELECT id, name, category, price, stock_quantity
     FROM inventory
     WHERE id = $1`,
    [productId],
  );

  return result.rows[0];
}

export async function updateInventoryProduct(
  productId: number,
  field: EditableInventoryField,
  value: string | number | null,
) {
  const columns: Record<EditableInventoryField, string> = {
    name: "name",
    category: "category",
    price: "price",
    stock_quantity: "stock_quantity",
  };
  const column = columns[field];
  const result = await pool.query(
    `UPDATE inventory
     SET ${column} = $2,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, name, category, price, stock_quantity`,
    [productId, value],
  );

  return result.rows[0];
}

export async function getOrCreateDraftOrder(telegramUserId: number) {
  const existingOrder = await pool.query(
    `SELECT *
    FROM orders
    WHERE telegram_user_id = $1
    AND status = 'draft'
    ORDER BY created_at DESC
    LIMIT 1`,
    [telegramUserId],
  );

  if (existingOrder.rows[0]) {
    return existingOrder.rows[0];
  }

  const newOrder = await pool.query(
    `INSERT INTO orders (telegram_user_id)
     VALUES ($1)
     RETURNING *`,
    [telegramUserId],
  );

  return newOrder.rows[0];
}

export class InventoryStockError extends Error {}

export async function addProductToOrder(orderId: number, productId: number) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const productResult = await client.query(
      `SELECT id, price, stock_quantity
       FROM inventory
       WHERE id = $1
       FOR UPDATE`,
      [productId],
    );
    const product = productResult.rows[0];

    if (!product || product.stock_quantity <= 0) {
      throw new InventoryStockError("This product is out of stock.");
    }

    const existingItemResult = await client.query(
      `SELECT id, quantity
       FROM order_items
       WHERE order_id = $1
         AND product_id = $2
       FOR UPDATE`,
      [orderId, productId],
    );
    const existingItem = existingItemResult.rows[0];

    if (existingItem && existingItem.quantity >= product.stock_quantity) {
      throw new InventoryStockError(
        `Only ${product.stock_quantity} available. Your cart already contains the maximum quantity.`,
      );
    }

    const itemResult = existingItem
      ? await client.query(
          `UPDATE order_items
           SET quantity = quantity + 1
           WHERE id = $1
           RETURNING *`,
          [existingItem.id],
        )
      : await client.query(
          `INSERT INTO order_items (order_id, product_id, unit_price)
           VALUES ($1, $2, $3)
           RETURNING *`,
          [orderId, product.id, product.price],
        );

    await client.query("COMMIT");
    return itemResult.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getOrderItems(orderId: number) {
  const result = await pool.query(
    `SELECT
       oi.product_id,
       i.name,
       oi.quantity,
       oi.unit_price,
       oi.quantity * oi.unit_price AS line_total
     FROM order_items AS oi
     JOIN inventory AS i
       ON i.id = oi.product_id
     WHERE oi.order_id = $1
     ORDER BY oi.id`,
    [orderId],
  );

  return result.rows;
}

export async function decreaseProductQuantity(
  orderId: number,
  productId: number,
  telegramUserId: number,
) {
  const result = await pool.query(
    `UPDATE order_items AS oi
     SET quantity = oi.quantity - 1
     FROM orders AS o
     WHERE oi.order_id = o.id
       AND oi.order_id = $1
       AND oi.product_id = $2
       AND o.telegram_user_id = $3
       AND o.status = 'draft'
       AND oi.quantity > 1
     RETURNING oi.id`,
    [orderId, productId, telegramUserId],
  );

  return result.rows[0];
}

export async function removeProductFromOrder(
  orderId: number,
  productId: number,
  telegramUserId: number,
) {
  const result = await pool.query(
    `DELETE FROM order_items AS oi
     USING orders AS o
     WHERE oi.order_id = o.id
       AND oi.order_id = $1
       AND oi.product_id = $2
       AND o.telegram_user_id = $3
       AND o.status = 'draft'
     RETURNING oi.id`,
    [orderId, productId, telegramUserId],
  );

  return result.rows[0];
}

export async function discardDraftOrder(
  orderId: number,
  telegramUserId: number,
) {
  const result = await pool.query(
    `DELETE FROM orders
     WHERE id = $1
       AND telegram_user_id = $2
       AND status = 'draft'
     RETURNING id`,
    [orderId, telegramUserId],
  );

  return result.rows[0];
}

export default pool;
