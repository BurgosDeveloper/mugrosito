import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { soundService } from '../services/soundService';
import {
  Product,
  Table,
  Order,
  OrderItem,
  OrderStatus,
  ExchangeRates,
  PaymentMethod,
  Ingredient,
  CajaChicaApertura,
  CajaChicaTransaction,
  CajaChicaCierre,
  DualPrintersConfig,
} from '../data/mockData';

export type UserRole = 'mesero' | 'caja' | 'cocina' | 'admin';

export interface UserSession {
  username: string;
  role: UserRole;
  shift?: 'manana' | 'noche' | 'ambos';
  sessionToken?: string;
}

interface AppContextType {
  userSession: UserSession | null;
  login: (username: string, password: string) => Promise<{ success: boolean; user?: UserSession; error?: string }>;
  logout: () => void;
  
  products: Product[];
  ingredients: Ingredient[];
  extras: Ingredient[]; // alias para ingredientes con isExtraForPizza === true
  tables: Table[];
  orders: Order[];
  exchangeRates: ExchangeRates;
  
  cajaChicaApertura: CajaChicaApertura;
  cajaChicaTransactions: CajaChicaTransaction[];
  ultimoCierre: CajaChicaCierre | null;
  
  // Actions
  createOrder: (orderData: {
    type: 'mesa' | 'delivery' | 'pickup';
    tableNumber?: number;
    customerName?: string;
    kitchenNotes?: string;
    items: OrderItem[];
    totalUSD: number;
    deliveryFeeUSD?: number;
    targetPrinter?: 'cocina' | 'caja' | 'ambas' | 'ninguna';
  }) => Promise<void>;
  
  updateOrderStatus: (orderId: string, status: OrderStatus) => Promise<void>;
  cancelOrder: (orderId: string) => Promise<void>;
  deleteOrder: (orderId: string) => Promise<void>;
  editOrder: (orderId: string, editData: { items: OrderItem[]; kitchenNotes?: string; totalUSD: number; deliveryFeeUSD?: number; customerName?: string; tableNumber?: number; type?: 'mesa' | 'delivery' | 'pickup' | 'credito' | 'llevar'; }) => Promise<Order>;
  processPayment: (

    orderId: string,
    method: PaymentMethod,
    amountUSD?: number,
    amountCOP?: number,
    splitPayments?: any[],
    details?: {
      payerName?: string;
      cashTenderedUSD?: number;
      cashTenderedCOP?: number;
      changeGivenUSD?: number;
      changeGivenCOP?: number;
      changeGivenBs?: number;
      cashTenderedBs?: number;
      itemIds?: string[];
    }
  ) => Promise<void>;
  registerLedgerEntry: (orderId: string, entry: {
    entryType: 'payment' | 'change';
    currency: 'USD' | 'COP' | 'Bs';
    amountLocal: number;
    paymentMethod: PaymentMethod;
    payerName?: string;
    itemIds?: string[];
  }) => Promise<Order>;
  finalizeOrder: (orderId: string) => Promise<void>;
  closeOrderAsCredit: (orderId: string, debtorName: string, notes?: string) => Promise<Order>;
  reopenOrder: (orderId: string) => Promise<void>;
  deletePaymentEntry: (orderId: string, paymentId: string) => Promise<Order>;
  mergeOrders: (targetOrderId: string, sourceOrderIds: string[]) => Promise<void>;
  changeOrderTable: (orderId: string, newTableNumber: number) => Promise<Order>;
  transferOrderService: (
    orderId: string,
    transferData: {
      action: 'change-table' | 'to-mesa' | 'to-delivery' | 'to-pickup' | 'assign-delivery-items';
      newTableNumber?: number;
      customerName?: string;
      deliveryFeeUSD?: number;
      selectedItemIds?: string[];
    }
  ) => Promise<Order>;
  appendOrderItems: (orderId: string, addedItems: OrderItem[], removedItemIds?: string[], targetPrinter?: 'cocina' | 'caja' | 'ambas' | 'ninguna', deliveryFeeUSD?: number, customerName?: string, kitchenNotes?: string) => Promise<void>;
  expandOrderItemsForSplit: (orderId: string) => Promise<Order>;

