# Telegram Shop Bot

A Telegram bot for a small local shop. Customers can view available products,
add products to a cart, review their cart, and discard it.

The project currently uses Telegram long polling, so it does not need Express or
a REST API.

## Current features

- Welcome message and **Continue** button
- Private access restricted to one configured Telegram user ID
- Telegram `/admin` inventory menu
- Complete admin inventory list, including out-of-stock products
- Guided Telegram flow for adding inventory products
- Telegram controls for editing product details and stock
- Product catalogue loaded from PostgreSQL
- Product stock and prices shown in Telegram
- Existing draft-order recovery for returning customers
- Add-to-cart buttons
- Cart totals
- `/cart` command
- Cart message updates without creating a new message every time
- Temporary `Updated ✅` indicator after adding an item
- **Discard** button that deletes the draft order and clears the cart message
- Placeholder **Checkout** button

Checkout is not implemented yet. Clicking it currently replies:

> Checkout is not supported yet.

## Technology

- Node.js
- TypeScript
- [grammY](https://grammy.dev/) for the Telegram Bot API
- PostgreSQL
- `pg` for database access
- `tsx` for development

## Project structure

```text
src/
├── handlers/
│   ├── cart.ts       # Cart commands and button handlers
│   ├── catalog.ts    # Product catalogue and Continue button
│   ├── admin.ts      # Admin menu and inventory controls
│   └── start.ts      # /start and welcome message
├── views/
│   └── cart-view.ts  # Cart formatting, keyboard, and message editing
├── bot.ts            # Creates the bot and registers handlers
├── db.ts             # Database connection, tables, and queries
├── helper.ts         # Shared helper functions
└── index.ts          # Initializes the database and starts polling
```

## Setup

### Requirements

- Node.js and npm
- A running PostgreSQL server
- A Telegram bot token

### 1. Install dependencies

```bash
npm install
```

### 2. Create a Telegram bot

Create a bot through [@BotFather](https://t.me/BotFather) and copy its token.

Never commit the real bot token to Git or share it publicly. If it is exposed,
revoke it through BotFather and generate a new one.

### 3. Configure PostgreSQL

Create a PostgreSQL database for the bot. The configured database user must be
able to create and modify tables. The application automatically creates the
following tables when it starts:

- `inventory`
- `orders`
- `order_items`

### 4. Configure environment variables

Copy the example environment file:

```bash
cp .env.example .env
```

Then fill in `.env`:

```env
BOT_TOKEN=your_telegram_bot_token
ADMIN_TELEGRAM_ID=your_numeric_telegram_user_id

DB_HOST=localhost
DB_PORT=5432
DB_NAME=postgres
DB_USER=your_database_user
DB_PASSWORD=your_database_password
```

Only the Telegram account matching `ADMIN_TELEGRAM_ID` can use the bot. Other
users receive a message explaining that the bot is private.

### 5. Add inventory

Products are currently added directly to PostgreSQL. For example:

```sql
INSERT INTO inventory (name, category, stock_quantity, price)
VALUES ('Green Tea', 'Tea', 10, 5.00);
```

### 6. Run the bot

Development mode with automatic restarts:

```bash
npm run dev
```

The terminal should print something similar to:

```text
Connected as @your_bot_username
```

Open the bot in Telegram and send `/start`.

## Scripts

```bash
npm run dev        # Run the TypeScript source in watch mode
npm run typecheck  # Check TypeScript without creating build files
npm run build      # Compile TypeScript into dist/
npm start          # Run the compiled application
```

Run `npm run build` before `npm start`.

## How the cart works

1. The customer sends `/start` and presses **Continue**.
2. The bot fetches products whose `stock_quantity` is greater than zero.
3. Pressing a product button creates a draft order or reuses the customer's
   most recently created draft order.
4. The product is inserted into `order_items`, or its quantity is increased.
5. The cart message is created or edited to show the latest contents and total.
6. Pressing **Discard** deletes the customer's draft order. Its order items are
   deleted automatically by the database's `ON DELETE CASCADE` rule.

## Planned work

- Full checkout flow
- Delivery address or Telegram location collection
- Delivery-area review
- Payment instructions and manual payment confirmation
- Admin notifications and order approval
- Order status updates
- Decreasing or removing individual cart items
- Preventing cart quantities from exceeding available stock
- Safely reducing inventory when an order is confirmed

## Important limitation

The bot currently checks whether a product has stock before adding it, but it
does not prevent a cart quantity from becoming greater than the available stock.
Do not use the current checkout/cart implementation for real orders until stock
validation is added.

## License

This project is unlicensed and intended for private development.
