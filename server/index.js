const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const { initDb, query } = require('./db');
const fs = require('fs');
const path = require('path');
const {
  fetchAllOrders,
  fetchAllProducts,
  fetchAllIngredients,
  fetchAllTables,
} = require('./helpers/fetchAll');
const { getLanConnectionInfo, writeLanConfig } = require('./helpers/lan');
const { getSession, requireSession } = require('./helpers/sessionAuth');
const { getRatesForShift } = require('./helpers/exchangeRates');

const app = express();
app.use(cors());
app.options('*', cors());
app.use(express.json({ limit: '50mb' }));

let lanConnectionInfo = getLanConnectionInfo();

function refreshLanConnectionInfo(logChange = false) {
  const nextConnectionInfo = getLanConnectionInfo();
  const hasChanged = nextConnectionInfo.backendUrl !== lanConnectionInfo.backendUrl;
  lanConnectionInfo = nextConnectionInfo;

  if (hasChanged || logChange) {
    const configFile = writeLanConfig(lanConnectionInfo);
    const address = lanConnectionInfo.backendUrl || 'SIN IP LAN DISPONIBLE';
    console.log(`LAN actual: ${address} (${lanConnectionInfo.interfaceName || 'sin interfaz'})`);
    if (hasChanged && !logChange) console.log(`Configuración LAN actualizada: ${configFile}`);
  }

  return lanConnectionInfo;
}

app.use((req, res, next) => {
  const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').replace('::ffff:', '');
  if (req.url.startsWith('/api')) {
    console.log(`🌐 [HTTP ${req.method}] ${req.url} (Cliente IP: ${clientIp || '127.0.0.1'})`);
  }
  next();
});

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

app.get('/api/connection-info', (req, res) => {
  res.json({ app: 'mugrosito', ...refreshLanConnectionInfo() });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  },
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.auth?.sessionToken;
  const user = getSession(token);
  if (!user) return next(new Error('Sesión no válida.'));
  socket.user = user;
  return next();
});

io.on('connection', (socket) => {
  const clientIp = (socket.handshake.address || '').replace('::ffff:', '');
  console.log(`⚡ Cliente conectado a WebSocket LAN: ${socket.id} (IP: ${clientIp || '127.0.0.1'})`);

  Promise.all([
    fetchAllOrders(),
    fetchAllProducts(),
    fetchAllIngredients(),
    fetchAllTables(),
    getRatesForShift({ query }, 'ambos'),
  ]).then(([orders, products, ingredients, tables, rates]) => {
    socket.emit('orders:sync', orders);
    socket.emit('products:sync', products);
    socket.emit('ingredients:sync', ingredients);
    socket.emit('tables:sync', tables);
    socket.emit('rates:updated', {
      COP: rates.COP,
      Bs: rates.Bs,
    });
    socket.emit('caja:updated');
  }).catch((error) => {
    console.error(`Error sincronizando WebSocket inicial para ${socket.id}:`, error.message);
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Cliente desconectado: ${socket.id}`);
  });
});

const authRoutes = require('./routes/auth');
const productsRoutes = require('./routes/products');
const ingredientsRoutes = require('./routes/ingredients');
const tablesRoutes = require('./routes/tables');
const ordersRoutes = require('./routes/orders');
const paymentsRoutes = require('./routes/payments');
const cajaRoutes = require('./routes/caja');
const ratesRoutes = require('./routes/rates');
const uploadRoutes = require('./routes/upload');
const reporteIntervaloRoutes = require('./routes/reporteIntervalo');
const printersRoutes = require('./routes/printers');

app.use('/api/auth', authRoutes(io));
app.use('/api', requireSession);
app.use('/api/products', productsRoutes(io));
app.use('/api/ingredients', ingredientsRoutes(io));
app.use('/api/tables', tablesRoutes(io));
app.use('/api/orders', ordersRoutes(io));
app.use('/api/orders', paymentsRoutes(io));
app.use('/api/payments', paymentsRoutes(io));
app.use('/api/caja-chica', cajaRoutes(io));
app.use('/api/caja', cajaRoutes(io));
app.use('/api/caja', reporteIntervaloRoutes(io));
app.use('/api/printers', printersRoutes(io));
app.use('/api/rates', ratesRoutes(io));
app.use('/api/upload', uploadRoutes(io));

const buildDir = path.join(__dirname, '../build');
if (fs.existsSync(buildDir)) {
  app.use((req, res, next) => {
    if (
      req.path === '/' ||
      req.path.endsWith('.html') ||
      req.path.includes('favicon') ||
      req.path.includes('icon') ||
      req.path.includes('manifest') ||
      req.path.includes('logo')
    ) {
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
    }
    next();
  });

  app.use(express.static(buildDir));
  app.get('*', (req, res) => {
    if (!req.url.startsWith('/api')) {
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(path.join(buildDir, 'index.html'));
    } else {
      res.status(404).json({ error: 'Endpoint no encontrado' });
    }
  });
}

initDb().then(() => {
  const PORT = process.env.PORT || 3001;
  server.listen(PORT, '0.0.0.0', () => {
    const connectionInfo = refreshLanConnectionInfo(true);
    console.log(`Servidor backend escuchando en 0.0.0.0:${PORT}`);
    console.log(`URL LAN anclada: ${connectionInfo.backendUrl || 'SIN IP LAN DISPONIBLE'}`);
  });
  setInterval(() => refreshLanConnectionInfo(), 10000);
}).catch((err) => {
  console.error('Error inicializando DB:', err);
});

// Production crash guards - prevent silent server termination
process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('🔴 Uncaught Exception:', err.message, err.stack);
});
