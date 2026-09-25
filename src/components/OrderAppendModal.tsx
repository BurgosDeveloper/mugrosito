import React, { useState, useEffect, useMemo } from 'react';
import { Order, OrderItem, Product, Ingredient } from '../data/mockData';
import { useApp } from '../context/AppContext';
import { ProductTextCatalog } from '../modules/mesero/ProductTextCatalog';
import { BurgerBuilderModal, BurgerOrderConfirmationItem } from '../modules/mesero/BurgerBuilderModal';
import { DrinkSelectorModal, DrinkOrderConfirmationItem } from '../modules/mesero/DrinkSelectorModal';
import { DeliveryConfigPanel } from '../modules/mesero/DeliveryConfigPanel';
import { AdminPinModal } from './AdminPinModal';
import { areProteinsDefault, getCleanItemNote, normalizeProteinName, formatRemovedIngredients } from '../utils/burgerProteins';
import { isCustomizableProduct } from '../utils/productClassifier';
import {
  IoClose,
  IoAdd,
  IoRemove,
  IoTrashOutline,
  IoAlertCircleOutline,
  IoCheckmarkCircle,
  IoRestaurantOutline,
  IoPrintOutline,
  IoPencilOutline,
} from 'react-icons/io5';

interface OrderAppendModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
}

