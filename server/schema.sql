-- Schema SQL para Mugrosito POS (PostgreSQL)

-- 1. Tabla de Usuarios
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  password VARCHAR(64) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'admin', -- mesero, caja, cocina, admin
  name VARCHAR(128) NOT NULL,
  shift VARCHAR(32) DEFAULT 'ambos',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabla de Ingredientes (Base & Adicionales para Hamburguesas)
CREATE TABLE IF NOT EXISTS ingredients (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  price_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  is_base BOOLEAN DEFAULT TRUE,
  is_extra BOOLEAN DEFAULT TRUE,
  category VARCHAR(64) DEFAULT 'Ingredientes',
  available BOOLEAN DEFAULT TRUE,
  shift VARCHAR(32) DEFAULT 'ambos',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabla de Productos (Hamburguesas, Bebidas, Acompañantes)
CREATE TABLE IF NOT EXISTS products (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  category VARCHAR(64) NOT NULL DEFAULT 'Hamburguesas', -- Hamburguesas, Bebidas, Acompañantes
  drink_type VARCHAR(32), -- refresco, jugo, agua
  price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  description TEXT,
  image TEXT,
  badge VARCHAR(64),
  base_ingredients TEXT[],
  shift VARCHAR(32) DEFAULT 'ambos',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Tabla de Mesas
CREATE TABLE IF NOT EXISTS tables_config (
  id VARCHAR(64) PRIMARY KEY,
  number INT NOT NULL UNIQUE,
  name VARCHAR(64) NOT NULL,
  capacity INT NOT NULL DEFAULT 4,
  status VARCHAR(32) NOT NULL DEFAULT 'libre',
  zone VARCHAR(64) NOT NULL DEFAULT 'Salón Principal'
);

-- 5. Tabla de Comandas / Órdenes
CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR(64) PRIMARY KEY,
  order_number VARCHAR(32) NOT NULL,
  type VARCHAR(32) NOT NULL DEFAULT 'mesa', -- mesa, delivery, pickup, credito
  table_number INT,
  customer_name VARCHAR(128),
  status VARCHAR(32) NOT NULL DEFAULT 'en_preparacion', -- en_preparacion, preparada, entregada, cancelado
  payment_status VARCHAR(32) NOT NULL DEFAULT 'no_pagado', -- no_pagado, pagado, credito
  payment_method VARCHAR(32),
  total_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  total_cop NUMERIC(12, 2) DEFAULT 0.00,
  cop_rate_at_payment NUMERIC(10, 2) DEFAULT 3100.00,
  bs_rate_at_payment NUMERIC(10, 2) DEFAULT 3.20,
  waiter_name VARCHAR(64) DEFAULT 'Mesero',
  kitchen_notes TEXT,
  is_edited BOOLEAN DEFAULT FALSE,
  paid_amount_usd NUMERIC(10, 2) DEFAULT 0.00,
  merged_from_orders TEXT[],
  payment_history_json JSONB,
  delivery_fee_usd NUMERIC(10, 2) DEFAULT 0.00,
  delivery_fee_cop NUMERIC(12, 2) DEFAULT 0.00,
  notes TEXT,
  debtor_name VARCHAR(128),
  archived_at TIMESTAMP,
  shift VARCHAR(32) DEFAULT 'ambos',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Items de Comandas con personalizaciones
CREATE TABLE IF NOT EXISTS order_items (
  id VARCHAR(64) PRIMARY KEY,
  order_id VARCHAR(64) REFERENCES orders(id) ON DELETE CASCADE,
  product_id VARCHAR(64) NOT NULL,
  product_name VARCHAR(128) NOT NULL,
  price NUMERIC(10, 2) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  removed_ingredients TEXT[],
  proteins TEXT[],
  extras_json JSONB,
  sugar_preference VARCHAR(32),
  is_takeaway BOOLEAN DEFAULT FALSE,
  is_new_or_modified BOOLEAN DEFAULT FALSE,
  is_paid_individually BOOLEAN DEFAULT FALSE,
  paid_by_name VARCHAR(128),
  drink_type VARCHAR(32),
  category VARCHAR(64),
  notes TEXT,
  size VARCHAR(32) DEFAULT 'Estándar',
  is_half_half BOOLEAN DEFAULT FALSE,
  half_details JSONB,
  is_cut BOOLEAN DEFAULT FALSE,
  cut_preference VARCHAR(32) DEFAULT 'Entera'
);

-- 7. Historial Desglosado de Pagos y Vueltos
CREATE TABLE IF NOT EXISTS order_payments (
  id VARCHAR(64) PRIMARY KEY,
  order_id VARCHAR(64) REFERENCES orders(id) ON DELETE CASCADE,
  payer_name VARCHAR(128) DEFAULT 'Cliente General',
  payment_method VARCHAR(32) NOT NULL,
  amount_paid_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  cash_tendered_usd NUMERIC(10, 2) DEFAULT 0.00,
  cash_tendered_cop NUMERIC(12, 2) DEFAULT 0.00,
  cash_tendered_bs NUMERIC(12, 2) DEFAULT 0.00,
  change_given_usd NUMERIC(10, 2) DEFAULT 0.00,
  change_given_cop NUMERIC(12, 2) DEFAULT 0.00,
  change_given_bs NUMERIC(12, 2) DEFAULT 0.00,
  item_ids TEXT[],
  cop_rate NUMERIC(10, 2) DEFAULT 3100.00,
  bs_rate NUMERIC(10, 2) DEFAULT 3.20,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. Apertura de Caja Chica
CREATE TABLE IF NOT EXISTS caja_chica_apertura (
  id VARCHAR(64) PRIMARY KEY,
  usd_cash NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  cop_cash NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  shift VARCHAR(32) DEFAULT 'ambos',
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. Transacciones de Caja Chica (Egresos / Ingresos manuales)
CREATE TABLE IF NOT EXISTS caja_chica_transactions (
  id VARCHAR(64) PRIMARY KEY,
  type VARCHAR(32) NOT NULL, -- ingreso, egreso
  amount_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  amount_cop NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  amount_bs NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  payment_method VARCHAR(32) NOT NULL,
  description TEXT NOT NULL,
  order_id VARCHAR(64),
  cierre_id VARCHAR(64),
  shift VARCHAR(32) DEFAULT 'ambos',
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 10. Cierres y Arqueos de Caja Chica
CREATE TABLE IF NOT EXISTS caja_chica_cierres (
  id VARCHAR(64) PRIMARY KEY,
  opened_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  opened_cop NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  total_sales_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  expected_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  expected_cop NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  actual_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  actual_cop NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  difference_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  difference_cop NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  closed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  closed_by VARCHAR(64) DEFAULT 'Caja',
  notes TEXT,
  shift VARCHAR(32) DEFAULT 'ambos'
);

-- 11. Tasas de Cambio
CREATE TABLE IF NOT EXISTS exchange_rates (
  id INT PRIMARY KEY DEFAULT 1,
  cop_rate NUMERIC(10, 2) NOT NULL DEFAULT 3100.00,
  bs_rate NUMERIC(10, 2) NOT NULL DEFAULT 3.20
);

CREATE TABLE IF NOT EXISTS shift_exchange_rates (
  shift VARCHAR(32) PRIMARY KEY,
  cop_rate NUMERIC(10, 2) NOT NULL,
  bs_rate NUMERIC(10, 2) NOT NULL,
  updated_by VARCHAR(128) NOT NULL DEFAULT 'Sistema',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 12. Historial de Edición y PIN de Seguridad
CREATE TABLE IF NOT EXISTS order_edits (
  id VARCHAR(64) PRIMARY KEY,
  order_id VARCHAR(64) REFERENCES orders(id) ON DELETE CASCADE,
  order_number VARCHAR(32),
  edited_by VARCHAR(128) DEFAULT 'admin',
  edit_type VARCHAR(64) DEFAULT 'modificacion',
  edit_details TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS system_settings (
  key VARCHAR(64) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices de Rendimiento
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_payments_order_id ON order_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_caja_tx_timestamp ON caja_chica_transactions(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_caja_tx_cierre_id ON caja_chica_transactions(cierre_id);

-- Inserción Inicial de Tasas y PIN
INSERT INTO exchange_rates (id, cop_rate, bs_rate) VALUES (1, 3100.00, 3.20) ON CONFLICT (id) DO NOTHING;
INSERT INTO shift_exchange_rates (shift, cop_rate, bs_rate, updated_by) VALUES ('ambos', 3100.00, 3.20, 'Inicial Mugrosito') ON CONFLICT (shift) DO NOTHING;
INSERT INTO system_settings (key, value) VALUES ('admin_pin', '1234') ON CONFLICT (key) DO NOTHING;

-- Inserción Inicial de Usuarios Mugrosito
INSERT INTO users (id, username, password, role, name, shift) VALUES
('u-admin', 'linda', 'lindamugrosito', 'admin', 'Linda', 'ambos'),
('u-caja', 'cajero', 'cajero', 'caja', 'Cajero', 'ambos'),
('u-mesero', 'mesero', 'mesero', 'mesero', 'Mesero Principal', 'ambos'),
('u-cocina', 'cocina', 'cocina', 'cocina', 'Jefe de Cocina', 'ambos')
ON CONFLICT (username) DO UPDATE SET password = EXCLUDED.password;

-- Inserción Inicial de Mesas
INSERT INTO tables_config (id, number, name, capacity, status, zone) VALUES
('table-1', 1, 'Mesa #1', 4, 'libre', 'Salón Principal'),
('table-2', 2, 'Mesa #2', 4, 'libre', 'Salón Principal'),
('table-3', 3, 'Mesa #3', 2, 'libre', 'Salón Principal'),
('table-4', 4, 'Mesa #4', 4, 'libre', 'Salón Principal'),
('table-5', 5, 'Mesa #5', 2, 'libre', 'Salón Principal'),
('table-6', 6, 'Mesa #6', 4, 'libre', 'Salón Principal'),
('table-7', 7, 'Mesa #7', 2, 'libre', 'Salón Principal'),
('table-8', 8, 'Mesa #8', 6, 'libre', 'Salón Principal')
ON CONFLICT (number) DO NOTHING;

-- Inserción Inicial de Hamburguesas y Productos Crispy
INSERT INTO products (id, name, category, drink_type, price, description, image, badge, base_ingredients, shift) VALUES
('prod-1', 'Hamburguesa Crispy Clásica', 'Hamburguesas', NULL, 6.50, 'Carne de res 150g, queso cheddar fundido, lechuga, tomate, cebolla y salsa especial Crispy.', 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80', 'POPULAR', ARRAY['Carne de Res', 'Queso Cheddar', 'Lechuga', 'Tomate', 'Cebolla', 'Salsa Crispy'], 'ambos'),
('prod-2', 'Hamburguesa Crispy Doble Bacon', 'Hamburguesas', NULL, 8.50, 'Doble carne de res 300g, doble cheddar fundido, tocineta crocante y salsa BBQ ahumada.', 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&w=600&q=80', 'ESPECIAL', ARRAY['Doble Carne', 'Queso Cheddar', 'Tocineta Ahumada', 'Salsa BBQ'], 'ambos'),
('prod-3', 'Crispy Chicken Burger', 'Hamburguesas', NULL, 7.00, 'Pechuga de pollo extra crujiente, pepinillos encurtidos, ensalada coleslaw y mayonesa de ajo.', 'https://images.unsplash.com/photo-1625813506062-0aeb1d7a094b?auto=format&fit=crop&w=600&q=80', 'FAVORITA', ARRAY['Pollo Crujiente', 'Pepinillos', 'Coleslaw', 'Mayonesa de Ajo'], 'ambos'),
('prod-4', 'Papas Fritas Crispy Grandes', 'Acompañantes', NULL, 3.00, 'Papas crujientes recién fritas, sazonadas con toque de sal marina y páprika.', 'https://images.unsplash.com/photo-1576107232684-1279f3908594?auto=format&fit=crop&w=600&q=80', 'CRISPY', ARRAY['Papas'], 'ambos'),
('prod-5', 'Refresco 1.5L', 'Bebidas', 'refresco', 3.50, 'Botella de 1.5 litros bien fría surtida.', 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=600&q=80', NULL, NULL, 'ambos'),
('prod-6', 'Refresco en Lata 355ml', 'Bebidas', 'refresco', 1.50, 'Lata de 355ml bien fría (Coca-Cola, Pepsi, Sprite, etc.).', 'https://images.unsplash.com/photo-1554866585-cd94860890b7?auto=format&fit=crop&w=600&q=80', NULL, NULL, 'ambos')
ON CONFLICT (id) DO NOTHING;

-- Inserción Inicial de Ingredientes y Extras para Hamburguesas
INSERT INTO ingredients (id, name, price_usd, is_base, is_extra, category, available, shift) VALUES
('ing-1', 'Carne de Res', 0.00, true, false, 'Carnes', true, 'ambos'),
('ing-2', 'Doble Carne', 2.00, false, true, 'Carnes', true, 'ambos'),
('ing-3', 'Pollo Crujiente', 0.00, true, false, 'Carnes', true, 'ambos'),
('ing-4', 'Queso Cheddar', 1.00, true, true, 'Quesos', true, 'ambos'),
('ing-5', 'Tocineta Ahumada', 1.50, false, true, 'Extras', true, 'ambos'),
('ing-6', 'Huevo Frito', 1.00, false, true, 'Extras', true, 'ambos'),
('ing-7', 'Pepinillos Encurtidos', 0.50, true, true, 'Vegetales', true, 'ambos'),
('ing-8', 'Cebolla Caramelizada', 1.00, false, true, 'Vegetales', true, 'ambos'),
('ing-9', 'Lechuga', 0.00, true, false, 'Vegetales', true, 'ambos'),
('ing-10', 'Tomate', 0.00, true, false, 'Vegetales', true, 'ambos'),
('ing-11', 'Salsa Crispy Especial', 0.50, true, true, 'Salsas', true, 'ambos'),
('ing-12', 'Papas Fritas Ración', 2.00, false, true, 'Acompañantes', true, 'ambos')
ON CONFLICT (id) DO NOTHING;