  aperturarCajaChica: (usdCash: number, copCash: number) => Promise<void>;
  addCajaTransaction: (trans: { type: 'ingreso' | 'egreso'; amountUSD: number; amountCOP: number; amountBs: number; paymentMethod: string; description: string }) => Promise<void>;
  realizarCierreCaja: (actualUSD?: number, actualCOP?: number, notes?: string) => Promise<any>;
  obtenerReporteDiario: () => Promise<any>;
  fetchReporteIntervalo: (from: string, to: string) => Promise<any>;
  printReporteIntervalo: (reportType: 'contable' | 'pizzas' | 'ingresos' | 'egresos' | 'cocina', data: any, targetPrinter?: 'cocina' | 'caja' | 'ambas') => Promise<void>;
  printOrderReceipt: (orderId: string, targetPrinter?: 'cocina' | 'caja' | 'ambas') => Promise<void>;
  reprintKitchenOrder: (orderId: string, targetPrinter?: 'cocina' | 'caja' | 'ambas') => Promise<void>;
  getPrintersConfig: () => Promise<DualPrintersConfig>;
  updatePrintersConfig: (config: Partial<DualPrintersConfig>) => Promise<DualPrintersConfig>;
  testPrinter: (targetPrinter: 'cocina' | 'caja' | 'ambas') => Promise<any>;
  updateExchangeRates: (newRates: Partial<ExchangeRates>) => Promise<void>;
  queryCajaAI: (message: string) => Promise<string>;
  verifyAdminPin: (pin: string) => Promise<boolean>;
  getAdminPin: () => Promise<string>;
  updateAdminPin: (newPin: string) => Promise<void>;

  // Admin CRUD Actions (Persisted to Database / JSON)
  addProduct: (product: Omit<Product, 'id'> & { id?: string }) => Promise<void>;
  updateProduct: (id: string, data: Omit<Product, 'id'>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  addIngredient: (ing: Omit<Ingredient, 'id'> & { id?: string }) => Promise<void>;
  updateIngredient: (id: string, data: Partial<Ingredient>) => Promise<void>;
  deleteIngredient: (id: string) => Promise<void>;
  addTable: (table: { number: number; name: string; capacity: number; zone: string }) => Promise<void>;
  updateTable: (id: string, data: { number: number; name: string; capacity: number; zone: string }) => Promise<void>;
  deleteTable: (id: string) => Promise<void>;
  purgeAllOrders: () => Promise<void>;

  // Server connection status & backend URL
  isConnected: boolean;
  syncError: string | null;
  backendUrl: string;
  updateServerIp: (newIp: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const getInitialBackendUrl = (): string => {
  // El cliente web consulta /api/connection-info antes de iniciar la sincronización.
  if (typeof document !== 'undefined') return '';

  // La app nativa usa la IP LAN incluida en su paquete.
  try {
    const lanConfig = require('../config/lanConfig.json');
    if (lanConfig && lanConfig.backendUrl) return lanConfig.backendUrl;
  } catch (e) {}

  // Respaldo manual para clientes nativos con una configuración específica.
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    const savedIp = window.localStorage.getItem('basilico_server_ip');
    if (savedIp) {
      const cleanIp = savedIp.trim();
      if (cleanIp) {
        return cleanIp.startsWith('http') ? cleanIp : `http://${cleanIp}:3001`;
      }
    }
  }

  return '';
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [backendUrl, setBackendUrlState] = useState<string>(getInitialBackendUrl);

  const updateServerIp = useCallback((newIp: string) => {
    let cleanIp = newIp.trim();
    if (!cleanIp) return;
    if (!cleanIp.startsWith('http://') && !cleanIp.startsWith('https://')) {
      if (cleanIp.includes(':')) {
        cleanIp = `http://${cleanIp}`;
      } else {
        cleanIp = `http://${cleanIp}:3001`;
      }
    }
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      window.localStorage.setItem('basilico_server_ip', cleanIp);
    }
    setBackendUrlState(cleanIp);
  }, []);

  const [userSession, setUserSession] = useState<UserSession | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem('basilico_user_session');
        window.localStorage.removeItem('crispy_user_session');
        window.localStorage.removeItem('mugrosito_user_session');
      } catch (e) {}