export const OrderAppendModal: React.FC<OrderAppendModalProps> = ({
  order,
  isOpen,
  onClose,
}) => {
  const { products, ingredients, appendOrderItems, exchangeRates, userSession } = useApp();

  // Estados de catálogo y búsqueda
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [itemsToAdd, setItemsToAdd] = useState<OrderItem[]>([]);
  const [removedItemIds, setRemovedItemIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [successToast, setSuccessToast] = useState<string>('');
  const [targetPrinter, setTargetPrinter] = useState<'cocina' | 'caja' | 'ambas' | 'ninguna'>('cocina');

  // Estado para hamburguesa seleccionada (personalización INLINE, idéntica a MeseroPage)
  const [selectedBurger, setSelectedBurger] = useState<Product | null>(null);
  // Estado para bebida seleccionada (sabores / jugos)
  const [selectedDrink, setSelectedDrink] = useState<Product | null>(null);
  const [editingAppendItem, setEditingAppendItem] = useState<{ index: number; item: OrderItem } | null>(null);
  const copRateInitial = exchangeRates?.COP || 3100;
  const getOrderDeliveryFeeCOP = (ord: Order | null) => {
    if (!ord) return 0;
    if (ord.deliveryFeeCOP !== undefined && ord.deliveryFeeCOP !== null) return Number(ord.deliveryFeeCOP);
    if (ord.deliveryFeeUSD && copRateInitial > 0) return Math.round(Number(ord.deliveryFeeUSD) * copRateInitial);
    return 0;
  };

  const [deliveryFeeUSD, setDeliveryFeeUSD] = useState<number>(() => getOrderDeliveryFeeCOP(order));
  const [customerName, setCustomerName] = useState<string>(order?.customerName || '');
  const [kitchenNotes, setKitchenNotes] = useState<string>(order?.kitchenNotes || '');
  const [showDeliveryConfig, setShowDeliveryConfig] = useState<boolean>(false);

  // Modal de PIN para eliminar ítems ya existentes
  const [pinModalState, setPinModalState] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    actionName: string;
    onSuccess: () => void;
  }>({
    isOpen: false,
    title: '',
    description: '',
    actionName: '',
    onSuccess: () => {},
  });

  // Reset al abrir modal
  useEffect(() => {
    if (isOpen) {
      setItemsToAdd([]);
      setRemovedItemIds([]);
      setError('');
      setSuccessToast('');
      setIsSubmitting(false);
      setSearchQuery('');
      setSelectedCategory('Todas');
      setSelectedBurger(null);
      setSelectedDrink(null);
      setEditingAppendItem(null);
      setDeliveryFeeUSD(getOrderDeliveryFeeCOP(order));
      setCustomerName(order?.customerName || '');
      setKitchenNotes(order?.kitchenNotes || '');
      setShowDeliveryConfig(order?.type === 'delivery');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, order?.id, order?.deliveryFeeCOP, order?.deliveryFeeUSD, order?.type, order?.customerName, order?.kitchenNotes]);

  // Filtrar productos por turno si aplica
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

  if (!isOpen || !order) return null;

  const areAppendItemsIdentical = (a: OrderItem, b: OrderItem): boolean => {
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

  const mergeAppendItem = (list: OrderItem[], item: OrderItem): OrderItem[] => {
    const matchIndex = list.findIndex((existing) => areAppendItemsIdentical(existing, item));
    if (matchIndex !== -1) {
      const updated = [...list];
      updated[matchIndex] = {
        ...updated[matchIndex],
        quantity: (updated[matchIndex].quantity || 1) + (item.quantity || 1),
      };
      return updated;
    }
    return [...list, item];
  };

  // Manejo de selección de producto: Hamburguesas abren sección inline; Bebidas con sabores o jugos abren modal; otros directos en 1 clic
  const handleSelectProduct = (prod: Product) => {
    if (isCustomizableProduct(prod)) {
      setSelectedBurger(prod);
    } else if (prod.drinkType === 'jugo' || (prod.flavors && prod.flavors.length > 0)) {
      setSelectedDrink(prod);
    } else {
      // Producto directo (1 solo clic, suma cantidades si se repite)
      const newItem: OrderItem = {
        id: `add-item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        productId: prod.id,
        productName: prod.name,
        price: prod.price,
        quantity: 1,
        category: prod.category || 'Otros',
        drinkType: prod.drinkType,
        isTakeaway: order.type === 'pickup',
        isDelivery: order.type === 'delivery',
        isNewOrModified: true,
      };
      setItemsToAdd((prev) => mergeAppendItem(prev, newItem));
      setSuccessToast(`¡${prod.name} agregado!`);
      setTimeout(() => setSuccessToast(''), 2500);
    }
  };

  // Confirmar Bebida seleccionada (Sabores / Jugos / Multi-unidad)
  const handleConfirmDrinkAdd = (
    configOrList: DrinkOrderConfirmationItem | DrinkOrderConfirmationItem[]
  ) => {
    const list = Array.isArray(configOrList) ? configOrList : [configOrList];
    const generatedItems: OrderItem[] = list.map((config) => {
      const formattedName = config.flavor
        ? `${config.drink.name} (${config.flavor})`
        : config.drink.name;

      return {
        id: `add-item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        productId: config.drink.id,
        productName: formattedName,
        price: config.drink.price,
        quantity: config.quantity,
        category: config.drink.category || 'Bebidas',
        drinkType: config.drink.drinkType,
        sugarPreference: config.sugarPreference,
        flavor: config.flavor,
        isTakeaway: Boolean(config.isTakeaway),
        isDelivery: Boolean(config.isDelivery),
        notes: getCleanItemNote(config.notes) || undefined,
        isNewOrModified: true,
      };
    });

    if (editingAppendItem !== null) {
      setItemsToAdd((prev) => {
        const updated = [...prev];
        updated.splice(editingAppendItem.index, 1, ...generatedItems);
        return updated;
      });
      setEditingAppendItem(null);
      setSuccessToast(`¡Bebida editada y actualizada!`);
    } else {
      setItemsToAdd((prev) => {
        let current = [...prev];
        for (const item of generatedItems) {
          current = mergeAppendItem(current, item);
        }
        return current;
      });
      setSuccessToast(`¡${list.length} bebida(s) agregada(s)!`);
    }

    if (list.some((c) => c.isDelivery) && deliveryFeeUSD <= 0) {
      setDeliveryFeeUSD(1.0);
    }
    setSelectedDrink(null);
    setTimeout(() => setSuccessToast(''), 2500);
  };

  // Manejo de adición directa de salsas (No contable, costo 0.00)
  const handleSelectSalsa = (salsa: Ingredient) => {
    const newItem: OrderItem = {
      id: `add-salsa-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      productId: salsa.id,
      productName: salsa.name,
      price: 0,
      quantity: 1,
      category: 'Salsas',
      isTakeaway: order.type === 'pickup',
      isDelivery: order.type === 'delivery',
      isNewOrModified: true,
    };
    setItemsToAdd((prev) => mergeAppendItem(prev, newItem));
    setSuccessToast(`¡${salsa.name} agregada!`);
    setTimeout(() => setSuccessToast(''), 2500);
  };

  // Editar ítem nuevo agregado antes de enviar a cocina
  const handleEditAddedItem = (index: number) => {
    const item = itemsToAdd[index];
    if (!item) return;
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

    setEditingAppendItem({ index, item });

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

  // Confirmar adición o edición de hot dog desde la sección INLINE
  const handleConfirmBurgerAdd = (
    configOrList: BurgerOrderConfirmationItem | BurgerOrderConfirmationItem[]
  ) => {
    const list = Array.isArray(configOrList) ? configOrList : [configOrList];
    const generatedItems: OrderItem[] = list.map((config) => ({
      id: `add-bg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
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
      isNewOrModified: true,
    }));

    if (editingAppendItem !== null) {
      setItemsToAdd((prev) => {
        const updated = [...prev];
        updated.splice(editingAppendItem.index, 1, ...generatedItems);
        return updated;
      });
      setEditingAppendItem(null);
      setSuccessToast(`¡Ítem editado y actualizado!`);
    } else {
      setItemsToAdd((prev) => {
        let current = [...prev];
        for (const item of generatedItems) {
          current = mergeAppendItem(current, item);
        }
        return current;
      });
      setSuccessToast(`¡${list.length} producto(s) agregado(s)!`);
    }

    if (list.some((c) => c.isDelivery) && deliveryFeeUSD <= 0) {
      setDeliveryFeeUSD(2000);
    }
    setSelectedBurger(null);
    setTimeout(() => setSuccessToast(''), 2500);
  };

  // Cambiar modo de empaque de ítem a adicionar (Salón, Llevar, Delivery)
  const setAddedItemPackaging = (index: number, mode: 'salon' | 'llevar' | 'delivery') => {
    setItemsToAdd((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        isTakeaway: mode === 'llevar',
        isDelivery: mode === 'delivery',
      };

      const stillHasDelivery =
        updated.some((i) => i.isDelivery) ||
        (order.items || []).some((it) => it.isDelivery && !removedItemIds.includes(it.id));

      if (mode === 'delivery') {
        if (deliveryFeeUSD <= 0) setDeliveryFeeUSD(2000);
        setShowDeliveryConfig(true);
      } else if (!stillHasDelivery && order.type !== 'delivery') {
        setDeliveryFeeUSD(0);
        setShowDeliveryConfig(false);
      }

      return updated;
    });
  };

  const handleSetAllDelivery = (isDelivery: boolean) => {
    setItemsToAdd((prev) =>
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
      const existingHasDelivery = (order.items || []).some(
        (it) => it.isDelivery && !removedItemIds.includes(it.id)
      );
      if (!existingHasDelivery && order.type !== 'delivery') {
        setDeliveryFeeUSD(0);
        setShowDeliveryConfig(false);
      }
    }
  };

  const handleClearAllDelivery = () => {
    handleSetAllDelivery(false);
  };

  // Modificar cantidades de ítems por adicionar
  const handleUpdateAddedQuantity = (index: number, delta: number) => {
    setItemsToAdd((prev) => {
      const updated = [...prev];
      const newQty = (updated[index].quantity || 1) + delta;
      if (newQty <= 0) {
        updated.splice(index, 1);
      } else {
        updated[index] = { ...updated[index], quantity: newQty };
      }
      return updated;
    });
  };

  const handleRemoveAddedItem = (index: number) => {
    setItemsToAdd((prev) => {
      const updated = [...prev];
      updated.splice(index, 1);
      return updated;
    });
  };

  // Eliminar ítem existente (requiere PIN si no es admin)
  const handleToggleRemoveExistingItem = (itemId: string) => {
    if (removedItemIds.includes(itemId)) {
      setRemovedItemIds((prev) => prev.filter((id) => id !== itemId));
    } else {
      if (userSession?.role === 'admin') {
        setRemovedItemIds((prev) => [...prev, itemId]);
      } else {
        setPinModalState({
          isOpen: true,
          title: '🔐 AUTORIZACIÓN REQUERIDA',
          description: 'Ingrese el PIN de administrador para remover este producto ya enviado a cocina:',
          actionName: 'Remover ítem de comanda',
          onSuccess: () => setRemovedItemIds((prev) => [...prev, itemId]),
        });
      }
    }
  };

  const copRate = exchangeRates?.COP || 3100;
  const bsRate = exchangeRates?.Bs || 3.2;

  // Cálculos de montos en COP nativo
  const currentSubtotalCOP = (order.items || []).reduce((sum, item) => {
    if (removedItemIds.includes(item.id)) return sum;
    const priceCOP = (item.price || 0) >= 100 ? (item.price || 0) : ((item.price || 0) * copRate);
    return sum + priceCOP * (item.quantity || 1);
  }, 0);

  const addedSubtotalCOP = itemsToAdd.reduce(
    (sum, item) => {
      const priceCOP = (item.price || 0) >= 100 ? (item.price || 0) : ((item.price || 0) * copRate);
      return sum + priceCOP * (item.quantity || 1);
    },
    0
  );

  const hasDeliveryItems =
    (order.items || []).some((it) => it.isDelivery && !removedItemIds.includes(it.id)) ||
    itemsToAdd.some((it) => it.isDelivery);
  const isDeliveryOrder = order.type === 'delivery' || hasDeliveryItems;
  const effectiveDeliveryFeeCOP = isDeliveryOrder ? deliveryFeeUSD : 0;
  const newTotalCOP = currentSubtotalCOP + addedSubtotalCOP + effectiveDeliveryFeeCOP;
  const newTotalUSD = copRate > 0 ? (newTotalCOP / copRate) : 0;
  const newTotalBs = bsRate > 0 ? (newTotalCOP / bsRate) : 0;

  // Detección si hay productos de cocina entre los agregados
  const hasKitchenItemsToAdd = itemsToAdd.some(
    (item) => item.category !== 'Bebidas' || (item.drinkType && /jugo|merengada|malteada|batido/i.test(item.drinkType))
  );

  // Enviar al servidor
  const handleSaveAppend = async () => {
    if (itemsToAdd.length === 0 && removedItemIds.length === 0) {
      setError('Debes seleccionar al menos un producto del catálogo para adicionar.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      await appendOrderItems(
        order.id,
        itemsToAdd,
        removedItemIds,
        targetPrinter,
        effectiveDeliveryFeeCOP,
        customerName,
        kitchenNotes
      );
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Error al adicionar productos a la comanda.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const cleanOrderNumber = order.orderNumber.toString().replace(/^#+/, '');

  return (
    <>
      {/* PANTALLA COMPLETA GIGANTE (IDÉNTICA AL MODAL DE CREAR PEDIDO) */}
      <div className="fixed inset-0 z-50 flex flex-col bg-stone-100 text-gray-900 w-screen h-screen overflow-hidden animate-in fade-in select-none">
        
        {/* HEADER PRINCIPAL */}
        <header className="bg-white px-4 py-2 border-b-2 border-yellow-400 flex items-center justify-between shrink-0 shadow-xs">
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 rounded-xl bg-yellow-400 text-black text-lg font-black shadow-xs">
              ➕
            </span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-black text-base sm:text-lg text-gray-900 leading-tight">
                  ADICIONAR A COMANDA #{cleanOrderNumber}
                </h3>
                <span className="px-2.5 py-0.5 rounded-lg bg-yellow-400 text-black font-black text-xs border border-yellow-500 shadow-xs">
                  {order.type === 'mesa' ? `Mesa #${order.tableNumber}` : (order.type || 'mesa').toUpperCase()}
                </span>
                <span className="text-xs text-gray-600 font-bold">
                  👤 Cliente: <strong className="text-black">{order.customerName || 'General'}</strong>
                </span>
              </div>
              <span className="text-[11px] text-gray-500 font-bold uppercase block mt-0.5">
                Selección de Hot Dogs, Bebidas y Acompañantes para Adicionar
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setSelectedBurger(null);
              onClose();
            }}
            className="px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-red-50 text-gray-700 hover:text-red-700 transition-colors flex items-center gap-1.5 font-black text-xs cursor-pointer border border-gray-200"
            title="Cerrar ventana de adición"
          >
            <IoClose className="text-xl" />
            <span>Cerrar</span>
          </button>
        </header>

        {/* MENSAJES DE ERROR / ÉXITO */}
        {error && (
          <div className="bg-red-50 text-red-700 px-3 py-1.5 text-xs font-bold border-b border-red-200 flex items-center gap-1.5 shrink-0">
            <IoAlertCircleOutline className="text-lg text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successToast && (
          <div className="bg-emerald-50 text-emerald-800 px-3 py-1 text-xs font-black border-b border-emerald-200 flex items-center gap-1.5 shrink-0 animate-in fade-in">
            <IoCheckmarkCircle className="text-base text-emerald-600 shrink-0" />
            <span>{successToast}</span>
          </div>
        )}

        {/* CUERPO PRINCIPAL: 2 COLUMNAS (IZQUIERDA: CATÁLOGO + INLINE BUILDER 65% | DERECHA: CANASTA Y RESUMEN 35%) */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0 bg-stone-100">
          
          {/* COLUMNA IZQUIERDA: CATÁLOGO, PERSONALIZADOR INLINE Y CONFIGURADOR DE DELIVERY */}
          <div className={`flex-1 md:w-[65%] ${selectedBurger || selectedDrink || (showDeliveryConfig && isDeliveryOrder) ? 'p-1 sm:p-1.5' : 'p-2.5 sm:p-3'} border-r border-gray-200 flex flex-col overflow-hidden min-h-0`}>
            
            {/* Contenedor del Catálogo de Productos (Oculto mientras se personaliza para dar máxima altura) */}
            {selectedBurger ? (
              /* SECCIÓN INLINE DE PERSONALIZACIÓN DE HAMBURGUESAS (Llega hasta arriba con máxima altura) */
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
                    setEditingAppendItem(null);
                  }}
                  onConfirm={(config) => {
                    handleConfirmBurgerAdd(config);
                    setSelectedBurger(null);
                  }}
                  defaultTakeaway={order.type === 'pickup'}
                  defaultDelivery={order.type === 'delivery'}
                  exchangeRates={exchangeRates}
                  initialEditItem={editingAppendItem ? editingAppendItem.item : null}
                />
              </div>
            ) : selectedDrink ? (
              /* SECCIÓN INLINE DE SELECCIÓN DE BEBIDAS / SABORES */
              <div className="flex-1 h-full min-h-0 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                <DrinkSelectorModal
                  drink={selectedDrink}
                  isOpen={true}
                  inline={true}
                  initialEditItem={editingAppendItem ? editingAppendItem.item : null}
                  onClose={() => {
                    setSelectedDrink(null);
                    setEditingAppendItem(null);
                  }}
                  onConfirm={(config) => {
                    handleConfirmDrinkAdd(config);
                    setSelectedDrink(null);
                    setEditingAppendItem(null);
                  }}
                  defaultTakeaway={order.type === 'pickup'}
                  defaultDelivery={order.type === 'delivery'}
                  exchangeRates={exchangeRates}
                />
              </div>
            ) : showDeliveryConfig && isDeliveryOrder ? (
              /* SECCIÓN INLINE DE CONFIGURACIÓN DE DELIVERY */
              <div className="flex-1 h-full min-h-0 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                <DeliveryConfigPanel
                  customerName={customerName}
                  onCustomerNameChange={setCustomerName}
                  kitchenNotes={kitchenNotes}
                  onKitchenNotesChange={setKitchenNotes}
                  deliveryFeeUSD={deliveryFeeUSD}
                  onDeliveryFeeChange={setDeliveryFeeUSD}
                  cartItems={itemsToAdd}
                  onSetItemPackaging={(id, mode) => {
                    const idx = itemsToAdd.findIndex((it) => it.id === id);
                    if (idx !== -1) setAddedItemPackaging(idx, mode);
                  }}
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

          {/* COLUMNA DERECHA: RESUMEN DE COMANDA Y PRODUCTOS A ADICIONAR (35%) */}
          <div className="md:w-[35%] p-2.5 sm:p-3 flex flex-col justify-between bg-gray-50 overflow-hidden min-h-0 border-l border-gray-200">
            
            <div className="flex-1 flex flex-col overflow-hidden min-h-0 space-y-2">
              {/* Banner interactivo de Delivery si la comanda incluye delivery */}
              {isDeliveryOrder && (
                <div className="p-2.5 rounded-2xl bg-blue-50 border-2 border-blue-400 shadow-xs flex items-center justify-between gap-2 shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-2xl shrink-0 p-1 bg-white rounded-xl border border-blue-200">🛵</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-black text-blue-950 uppercase">DELIVERY ACTIVO</span>
                        <span className="text-[11px] font-black bg-blue-600 text-white px-2 py-0.5 rounded-md">
                          +{Math.round(effectiveDeliveryFeeCOP).toLocaleString('es-CO')} COP
                        </span>
                      </div>
                      <span className="text-[11px] font-bold text-blue-800 truncate block mt-0.5">
                        {order.customerName ? order.customerName : 'Cliente de la comanda'}
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
              )}

              <div className="flex items-center justify-between pb-1.5 border-b border-gray-200 shrink-0">
                <span className="text-xs font-black text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                  <IoRestaurantOutline className="text-yellow-600 text-base" />
                  <span>Resumen de la Comanda</span>
                </span>
                <span className="text-xs font-black text-gray-700 bg-white px-2 py-0.5 rounded-lg border border-gray-200 shadow-xs">
                  Actual: {Math.round(currentSubtotalCOP).toLocaleString('es-CO')} COP
                </span>
              </div>

              {/* LISTA SCROLLABLE DE ÍTEMS */}
              <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                
                {/* 1. Ítems ya existentes en la mesa */}
                <div className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-gray-500 block">
                    Ítems ya pedidos en esta comanda:
                  </span>
                  {(order.items || []).map((it) => {
                    const isRemoved = removedItemIds.includes(it.id);
                    return (
                      <div
                        key={it.id}
                        className={`p-2.5 rounded-xl border text-xs sm:text-sm flex items-center justify-between gap-2 transition-all ${
                          isRemoved
                            ? 'bg-red-50 border-red-300 text-red-700 line-through opacity-60'
                            : 'bg-white border-gray-200 text-gray-800 shadow-xs'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="font-black text-black truncate flex items-center gap-1.5 text-xs sm:text-sm">
                            <span>{it.quantity}x {it.productName}</span>
                            {it.isDelivery ? (
                              <span className="text-[9px] font-bold text-blue-700 uppercase bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                                🛵 Delivery
                              </span>
                            ) : it.isTakeaway ? (
                              <span className="text-[9px] font-bold text-amber-700 uppercase bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                🛍️ Llevar
                              </span>
                            ) : (
                              <span className="text-[9px] font-bold text-gray-500 uppercase bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                                ✓ En Comanda
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-600 font-bold mt-0.5">
                            {((it.price || 0) >= 100)
                              ? `${Math.round((it.price || 0) * (it.quantity || 1)).toLocaleString('es-CO')} COP`
                              : `$${((it.price || 0) * (it.quantity || 1)).toFixed(2)} USD`}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleToggleRemoveExistingItem(it.id)}
                          className={`p-2 rounded-xl transition-colors cursor-pointer shrink-0 ${
                            isRemoved
                              ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                              : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                          }`}
                          title={isRemoved ? 'Restaurar ítem' : 'Remover ítem de la comanda'}
                        >
                          <IoTrashOutline className="text-base" />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* 2. Canasta de Nuevos Ítems a Adicionar */}
                <div className="space-y-2 pt-2 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-yellow-950 flex items-center gap-1">
                      <span>✨</span>
                      <span>Nuevos Ítems a Adicionar ({itemsToAdd.reduce((s, i) => s + i.quantity, 0)}):</span>
                    </span>
                    {itemsToAdd.length > 0 && (
                      <span className="text-xs sm:text-sm font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                        +{Math.round(addedSubtotalCOP).toLocaleString('es-CO')} COP
                      </span>
                    )}
                  </div>

                  {itemsToAdd.length > 0 && (
                    <div className="flex items-center justify-between gap-1.5 pb-0.5 pt-0.5">
                      <span className="text-[10px] font-bold text-gray-500">Marcar todo el pedido nuevo:</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleSetAllDelivery(true)}
                          className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100 transition-colors cursor-pointer"
                          title="Marcar todos los ítems agregados como Delivery"
                        >
                          🛵 Todos Delivery
                        </button>
                        <button
                          type="button"
                          onClick={handleClearAllDelivery}
                          className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200 transition-colors cursor-pointer"
                          title="Marcar todos los ítems agregados como Salón"
                        >
                          🍽️ Todos Salón
                        </button>
                      </div>
                    </div>
                  )}

                  {itemsToAdd.length === 0 ? (
                    <div className="p-4 rounded-2xl border-2 border-dashed border-gray-300 bg-white text-center text-xs sm:text-sm font-bold text-gray-400 space-y-1">
                      <p>No has agregado nuevos productos todavía.</p>
                      <p className="text-xs text-gray-400">
                        Toca un hot dog o bebida del catálogo para sumarla a esta comanda.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {itemsToAdd.map((item, idx) => {
                        const isKitchen =
                          item.category !== 'Bebidas' ||
                          (item.drinkType && /jugo|merengada|malteada|batido/i.test(item.drinkType));

                        return (
                          <div
                            key={item.id}
                            className="p-3 rounded-2xl bg-white border-2 border-yellow-400 shadow-xs space-y-2"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-black text-xs sm:text-sm text-black">{item.productName}</span>
                                  {item.category === 'Salsas' ? (
                                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded uppercase bg-amber-100 text-amber-900 border border-amber-300">
                                      🥣 SALSA
                                    </span>
                                  ) : (
                                    <span
                                      className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase ${
                                        isKitchen
                                          ? 'bg-red-100 text-red-800 border border-red-200'
                                          : 'bg-blue-100 text-blue-800 border border-blue-200'
                                      }`}
                                    >
                                      {isKitchen ? '🔥 COCINA' : '🥤 BARRA'}
                                    </span>
                                  )}
                                  {item.cutPreference === 'Picada' && (
                                    <span className="text-[9px] font-bold text-red-600 bg-red-50 px-1 rounded">
                                      🔪 Picada
                                    </span>
                                  )}
                                  {item.isTakeaway && (
                                    <span className="text-[9px] font-bold text-amber-700 bg-amber-50 px-1 rounded">
                                      📦 Llevar
                                    </span>
                                  )}
                                </div>

                                {/* Modificadores */}
                                <div className="text-xs text-gray-600 space-y-0.5 mt-1 font-semibold">
                                  {item.proteins && item.proteins.length > 0 && !areProteinsDefault(item.productName, item.proteins) && (
                                    <div className="text-amber-900 font-bold">🥩 {item.proteins.join(' + ')}</div>
                                  )}
                                  {item.removedIngredients && item.removedIngredients.length > 0 && (
                                    <div className="text-red-600 font-bold">
                                      🚫 SIN {formatRemovedIngredients(item.removedIngredients).join(', ')}
                                    </div>
                                  )}
                                  {item.extras && item.extras.length > 0 && (
                                    <div className="text-gray-800 font-bold">
                                      {item.extras.map((e) => (e.price === 0 ? `✨ ${e.name}` : `+ ADD: ${(e.quantity && e.quantity > 1) ? `${e.quantity}x ` : ''}${e.name} ($${e.price.toFixed(2)})`)).join(' • ')}
                                    </div>
                                  )}
                                  {item.flavor && (
                                    <div className="text-amber-800 font-bold">🍹 Sabor: {item.flavor}</div>
                                  )}
                                  {item.sugarPreference && (
                                    <div className="text-sky-700 font-bold">🥤 Azúcar: {item.sugarPreference}</div>
                                  )}
                                  {getCleanItemNote(item.notes) && (
                                    <div className="italic text-gray-500">"{getCleanItemNote(item.notes)}"</div>
                                  )}
                                </div>

                                {/* Selector de empaque individual: Salón / Llevar / Delivery */}
                                <div className="flex items-center gap-1 mt-1 bg-stone-100 p-0.5 rounded-lg w-fit">
                                  <button
                                    type="button"
                                    onClick={() => setAddedItemPackaging(idx, 'salon')}
                                    className={`px-2 py-0.5 rounded-md text-[10px] font-black transition-colors cursor-pointer ${
                                      !item.isTakeaway && !item.isDelivery
                                        ? 'bg-white text-black shadow-xs border border-gray-200'
                                        : 'text-gray-500 hover:text-black'
                                    }`}
                                  >
                                    🍽️ Salón
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setAddedItemPackaging(idx, 'llevar')}
                                    className={`px-2 py-0.5 rounded-md text-[10px] font-black transition-colors cursor-pointer ${
                                      item.isTakeaway && !item.isDelivery
                                        ? 'bg-amber-400 text-black shadow-xs'
                                        : 'text-gray-500 hover:text-black'
                                    }`}
                                  >
                                    🛍️ Llevar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setAddedItemPackaging(idx, 'delivery')}
                                    className={`px-2 py-0.5 rounded-md text-[10px] font-black transition-colors cursor-pointer ${
                                      item.isDelivery
                                        ? 'bg-blue-500 text-white shadow-xs'
                                        : 'text-gray-500 hover:text-black'
                                    }`}
                                  >
                                    🛵 Delivery
                                  </button>
                                </div>
                              </div>

                              <div className="text-right shrink-0">
                                <span className="text-xs sm:text-sm font-black text-black">
                                  {Math.round((item.price || 0) * (item.quantity || 1)).toLocaleString('es-CO')} COP
                                </span>
                              </div>
                            </div>

                            {/* Controles de Cantidad y Eliminar */}
                            <div className="flex items-center justify-between pt-1.5 border-t border-gray-100">
                              <div className="flex items-center border border-gray-300 rounded-xl bg-stone-50 overflow-hidden">
                                <button
                                  type="button"
                                  onClick={() => handleUpdateAddedQuantity(idx, -1)}
                                  className="px-2.5 py-1 hover:bg-gray-200 text-black font-black text-xs cursor-pointer"
                                >
                                  <IoRemove />
                                </button>
                                <span className="px-3 py-1 text-xs sm:text-sm font-black text-black min-w-[1.5rem] text-center">
                                  {item.quantity}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateAddedQuantity(idx, 1)}
                                  className="px-2.5 py-1 hover:bg-gray-200 text-black font-black text-xs cursor-pointer"
                                >
                                  <IoAdd />
                                </button>
                              </div>

                              <div className="flex items-center gap-1.5">
                                {item.category !== 'Salsas' && (
                                  <button
                                    type="button"
                                    onClick={() => handleEditAddedItem(idx)}
                                    className="px-2.5 py-1 rounded-xl text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 font-black text-xs flex items-center gap-1 transition-colors cursor-pointer shadow-2xs active:scale-95"
                                    title="Editar personalización de este ítem"
                                  >
                                    <IoPencilOutline className="text-sm" />
                                    <span>Editar</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleRemoveAddedItem(idx)}
                                  className="text-gray-400 hover:text-red-600 p-1.5 transition-colors cursor-pointer"
                                  title="Eliminar ítem agregado"
                                >
                                  <IoTrashOutline className="text-base" />
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

              {/* AVISO DE IMPRESIÓN TÉRMICA SELECTIVA */}
              <div className="p-2.5 rounded-xl bg-amber-50/80 border border-yellow-300 text-xs text-yellow-950 font-bold flex items-center gap-2 shrink-0">
                <IoPrintOutline className="text-base text-yellow-700 shrink-0" />
                <span>
                  {hasKitchenItemsToAdd ? (
                    <span>🔥 <strong>Cocina:</strong> Los ítems de cocina se imprimirán en el ticket térmico. Las bebidas solo se sumarán a la cuenta.</span>
                  ) : (
                    <span>🥤 <strong>Solo barra/bebidas:</strong> No se enviará ticket a cocina, solo se sumarán a la comanda.</span>
                  )}
                </span>
              </div>
            </div>

            {/* TOTALES DE LA ADICIÓN Y BOTONES DE ACCIÓN */}
            <div className="bg-white p-3 sm:p-4 rounded-2xl border border-gray-200 shadow-xs space-y-2.5 shrink-0 mt-2">
              <div className="flex items-baseline justify-between font-bold text-xs sm:text-sm text-gray-600">
                <span>Actual: {Math.round(currentSubtotalCOP).toLocaleString('es-CO')} COP</span>
                <span>+ Adición: <strong className="text-yellow-700 font-black">+{Math.round(addedSubtotalCOP).toLocaleString('es-CO')} COP</strong></span>
              </div>

              {isDeliveryOrder && effectiveDeliveryFeeCOP > 0 && (
                <div className="flex items-baseline justify-between font-bold text-xs sm:text-sm text-gray-600">
                  <span>Costo Delivery:</span>
                  <span className="text-blue-700 font-black">+{Math.round(effectiveDeliveryFeeCOP).toLocaleString('es-CO')} COP</span>
                </div>
              )}

              <div className="flex items-baseline justify-between pt-1.5 border-t border-gray-100">
                <span className="text-xs sm:text-sm font-black text-gray-800 uppercase">Nuevo Total:</span>
                <div className="text-right">
                  <span className="text-xl sm:text-2xl font-black text-black">
                    {Math.round(newTotalCOP).toLocaleString('es-CO')} <span className="text-xs font-bold text-gray-500">COP</span>
                  </span>
                  <div className="text-xs font-bold text-gray-600 mt-0.5">
                    🇺🇸 ${newTotalUSD.toFixed(2)} USD • 🇻🇪 {newTotalBs.toFixed(2)} Bs
                  </div>
                </div>
              </div>

              {/* Selector de Impresora al Adicionar */}
              <div className="pt-2 border-t border-gray-100 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-gray-800 flex items-center gap-1.5">
                    <IoPrintOutline className="text-sm text-yellow-600" />
                    <span>Imprimir Adición en:</span>
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

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-3 rounded-xl bg-stone-100 hover:bg-stone-200 text-gray-800 font-black text-xs sm:text-sm transition-colors border border-gray-300 cursor-pointer"
                >
                  CANCELAR
                </button>
                <button
                  type="button"
                  onClick={handleSaveAppend}
                  disabled={isSubmitting || (itemsToAdd.length === 0 && removedItemIds.length === 0)}
                  className="flex-[2] py-3 rounded-xl bg-yellow-400 hover:bg-yellow-500 disabled:opacity-50 text-black font-black text-xs sm:text-sm border-2 border-yellow-500 shadow-md flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:cursor-not-allowed"
                >
                  <IoCheckmarkCircle className="text-lg" />
                  <span>
                    {isSubmitting
                      ? 'GUARDANDO...'
                      : hasKitchenItemsToAdd
                      ? `CONFIRMAR Y ENVIAR A COCINA (${itemsToAdd.length})`
                      : `CONFIRMAR ADICIÓN (${itemsToAdd.length})`}
                  </span>
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* MODAL DE PIN PARA AUTORIZACIÓN DE ELIMINACIÓN DE ÍTEMS EXISTENTES */}
      <AdminPinModal
        isOpen={pinModalState.isOpen}
        title={pinModalState.title}
        description={pinModalState.description}
        actionName={pinModalState.actionName}
        onSuccess={pinModalState.onSuccess}
        onClose={() => setPinModalState((prev) => ({ ...prev, isOpen: false }))}
      />
    </>
  );
};
