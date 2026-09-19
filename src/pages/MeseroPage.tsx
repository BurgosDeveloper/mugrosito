import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Product, OrderItem, Order, Ingredient } from '../data/mockData';
import { TableCompactGrid } from '../modules/mesero/TableCompactGrid';
import { ProductTextCatalog } from '../modules/mesero/ProductTextCatalog';
import { BurgerBuilderModal, BurgerOrderConfirmationItem } from '../modules/mesero/BurgerBuilderModal';
import { DrinkSelectorModal, DrinkOrderConfirmationItem } from '../modules/mesero/DrinkSelectorModal';
import { DeliveryConfigPanel } from '../modules/mesero/DeliveryConfigPanel';
import { OrderServiceTransferModal } from '../components/OrderServiceTransferModal';
import { OrderAppendModal } from '../components/OrderAppendModal';
import { OrderDetailModal } from '../components/OrderDetailModal';
import { OrderEditModal } from '../components/OrderEditModal';
import { PaymentLedgerModal } from '../components/PaymentLedgerModal';
import { PrinterSelectModal } from '../components/PrinterSelectModal';
import { roundCOP } from '../utils/currencyRounding';
import { areProteinsDefault, getCleanItemNote, normalizeProteinName, formatRemovedIngredients } from '../utils/burgerProteins';
import { isCustomizableProduct } from '../utils/productClassifier';

import {
  IoReaderOutline,
  IoClose,
  IoTrashOutline,
  IoPaperPlane,
  IoSwapHorizontal,
  IoWarningOutline,
  IoPrintOutline,
  IoPencilOutline,
} from 'react-icons/io5';

