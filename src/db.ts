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

export async function addProductToOrder(orderId: number, productId: number) {
  const productResult = await pool.query(
    `SELECT id, price, stock_quantity
     FROM inventory
     WHERE id = $1
       AND stock_quantity > 0`,
    [productId],
  );

  const product = productResult.rows[0];

  if (!product) {
    throw new Error("Product not found or out of stock");
  }

  const itemResult = await pool.query(
    `INSERT INTO order_items (
       order_id,
       product_id,
       unit_price
     )
     VALUES ($1, $2, $3)
     ON CONFLICT (order_id, product_id)
     DO UPDATE SET quantity = order_items.quantity + 1
     RETURNING *`,
    [orderId, product.id, product.price],
  );

  return itemResult.rows[0];
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

export default pool;