      if (typeof window.sessionStorage !== 'undefined') {
        const saved = window.sessionStorage.getItem('mugrosito_user_session') || window.sessionStorage.getItem('crispy_user_session');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (parsed && parsed.sessionToken) return parsed;
          } catch (e) {}
        }
      }
    }
    return null;
  });

  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    let isActive = true;
    const resolveLanBackend = async () => {
      try {
        const response = await fetch('/api/connection-info', { cache: 'no-store' });
        const connectionInfo = await response.json();
        if (!response.ok || !connectionInfo.backendUrl) {
          throw new Error('El servidor no tiene una IP LAN disponible.');
        }
        if (isActive) {
          setBackendUrlState(connectionInfo.backendUrl);
          setSyncError(null);
        }
      } catch (error) {
        if (isActive) {
          setIsConnected(false);
          setSyncError('No se pudo detectar la IP LAN del servidor.');
        }
      }
    };

    resolveLanBackend();
    const intervalId = window.setInterval(resolveLanBackend, 10000);
    return () => {
      isActive = false;
      window.clearInterval(intervalId);
    };
  }, []);
  
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [exchangeRates, setExchangeRates] = useState<ExchangeRates>({ COP: 3100, Bs: 3.20 });
  
  const [cajaChicaApertura, setCajaChicaApertura] = useState<CajaChicaApertura>({ usdCash: 0, copCash: 0 });
  const [cajaChicaTransactions, setCajaChicaTransactions] = useState<CajaChicaTransaction[]>([]);
  const [ultimoCierre, setUltimoCierre] = useState<CajaChicaCierre | null>(null);

  const logout = useCallback(() => {
    setUserSession(null);
    if (typeof window !== 'undefined') {
      if (typeof window.sessionStorage !== 'undefined') {
        window.sessionStorage.removeItem('mugrosito_user_session');
        window.sessionStorage.removeItem('crispy_user_session');
      }
      try {
        window.localStorage.removeItem('basilico_user_session');
        window.localStorage.removeItem('crispy_user_session');
        window.localStorage.removeItem('mugrosito_user_session');
      } catch (e) {}
    }
  }, []);

  const apiFetch = useCallback((url: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers);
    if (userSession?.sessionToken) {
      headers.set('Authorization', `Bearer ${userSession.sessionToken}`);
      headers.set('x-mugrosito-token', userSession.sessionToken);
      headers.set('x-crispy-token', userSession.sessionToken);
      headers.set('x-basilico-session', userSession.sessionToken);
    }
    return fetch(url, { ...options, headers }).then((res) => {
      if (res.status === 401 && typeof window !== 'undefined') {
        logout();
      }
      return res;
    });
  }, [userSession?.sessionToken, logout]);

  // Fetch Functions
  const fetchProducts = useCallback(async () => {
    try {
      const res = await apiFetch(`${backendUrl}/api/products`);
      if (res.ok) setProducts(await res.json());
    } catch (e) {}
  }, [apiFetch, backendUrl]);

  const fetchIngredients = useCallback(async () => {
    try {
      const res = await apiFetch(`${backendUrl}/api/ingredients`);
      if (res.ok) setIngredients(await res.json());
    } catch (e) {}
  }, [apiFetch, backendUrl]);

  const fetchTables = useCallback(async () => {
    try {
      const res = await apiFetch(`${backendUrl}/api/tables`);
      if (res.ok) setTables(await res.json());
    } catch (e) {}
  }, [apiFetch, backendUrl]);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await apiFetch(`${backendUrl}/api/orders`);
      if (res.ok) setOrders(await res.json());
    } catch (e) {}
  }, [apiFetch, backendUrl]);

  const fetchCajaChica = useCallback(async () => {
    try {
      const res = await apiFetch(`${backendUrl}/api/caja-chica`);
      if (res.ok) {
        const data = await res.json();
        if (data.apertura) setCajaChicaApertura(data.apertura);
        if (data.transacciones) setCajaChicaTransactions(data.transacciones);
        if (data.ultimoCierre) setUltimoCierre(data.ultimoCierre);
      }
    } catch (e) {}
  }, [apiFetch, backendUrl]);

  const fetchRates = useCallback(async () => {
    try {
      const res = await apiFetch(`${backendUrl}/api/rates`);
      if (res.ok) setExchangeRates(await res.json());
    } catch (e) {}
  }, [apiFetch, backendUrl]);

  const refreshAllState = useCallback(() => {
    fetchProducts();
    fetchIngredients();
    fetchTables();
    fetchOrders();
    fetchCajaChica();
    fetchRates();
  }, [fetchProducts, fetchIngredients, fetchTables, fetchOrders, fetchCajaChica, fetchRates]);

  const requireApiSuccess = async (response: Response, fallbackMessage: string) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload.error || fallbackMessage;
      setSyncError(message);
      throw new Error(message);
    }
    setSyncError(null);
    return payload;
  };

  const login = async (usernameInput: string, passwordInput: string) => {
    try {
      const res = await fetch(`${backendUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput, password: passwordInput }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.user) {
          const session: UserSession = { username: data.user.username, role: data.user.role, shift: data.user.shift, sessionToken: data.user.sessionToken };
          setUserSession(session);
          if (typeof window !== 'undefined') {
            if (typeof window.sessionStorage !== 'undefined') {
              window.sessionStorage.setItem('mugrosito_user_session', JSON.stringify(session));
              window.sessionStorage.removeItem('crispy_user_session');
            }
            try {
              window.localStorage.removeItem('basilico_user_session');
              window.localStorage.removeItem('crispy_user_session');
              window.localStorage.removeItem('mugrosito_user_session');
            } catch (e) {}
          }
          return { success: true, user: session };
        }
      }
      return { success: false, error: 'Credenciales inválidas. Verifica usuario y contraseña.' };
    } catch (e) {
      return {
        success: false,
        error: `⚠️ Sin conexión a la PC Servidor (${backendUrl}). Verifica que el servidor esté encendido y la IP configurada.`,
      };
    }
  };



  useEffect(() => {
    if (!backendUrl || !userSession?.sessionToken) {
      setIsConnected(false);
      return;
    }

    const socket: Socket = io(backendUrl, {
      auth: {
        token: userSession?.sessionToken,
        sessionToken: userSession?.sessionToken,
      },
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      timeout: 5000,
    });

    socket.on('connect', () => {
      setIsConnected(true);
      setSyncError(null);
      refreshAllState();
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      setSyncError('Conexión en tiempo real interrumpida. Se reintentará automáticamente.');
    });

    socket.on('connect_error', (error) => {
      setIsConnected(false);
      if (error.message && error.message.toLowerCase().includes('sesión')) {
        logout();
        setSyncError('La sesión venció o no es válida. Inicia sesión nuevamente.');
        return;
      }
      setSyncError(`No se pudo conectar al servidor en ${backendUrl}.`);
    });

    socket.on('order:created', (newOrder: Order) => {
      setOrders((prev) => [newOrder, ...prev.filter((o) => o.id !== newOrder.id)]);
      // Silenciado totalmente a petición del cliente
    });

    socket.on('order:status_updated', (updatedOrder: Order) => {
      setOrders((prev) => prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o)));
    });

    socket.on('order:prepared_sound', () => {
      soundService.playOrderReadySound();
    });

    socket.on('order:cancelled_sound', () => {
      // Silenciado a petición del cliente
    });

    socket.on('order:cancelled', (cancelledOrder: any) => {
      if (!cancelledOrder || !cancelledOrder.id) return;
      if (cancelledOrder.status === 'cancelado' && cancelledOrder.type) {
        setOrders((prev) => prev.map((o) => (o.id === cancelledOrder.id ? { ...o, ...cancelledOrder } : o)));
      } else {
        setOrders((prev) => prev.filter((o) => o.id !== cancelledOrder.id));
      }
    });

    socket.on('order:deleted', (deletedData: { id: string }) => {
      if (deletedData && deletedData.id) {
        setOrders((prev) => prev.filter((o) => o.id !== deletedData.id));
      }
    });

    socket.on('order:edited', (editedOrder: Order) => {
      setOrders((prev) => prev.map((o) => (o.id === editedOrder.id ? editedOrder : o)));
    });

    socket.on('order:print_failed', (printFailure: { orderNumber?: string; message?: string }) => {
      setSyncError(`La comanda ${printFailure.orderNumber || ''} fue guardada, pero no se imprimió: ${printFailure.message || 'verifica la impresora térmica.'}`);
    });

    socket.on('order:paid', (updatedOrder: Order) => {
      setOrders((prev) => prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o)));
      fetchCajaChica();
    });

    socket.on('orders:sync', (allOrders: Order[]) => {
      setOrders(allOrders);
    });

    socket.on('products:sync', (allProducts: Product[]) => {
      setProducts(allProducts);
    });

    socket.on('ingredients:sync', (allIngredients: Ingredient[]) => {
      setIngredients(allIngredients);
    });

    socket.on('tables:sync', (allTables: Table[]) => {
      setTables(allTables);
    });

    socket.on('caja:updated', () => {
      fetchCajaChica();
    });

    socket.on('rates:updated', (newRates: ExchangeRates) => {
      setExchangeRates(newRates);
    });

    return () => {
      socket.disconnect();
    };
  }, [backendUrl, refreshAllState, fetchCajaChica, userSession?.sessionToken, logout]);

  const createOrder = async (orderData: {
    type: 'mesa' | 'delivery' | 'pickup';
    tableNumber?: number;
    customerName?: string;
    kitchenNotes?: string;
    items: OrderItem[];
    totalUSD: number;
    deliveryFeeUSD?: number;
    targetPrinter?: 'cocina' | 'caja' | 'ambas' | 'ninguna';
  }) => {
    const res = await apiFetch(`${backendUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...orderData,
        waiterName: userSession?.username || 'Mesero',
        shift: userSession?.shift || 'ambos',
      }),
    });
    const created = await requireApiSuccess(res, 'No se pudo crear la comanda en el servidor.');
    setOrders((prev) => [created, ...prev.filter((order) => order.id !== created.id)]);
    // Silenciado totalmente a petición del cliente
  };

  const updateOrderStatus = async (orderId: string, status: OrderStatus) => {
    const res = await apiFetch(`${backendUrl}/api/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const updated = await requireApiSuccess(res, 'No se pudo actualizar el estado de la comanda.');
    setOrders((prev) => prev.map((order) => (order.id === orderId ? updated : order)));
  };

  const cancelOrder = async (orderId: string) => {
    const res = await apiFetch(`${backendUrl}/api/orders/${orderId}/cancel`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await requireApiSuccess(res, 'No se pudo cancelar la comanda.');
    setOrders((prev) => prev.map((order) => (order.id === orderId ? data.order : order)));
  };

  const deleteOrder = async (orderId: string) => {
    const res = await apiFetch(`${backendUrl}/api/orders/${orderId}`, {
      method: 'DELETE',
    });
    await requireApiSuccess(res, 'No se pudo anular la comanda.');
    setOrders((prev) => prev.filter((order) => order.id !== orderId));
  };

  const editOrder = async (orderId: string, editData: { items: OrderItem[]; kitchenNotes?: string; totalUSD: number; deliveryFeeUSD?: number; customerName?: string; tableNumber?: number; type?: 'mesa' | 'delivery' | 'pickup' | 'credito' | 'llevar'; }) => {
    if (userSession?.role !== 'admin' && userSession?.role !== 'caja') {
      throw new Error('Solo un administrador o usuario de caja puede editar una comanda.');
    }
    const res = await apiFetch(`${backendUrl}/api/orders/${orderId}/edit`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...editData, actorRole: userSession?.role || 'caja' }),
    });
    const response = await requireApiSuccess(res, 'No se pudo editar la comanda.');
    setOrders((prev) => prev.map((order) => (order.id === orderId ? response : order)));
    return response as Order;
  };

  const processPayment = async (
    orderId: string,
    method: PaymentMethod,
    amountUSD?: number,
    amountCOP?: number,
    splitPayments?: any[],
    details?: {
      payerName?: string;
      cashTenderedUSD?: number;
      cashTenderedCOP?: number;
      cashTenderedBs?: number;
      changeGivenUSD?: number;
      changeGivenCOP?: number;
      changeGivenBs?: number;
      itemIds?: string[];
      isDraft?: boolean;
    }
  ) => {
    const payload = {
      paymentMethod: method,
      amountUSD,
      amountCOP,
      splitPayments,
      payerName: details?.payerName,
      cashTenderedUSD: details?.cashTenderedUSD,
      cashTenderedCOP: details?.cashTenderedCOP,
      cashTenderedBs: details?.cashTenderedBs,
      changeGivenUSD: details?.changeGivenUSD,
      changeGivenCOP: details?.changeGivenCOP,
      changeGivenBs: details?.changeGivenBs,
      itemIds: details?.itemIds,
      isDraft: details?.isDraft,
      shift: userSession?.shift || 'ambos',
    };
    const res = await apiFetch(`${backendUrl}/api/orders/${orderId}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const updated = await requireApiSuccess(res, 'No se pudo registrar el pago.');
    setOrders((prev) => prev.map((order) => (order.id === orderId ? updated : order)));
    fetchCajaChica();
  };

  const registerLedgerEntry = async (
    orderId: string,
    entry: {
      entryType: 'payment' | 'change';
      currency: 'USD' | 'COP' | 'Bs';
      amountLocal: number;
      paymentMethod: PaymentMethod;
      payerName?: string;
      itemIds?: string[];
    }
  ) => {
    const res = await apiFetch(`${backendUrl}/api/orders/${orderId}/ledger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...entry, shift: userSession?.shift || 'ambos' }),
    });
    const response = await requireApiSuccess(res, 'No se pudo registrar el movimiento.');
    setOrders((prev) => prev.map((order) => (order.id === orderId ? response : order)));
    fetchCajaChica();
    return response as Order;
  };

  const finalizeOrder = async (orderId: string) => {
    const res = await apiFetch(`${backendUrl}/api/orders/${orderId}/finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await requireApiSuccess(res, 'No se pudo finalizar la comanda.');
    setOrders((prev) => prev.map((order) => (order.id === orderId ? response : order)));
  };

  const reopenOrder = async (orderId: string) => {
    const res = await apiFetch(`${backendUrl}/api/orders/${orderId}/reopen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const updated = await requireApiSuccess(res, 'No se pudo reactivar la comanda.');
    setOrders((prev) => prev.map((order) => (order.id === orderId ? updated : order)));
  };

  const closeOrderAsCredit = async (orderId: string, debtorName: string, notes?: string) => {
    const res = await apiFetch(`${backendUrl}/api/orders/${orderId}/credit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ debtorName, notes }),
    });
    const response = await requireApiSuccess(res, 'No se pudo cerrar la cuenta a crédito.');
    setOrders((prev) => prev.map((order) => (order.id === orderId ? response : order)));
    fetchCajaChica();
    return response as Order;
  };

  const deletePaymentEntry = async (orderId: string, paymentId: string) => {
    const res = await apiFetch(`${backendUrl}/api/orders/${orderId}/payments/${paymentId}`, {
      method: 'DELETE',
    });
    const response = await requireApiSuccess(res, 'No se pudo eliminar el registro.');
    setOrders((prev) => prev.map((order) => (order.id === orderId ? response : order)));
    fetchCajaChica();
    return response as Order;
  };

  const mergeOrders = async (targetOrderId: string, sourceOrderIds: string[]) => {
    const res = await apiFetch(`${backendUrl}/api/orders/merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetOrderId, sourceOrderIds }),
    });
    await requireApiSuccess(res, 'No se pudieron unificar las comandas.');
    fetchOrders();
  };

  const changeOrderTable = async (orderId: string, newTableNumber: number) => {
    const res = await apiFetch(`${backendUrl}/api/orders/${orderId}/change-table`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newTableNumber }),
    });
    const response = await requireApiSuccess(res, 'No se pudo cambiar la mesa de la comanda.');
    setOrders((prev) => prev.map((order) => (order.id === orderId ? response : order)));
    fetchTables();
    return response as Order;
  };

  const transferOrderService = async (
    orderId: string,
    transferData: {
      action: 'change-table' | 'to-mesa' | 'to-delivery' | 'to-pickup' | 'assign-delivery-items';
      newTableNumber?: number;
      customerName?: string;
      deliveryFeeUSD?: number;
      selectedItemIds?: string[];
    }
  ) => {
    const res = await apiFetch(`${backendUrl}/api/orders/${orderId}/transfer-service`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(transferData),
    });
    const response = await requireApiSuccess(res, 'No se pudo transferir o cambiar el servicio de la comanda.');
    setOrders((prev) => prev.map((order) => (order.id === orderId ? response : order)));
    fetchTables();
    return response as Order;
  };

  const appendOrderItems = async (
    orderId: string,
    addedItems: OrderItem[],
    removedItemIds: string[] = [],
    targetPrinter: 'cocina' | 'caja' | 'ambas' | 'ninguna' = 'cocina',
    deliveryFeeUSD?: number,
    customerName?: string,
    kitchenNotes?: string
  ) => {
    const res = await apiFetch(`${backendUrl}/api/orders/${orderId}/append-items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addedItems, removedItemIds, targetPrinter, deliveryFeeUSD, customerName, kitchenNotes }),
    });
    const response = await requireApiSuccess(res, 'No se pudo adicionar productos a la comanda.');
    if (response?.order) {
      setOrders((prev) => prev.map((order) => (order.id === orderId ? response.order : order)));
    } else {
      fetchOrders();
    }
  };

  const aperturarCajaChica = async (usdCash: number, copCash: number) => {
    const res = await apiFetch(`${backendUrl}/api/caja-chica/apertura`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usdCash, copCash, shift: userSession?.shift || 'ambos' }),
    });
    await requireApiSuccess(res, 'No se pudo aperturar la caja.');
    fetchCajaChica();
  };

  const addCajaTransaction = async (trans: {
    type: 'ingreso' | 'egreso';
    amountUSD: number;
    amountCOP: number;
    amountBs: number;
    paymentMethod: string;
    description: string;
  }) => {
    const res = await apiFetch(`${backendUrl}/api/caja-chica/transaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...trans, shift: userSession?.shift || 'ambos' }),
    });
    await requireApiSuccess(res, 'No se pudo registrar el movimiento de caja.');
    fetchCajaChica();
  };

  const realizarCierreCaja = async (actualUSD?: number, actualCOP?: number, notes?: string) => {
    const res = await apiFetch(`${backendUrl}/api/caja-chica/cierre`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actualUSD, actualCOP, notes, closedBy: userSession?.username || 'Caja', shift: userSession?.shift || 'ambos' }),
    });
    const data = await requireApiSuccess(res, 'No se pudo cerrar la caja.');
    fetchCajaChica();
    return data;
  };

  const obtenerReporteDiario = async () => {
    try {
      const res = await apiFetch(`${backendUrl}/api/caja-chica/reporte-diario`);
      if (res.ok) return await res.json();
    } catch (e) {}
    return null;
  };

  const fetchReporteIntervalo = async (from: string, to: string) => {
    try {
      const params = new URLSearchParams({ from, to });
      const res = await apiFetch(`${backendUrl}/api/caja/reporte-intervalo?${params.toString()}`);
      if (res.ok) return await res.json();
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Error al obtener reporte por intervalo.');
    } catch (e: any) {
      setSyncError(e.message || 'Error al obtener reporte por intervalo.');
      throw e;
    }
  };

  const printReporteIntervalo = async (
    reportType: 'contable' | 'pizzas' | 'ingresos' | 'egresos' | 'cocina',
    data: any,
    targetPrinter: 'cocina' | 'caja' | 'ambas' = 'caja'
  ) => {
    const res = await apiFetch(`${backendUrl}/api/caja/reporte-intervalo/imprimir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportType, data, targetPrinter }),
    });
    await requireApiSuccess(res, 'No se pudo imprimir el reporte térmico.');
  };

  const printOrderReceipt = async (orderId: string, targetPrinter: 'cocina' | 'caja' | 'ambas' = 'caja') => {
    const res = await apiFetch(`${backendUrl}/api/orders/${orderId}/print-receipt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetPrinter, rates: exchangeRates }),
    });
    await requireApiSuccess(res, 'No se pudo enviar la pre-cuenta a la impresora térmica.');
  };

  const reprintKitchenOrder = async (orderId: string, targetPrinter: 'cocina' | 'caja' | 'ambas' = 'cocina') => {
    const res = await apiFetch(`${backendUrl}/api/orders/${orderId}/reprint-kitchen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetPrinter }),
    });
    await requireApiSuccess(res, 'No se pudo reimprimir la comanda de cocina.');
  };

  const expandOrderItemsForSplit = async (orderId: string): Promise<Order> => {
    const res = await apiFetch(`${backendUrl}/api/orders/${orderId}/expand-split-items`, {
      method: 'POST',
    });
    const data = await requireApiSuccess(res, 'No se pudo preparar la división de ítems.');
    return data.order;
  };

  const getPrintersConfig = async (): Promise<DualPrintersConfig> => {
    const res = await apiFetch(`${backendUrl}/api/printers/config`);
    return await requireApiSuccess(res, 'No se pudo obtener la configuración de impresoras.');
  };

  const updatePrintersConfig = async (config: Partial<DualPrintersConfig>): Promise<DualPrintersConfig> => {
    const res = await apiFetch(`${backendUrl}/api/printers/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    const data = await requireApiSuccess(res, 'No se pudo guardar la configuración de impresoras.');
    return data.config;
  };

  const testPrinter = async (targetPrinter: 'cocina' | 'caja' | 'ambas' = 'caja') => {
    const res = await apiFetch(`${backendUrl}/api/printers/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetPrinter }),
    });
    return await requireApiSuccess(res, `No se pudo conectar con la impresora (${targetPrinter}).`);
  };

  const verifyAdminPin = async (pin: string): Promise<boolean> => {
    try {
      const res = await apiFetch(`${backendUrl}/api/auth/verify-admin-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      if (res.ok) {
        const data = await res.json();
        return !!data.valid;
      }
      return false;
    } catch {
      return false;
    }
  };

  const getAdminPin = async (): Promise<string> => {
    const res = await apiFetch(`${backendUrl}/api/auth/admin-pin`);
    const data = await requireApiSuccess(res, 'No se pudo consultar el PIN de administrador.');
    return data.pin || '1234';
  };

  const updateAdminPin = async (newPin: string): Promise<void> => {
    const res = await apiFetch(`${backendUrl}/api/auth/admin-pin`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: newPin }),
    });
    await requireApiSuccess(res, 'No se pudo actualizar el PIN de administrador.');
  };

  const updateExchangeRates = async (newRates: Partial<ExchangeRates>) => {
    const updated = { ...exchangeRates, ...newRates };
    const res = await apiFetch(`${backendUrl}/api/rates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    await requireApiSuccess(res, 'No se pudieron actualizar las tasas.');
    setExchangeRates(updated);
  };

  const queryCajaAI = async (message: string): Promise<string> => {
    try {
      const res = await apiFetch(`${backendUrl}/api/caja/ai-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      if (res.ok) {
        const data = await res.json();
        return data.reply;
      }
    } catch (e) {}

    const lower = message.toLowerCase();
    const paidOrders = orders.filter((o) => o.paymentStatus === 'pagado');
    if (lower.includes('pizza') || lower.includes('vendida')) {
      const tally: Record<string, number> = {};
      paidOrders.forEach((o) => {
        o.items.forEach((it) => {
          tally[it.productName] = (tally[it.productName] || 0) + it.quantity;
        });
      });
      const entries = Object.entries(tally);
      if (entries.length === 0) return '🍕 No se registran pizzas cobradas hoy.';
      return `🍕 Pizzas Cobradas Hoy:\n` + entries.map(([n, q]) => `• ${n}: ${q} unidades`).join('\n');
    }
    return `🤖 Asistente de Caja: Hay ${orders.length} comandas registradas en el sistema.`;
  };

  // ADMIN CRUD ACTIONS (Persisted to Database / JSON)
  const addProduct = async (productData: Omit<Product, 'id'>) => {
    const res = await apiFetch(`${backendUrl}/api/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(productData),
    });
    await requireApiSuccess(res, 'No se pudo guardar el producto.');
    fetchProducts();
  };

  const updateProduct = async (id: string, productData: Omit<Product, 'id'>) => {
    const res = await apiFetch(`${backendUrl}/api/products/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(productData),
    });
    await requireApiSuccess(res, 'No se pudo actualizar el producto.');
    fetchProducts();
  };


  const deleteProduct = async (id: string) => {
    const res = await apiFetch(`${backendUrl}/api/products/${id}`, { method: 'DELETE' });
    await requireApiSuccess(res, 'No se pudo eliminar el producto.');
    fetchProducts();
  };

  const addIngredient = async (ingData: Omit<Ingredient, 'id'>) => {
    const res = await apiFetch(`${backendUrl}/api/ingredients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ingData),
    });
    await requireApiSuccess(res, 'No se pudo guardar el ingrediente.');
    fetchIngredients();
  };

  const updateIngredient = async (id: string, ingData: Partial<Ingredient>) => {
    const res = await apiFetch(`${backendUrl}/api/ingredients/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ingData),
    });
    await requireApiSuccess(res, 'No se pudo actualizar el ingrediente.');
    fetchIngredients();
  };


  const deleteIngredient = async (id: string) => {
    const res = await apiFetch(`${backendUrl}/api/ingredients/${id}`, { method: 'DELETE' });
    await requireApiSuccess(res, 'No se pudo eliminar el ingrediente.');
    fetchIngredients();
  };

  const addTable = async (tableData: { number: number; name: string; capacity: number; zone: string }) => {
    const res = await apiFetch(`${backendUrl}/api/tables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tableData),
    });
    await requireApiSuccess(res, 'No se pudo guardar la mesa.');
    fetchTables();
  };

  const updateTable = async (id: string, tableData: { number: number; name: string; capacity: number; zone: string }) => {
    const res = await apiFetch(`${backendUrl}/api/tables/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tableData),
    });
    await requireApiSuccess(res, 'No se pudo actualizar la mesa.');
    fetchTables();
  };


  const deleteTable = async (id: string) => {
    const res = await apiFetch(`${backendUrl}/api/tables/${id}`, { method: 'DELETE' });
    await requireApiSuccess(res, 'No se pudo eliminar la mesa.');
    fetchTables();
  };

  const purgeAllOrders = async () => {
    const res = await apiFetch(`${backendUrl}/api/orders/purge-all`, { method: 'DELETE' });
    await requireApiSuccess(res, 'No se pudieron eliminar las comandas.');
    setOrders([]);
  };

  const extras = ingredients.filter((i) => i.isExtraForPizza);

  return (
    <AppContext.Provider
      value={{
        userSession,
        login,
        logout,
        products,
        ingredients,
        extras,
        tables,
        orders,
        exchangeRates,
        cajaChicaApertura,
        cajaChicaTransactions,
        ultimoCierre,
        syncError,
        createOrder,
        updateOrderStatus,
        cancelOrder,
        deleteOrder,
        editOrder,
        processPayment,
        registerLedgerEntry,
        finalizeOrder,
        closeOrderAsCredit,
        reopenOrder,
        deletePaymentEntry,
        mergeOrders,
        changeOrderTable,
        transferOrderService,
        appendOrderItems,
        expandOrderItemsForSplit,
        aperturarCajaChica,
        addCajaTransaction,
        realizarCierreCaja,
        obtenerReporteDiario,
        fetchReporteIntervalo,
        printReporteIntervalo,
        printOrderReceipt,
        reprintKitchenOrder,
        getPrintersConfig,
        updatePrintersConfig,
        testPrinter,
        updateExchangeRates,
        queryCajaAI,
        verifyAdminPin,
        getAdminPin,
        updateAdminPin,
        addProduct,
        updateProduct,
        deleteProduct,
        addIngredient,
        updateIngredient,
        deleteIngredient,
        addTable,
        updateTable,
        deleteTable,
        purgeAllOrders,
        isConnected,
        backendUrl,
        updateServerIp,
      }}

    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp debe ser usado dentro de un AppProvider');
  }
  return context;
};
