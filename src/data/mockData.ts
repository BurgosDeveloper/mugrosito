export interface RecipeIngredient {
  ingredientId: string;
  quantity: number;
  unit: string;
}

export interface Product {
  id: string;
  name: string;
  category: 'Hot Dogs' | 'Hamburguesas' | 'Bebidas' | 'Acompañantes' | 'Combos' | 'Pizzas' | 'Platos' | string;
  drinkType?: 'refresco' | 'jugo' | 'licor' | 'granizado' | 'te' | 'agua' | string;
  price: number; // En USD
  priceSmall?: number; // En USD (retrocompatibilidad)
  description: string;
  image: string;
  badge?: string;
  baseIngredients?: string[];
  proteinCount?: number;
  defaultProteins?: string[];
  flavors?: string[];
  recipe: RecipeIngredient[];
  shift?: 'manana' | 'noche' | 'ambos';
}

export interface Ingredient {
  id: string;
  name: string;
  priceUSD: number;
  ingredientType?: 'proteina' | 'gratis' | 'adicional' | 'base' | 'salsa';
  isBase?: boolean;
  isExtra?: boolean;
  priceGrandeCompleta?: number;
  priceGrandeMitad?: number;
  pricePequenaCompleta?: number;
  pricePequenaMitad?: number;
  isBaseForPizza?: boolean;
  isExtraForPizza?: boolean;
  category?: string;
  available?: boolean;
  shift?: 'manana' | 'noche' | 'ambos';
}

// Alias de retrocompatibilidad
export type ExtraIngredient = Ingredient;

export interface Table {
  id: string;
  number: number;
  name: string;
  capacity: number;
  status: 'libre' | 'ocupada' | 'cuenta_pedida' | 'reservada';
  activeOrderId?: string;
  zone: string;
}

export interface OrderItemExtra {
  name: string;
  price: number;
  quantity?: number;
  unitPrice?: number;
}

export interface HalfDetails {
  half1Name: string;
  half2Name: string;
  half1Removed?: string[];
  half2Removed?: string[];
  half1Extras?: OrderItemExtra[];
  half2Extras?: OrderItemExtra[];
}

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  price: number;
  quantity: number;
  category?: string;
  drinkType?: 'refresco' | 'jugo' | 'licor' | string;
  size?: 'Grande' | 'Pequeña';
  isHalfHalf?: boolean;
  halfDetails?: HalfDetails;
  modifiers?: string[];
  proteins?: string[];
  defaultProteins?: string[];
  removedIngredients?: string[];
  extras?: OrderItemExtra[];
  sugarPreference?: 'Con azúcar' | 'Sin azúcar' | 'Poca azúcar' | string;
  isTakeaway?: boolean;
  isDelivery?: boolean;
  isCut?: boolean;
  cutPreference?: 'Picada' | 'Entera';
  isNewOrModified?: boolean;
  isPaidIndividually?: boolean;
  paidByName?: string;
  flavor?: string;
  notes?: string;
}

export type OrderStatus = 'en_preparacion' | 'preparada' | 'entregada' | 'cancelado' | 'fusionada';
export type PaymentStatus = 'no_pagado' | 'pagado' | 'credito';
export type PaymentMethod = 'Efectivo USD' | 'Efectivo COP' | 'Zelle' | 'Binance' | 'Bancolombia' | 'Nequi' | 'Pago Móvil' | 'Tarjeta de Crédito' | 'Tarjeta de Débito' | 'Mixto' | 'Crédito';

export interface SplitPayment {
  method: PaymentMethod;
  amountUSD: number;
  amountCOP?: number;
  amountBs?: number;
}

export interface OrderPaymentBreakdown {
  id: string;
  orderId: string;
  payerName?: string;
  paymentMethod: PaymentMethod;
  amountPaidUSD: number;
  cashTenderedUSD?: number;
  cashTenderedCOP?: number;
  cashTenderedBs?: number;
  changeGivenUSD?: number;
  changeGivenCOP?: number;
  changeGivenBs?: number;
  copRate?: number;
  bsRate?: number;
  entryType?: 'payment' | 'change';
  method?: string;
  currency?: string;
  itemIds?: string[];
  createdAt: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  type: 'mesa' | 'delivery' | 'pickup' | 'credito';
  tableNumber?: number;
  customerName?: string;
  customerPhone?: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  items: OrderItem[];
  totalUSD: number;
  totalCOP?: number;
  paidAmountUSD?: number;
  mergedFromOrders?: string[];
  paymentHistory?: OrderPaymentBreakdown[];
  copRateAtPayment?: number;
  bsRateAtPayment?: number;
  createdAt: string; // ISO String
  elapsedMinutes?: number;
  paymentMethod?: PaymentMethod;
  splitPayments?: SplitPayment[];
  paymentReference?: string;
  waiterName?: string;
  isEdited?: boolean;
  notes?: string;
  kitchenNotes?: string;
  shift?: 'manana' | 'noche' | 'ambos';
  deliveryFeeUSD?: number;
  deliveryFeeCOP?: number;
}



export interface CajaChicaTransaction {
  id: string;
  timestamp: string;
  type: 'ingreso' | 'egreso';
  amountUSD: number;
  amountCOP: number;
  amountBs: number;
  currency: string;
  paymentMethod: string;
  description: string;
  orderId?: string;
  orderReference: string;
  shift?: 'manana' | 'noche' | 'ambos';
}

export interface CajaChicaApertura {
  usdCash: number;
  copCash: number;
  openedAt?: string;
  shift?: 'manana' | 'noche' | 'ambos';
}

export interface CajaChicaCierre {
  id: string;
  openedUSD: number;
  openedCOP: number;
  totalSalesUSD: number;
  expectedUSD: number;
  expectedCOP: number;
  actualUSD: number;
  actualCOP: number;
  differenceUSD: number;
  differenceCOP: number;
  closedAt: string;
  closedBy?: string;
  notes?: string;
  shift?: 'manana' | 'noche' | 'ambos';
}

export interface ExchangeRates {
  COP: number;
  Bs: number;
}

export interface PrinterUnitConfig {
  name: string;
  enabled: boolean;
  connectionType?: 'lan' | 'usb';
  paperWidth?: '80mm' | '58mm';
  host: string;
  port: number;
  usbDeviceName?: string;
  timeoutMs: number;
  copies: number;
}

export interface DualPrintersConfig {
  cocina: PrinterUnitConfig;
  caja: PrinterUnitConfig;
}

export interface BurgerUnitConfig {
  unitIndex: number;
  proteins: string[];
  removedIngredients: string[];
  selectedFreeToppings: string[];
  selectedPaidExtras: { name: string; price: number; quantity?: number; unitPrice?: number }[];
  isTakeaway: boolean;
  isDelivery?: boolean;
  isCut: boolean;
  cutPreference: 'Picada' | 'Entera';
  notes: string;
  subtotalUSD: number;
}

export const INITIAL_EXCHANGE_RATES: ExchangeRates = {
  COP: 3100,
  Bs: 3.20,
};

// Arrays de respaldo para producción limpia
export const MOCK_EXTRAS: Ingredient[] = [];
export const MOCK_PRODUCTS: Product[] = [];
export const MOCK_TABLES: Table[] = [];
export const MOCK_ORDERS: Order[] = [];