export const MeseroPage: React.FC = () => {
  const {
    tables,
    products,
    ingredients,
    orders,
    createOrder,
    updateOrderStatus,
    deleteOrder,
    editOrder,
    exchangeRates,
    userSession,
    reprintKitchenOrder,
    printOrderReceipt,
  } = useApp();

  const [searchParams, setSearchParams] = useSearchParams();
  const activeSubTab = searchParams.get('tab') || 'pedidos';

  // Target of active order (Mesa, Delivery, PickUp)
  const [activeOrderTarget, setActiveOrderTarget] = useState<{
    type: 'mesa' | 'delivery' | 'pickup';
    tableNumber?: number;
    title: string;
  } | null>(null);

  // Auto-abrir comanda si se navegó desde Caja u otra vista con query params (?type=delivery | pickup | mesa)
  useEffect(() => {
    const typeParam = searchParams.get('type');
    const tableParam = searchParams.get('table');
    if (typeParam === 'delivery') {
      setActiveOrderTarget({ type: 'delivery', title: 'Nuevo Pedido Delivery 🛵' });
      setDeliveryFeeUSD(2000);
      setShowDeliveryConfig(true);
    } else if (typeParam === 'pickup') {
      setActiveOrderTarget({ type: 'pickup', title: 'Nuevo Pedido PickUp 🛍️' });
      setShowDeliveryConfig(false);
    } else if (typeParam === 'mesa' && tableParam) {
      const tNum = parseInt(tableParam, 10);
      if (!isNaN(tNum)) {
        setActiveOrderTarget({ type: 'mesa', tableNumber: tNum, title: `Mesa #${tNum}` });
        setShowDeliveryConfig(false);
      }
    }
  }, [searchParams]);

  // Cart & Order Form State
  const [cartItems, setCartItems] = useState<OrderItem[]>([]);
  const [editingCartItem, setEditingCartItem] = useState<OrderItem | null>(null);
  const [customerName, setCustomerName] = useState<string>('');
  const [kitchenNotes, setKitchenNotes] = useState<string>('');
  const [deliveryFeeUSD, setDeliveryFeeUSD] = useState<number>(0);
  const [showDeliveryConfig, setShowDeliveryConfig] = useState<boolean>(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState<boolean>(false);
  const [sentAlert, setSentAlert] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [targetPrinter, setTargetPrinter] = useState<'cocina' | 'caja' | 'ambas' | 'ninguna'>('cocina');

  // Modals for Products
  const [selectedBurger, setSelectedBurger] = useState<Product | null>(null);
  const [selectedDrink, setSelectedDrink] = useState<Product | null>(null);

  // Secondary Modals for Orders
  const [tableChangeOrder, setTableChangeOrder] = useState<Order | null>(null);
  const [orderAppendModalOrder, setOrderAppendModalOrder] = useState<Order | null>(null);
  const [orderDetailModalOrder, setOrderDetailModalOrder] = useState<Order | null>(null);
  const [orderEditModalOrder, setOrderEditModalOrder] = useState<Order | null>(null);
  const [printerSelectOrder, setPrinterSelectOrder] = useState<Order | null>(null);
  const [printerSelectKitchenOrder, setPrinterSelectKitchenOrder] = useState<Order | null>(null);
  const [activeOrderForPay, setActiveOrderForPay] = useState<Order | null>(null);
  const [isCompactComandasView, setIsCompactComandasView] = useState<boolean>(() => {
    return localStorage.getItem('mugrosito_mesero_view_mode') !== 'expanded';
  });
  const [expandedOrderIds, setExpandedOrderIds] = useState<string[]>([]);
  const toggleExpandOrder = (orderId: string) => {
    setExpandedOrderIds((prev) =>
      prev.includes(orderId) ? prev.filter((id) => id !== orderId) : [...prev, orderId]
    );
  };

  // Catalog Filters
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const activeProducts = useMemo(() => {
    return products
      .filter((p) => !p.shift || p.shift === 'ambos' || p.shift === userSession?.shift)
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  }, [products, userSession?.shift]);

  const availableExtras = useMemo(() => {
    return ingredients
      .filter((i) => (i.isExtra || i.isExtraForPizza || i.ingredientType === 'adicional' || i.ingredientType === 'gratis' || i.category === 'Adicionales' || i.category === 'Toppings') && (!i.shift || i.shift === 'ambos' || i.shift === userSession?.shift))
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  }, [ingredients, userSession?.shift]);

  const availableFreeToppings = useMemo(() => {
    return ingredients
      .filter(
        (i) =>
          (i.ingredientType?.toLowerCase() === 'gratis' ||
            i.category?.toLowerCase() === 'gratis' ||
            i.category?.toLowerCase() === 'toppings gratis') &&
          (!i.shift || i.shift === 'ambos' || i.shift === userSession?.shift) &&
          i.available !== false
      )
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  }, [ingredients, userSession?.shift]);

  const availableSalsas = useMemo(() => {
    return ingredients
      .filter((i) => (i.ingredientType === 'salsa' || i.category === 'Salsas') && (!i.shift || i.shift === 'ambos' || i.shift === userSession?.shift))
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  }, [ingredients, userSession?.shift]);

  const availableProteins = useMemo(() => {
    return ingredients
      .filter(
        (i) =>
          (i.ingredientType === 'proteina' || i.category === 'Proteínas' || i.category === 'Carnes') &&
          (!i.shift || i.shift === 'ambos' || i.shift === userSession?.shift)
      )
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  }, [ingredients, userSession?.shift]);

  // Open order creation
  const handleOpenOrder = (type: 'mesa' | 'delivery' | 'pickup', tableNumber?: number, title?: string) => {
    setActiveOrderTarget({
      type,
      tableNumber,
      title: title || (type === 'delivery' ? 'Orden Delivery' : type === 'pickup' ? 'Orden Para Llevar' : `Mesa #${tableNumber}`),
    });
    setCartItems([]);
    setCustomerName('');
    setKitchenNotes('');
    setDeliveryFeeUSD(type === 'delivery' ? 2000 : 0);
    setShowDeliveryConfig(type === 'delivery');
    setOrderError(null);
  };

  const areCartItemsIdentical = (a: OrderItem, b: OrderItem): boolean => {
    if (a.productId !== b.productId) return false;
    if (Boolean(a.isTakeaway) !== Boolean(b.isTakeaway)) return false;
    if (Boolean(a.isDelivery) !== Boolean(b.isDelivery)) return false;
    if (Boolean(a.isCut) !== Boolean(b.isCut)) return false;
    if ((a.cutPreference || 'Entera') !== (b.cutPreference || 'Entera')) return false;
    if ((a.sugarPreference || '') !== (b.sugarPreference || '')) return false;
    if ((a.flavor || '') !== (b.flavor || '')) return false;
    if (getCleanItemNote(a.notes) !== getCleanItemNote(b.notes)) return false;

    const aProt = [...(a.proteins || [])].map(normalizeProteinName).sort().join('|');
    const bProt = [...(b.proteins || [])].map(normalizeProteinName).sort().join('|');
    if (aProt !== bProt) return false;

    const aRem = [...(a.removedIngredients || [])].sort().join('|');
    const bRem = [...(b.removedIngredients || [])].sort().join('|');
    if (aRem !== bRem) return false;

    const aExtras = (a.extras || []).map((e) => `${e.name}:${e.quantity || 1}:${e.price}`).sort().join('|');
    const bExtras = (b.extras || []).map((e) => `${e.name}:${e.quantity || 1}:${e.price}`).sort().join('|');
    if (aExtras !== bExtras) return false;

    return Math.abs(a.price - b.price) < 0.01;
  };

  const mergeCartItem = (cart: OrderItem[], item: OrderItem): OrderItem[] => {
    const matchIndex = cart.findIndex((existing) => areCartItemsIdentical(existing, item));
    if (matchIndex !== -1) {
      const updated = [...cart];
      updated[matchIndex] = {
        ...updated[matchIndex],
        quantity: updated[matchIndex].quantity + item.quantity,
      };
      return updated;
    }
    return [...cart, item];
  };

  // Product Selection Click
  const handleSelectProduct = (product: Product) => {
    const isTargetTakeaway = activeOrderTarget?.type === 'pickup' || activeOrderTarget?.type === 'delivery';

    if (isCustomizableProduct(product)) {
      setSelectedBurger(product);
    } else if (product.drinkType === 'jugo' || (product.flavors && product.flavors.length > 0)) {
      setSelectedDrink(product);
    } else {
      // Direct add to cart for drinks, sides or potatoes (1 solo clic, suma cantidades si se repite)
      const newItem: OrderItem = {
        id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        productId: product.id,
        productName: product.name,
        price: product.price,
        quantity: 1,
        category: product.category,
        drinkType: product.drinkType,
        isTakeaway: isTargetTakeaway,
        isNewOrModified: false,
      };
      setCartItems((prev) => mergeCartItem(prev, newItem));
    }
  };

  // Salsa Selection Click (No contable, costo 0.00, directo al pedido)
  const handleSelectSalsa = (salsa: Ingredient) => {
    const isTargetTakeaway = activeOrderTarget?.type === 'pickup' || activeOrderTarget?.type === 'delivery';
    const newItem: OrderItem = {
      id: `item-salsa-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      productId: salsa.id,
      productName: salsa.name,
      price: 0,
      quantity: 1,
      category: 'Salsas',
      isTakeaway: isTargetTakeaway,
      isNewOrModified: false,
    };
    setCartItems((prev) => mergeCartItem(prev, newItem));
  };

  // Editar ítem del carrito antes de enviar a cocina
  const handleEditCartItem = (item: OrderItem) => {
    const paidExtrasCost = (item.extras || []).reduce((s, e) => s + (Number(e.price) || 0), 0);
    const estimatedBasePrice = Math.max(0, (item.price || 0) - paidExtrasCost);

    const prod = products.find((p) => 
      p.id === item.productId || 
      p.name.toUpperCase() === item.productName.toUpperCase() ||
      item.productName.toUpperCase().startsWith(p.name.toUpperCase())
    ) || {
      id: item.productId,
      name: item.productName,
      price: estimatedBasePrice,
      category: item.category || 'Hot Dogs',
      baseIngredients: [],
    } as Product;

    setEditingCartItem(item);

    const isDrink =
      (item.category || '').toLowerCase().includes('bebida') ||
      (item.category || '').toLowerCase().includes('refresco') ||
      (item.category || '').toLowerCase().includes('jugo') ||
      Boolean(item.drinkType) ||
      Boolean(item.flavor);

    if (isDrink) {
      setSelectedBurger(null);
      setSelectedDrink(prod);
    } else {
      setSelectedDrink(null);
      setSelectedBurger(prod);
    }
  };

  // Confirm Burger Add (Nuevo o Editado)
  const handleConfirmBurgerAdd = (
    configOrList: BurgerOrderConfirmationItem | BurgerOrderConfirmationItem[]
  ) => {
    const list = Array.isArray(configOrList) ? configOrList : [configOrList];
    const generatedItems: OrderItem[] = list.map((config) => ({
      id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      productId: config.burger.id,
      productName: config.burger.name,
      price: config.finalPrice,
      quantity: config.quantity,
      category: config.burger.category,
      proteins: config.proteins && config.proteins.length > 0 ? config.proteins : undefined,
      removedIngredients: config.removedIngredients && config.removedIngredients.length > 0 ? config.removedIngredients : undefined,
      extras: config.extras && config.extras.length > 0 ? config.extras : undefined,
      isTakeaway: Boolean(config.isTakeaway),
      isDelivery: Boolean(config.isDelivery),
      isCut: config.isCut,
      cutPreference: config.cutPreference,
      notes: getCleanItemNote(config.notes) || undefined,
      isNewOrModified: false,
    }));

    if (editingCartItem) {
      setCartItems((prev) => {
        const idx = prev.findIndex((it) => it.id === editingCartItem.id);
        if (idx === -1) return [...prev, ...generatedItems];
        const updated = [...prev];
        updated.splice(idx, 1, ...generatedItems);
        return updated;
      });
      setEditingCartItem(null);
    } else {
      setCartItems((prev) => {
        let current = [...prev];
        for (const item of generatedItems) {
          current = mergeCartItem(current, item);
        }
        return current;
      });
    }

    if (list.some((c) => c.isDelivery) && deliveryFeeUSD <= 0) {
      setDeliveryFeeUSD(2000);
    }
  };

  // Confirm Drink Add (Nuevo o Editado, soporta multi-unidad)
  const handleConfirmDrinkAdd = (
    configOrList: DrinkOrderConfirmationItem | DrinkOrderConfirmationItem[]
  ) => {
    const list = Array.isArray(configOrList) ? configOrList : [configOrList];
    const generatedItems: OrderItem[] = list.map((config) => {
      const formattedName = config.flavor
        ? `${config.drink.name} (${config.flavor})`
        : config.drink.name;

      return {
        id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        productId: config.drink.id,
        productName: formattedName,
        price: config.drink.price,
        quantity: config.quantity,
        category: config.drink.category,
        drinkType: config.drink.drinkType,
        sugarPreference: config.sugarPreference,
        flavor: config.flavor,
        isTakeaway: Boolean(config.isTakeaway),
        isDelivery: Boolean(config.isDelivery),
        notes: getCleanItemNote(config.notes) || undefined,
        isNewOrModified: false,
      };
    });

    if (editingCartItem) {
      setCartItems((prev) => {
        const idx = prev.findIndex((it) => it.id === editingCartItem.id);
        if (idx === -1) return [...prev, ...generatedItems];
        const updated = [...prev];
        updated.splice(idx, 1, ...generatedItems);
        return updated;
      });
      setEditingCartItem(null);
    } else {
      setCartItems((prev) => {
        let current = [...prev];
        for (const item of generatedItems) {
          current = mergeCartItem(current, item);
        }
        return current;
      });
    }

    if (list.some((c) => c.isDelivery) && deliveryFeeUSD <= 0) {
      setDeliveryFeeUSD(2000);
    }
  };

  // Cart quantity adjustment
  const updateCartItemQuantity = (itemId: string, delta: number) => {
    setCartItems((prev) =>
      prev
        .map((item) => {
          if (item.id === itemId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as OrderItem[]
    );
  };

  const removeCartItem = (itemId: string) => {
    setCartItems((prev) => prev.filter((i) => i.id !== itemId));
  };

  // Delivery & Cart Calculations
  const hasAnyDeliveryItem = cartItems.some((i) => i.isDelivery);
  const isDeliveryOrder = activeOrderTarget?.type === 'delivery' || hasAnyDeliveryItem;
  const effectiveDeliveryFee = (hasAnyDeliveryItem || activeOrderTarget?.type === 'delivery') ? deliveryFeeUSD : 0;
  const itemsSubtotalUSD = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cartTotalUSD = itemsSubtotalUSD + effectiveDeliveryFee;

  const setItemPackaging = (itemId: string, mode: 'salon' | 'llevar' | 'delivery') => {
    setCartItems((prev) => {
      const next = prev.map((it) => {
        if (it.id !== itemId) return it;
        return {
          ...it,
          isTakeaway: mode === 'llevar',
          isDelivery: mode === 'delivery',
        };
      });

      const stillHasDelivery = next.some((i) => i.isDelivery);
      if (mode === 'delivery') {
        if (deliveryFeeUSD <= 0) setDeliveryFeeUSD(2000);
        setShowDeliveryConfig(true);
      } else if (!stillHasDelivery && activeOrderTarget?.type !== 'delivery') {
        setDeliveryFeeUSD(0);
        setShowDeliveryConfig(false);
      }

      return next;
    });
  };

  const handleSetAllDelivery = (isDelivery: boolean) => {
    setCartItems((prev) =>
      prev.map((item) => ({
        ...item,
        isDelivery,
        isTakeaway: isDelivery ? false : item.isTakeaway,
      }))
    );
    if (isDelivery) {
      if (deliveryFeeUSD <= 0) setDeliveryFeeUSD(2000);
      setShowDeliveryConfig(true);
    } else {
      if (activeOrderTarget?.type !== 'delivery') {
        setDeliveryFeeUSD(0);
        setShowDeliveryConfig(false);
      }
    }
  };

  const handleClearAllDelivery = () => {
    handleSetAllDelivery(false);
  };

  // Submit Order to Server
  const handleSubmitOrder = async () => {
    if (!activeOrderTarget || cartItems.length === 0 || isSubmittingOrder) return;

    if (isDeliveryOrder) {
      if (!customerName.trim()) {
        setOrderError('⚠️ Para pedidos con Delivery es obligatorio ingresar el nombre y dirección del cliente.');
        setShowDeliveryConfig(true);
        return;
      }
      if (effectiveDeliveryFee <= 0) {
        setOrderError('⚠️ Debe seleccionar o ingresar el costo del Delivery (mínimo 1.000 COP).');
        setShowDeliveryConfig(true);
        return;
      }
    }

    if (activeOrderTarget.type === 'pickup' && !customerName.trim()) {
      setOrderError('⚠️ Para PickUp es obligatorio ingresar el nombre o referencia del cliente.');
      return;
    }

    setIsSubmittingOrder(true);
    setOrderError(null);

    try {
      const copRate = exchangeRates?.COP || 3100;
      const totalUSDCalc = copRate > 0 ? (cartTotalUSD / copRate) : 0;
      const deliveryUSDCalc = copRate > 0 ? (effectiveDeliveryFee / copRate) : 0;

      await createOrder({
        type: activeOrderTarget.type,
        tableNumber: activeOrderTarget.tableNumber,
        customerName: customerName.trim() || undefined,
        kitchenNotes: getCleanItemNote(kitchenNotes) || undefined,
        items: cartItems,
        totalUSD: totalUSDCalc,
        totalCOP: cartTotalUSD,
        deliveryFeeUSD: deliveryUSDCalc,
        deliveryFeeCOP: effectiveDeliveryFee,
        shift: userSession?.shift || 'ambos',
        targetPrinter,
      } as any);

      setSentAlert(`✅ Comanda enviada exitosamente (${activeOrderTarget.title})`);
      setTimeout(() => setSentAlert(null), 3500);

      setActiveOrderTarget(null);
      setCartItems([]);
      setCustomerName('');
      setKitchenNotes('');
      setDeliveryFeeUSD(0);
      setEditingCartItem(null);
      setShowDeliveryConfig(false);
    } catch (err: any) {
      setOrderError(err?.message || 'Error al enviar la comanda a cocina y caja.');
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] p-2.5 sm:p-3 overflow-hidden bg-gray-100 text-gray-900">
      {/* Top Banner Alert (if any) */}
      {sentAlert && (
        <div className="mb-2 p-2 rounded-lg bg-green-500 text-black text-xs font-black text-center shadow-md animate-in fade-in shrink-0">
          {sentAlert}
        </div>
      )}

      {/* SUB-TAB 1: PEDIDOS & MAPA DE MESAS */}
      {(activeSubTab === 'pedidos' || activeSubTab === 'default') && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <TableCompactGrid
            tables={tables}
            orders={orders}
            onSelectTarget={handleOpenOrder}
            onViewActiveOrder={(ord) => setOrderDetailModalOrder(ord)}
            onAppendOrder={(ord) => setOrderAppendModalOrder(ord)}
            canPay={userSession?.role === 'caja' || userSession?.role === 'admin'}
            onPayOrder={(ord) => setActiveOrderForPay(ord)}
            onMarkDelivered={async (ord) => {
              await updateOrderStatus(ord.id, 'entregada');
              setOrderDetailModalOrder(null);
            }}
            onPrintReceipt={(ord) => setPrinterSelectOrder(ord)}
            onViewHistory={() => setSearchParams({ tab: 'comandas' })}
          />
        </div>
      )}

      {/* SUB-TAB 2: MIS COMANDAS (MONITOR MESERO) */}
      {activeSubTab === 'comandas' && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden space-y-2">
          <div className="flex flex-wrap items-center justify-between pb-1 border-b border-gray-200 shrink-0 gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSearchParams({ tab: 'pedidos' })}
                className="px-2.5 py-1 rounded-lg bg-stone-900 hover:bg-black text-white font-black text-xs transition-all shadow-xs cursor-pointer flex items-center gap-1"
                title="Volver a la cuadrícula de mesas y pedidos"
              >
                <span>⬅️</span>
                <span>VOLVER AL PANEL</span>
              </button>
              <h2 className="text-xs font-black text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                <IoReaderOutline className="text-yellow-600 text-sm" />
                <span>ESTADO DE COMANDAS ACTIVAS</span>
              </h2>
            </div>
            <div className="flex items-center gap-2">
              {/* Selector de Modo de Vista (Tarea 4) */}
              <button
                type="button"
                onClick={() => {
                  const next = !isCompactComandasView;
                  setIsCompactComandasView(next);
                  localStorage.setItem('mugrosito_mesero_view_mode', next ? 'compact' : 'expanded');
                }}
                className={`px-2.5 py-1 rounded-lg font-black text-[11px] flex items-center gap-1 border transition-all cursor-pointer shadow-xs ${
                  isCompactComandasView
                    ? 'bg-yellow-400 text-black border-yellow-500 hover:bg-yellow-500'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                }`}
                title="Alternar vista compacta (50+ comandas) vs vista extendida"
              >
                <span>👁️</span>
                <span>{isCompactComandasView ? 'Modo Compacto (50+)' : 'Modo Extendido'}</span>
              </button>
              <span className="text-[11px] text-gray-500 font-bold bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
                Total: {orders.filter((o) => o.status !== 'cancelado' && o.status !== 'fusionada').length}
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto pr-1">
            {orders.filter((o) => o.status !== 'cancelado' && o.status !== 'fusionada').length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-xs font-bold">
                No hay comandas activas en este momento.
              </div>
            ) : isCompactComandasView ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5">
                {orders
                  .filter((o) => o.status !== 'cancelado' && o.status !== 'fusionada')
                  .map((ord) => {
                    const isReady = ord.status === 'preparada';
                    const isExpanded = expandedOrderIds.includes(ord.id);
                    const isDelivery = ord.type === 'delivery';
                    const titleText = ord.type === 'mesa'
                      ? `Mesa #${ord.tableNumber}`
                      : `${isDelivery ? '🛵' : '🛍️'} ${ord.customerName || (isDelivery ? 'Delivery' : 'PickUp')}`;
                    const itemsCount = (ord.items || []).reduce((acc, i) => acc + (i.quantity || 1), 0);
                    const itemsSummary = (ord.items || []).map((i) => `${i.quantity}x ${i.productName}`).join(', ');

                    if (!isExpanded) {
                      // MINICOMANDA: Solo mesa o nombre delivery/pickup, montos en cada moneda y botón de ojito
                      return (
                        <div
                          key={ord.id}
                          className={`p-3 rounded-2xl border flex flex-col justify-between shadow-xs transition-all text-center ${
                            isReady
                              ? 'bg-yellow-200/80 border-yellow-500 ring-2 ring-yellow-400'
                              : 'bg-white border-gray-200 hover:border-yellow-400'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1 pb-1.5 border-b border-gray-100">
                            <span className="font-black text-sm text-black truncate text-center flex-1" title={titleText}>
                              {titleText}
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => setPrinterSelectOrder(ord)}
                                className="px-2 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-black transition-all shadow-xs border border-amber-300 cursor-pointer"
                                title="Imprimir pre-cuenta del cliente"
                              >
                                🧾
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleExpandOrder(ord.id)}
                                className="px-2 py-1 rounded-lg bg-yellow-400 hover:bg-yellow-500 text-black text-xs font-black transition-all shadow-xs border border-yellow-500 cursor-pointer shrink-0"
                                title="Expandir comanda"
                              >
                                👁️ Ver
                              </button>
                            </div>
                          </div>

                          <div className="py-2 space-y-1 text-center flex flex-col items-center justify-center">
                            {(() => {
                              const totalCOP = ord.totalCOP || roundCOP(ord.totalUSD * exchangeRates.COP);
                              const totalUSD = ord.totalCOP ? (ord.totalCOP / (exchangeRates.COP || 3100)) : ord.totalUSD;
                              const totalBs = ord.totalCOP ? (ord.totalCOP / (exchangeRates.Bs || 3.2)) : ((ord.totalUSD * (exchangeRates.COP || 3100)) / (exchangeRates.Bs || 3.2));
                              return (
                                <>
                                  <div className="text-base sm:text-lg font-black text-black leading-none">
                                    {Math.round(totalCOP).toLocaleString('es-CO')} <span className="text-[11px] font-bold text-gray-500">COP</span>
                                  </div>
                                  <div className="text-xs font-bold text-gray-700 truncate">
                                    🇺🇸 ${totalUSD.toFixed(2)} USD
                                  </div>
                                  <div className="text-xs font-bold text-gray-700 truncate">
                                    🇻🇪 {totalBs.toFixed(2)} Bs
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      );
                    }

                    // COMANDA EXPANDIDA
                    return (
                      <div
                        key={ord.id}
                        className={`col-span-2 p-3.5 rounded-2xl border flex flex-col justify-between shadow-md space-y-2.5 transition-all text-center ${
                          isReady
                            ? 'bg-yellow-100/90 border-yellow-500 ring-2 ring-yellow-400'
                            : 'bg-white border-gray-200 hover:border-yellow-400'
                        }`}
                      >
                        {/* Header con botón Colapsar */}
                        <div>
                          <div className="flex items-center justify-between gap-1 pb-1.5 border-b border-gray-100">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-black text-base text-black">#{ord.orderNumber}</span>
                              <span className="text-xs font-black text-black bg-yellow-400 px-2 py-0.5 rounded-lg uppercase truncate">
                                {ord.type === 'mesa' ? `Mesa #${ord.tableNumber}` : ord.type}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => toggleExpandOrder(ord.id)}
                              className="px-2.5 py-1 rounded-xl bg-gray-100 hover:bg-yellow-400 text-black text-xs font-black transition-all shadow-xs border border-gray-300 cursor-pointer shrink-0"
                              title="Colapsar a minicomanda"
                            >
                              👁️ Colapsar
                            </button>
                          </div>

                          {/* Customer */}
                          {ord.customerName && (
                            <p className="text-xs sm:text-sm text-gray-900 font-black mt-1 truncate text-center" title={ord.customerName}>
                              👤 {ord.customerName}
                            </p>
                          )}

                          {/* Items summary */}
                          <div className="my-1.5 py-1.5 px-2 rounded-xl bg-gray-50 border border-gray-100 text-center">
                            <div className="text-xs sm:text-sm font-black text-yellow-900">
                              🌭 {itemsCount} {itemsCount === 1 ? 'ítem' : 'ítems'}
                            </div>
                            <p className="text-xs text-gray-700 font-medium text-center truncate mt-0.5" title={itemsSummary}>
                              {itemsSummary}
                            </p>
                          </div>

                          {/* Status */}
                          <div className="flex items-center justify-between text-xs font-black uppercase mb-1">
                            <span
                              className={`px-2.5 py-1 rounded-lg text-xs font-black ${
                                isReady
                                  ? 'bg-green-600 text-white animate-pulse'
                                  : 'bg-yellow-400 text-black'
                              }`}
                            >
                              {isReady ? '¡LISTA!' : 'EN PREP.'}
                            </span>
                            <span className="text-black font-black text-sm sm:text-base">
                              {Math.round(ord.totalCOP || (ord.totalUSD * exchangeRates.COP)).toLocaleString('es-CO')} COP
                            </span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="pt-2 border-t border-gray-100 flex items-center justify-between gap-1.5">
                          <button
                            type="button"
                            onClick={() => setOrderAppendModalOrder(ord)}
                            className="flex-1 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-black text-xs sm:text-sm font-black transition-all cursor-pointer text-center shadow-xs"
                            title="Adicionar ítem"
                          >
                            + Ítem
                          </button>

                          <button
                            type="button"
                            onClick={() => setPrinterSelectOrder(ord)}
                            className="px-2.5 py-2 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-400 text-xs sm:text-sm font-black transition-all cursor-pointer flex items-center gap-1 shadow-xs"
                            title="Imprimir pre-cuenta del cliente"
                          >
                            <IoPrintOutline className="text-base" />
                            <span>Cuenta</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setPrinterSelectKitchenOrder(ord)}
                            className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm transition-all cursor-pointer shadow-xs"
                            title="Reimprimir en cocina"
                          >
                            <IoPrintOutline />
                          </button>

                          {ord.type === 'mesa' && ord.status !== 'entregada' && (
                            <button
                              type="button"
                              onClick={() => setTableChangeOrder(ord)}
                              className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm transition-all cursor-pointer shadow-xs"
                              title="Cambiar mesa"
                            >
                              <IoSwapHorizontal />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                {orders
                  .filter((o) => o.status !== 'cancelado' && o.status !== 'fusionada')
                  .map((ord) => {
                    const isReady = ord.status === 'preparada';
                    return (
                      <div
                        key={ord.id}
                        className={`p-3 rounded-2xl border flex flex-col justify-between shadow-sm transition-all ${
                          isReady
                            ? 'bg-green-50 border-green-400'
                            : 'bg-white border-gray-200 hover:border-yellow-400'
                        }`}
                      >
                        {/* Header */}
                        <div>
                          <div className="flex items-center justify-between gap-1 pb-1.5 border-b border-gray-100">
                            <div className="flex items-center gap-1.5">
                              <span className="font-black text-base text-black">#{ord.orderNumber}</span>
                              <span className="text-xs font-bold text-gray-600 uppercase">
                                {ord.type === 'mesa' ? `Mesa #${ord.tableNumber}` : ord.type}
                              </span>
                            </div>
                            <span
                              className={`text-xs font-black px-2 py-0.5 rounded-lg uppercase ${
                                isReady
                                  ? 'bg-green-500 text-black animate-pulse'
                                  : 'bg-yellow-400 text-black'
                              }`}
                            >
                              {ord.status === 'preparada' ? '¡LISTA!' : 'EN PREP.'}
                            </span>
                          </div>

                          {/* Customer */}
                          {ord.customerName && (
                            <p className="text-xs sm:text-sm text-gray-800 font-bold mt-1.5 truncate">
                              👤 {ord.customerName}
                            </p>
                          )}

                          {/* Items brief */}
                          <div className="my-2 space-y-1">
                            {(ord.items || []).map((it, idx) => (
                              <div key={idx} className="text-xs sm:text-sm text-gray-800 flex justify-between font-semibold">
                                <span className="truncate">
                                  {it.quantity}x {it.productName}
                                </span>
                                <span className="text-black font-bold shrink-0 ml-1">
                                  {it.price >= 100
                                    ? `${Math.round(it.price * it.quantity).toLocaleString('es-CO')} COP`
                                    : `$${(it.price * it.quantity).toFixed(2)}`}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="pt-2 border-t border-gray-100 flex items-center justify-between gap-1.5">
                          <span className="text-sm sm:text-base font-black text-black">
                            {Math.round(ord.totalCOP || (ord.totalUSD * exchangeRates.COP)).toLocaleString('es-CO')} COP
                          </span>

                          <div className="flex items-center gap-1.5">
                            {ord.type === 'mesa' && ord.status !== 'entregada' && (
                              <button
                                type="button"
                                onClick={() => setTableChangeOrder(ord)}
                                className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold cursor-pointer"
                                title="Cambiar de mesa"
                              >
                                <IoSwapHorizontal />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => setOrderAppendModalOrder(ord)}
                              className="px-2.5 py-1.5 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-black text-xs font-black cursor-pointer shadow-xs"
                              title="Adicionar ítem"
                            >
                              + Ítem
                            </button>

                            <button
                              type="button"
                              onClick={() => setPrinterSelectKitchenOrder(ord)}
                              className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 cursor-pointer shadow-xs"
                              title="Reimprimir comanda en cocina"
                            >
                              <IoPrintOutline className="text-sm" />
                            </button>

                            <button
                              type="button"
                              onClick={() => setOrderDetailModalOrder(ord)}
                              className="px-2.5 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-900 text-xs font-black cursor-pointer shadow-xs"
                            >
                              Ver
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* FULLSCREEN / PANTALLA DE TOMA DE PEDIDOS */}
      {activeOrderTarget && (
        <div className="fixed inset-0 z-50 flex flex-col bg-stone-100 text-gray-900 w-screen h-screen overflow-hidden animate-in fade-in select-none">
          {/* Header */}
          <div className="bg-white px-4 py-2 border-b-2 border-yellow-400 flex items-center justify-between shrink-0 shadow-xs">
            <div className="flex items-center gap-2.5">
              <span className="p-1.5 rounded-xl bg-yellow-400 text-black text-lg font-black shadow-xs">
                {activeOrderTarget.type === 'delivery' ? '🛵' : activeOrderTarget.type === 'pickup' ? '🛍️' : '🍽️'}
              </span>
              <div>
                <h3 className="font-black text-base sm:text-lg text-gray-900 leading-tight">
                  {activeOrderTarget.title}
                </h3>
                <span className="text-[11px] text-gray-500 font-bold uppercase">
                  Selección de Hot Dogs, Bebidas y Acompañantes
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setActiveOrderTarget(null);
                setSelectedBurger(null);
                setSelectedDrink(null);
                setEditingCartItem(null);
                setShowDeliveryConfig(false);
              }}
              className="px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-red-50 text-gray-700 hover:text-red-700 transition-colors flex items-center gap-1.5 font-black text-xs cursor-pointer border border-gray-200"
            >
              <IoClose className="text-xl" />
              <span>Cerrar Pedido</span>
            </button>
          </div>

          {/* Error Message */}
          {orderError && (
            <div className="bg-red-50 text-red-700 px-3 py-1.5 text-xs font-bold border-b border-red-200 flex items-center gap-1.5 shrink-0">
              <IoWarningOutline />
              <span>{orderError}</span>
            </div>
          )}

          {/* Body: Split View (Catalog + Inline Customizer on Left 65%, Cart on Right 35%) */}
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0 bg-stone-100">
            {/* LEFT: 100% TEXT CATALOG & INLINE BURGER / DRINK BUILDER / DELIVERY CONFIG (65%) */}
            <div className={`flex-1 w-full md:w-[60%] lg:w-[65%] ${selectedBurger || selectedDrink || (showDeliveryConfig && isDeliveryOrder) ? 'p-1 sm:p-1.5' : 'p-2.5 sm:p-3'} border-b md:border-b-0 md:border-r border-gray-200 flex flex-col overflow-hidden min-h-0`}>
              {selectedBurger ? (
                /* INLINE BURGER BUILDER (Llega hasta arriba con máxima altura) */
                <div className="flex-1 h-full min-h-0 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                  <BurgerBuilderModal
                    burger={selectedBurger}
                    availableExtras={availableExtras}
                    availableProteins={availableProteins}
                    availableFreeToppings={availableFreeToppings}
                    isOpen={true}
                    inline={true}
                    onClose={() => {
                      setSelectedBurger(null);
                      setEditingCartItem(null);
                    }}
                    onConfirm={(config) => {
                      handleConfirmBurgerAdd(config);
                      setSelectedBurger(null);
                    }}
                    defaultTakeaway={activeOrderTarget.type === 'pickup'}
                    defaultDelivery={activeOrderTarget.type === 'delivery'}
                    exchangeRates={exchangeRates}
                    initialEditItem={editingCartItem}
                  />
                </div>
              ) : selectedDrink ? (
                /* INLINE DRINK SELECTOR (Llega hasta arriba con máxima altura) */
                <div className="flex-1 h-full min-h-0 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                  <DrinkSelectorModal
                    drink={selectedDrink}
                    isOpen={true}
                    inline={true}
                    initialEditItem={editingCartItem}
                    onClose={() => {
                      setSelectedDrink(null);
                      setEditingCartItem(null);
                    }}
                    onConfirm={(config) => {
                      handleConfirmDrinkAdd(config);
                      setSelectedDrink(null);
                      setEditingCartItem(null);
                    }}
                    defaultTakeaway={activeOrderTarget.type === 'pickup'}
                    defaultDelivery={activeOrderTarget.type === 'delivery'}
                    exchangeRates={exchangeRates}
                  />
                </div>
              ) : showDeliveryConfig && isDeliveryOrder ? (
                /* INLINE DELIVERY CONFIG PANEL */
                <div className="flex-1 h-full min-h-0 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                  <DeliveryConfigPanel
                    customerName={customerName}
                    onCustomerNameChange={setCustomerName}
                    kitchenNotes={kitchenNotes}
                    onKitchenNotesChange={setKitchenNotes}
                    deliveryFeeUSD={deliveryFeeUSD}
                    onDeliveryFeeChange={setDeliveryFeeUSD}
                    cartItems={cartItems}
                    onSetItemPackaging={setItemPackaging}
                    onSetAllDelivery={handleSetAllDelivery}
                    exchangeRates={exchangeRates}
                    onClose={() => setShowDeliveryConfig(false)}
                    onClearAllDelivery={handleClearAllDelivery}
                  />
                </div>
              ) : (
                /* Product Catalog (Visible cuando no hay personalización ni config de delivery) */
                <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                  <ProductTextCatalog
                    products={activeProducts}
                    onSelectProduct={handleSelectProduct}
                    selectedCategory={selectedCategory}
                    onSelectCategory={setSelectedCategory}
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    exchangeRates={exchangeRates}
                    salsas={availableSalsas}
                    onSelectSalsa={handleSelectSalsa}
                  />
                </div>
              )}
            </div>

            {/* RIGHT: COMPACT CART & ORDER FORM (35%) */}
            <div className="w-full md:w-[40%] lg:w-[35%] h-[48vh] md:h-full p-2.5 sm:p-3 flex flex-col justify-between bg-gray-50 overflow-hidden min-h-0 border-t md:border-t-0 md:border-l border-gray-200 shrink-0 md:shrink">
                <div className="flex-1 flex flex-col overflow-hidden min-h-0 space-y-2">
                  
                  {/* SECCIÓN SUPERIOR COMPACTA DE LA COMANDA */}
                  {isDeliveryOrder ? (
                    /* Banner interactivo de Delivery: Abre o minimiza la sección en el menú */
                    <div className="p-2.5 rounded-2xl bg-blue-50 border-2 border-blue-400 shadow-xs flex items-center justify-between gap-2 shrink-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-2xl shrink-0 p-1 bg-white rounded-xl border border-blue-200">🛵</span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-black text-blue-950 uppercase">DELIVERY ACTIVO</span>
                            <span className="text-[11px] font-black bg-blue-600 text-white px-2 py-0.5 rounded-md">
                              +{Math.round(effectiveDeliveryFee).toLocaleString('es-CO')} COP
                            </span>
                          </div>
                          <span className="text-[11px] font-bold text-blue-800 truncate block mt-0.5">
                            {customerName.trim() ? customerName : '⚠️ Toca para configurar cliente/dirección'}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setShowDeliveryConfig((prev) => !prev)}
                        className={`px-3 py-2 rounded-xl font-black text-xs transition-all border cursor-pointer shadow-xs flex items-center gap-1 shrink-0 ${
                          showDeliveryConfig
                            ? 'bg-white border-blue-400 text-blue-900 hover:bg-blue-100'
                            : 'bg-blue-600 hover:bg-blue-700 text-white border-blue-700 active:scale-95'
                        }`}
                        title={showDeliveryConfig ? 'Minimizar sección para ver el menú' : 'Abrir sección de configuración de delivery en el panel izquierdo'}
                      >
                        <span>{showDeliveryConfig ? '➖ Minimizar' : '✏️ Configurar'}</span>
                      </button>
                    </div>
                  ) : (
                    /* Para Mesa o Salón: Entrada compacta y delgada de cliente/referencia */
                    <div className="bg-white px-3 py-2 rounded-xl border border-gray-200 shadow-xs flex items-center gap-2 shrink-0">
                      <span className="text-xs font-black text-gray-700 uppercase whitespace-nowrap">
                        {activeOrderTarget.type === 'pickup' ? '👤 Cliente *:' : '👤 Cliente:'}
                      </span>
                      <input
                        type="text"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder={activeOrderTarget.type === 'pickup' ? 'Nombre o Referencia (*Obligatorio)' : 'Nombre o referencia (opcional)'}
                        className="flex-1 text-xs font-bold text-gray-900 bg-transparent outline-none placeholder-gray-400"
                      />
                    </div>
                  )}

                  {/* Cabecera de Ítems del Carrito con selector de lote */}
                  <div className="flex items-center justify-between text-xs font-black uppercase text-gray-600 px-1 shrink-0 pt-1">
                    <span>Ítems Agregados ({cartItems.reduce((s, i) => s + i.quantity, 0)})</span>
                    {cartItems.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleSetAllDelivery(true)}
                          className="text-[10px] font-bold text-blue-700 hover:underline cursor-pointer flex items-center gap-0.5"
                          title="Marcar todos los productos como delivery"
                        >
                          🛵 Todos Delivery
                        </button>
                        {hasAnyDeliveryItem && (
                          <>
                            <span className="text-gray-300">|</span>
                            <button
                              type="button"
                              onClick={handleClearAllDelivery}
                              className="text-[10px] font-bold text-gray-600 hover:underline cursor-pointer flex items-center gap-0.5"
                              title="Desmarcar delivery y pasar todos a salón"
                            >
                              🍽️ Todos Salón
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Cart Items List */}
                  <div className="flex-1 overflow-y-auto pr-1 space-y-2 min-h-[140px]">
                    {cartItems.length === 0 ? (
                      <div className="h-32 flex flex-col items-center justify-center text-center text-gray-400 text-sm border border-dashed border-gray-300 rounded-2xl bg-white/60 p-3">
                        <span className="font-bold">El carrito está vacío</span>
                        <span className="text-xs text-gray-400 mt-1">
                          Toca un ítem del catálogo para agregarlo
                        </span>
                      </div>
                    ) : (
                      cartItems.map((item) => (
                        <div
                          key={item.id}
                          className="p-3 rounded-2xl bg-white border border-gray-200 shadow-xs flex flex-col gap-1.5"
                        >
                          <div className="flex items-start justify-between gap-1.5">
                            <div>
                              <span className="text-sm sm:text-base font-black text-gray-950 block leading-tight">
                                {item.productName}
                              </span>
                              <div className="flex items-center gap-1 mt-1 flex-wrap">
                                {/* Selector de Empaque / Servicio para este ítem */}
                                <button
                                  type="button"
                                  onClick={() => setItemPackaging(item.id, 'salon')}
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-black border transition-all cursor-pointer ${
                                    !item.isTakeaway && !item.isDelivery
                                      ? 'bg-yellow-400 border-yellow-500 text-black shadow-2xs scale-[1.02]'
                                      : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                                  }`}
                                  title="Servir en mesa (Salón)"
                                >
                                  🍽️ Salón
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setItemPackaging(item.id, 'llevar')}
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-black border transition-all cursor-pointer ${
                                    item.isTakeaway && !item.isDelivery
                                      ? 'bg-amber-200 border-amber-400 text-amber-950 shadow-2xs scale-[1.02]'
                                      : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                                  }`}
                                  title="Empaquetar para llevar"
                                >
                                  🛍️ Llevar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setItemPackaging(item.id, 'delivery');
                                    if (deliveryFeeUSD <= 0) setDeliveryFeeUSD(2000);
                                  }}
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-black border transition-all cursor-pointer ${
                                    item.isDelivery
                                      ? 'bg-blue-100 border-blue-400 text-blue-950 shadow-2xs scale-[1.02]'
                                      : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                                  }`}
                                  title="Marcar este producto para Servicio Delivery"
                                >
                                  🛵 Delivery
                                </button>

                                {item.category === 'Salsas' ? (
                                  <span className="text-[10px] font-black text-amber-900 bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded-md inline-block">
                                    🥣 Salsa
                                  </span>
                                ) : (item.isCut || item.cutPreference === 'Picada') ? (
                                  <span className="text-[10px] font-black text-red-800 bg-red-100 px-1.5 py-0.5 rounded-md inline-block">
                                    🔪 Picada
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-bold text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded-md inline-block">
                                    🌭 Entero
                                  </span>
                                )}
                              </div>
                            </div>

                            <span className="text-sm sm:text-base font-black text-black shrink-0">
                              {Math.round(item.price * item.quantity).toLocaleString('es-CO')} COP
                            </span>
                          </div>

                          {/* Proteins (Tarea 3) */}
                          {item.proteins && item.proteins.length > 0 && !areProteinsDefault(item.productName, item.proteins) && (
                            <div className="text-xs text-amber-950 font-black bg-yellow-100 px-2 py-0.5 rounded-lg border border-yellow-300 inline-block">
                              🥩 {item.proteins.join(' + ')}
                            </div>
                          )}

                          {/* Removed ingredients (SIN) */}
                          {item.removedIngredients && item.removedIngredients.length > 0 && (
                            <div className="text-xs text-red-600 font-bold">
                              🚫 SIN: {formatRemovedIngredients(item.removedIngredients).join(', ')}
                            </div>
                          )}

                          {/* Extra ingredients (ADD) */}
                          {item.extras && item.extras.length > 0 && (
                            <div className="text-xs text-gray-800 font-bold space-y-0.5">
                              {item.extras.map((ex, exIdx) => (
                                <div key={exIdx} className="flex justify-between">
                                  <span>➕ ADD: {(ex.quantity && ex.quantity > 1) ? `${ex.quantity}x ` : ''}{ex.name}</span>
                                  {ex.price > 0 && <span className="font-black text-emerald-700">+{Math.round(ex.price).toLocaleString('es-CO')} COP</span>}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Sugar preference */}
                          {item.sugarPreference && (
                            <div className="text-xs text-blue-700 font-bold">
                              🥤 Azúcar: {item.sugarPreference}
                            </div>
                          )}

                          {/* Drink Flavor */}
                          {item.flavor && (
                            <div className="text-xs text-amber-800 font-bold">
                              🍹 Sabor: {item.flavor}
                            </div>
                          )}

                          {/* Item Note */}
                          {getCleanItemNote(item.notes) && (
                            <div className="text-xs text-gray-600 italic">
                              📝 Nota: {getCleanItemNote(item.notes)}
                            </div>
                          )}

                          {/* Quantity Controls & Remove */}
                          <div className="flex items-center justify-between pt-1.5 border-t border-gray-100 mt-1">
                            <div className="flex items-center border border-gray-300 rounded-xl bg-gray-50 overflow-hidden shadow-2xs">
                              <button
                                type="button"
                                onClick={() => updateCartItemQuantity(item.id, -1)}
                                className="px-3 py-1 text-sm font-black text-gray-800 hover:bg-gray-200 transition-colors cursor-pointer"
                              >
                                -
                              </button>
                              <span className="px-3 text-sm font-black text-black">{item.quantity}</span>
                              <button
                                type="button"
                                onClick={() => updateCartItemQuantity(item.id, 1)}
                                className="px-3 py-1 text-sm font-black text-gray-800 hover:bg-gray-200 transition-colors cursor-pointer"
                              >
                                +
                              </button>
                            </div>

                            <div className="flex items-center gap-1.5">
                              {item.category !== 'Salsas' && (
                                <button
                                  type="button"
                                  onClick={() => handleEditCartItem(item)}
                                  className="px-2.5 py-1 rounded-xl text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 font-black text-xs flex items-center gap-1 transition-colors cursor-pointer shadow-2xs active:scale-95"
                                  title="Editar personalización de este ítem"
                                >
                                  <IoPencilOutline className="text-sm" />
                                  <span>Editar</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => removeCartItem(item.id)}
                                className="text-gray-400 hover:text-red-600 p-1.5 transition-colors cursor-pointer"
                                title="Eliminar este ítem"
                              >
                                <IoTrashOutline className="text-base" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Cart Footer: Totals & Submit Button */}
                <div className="pt-2 border-t border-gray-200 shrink-0 space-y-2 mt-2">
                  <div className="bg-white p-3 rounded-2xl border border-gray-200 space-y-1 shadow-xs">
                    <div className="flex justify-between text-xs sm:text-sm font-bold text-gray-600">
                      <span>Subtotal Ítems:</span>
                      <span className="text-black font-black">{Math.round(itemsSubtotalUSD).toLocaleString('es-CO')} COP</span>
                    </div>

                    {effectiveDeliveryFee > 0 && (
                      <div className="flex justify-between text-xs sm:text-sm font-bold text-gray-600">
                        <span>Costo Delivery:</span>
                        <span className="text-black font-black">+{Math.round(effectiveDeliveryFee).toLocaleString('es-CO')} COP</span>
                      </div>
                    )}

                    <div className="flex justify-between items-baseline pt-1.5 border-t border-gray-100">
                      <span className="text-xs sm:text-sm font-black text-gray-900 uppercase">Total a Pagar:</span>
                      <div className="text-right">
                        <span className="text-xl sm:text-2xl font-black text-black block leading-none">
                          {Math.round(cartTotalUSD).toLocaleString('es-CO')} COP
                        </span>
                        <span className="text-xs text-gray-600 font-bold block mt-1">
                          ≈ ${(exchangeRates.COP > 0 ? cartTotalUSD / exchangeRates.COP : 0).toFixed(2)} USD | {(exchangeRates.Bs > 0 ? cartTotalUSD / exchangeRates.Bs : 0).toFixed(2)} Bs
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Selector de Impresora al Enviar Pedido */}
                  <div className="pt-2 border-t border-gray-200 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase tracking-wider text-gray-800 flex items-center gap-1.5">
                        <IoPrintOutline className="text-sm text-yellow-600" />
                        <span>Imprimir Comanda:</span>
                      </span>
                      <span className="text-[11px] font-black text-gray-600 bg-gray-100 px-2 py-0.5 rounded-lg">
                        {targetPrinter === 'cocina'
                          ? 'Cocina (80mm LAN)'
                          : targetPrinter === 'caja'
                          ? 'Caja (58mm USB)'
                          : targetPrinter === 'ambas'
                          ? 'Ambas'
                          : 'Sin ticket'}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[
                        { id: 'cocina', label: '🍳 Cocina' },
                        { id: 'caja', label: '💳 Caja' },
                        { id: 'ambas', label: '⚡ Ambas' },
                        { id: 'ninguna', label: '🚫 No' },
                      ].map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setTargetPrinter(p.id as any)}
                          className={`py-2 px-1 rounded-xl text-xs font-black text-center transition-all border cursor-pointer ${
                            targetPrinter === p.id
                              ? 'bg-yellow-400 text-black border-yellow-500 shadow-xs font-black scale-[1.02]'
                              : 'bg-stone-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={cartItems.length === 0 || isSubmittingOrder}
                    onClick={handleSubmitOrder}
                    className={`w-full py-3.5 rounded-2xl font-black text-sm sm:text-base uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer ${
                      cartItems.length === 0 || isSubmittingOrder
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        : 'bg-yellow-400 hover:bg-yellow-500 text-black border-2 border-yellow-500 active:scale-[0.99]'
                    }`}
                  >
                    <IoPaperPlane className="text-base" />
                    <span>{isSubmittingOrder ? 'ENVIANDO COMANDA...' : 'ENVIAR A COCINA & CAJA'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
      )}

      {/* MODAL 2: CONFIGURADOR DE HOT DOGS (Solo fallback si no hay activeOrderTarget) */}
      {!activeOrderTarget && (
        <BurgerBuilderModal
          burger={selectedBurger}
          availableExtras={availableExtras}
          availableProteins={availableProteins}
          availableFreeToppings={availableFreeToppings}
          isOpen={!!selectedBurger}
          onClose={() => {
            setSelectedBurger(null);
            setEditingCartItem(null);
          }}
          onConfirm={handleConfirmBurgerAdd}
          defaultTakeaway={activeOrderTarget?.type === 'pickup' || activeOrderTarget?.type === 'delivery'}
          exchangeRates={exchangeRates}
          initialEditItem={editingCartItem}
        />
      )}

      {/* MODAL 3: SELECTOR DE BEBIDAS / JUGOS (Solo cuando no está en comanda activa) */}
      {!activeOrderTarget && (
        <DrinkSelectorModal
          drink={selectedDrink}
          isOpen={!!selectedDrink}
          initialEditItem={editingCartItem}
          onClose={() => {
            setSelectedDrink(null);
            setEditingCartItem(null);
          }}
          onConfirm={(config) => {
            handleConfirmDrinkAdd(config);
            setSelectedDrink(null);
            setEditingCartItem(null);
          }}
          defaultTakeaway={activeOrderTarget?.type === 'pickup' || activeOrderTarget?.type === 'delivery'}
          exchangeRates={exchangeRates}
        />
      )}

      {/* MODAL 4: CAMBIO DE MESA O SERVICIO */}
      {tableChangeOrder && (
        <OrderServiceTransferModal
          order={tableChangeOrder}
          isOpen={!!tableChangeOrder}
          onClose={() => setTableChangeOrder(null)}
        />
      )}

      {orderAppendModalOrder && (
        <OrderAppendModal
          order={orderAppendModalOrder}
          isOpen={!!orderAppendModalOrder}
          onClose={() => setOrderAppendModalOrder(null)}
        />
      )}

      {/* MODAL 6: VER DETALLE DE COMANDA */}
      {orderDetailModalOrder && (
        <OrderDetailModal
          order={orders.find((o) => o.id === orderDetailModalOrder.id) || orderDetailModalOrder}
          isOpen={!!orderDetailModalOrder}
          onClose={() => setOrderDetailModalOrder(null)}
          exchangeRates={exchangeRates}
          onPayOrder={userSession?.role === 'caja' || userSession?.role === 'admin' ? (ord) => setActiveOrderForPay(ord) : undefined}
          onAppendOrder={(ord) => setOrderAppendModalOrder(ord)}
          onEditOrder={(ord) => setOrderEditModalOrder(ord)}
          onChangeTable={(ord) => setTableChangeOrder(ord)}
          onToggleDelivered={async (ord) => {
            const newStatus = ord.status === 'entregada' ? 'preparada' : 'entregada';
            await updateOrderStatus(ord.id, newStatus);
            if (newStatus === 'entregada') {
              setOrderDetailModalOrder(null);
            } else {
              setOrderDetailModalOrder((prev) => prev ? { ...prev, status: newStatus } : null);
            }
          }}
          onCancelOrder={async (ord) => {
            if (!window.confirm(`¿Seguro que deseas anular y eliminar la comanda #${ord.orderNumber}?`)) return;
            try {
              await deleteOrder(ord.id);
              setOrderDetailModalOrder(null);
            } catch (err) {
              alert(err instanceof Error ? err.message : 'No se pudo anular la comanda');
            }
          }}
          onPrintReceipt={(ord) => setPrinterSelectOrder(ord)}
          onReprintKitchen={(ord) => setPrinterSelectKitchenOrder(ord)}
          userRole={userSession?.role}
        />
      )}

      {/* MODAL DE EDICIÓN DE COMANDA */}
      {orderEditModalOrder && (
        <OrderEditModal
          order={orders.find((o) => o.id === orderEditModalOrder.id) || orderEditModalOrder}
          isOpen={!!orderEditModalOrder}
          onClose={() => setOrderEditModalOrder(null)}
          products={products}
          ingredients={ingredients}
          exchangeRates={exchangeRates}
          onSaveEdit={async (orderId, payload) => {
            await editOrder(orderId, {
              ...payload,
              type: payload.type === 'llevar' ? 'pickup' : payload.type,
            });
            setOrderEditModalOrder(null);
          }}
          onDeleteOrder={deleteOrder}
        />
      )}

      {/* MODAL 7: COBRO DIRECTO DESDE MESAS (TAREA 5) */}
      {activeOrderForPay && (
        <PaymentLedgerModal
          order={orders.find((o) => o.id === activeOrderForPay.id) || activeOrderForPay}
          onClose={() => setActiveOrderForPay(null)}
          onViewOrder={(ord) => setOrderDetailModalOrder(ord)}
        />
      )}

      {/* MODAL 8: IMPRIMIR PRE-CUENTA CLIENTE */}
      <PrinterSelectModal
        isOpen={printerSelectOrder !== null}
        title={`🖨️ PRE-CUENTA COMANDA #${(printerSelectOrder?.orderNumber || '').toString().replace(/^#+/, '')}`}
        jobDescription="Selecciona la impresora térmica donde deseas emitir la pre-cuenta del cliente"
        defaultTarget="caja"
        onClose={() => setPrinterSelectOrder(null)}
        onSelectPrinter={async (target) => {
          if (printerSelectOrder) {
            await printOrderReceipt(printerSelectOrder.id, target);
            setSentAlert(`🧾 Pre-cuenta de la comanda #${printerSelectOrder.orderNumber} enviada a imprimir.`);
            setTimeout(() => setSentAlert(null), 4000);
          }
        }}
      />

      {/* MODAL 9: REIMPRIMIR COMANDA DE COCINA */}
      <PrinterSelectModal
        isOpen={printerSelectKitchenOrder !== null}
        title={`🖨️ REIMPRIMIR COMANDA #${(printerSelectKitchenOrder?.orderNumber || '').toString().replace(/^#+/, '')}`}
        jobDescription="Selecciona a qué impresora térmica deseas enviar la comanda completa de cocina"
        defaultTarget="cocina"
        onClose={() => setPrinterSelectKitchenOrder(null)}
        onSelectPrinter={async (target) => {
          if (printerSelectKitchenOrder) {
            await reprintKitchenOrder(printerSelectKitchenOrder.id, target);
            setSentAlert(`🖨️ Comanda #${printerSelectKitchenOrder.orderNumber} enviada a reimprimir.`);
            setTimeout(() => setSentAlert(null), 4000);
          }
        }}
      />
    </div>
  );
};
