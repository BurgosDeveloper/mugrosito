import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Product, OrderItem, Ingredient } from '../../data/mockData';
import { ProductTextCatalog } from './ProductTextCatalog';
import { BurgerBuilderModal, BurgerOrderConfirmationItem } from './BurgerBuilderModal';
import { DrinkSelectorModal, DrinkOrderConfirmationItem } from './DrinkSelectorModal';
import { DeliveryConfigPanel } from './DeliveryConfigPanel';
import { areProteinsDefault, getCleanItemNote, normalizeProteinName, formatRemovedIngredients } from '../../utils/burgerProteins';
import { isCustomizableProduct } from '../../utils/productClassifier';

import {
  IoClose,
  IoTrashOutline,
  IoPaperPlane,
  IoWarningOutline,
  IoPrintOutline,
  IoArrowBack,
  IoPencilOutline,
} from 'react-icons/io5';

export interface OrderTarget {
  type: 'mesa' | 'delivery' | 'pickup';
  tableNumber?: number;
  title: string;
}

interface OrderCreateViewProps {
  target: OrderTarget;
  onClose: () => void;
  onOrderCreated?: () => void;
}

export const OrderCreateView: React.FC<OrderCreateViewProps> = ({
  target,
  onClose,
  onOrderCreated,
}) => {
  const {
    products,
    ingredients,
    createOrder,
    exchangeRates,
    userSession,
  } = useApp();

  // Estados de catálogo y búsqueda
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Carrito y Formulario de Orden
  const [cartItems, setCartItems] = useState<OrderItem[]>([]);
  const [customerName, setCustomerName] = useState<string>('');
  const [kitchenNotes, setKitchenNotes] = useState<string>('');
  const [deliveryFeeUSD, setDeliveryFeeUSD] = useState<number>(target.type === 'delivery' ? 2000 : 0);
  const [showDeliveryConfig, setShowDeliveryConfig] = useState<boolean>(target.type === 'delivery');
  const [isSubmittingOrder, setIsSubmittingOrder] = useState<boolean>(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [targetPrinter, setTargetPrinter] = useState<'cocina' | 'caja' | 'ambas' | 'ninguna'>('cocina');

  // Modales de Productos
  const [selectedBurger, setSelectedBurger] = useState<Product | null>(null);
  const [selectedDrink, setSelectedDrink] = useState<Product | null>(null);
  const [editingCartItem, setEditingCartItem] = useState<OrderItem | null>(null);

  // Filtrado de catálogo por turno memoizado para evitar re-renders y reseteos
  const activeProducts = useMemo(() => {
    return products
      .filter((p) => !p.shift || p.shift === 'ambos' || p.shift === userSession?.shift)
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  }, [products, userSession?.shift]);

  const activeIngredients = useMemo(() => {
    return ingredients
      .filter((i) => !i.shift || i.shift === 'ambos' || i.shift === userSession?.shift)
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  }, [ingredients, userSession?.shift]);

  const availableExtras = useMemo(() => {
    return activeIngredients.filter(
      (i) => i.isExtra || i.isExtraForPizza || i.ingredientType === 'adicional' || i.ingredientType === 'gratis' || i.category === 'Adicionales' || i.category === 'Toppings'
    );
  }, [activeIngredients]);

  const availableFreeToppings = useMemo(() => {
    return activeIngredients.filter(
      (i) =>
        (i.ingredientType?.toLowerCase() === 'gratis' ||
          i.category?.toLowerCase() === 'gratis' ||
          i.category?.toLowerCase() === 'toppings gratis') &&
        i.available !== false
    );
  }, [activeIngredients]);

  const availableProteins = useMemo(() => {
    return activeIngredients.filter(
      (i) => i.ingredientType === 'proteina' || i.category === 'Proteínas' || i.category === 'Carnes'
    );
  }, [activeIngredients]);

  const availableSalsas = useMemo(() => {
    return activeIngredients.filter(
      (i) => i.category === 'Salsas' || i.ingredientType === 'salsa'
    );
  }, [activeIngredients]);

  // Helper para comparar ítems idénticos en carrito
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

  // Selección de Producto desde Catálogo
  const handleSelectProduct = (product: Product) => {
    const isTargetTakeaway = target.type === 'pickup' || target.type === 'delivery';

    if (isCustomizableProduct(product)) {
      setSelectedBurger(product);
    } else if (product.drinkType === 'jugo' || (product.flavors && product.flavors.length > 0)) {
      setSelectedDrink(product);
    } else {
      // Adición directa al carrito para bebidas o acompañantes estándar
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

  // Adición directa de Salsa (Costo 0.00, no contable, directo a cocina)
  const handleSelectSalsa = (salsa: Ingredient) => {
    const isTargetTakeaway = target.type === 'pickup' || target.type === 'delivery';
    const newItem: OrderItem = {
      id: `item-salsa-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      productId: salsa.id,
      productName: salsa.name.toUpperCase(),
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
    const isDrink = (item.category || '').toLowerCase().includes('bebida') ||
                    (item.category || '').toLowerCase().includes('refresco') ||
                    (item.category || '').toLowerCase().includes('jugo') ||
                    Boolean(item.drinkType) ||
                    Boolean(item.flavor);

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
      category: item.category || (isDrink ? 'Bebidas' : 'Hot Dogs'),
      baseIngredients: [],
    } as Product;

    setEditingCartItem(item);
    if (isDrink) {
      setSelectedDrink(prod);
      setSelectedBurger(null);
    } else {
      setSelectedBurger(prod);
      setSelectedDrink(null);
    }
  };

  // Confirmar Hot Dog personalizado (nuevo o editado)
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
      category: config.burger.category || 'Hot Dogs',
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
      setDeliveryFeeUSD(1.0);
    }
  };

  // Confirmar Bebida seleccionada (nueva o editada)
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
      setDeliveryFeeUSD(1.0);
    }
  };

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

  const hasAnyDeliveryItem = cartItems.some((i) => i.isDelivery);
  const isDeliveryOrder = target.type === 'delivery' || hasAnyDeliveryItem;
  const effectiveDeliveryFee = (hasAnyDeliveryItem || target.type === 'delivery') ? deliveryFeeUSD : 0;
  const itemsSubtotalCOP = cartItems.reduce((sum, item) => sum + (item.price || 0) * item.quantity, 0);
  const cartTotalCOP = itemsSubtotalCOP + effectiveDeliveryFee;

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
      } else if (!stillHasDelivery && target.type !== 'delivery') {
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
      if (target.type !== 'delivery') {
        setDeliveryFeeUSD(0);
        setShowDeliveryConfig(false);
      }
    }
  };

  const handleClearAllDelivery = () => {
    handleSetAllDelivery(false);
  };

  // Envío de Comanda
  const handleSubmitOrder = async () => {
    if (cartItems.length === 0 || isSubmittingOrder) return;

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

    if (target.type === 'pickup' && !customerName.trim()) {
      setOrderError('⚠️ Para PickUp es obligatorio ingresar el nombre o referencia del cliente.');
      return;
    }

    setOrderError(null);
    setIsSubmittingOrder(true);

    try {
      const copRate = exchangeRates?.COP || 3100;
      const totalUSDCalc = copRate > 0 ? (cartTotalCOP / copRate) : 0;
      const deliveryUSDCalc = copRate > 0 ? (effectiveDeliveryFee / copRate) : 0;

      await createOrder({
        type: target.type,
        tableNumber: target.tableNumber,
        customerName: customerName.trim() || undefined,
        kitchenNotes: getCleanItemNote(kitchenNotes) || undefined,
        items: cartItems,
        totalUSD: totalUSDCalc,
        totalCOP: cartTotalCOP,
        deliveryFeeUSD: deliveryUSDCalc,
        deliveryFeeCOP: effectiveDeliveryFee,
        shift: userSession?.shift || 'ambos',
        targetPrinter,
      } as any);

      if (onOrderCreated) {
        onOrderCreated();
      }
      onClose();
    } catch (err: any) {
      setOrderError(err?.message || 'Error al enviar la comanda a cocina y caja.');
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-white border border-gray-200 rounded-2xl shadow-xs">
      {/* 1. Header de Toma de Pedidos */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-yellow-400 border-b border-yellow-500 shrink-0">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-black/10 hover:bg-black/20 text-black font-black transition-all cursor-pointer"
            title="Volver al tablero de mesas"
          >
            <IoArrowBack className="text-lg" />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-sm sm:text-base font-black text-black uppercase tracking-tight">
              {target.title}
            </span>
            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-black text-yellow-400">
              {target.type === 'delivery' ? 'DELIVERY' : target.type === 'pickup' ? 'PICKUP' : 'SALÓN'}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 rounded-xl bg-white hover:bg-red-50 text-gray-800 hover:text-red-700 transition-colors flex items-center gap-1.5 font-black text-xs cursor-pointer border border-gray-200 shadow-xs"
        >
          <IoClose className="text-base" />
          <span>Cerrar Pedido</span>
        </button>
      </div>

      {/* Alerta de Error si la hay */}
      {orderError && (
        <div className="bg-red-50 text-red-700 px-3.5 py-2 text-xs font-bold border-b border-red-200 flex items-center gap-1.5 shrink-0">
          <IoWarningOutline className="text-base shrink-0" />
          <span>{orderError}</span>
        </div>
      )}

      {/* 2. Cuerpo: Split View (Catálogo a la izquierda 65%, Carrito a la derecha 35%) */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0 bg-stone-100">
        {/* IZQUIERDA: Catálogo e Inline Burger / Drink / Delivery Config Panel (65%) */}
        <div className={`flex-1 w-full md:w-[60%] lg:w-[65%] ${selectedBurger || selectedDrink || (showDeliveryConfig && isDeliveryOrder) ? 'p-1 sm:p-1.5' : 'p-2.5 sm:p-3'} border-b md:border-b-0 md:border-r border-gray-200 flex flex-col overflow-hidden min-h-0`}>
          {selectedBurger ? (
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
                  setEditingCartItem(null);
                }}
                defaultTakeaway={target.type === 'pickup'}
                defaultDelivery={target.type === 'delivery'}
                exchangeRates={exchangeRates}
                initialEditItem={editingCartItem}
              />
            </div>
          ) : selectedDrink ? (
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
                defaultTakeaway={target.type === 'pickup'}
                defaultDelivery={target.type === 'delivery'}
                exchangeRates={exchangeRates}
              />
            </div>
          ) : showDeliveryConfig && isDeliveryOrder ? (
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

        {/* DERECHA: Carrito y Formulario (35%) */}
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
                        +${effectiveDeliveryFee.toFixed(2)} USD
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
                  {target.type === 'pickup' ? '👤 Cliente *:' : '👤 Cliente:'}
                </span>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder={target.type === 'pickup' ? 'Nombre o Referencia (*Obligatorio)' : 'Nombre o referencia (opcional)'}
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

                    {/* Proteínas */}
                    {item.proteins && item.proteins.length > 0 && !areProteinsDefault(item.productName, item.proteins) && (
                      <div className="text-xs text-amber-950 font-black bg-yellow-100 px-2 py-0.5 rounded-lg border border-yellow-300 inline-block">
                        🥩 {item.proteins.join(' + ')}
                      </div>
                    )}

                    {/* Ingredientes Retirados (SIN) */}
                    {item.removedIngredients && item.removedIngredients.length > 0 && (
                      <div className="text-xs text-red-600 font-bold">
                        🚫 SIN: {formatRemovedIngredients(item.removedIngredients).join(', ')}
                      </div>
                    )}

                    {/* Ingredientes Extras (ADD) */}
                    {item.extras && item.extras.length > 0 && (
                      <div className="text-xs text-gray-800 font-bold space-y-0.5">
                        {item.extras.map((ex, exIdx) => (
                          <div key={exIdx} className="flex justify-between">
                            <span>➕ ADD: {(ex.quantity && ex.quantity > 1) ? `${ex.quantity}x ` : ''}{ex.name}</span>
                            {ex.price > 0 && <span className="font-black text-emerald-700">+${ex.price.toFixed(2)}</span>}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Preferencia de Azúcar */}
                    {item.sugarPreference && (
                      <div className="text-xs text-blue-700 font-bold">
                        🥤 Azúcar: {item.sugarPreference}
                      </div>
                    )}

                    {/* Nota del ítem */}
                    {getCleanItemNote(item.notes) && (
                      <div className="text-xs text-gray-600 italic">
                        📝 Nota: {getCleanItemNote(item.notes)}
                      </div>
                    )}

                    {/* Controles de Cantidad y Eliminar */}
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

          {/* Footer del Carrito: Totales e Impresión */}
          <div className="pt-2 border-t border-gray-200 shrink-0 space-y-2 mt-2">
            <div className="bg-white p-3 rounded-2xl border border-gray-200 space-y-1 shadow-xs">
              <div className="flex justify-between text-xs sm:text-sm font-bold text-gray-600">
                <span>Subtotal Ítems:</span>
                <span className="text-black font-black">{Math.round(itemsSubtotalCOP).toLocaleString('es-CO')} COP</span>
              </div>

              {isDeliveryOrder && (
                <div className="flex justify-between text-xs sm:text-sm font-bold text-gray-600">
                  <span>Costo Delivery:</span>
                  <span className="text-black font-black">+{Math.round(effectiveDeliveryFee).toLocaleString('es-CO')} COP</span>
                </div>
              )}

              <div className="flex justify-between items-baseline pt-1.5 border-t border-gray-100">
                <span className="text-xs sm:text-sm font-black text-gray-900 uppercase">Total a Pagar:</span>
                <div className="text-right">
                  <span className="text-xl sm:text-2xl font-black text-black block leading-none">
                    {Math.round(cartTotalCOP).toLocaleString('es-CO')} <span className="text-xs font-bold text-gray-500">COP</span>
                  </span>
                  <span className="text-xs text-gray-600 font-bold block mt-1">
                    🇺🇸 ${(exchangeRates.COP > 0 ? cartTotalCOP / exchangeRates.COP : 0).toFixed(2)} USD | 🇻🇪 {(exchangeRates.Bs > 0 ? cartTotalCOP / exchangeRates.Bs : 0).toFixed(2)} Bs
                  </span>
                </div>
              </div>
            </div>

            {/* Selector de Impresora */}
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
  );
};
