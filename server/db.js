const { Pool } = require('pg');

let pool = null;

async function tryPgPool(dbName, dbPassword) {
  const p = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: dbName,
    password: dbPassword,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    connectionTimeoutMillis: 3000,
  });
  const client = await p.connect();
  return { pool: p, client, dbName };
}

async function initDb() {
  const targetDbName = process.env.DB_NAME || 'mugrosito';
  const explicitPass = process.env.DB_PASSWORD;

  // Lista de posibles contraseñas a probar en orden
  const passwordsToTry = explicitPass
    ? [explicitPass]
    : ['mugrosito1.', 'postgres', 'admin', 'sdmaia1.', 'crispy1.', 'root', ''];

  const dbsToTry = [targetDbName, 'postgres'];

  let connectionObj = null;
  let lastError = null;

  // 1. Intentar conectar a la base de datos principal con las contraseñas posibles
  for (const pass of passwordsToTry) {
    try {
      connectionObj = await tryPgPool(targetDbName, pass);
      if (connectionObj) break;
    } catch (err) {
      lastError = err;
      if (err.message && err.message.includes(`database "${targetDbName}" does not exist`)) {
        // La BD no existe pero la contraseña es correcta, intentar crearla
        try {
          console.log(`ℹ️ La base de datos "${targetDbName}" no existe. Creándola automáticamente en PostgreSQL...`);
          const adminConn = await tryPgPool('postgres', pass);
          await adminConn.client.query(`CREATE DATABASE "${targetDbName}"`);
          adminConn.client.release();
          await adminConn.pool.end();
          connectionObj = await tryPgPool(targetDbName, pass);
          if (connectionObj) break;
        } catch (createErr) {
          console.error(`⚠️ No se pudo crear la BD "${targetDbName}":`, createErr.message);
        }
      }
    }
  }

  // 2. Si aún no conectó, intentar con postgres administrativo
  if (!connectionObj) {
    for (const db of dbsToTry) {
      if (db === targetDbName) continue;
      for (const pass of passwordsToTry) {
        try {
          connectionObj = await tryPgPool(db, pass);
          if (connectionObj) break;
        } catch (e) {
          lastError = e;
        }
      }
      if (connectionObj) break;
    }
  }

  if (!connectionObj) {
    console.error('Fatal: Could not connect to PostgreSQL database.', lastError ? lastError.message : '');
    process.exit(1);
  }

  if (connectionObj) {
    pool = connectionObj.pool;
    pool.on('error', (err) => {
      console.error('⚠️ PG Pool Error (idle client):', err.message);
    });
    const client = connectionObj.client;
    console.log(`✅ Conectado exitosamente a PostgreSQL (${connectionObj.dbName})`);
    
    const migrationQueries = [
      `CREATE TABLE IF NOT EXISTS users (id VARCHAR(64) PRIMARY KEY, username VARCHAR(64) NOT NULL UNIQUE, password VARCHAR(64) NOT NULL, role VARCHAR(32) NOT NULL DEFAULT 'admin', name VARCHAR(128) NOT NULL, shift VARCHAR(32) DEFAULT 'ambos', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(32) DEFAULT 'admin';`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS shift VARCHAR(32) DEFAULT 'ambos';`,

      `CREATE TABLE IF NOT EXISTS ingredients (id VARCHAR(64) PRIMARY KEY, name VARCHAR(128) NOT NULL, ingredient_type VARCHAR(32) DEFAULT 'adicional', price_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00, is_base BOOLEAN DEFAULT TRUE, is_extra BOOLEAN DEFAULT TRUE, category VARCHAR(64) DEFAULT 'Ingredientes', available BOOLEAN DEFAULT TRUE, shift VARCHAR(32) DEFAULT 'ambos', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`,
      `ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS ingredient_type VARCHAR(32) DEFAULT 'adicional';`,
      `ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS is_base BOOLEAN DEFAULT TRUE;`,
      `ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS is_extra BOOLEAN DEFAULT TRUE;`,
      `ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS is_base_for_pizza BOOLEAN DEFAULT TRUE;`,
      `ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS is_extra_for_pizza BOOLEAN DEFAULT TRUE;`,
      `ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS category VARCHAR(64) DEFAULT 'Ingredientes';`,
      `ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS available BOOLEAN DEFAULT TRUE;`,
      `ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS price_grande_completa NUMERIC(10, 2) DEFAULT 0.00;`,
      `ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS price_grande_mitad NUMERIC(10, 2) DEFAULT 0.00;`,
      `ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS price_pequena_completa NUMERIC(10, 2) DEFAULT 0.00;`,
      `ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS price_pequena_mitad NUMERIC(10, 2) DEFAULT 0.00;`,
      `ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS shift VARCHAR(32) DEFAULT 'ambos';`,
      `ALTER TABLE ingredients DROP CONSTRAINT IF EXISTS ingredients_name_key;`,

      `CREATE TABLE IF NOT EXISTS products (id VARCHAR(64) PRIMARY KEY, name VARCHAR(128) NOT NULL, category VARCHAR(64) NOT NULL DEFAULT 'Hamburguesas', drink_type VARCHAR(32), price NUMERIC(10, 2) NOT NULL DEFAULT 0.00, description TEXT, image TEXT, badge VARCHAR(64), base_ingredients TEXT[], protein_count INT DEFAULT 1, default_proteins TEXT[], shift VARCHAR(32) DEFAULT 'ambos', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`,
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS protein_count INT DEFAULT 1;`,
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS default_proteins TEXT[];`,
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS flavors TEXT[];`,
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS price_small NUMERIC(10, 2);`,
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS shift VARCHAR(32) DEFAULT 'ambos';`,

      `CREATE TABLE IF NOT EXISTS tables_config (id VARCHAR(64) PRIMARY KEY, number INT NOT NULL UNIQUE, name VARCHAR(64) NOT NULL, capacity INT NOT NULL DEFAULT 4, status VARCHAR(32) NOT NULL DEFAULT 'libre', zone VARCHAR(64) NOT NULL DEFAULT 'Salón Principal');`,

      `CREATE TABLE IF NOT EXISTS orders (id VARCHAR(64) PRIMARY KEY, order_number VARCHAR(32) NOT NULL, type VARCHAR(32) NOT NULL DEFAULT 'mesa', table_number INT, customer_name VARCHAR(128), status VARCHAR(32) NOT NULL DEFAULT 'en_preparacion', payment_status VARCHAR(32) NOT NULL DEFAULT 'no_pagado', payment_method VARCHAR(32), total_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00, waiter_name VARCHAR(64) DEFAULT 'Mesero', kitchen_notes TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE;`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS cop_rate_at_payment NUMERIC(10, 2) DEFAULT 3100.00;`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS bs_rate_at_payment NUMERIC(10, 2) DEFAULT 3.20;`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_amount_usd NUMERIC(10, 2) DEFAULT 0.00;`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS merged_from_orders TEXT[];`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_history_json JSONB;`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee_usd NUMERIC(10, 2) DEFAULT 0.00;`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes TEXT;`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS debtor_name VARCHAR(128);`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP;`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS shift VARCHAR(32) DEFAULT 'ambos';`,

      `CREATE TABLE IF NOT EXISTS order_items (id VARCHAR(64) PRIMARY KEY, order_id VARCHAR(64) REFERENCES orders(id) ON DELETE CASCADE, product_id VARCHAR(64) NOT NULL, product_name VARCHAR(128) NOT NULL, price NUMERIC(10, 2) NOT NULL, quantity INT NOT NULL DEFAULT 1, removed_ingredients TEXT[], extras_json JSONB, sugar_preference VARCHAR(32), is_takeaway BOOLEAN DEFAULT FALSE, notes TEXT);`,
      `ALTER TABLE order_items ADD COLUMN IF NOT EXISTS size VARCHAR(32) DEFAULT 'Estándar';`,
      `ALTER TABLE order_items ADD COLUMN IF NOT EXISTS is_half_half BOOLEAN DEFAULT FALSE;`,
      `ALTER TABLE order_items ADD COLUMN IF NOT EXISTS half_details JSONB;`,
      `ALTER TABLE order_items ADD COLUMN IF NOT EXISTS is_new_or_modified BOOLEAN DEFAULT FALSE;`,
      `ALTER TABLE order_items ADD COLUMN IF NOT EXISTS is_paid_individually BOOLEAN DEFAULT FALSE;`,
      `ALTER TABLE order_items ADD COLUMN IF NOT EXISTS paid_by_name VARCHAR(128);`,
      `ALTER TABLE order_items ADD COLUMN IF NOT EXISTS drink_type VARCHAR(32);`,
      `ALTER TABLE order_items ADD COLUMN IF NOT EXISTS category VARCHAR(64);`,
      `ALTER TABLE order_items ADD COLUMN IF NOT EXISTS proteins TEXT[];`,
      `ALTER TABLE order_items ADD COLUMN IF NOT EXISTS is_cut BOOLEAN DEFAULT FALSE;`,
      `ALTER TABLE order_items ADD COLUMN IF NOT EXISTS cut_preference VARCHAR(32) DEFAULT 'Entera';`,
      `ALTER TABLE order_items ADD COLUMN IF NOT EXISTS is_delivery BOOLEAN DEFAULT FALSE;`,
      `ALTER TABLE order_items ADD COLUMN IF NOT EXISTS flavor VARCHAR(64);`,

      `CREATE TABLE IF NOT EXISTS order_payments (id VARCHAR(64) PRIMARY KEY, order_id VARCHAR(64) REFERENCES orders(id) ON DELETE CASCADE, payer_name VARCHAR(128) DEFAULT 'Cliente General', payment_method VARCHAR(32) NOT NULL, amount_paid_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00, cash_tendered_usd NUMERIC(10, 2) DEFAULT 0.00, cash_tendered_cop NUMERIC(12, 2) DEFAULT 0.00, cash_tendered_bs NUMERIC(12, 2) DEFAULT 0.00, change_given_usd NUMERIC(10, 2) DEFAULT 0.00, change_given_cop NUMERIC(12, 2) DEFAULT 0.00, change_given_bs NUMERIC(12, 2) DEFAULT 0.00, item_ids TEXT[], cop_rate NUMERIC(10, 2) DEFAULT 3100.00, bs_rate NUMERIC(10, 2) DEFAULT 3.20, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`,
      `ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS cash_tendered_bs NUMERIC(12, 2) DEFAULT 0.00;`,
      `ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS change_given_bs NUMERIC(12, 2) DEFAULT 0.00;`,

      `CREATE TABLE IF NOT EXISTS caja_chica_apertura (id VARCHAR(64) PRIMARY KEY, usd_cash NUMERIC(10, 2) NOT NULL DEFAULT 0.00, cop_cash NUMERIC(12, 2) NOT NULL DEFAULT 0.00, shift VARCHAR(32) DEFAULT 'ambos', timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`,
      `ALTER TABLE caja_chica_apertura ADD COLUMN IF NOT EXISTS shift VARCHAR(32) DEFAULT 'ambos';`,

      `CREATE TABLE IF NOT EXISTS caja_chica_transactions (id VARCHAR(64) PRIMARY KEY, type VARCHAR(32) NOT NULL, amount_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00, amount_cop NUMERIC(12, 2) NOT NULL DEFAULT 0.00, amount_bs NUMERIC(12, 2) NOT NULL DEFAULT 0.00, payment_method VARCHAR(32) NOT NULL, description TEXT NOT NULL, order_id VARCHAR(64), cierre_id VARCHAR(64), shift VARCHAR(32) DEFAULT 'ambos', timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`,
      `ALTER TABLE caja_chica_transactions ADD COLUMN IF NOT EXISTS cierre_id VARCHAR(64);`,
      `ALTER TABLE caja_chica_transactions ADD COLUMN IF NOT EXISTS shift VARCHAR(32) DEFAULT 'ambos';`,
      `ALTER TABLE caja_chica_transactions ADD COLUMN IF NOT EXISTS amount_bs NUMERIC(12, 2) NOT NULL DEFAULT 0.00;`,

      `CREATE TABLE IF NOT EXISTS caja_chica_cierres (id VARCHAR(64) PRIMARY KEY, opened_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00, opened_cop NUMERIC(12, 2) NOT NULL DEFAULT 0.00, total_sales_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00, expected_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00, expected_cop NUMERIC(12, 2) NOT NULL DEFAULT 0.00, actual_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00, actual_cop NUMERIC(12, 2) NOT NULL DEFAULT 0.00, difference_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00, difference_cop NUMERIC(12, 2) NOT NULL DEFAULT 0.00, closed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, closed_by VARCHAR(64) DEFAULT 'Caja', notes TEXT, shift VARCHAR(32) DEFAULT 'ambos');`,
      `ALTER TABLE caja_chica_cierres ADD COLUMN IF NOT EXISTS shift VARCHAR(32) DEFAULT 'ambos';`,
      `ALTER TABLE caja_chica_cierres ADD COLUMN IF NOT EXISTS expected_cop NUMERIC(12, 2) NOT NULL DEFAULT 0.00;`,
      `ALTER TABLE caja_chica_cierres ADD COLUMN IF NOT EXISTS difference_cop NUMERIC(12, 2) NOT NULL DEFAULT 0.00;`,

      `CREATE TABLE IF NOT EXISTS exchange_rates (id INT PRIMARY KEY DEFAULT 1, cop_rate NUMERIC(10, 2) NOT NULL DEFAULT 3100.00, bs_rate NUMERIC(10, 2) NOT NULL DEFAULT 3.20);`,
      `CREATE TABLE IF NOT EXISTS shift_exchange_rates (shift VARCHAR(32) PRIMARY KEY, cop_rate NUMERIC(10, 2) NOT NULL, bs_rate NUMERIC(10, 2) NOT NULL, updated_by VARCHAR(128) NOT NULL DEFAULT 'Sistema', updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP);`,
      `CREATE TABLE IF NOT EXISTS exchange_rate_history (id VARCHAR(64) PRIMARY KEY, shift VARCHAR(32) NOT NULL, cop_rate NUMERIC(10, 2) NOT NULL, bs_rate NUMERIC(10, 2) NOT NULL, changed_by VARCHAR(128) NOT NULL, changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP);`,

      `CREATE TABLE IF NOT EXISTS order_edits (id VARCHAR(64) PRIMARY KEY, order_id VARCHAR(64) REFERENCES orders(id) ON DELETE CASCADE, order_number VARCHAR(32), edited_by VARCHAR(128) DEFAULT 'admin', edit_type VARCHAR(64) DEFAULT 'modificacion', edit_details TEXT DEFAULT '', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`,
      `CREATE TABLE IF NOT EXISTS system_settings (key VARCHAR(64) PRIMARY KEY, value TEXT NOT NULL, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`,

      `CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);`,
      `CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);`,
      `CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_orders_archived_at ON orders(archived_at);`,
      `CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);`,
      `CREATE INDEX IF NOT EXISTS idx_order_payments_order_id ON order_payments(order_id);`,
      `CREATE INDEX IF NOT EXISTS idx_caja_tx_timestamp ON caja_chica_transactions(timestamp DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_caja_tx_cierre_id ON caja_chica_transactions(cierre_id);`,
      `CREATE INDEX IF NOT EXISTS idx_order_edits_created_at ON order_edits(created_at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_order_edits_order_id ON order_edits(order_id);`,
      `CREATE INDEX IF NOT EXISTS idx_exchange_rate_history_shift_changed_at ON exchange_rate_history(shift, changed_at DESC);`,

      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_cop NUMERIC(12, 2) DEFAULT 0.00;`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee_cop NUMERIC(12, 2) DEFAULT 0.00;`,
      `INSERT INTO exchange_rates (id, cop_rate, bs_rate) VALUES (1, 3100.00, 3.20) ON CONFLICT (id) DO UPDATE SET cop_rate = EXCLUDED.cop_rate, bs_rate = EXCLUDED.bs_rate;`,
      `INSERT INTO shift_exchange_rates (shift, cop_rate, bs_rate, updated_by) VALUES ('ambos', 3100.00, 3.20, 'Inicial Mugrosito') ON CONFLICT (shift) DO UPDATE SET cop_rate = EXCLUDED.cop_rate, bs_rate = EXCLUDED.bs_rate;`,
      `INSERT INTO shift_exchange_rates (shift, cop_rate, bs_rate, updated_by) VALUES ('manana', 3100.00, 3.20, 'Compatibilidad') ON CONFLICT (shift) DO UPDATE SET cop_rate = EXCLUDED.cop_rate, bs_rate = EXCLUDED.bs_rate;`,
      `INSERT INTO shift_exchange_rates (shift, cop_rate, bs_rate, updated_by) VALUES ('noche', 3100.00, 3.20, 'Compatibilidad') ON CONFLICT (shift) DO UPDATE SET cop_rate = EXCLUDED.cop_rate, bs_rate = EXCLUDED.bs_rate;`,
      `INSERT INTO system_settings (key, value) VALUES ('admin_pin', '1234') ON CONFLICT (key) DO NOTHING;`,

      `INSERT INTO users (id, username, password, role, name, shift) VALUES
        ('u-admin', 'linda', 'lindamugrosito', 'admin', 'Linda', 'ambos'),
        ('u-caja', 'cajero', 'cajero', 'caja', 'Cajero', 'ambos'),
        ('u-mesero', 'mesero', 'mesero', 'mesero', 'Mesero Principal', 'ambos'),
        ('u-cocina', 'cocina', 'cocina', 'cocina', 'Jefe de Cocina', 'ambos')
        ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username, password = EXCLUDED.password, role = EXCLUDED.role, name = EXCLUDED.name;`,
    ];

    for (const q of migrationQueries) {
      try { await client.query(q); } catch (e) { console.warn('Aviso migración PG:', e.message); }
    }

    console.log('ℹ️ Base de datos Mugrosito inicializada limpia (sin productos, ingredientes ni mesas precargadas).');

    client.release();
    console.log('✅ Base de datos PostgreSQL configurada y lista.');
  }
}

module.exports = {
  initDb,
  query: async (text, params) => {
    if (pool) {
      return pool.query(text, params);
    }
    throw new Error('Database pool not initialized.');
  },
  getClient: async () => {
    if (pool) {
      return pool.connect();
    }
    throw new Error('Database pool not initialized.');
  }
};
