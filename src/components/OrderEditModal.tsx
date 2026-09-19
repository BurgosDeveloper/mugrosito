import React, { useState, useEffect, useMemo } from 'react';
import { Order, OrderItem, Product, Ingredient } from '../data/mockData';
import { getIngredientExtraPrice } from '../utils/pizzaPricing';
import { IoClose, IoCreateOutline, IoTrashOutline, IoAddCircleOutline, IoCheckmarkCircleOutline, IoChevronDownOutline, IoChevronUpOutline } from 'react-icons/io5';

interface OrderEditModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  ingredients: Ingredient[];
  exchangeRates?: { COP: number; Bs: number };
  onSaveEdit: (orderId: string, payload: {
    items: OrderItem[];
    kitchenNotes?: string;
    totalUSD: number;
    totalCOP?: number;
    customerName?: string;
    tableNumber?: number;
    type?: 'mesa' | 'llevar' | 'delivery' | 'pickup' | 'credito';
    deliveryFeeUSD?: number;
    deliveryFeeCOP?: number;
  }) => Promise<void>;
  onDeletePaymentEntry?: (orderId: string, paymentId: string) => Promise<Order>;
  onDeleteOrder?: (orderId: string) => Promise<void>;
}

export const OrderEditModal: React.FC<OrderEditModalProps> = ({
  order,
  isOpen,
  onClose,
  products,
  ingredients,
  exchangeRates = { COP: 3100, Bs: 3.2 },
  onSaveEdit,
  onDeletePaymentEntry,
  onDeleteOrder,
}) => {
  const [customerName, setCustomerName] = useState('');
  const [tableNumber, setTableNumber] = useState<number | ''>('');
  const [type, setType] = useState<'mesa' | 'llevar' | 'delivery' | 'pickup' | 'credito'>('mesa');
  const [kitchenNotes, setKitchenNotes] = useState('');
  const [items, setItems] = useState<OrderItem[]>([]);
  const [paymentHistory, setPaymentHistory] = useState<Order['paymentHistory']>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedProductToAdd, setSelectedProductToAdd] = useState<string>('');
  const [deliveryFeeUSD, setDeliveryFeeUSD] = useState<number | ''>('');
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const availableExtras = useMemo(() => ingredients.filter(i => i.isExtraForPizza).sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })), [ingredients]);
  const allPizzaProducts = useMemo(() => products.filter(p => p.category === 'Pizzas').sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })), [products]);

  useEffect(() => {
    if (order) {
      setCustomerName(order.customerName || '');
      setTableNumber(order.tableNumber || '');
      setType(order.type || 'mesa');
      const copR = exchangeRates?.COP || 3100;
      const initialFeeCOP = order.deliveryFeeCOP !== undefined && order.deliveryFeeCOP !== null
        ? Number(order.deliveryFeeCOP)
        : (order.deliveryFeeUSD && copR > 0 ? Math.round(Number(order.deliveryFeeUSD) * copR) : 0);
      setDeliveryFeeUSD(initialFeeCOP);
      setItems(JSON.parse(JSON.stringify(order.items || [])));
      setPaymentHistory(order.paymentHistory ? [...order.paymentHistory] : []);
      setExpandedItemId(null);
      setError('');
    }
  }, [order, exchangeRates?.COP]);

  if (!isOpen || !order) return null;

  const hasPaymentHistory = (paymentHistory?.length || 0) > 0;

  const calculateItemPrice = (item: OrderItem) => {
    const prod = products.find(p => p.id === item.productId);
    if (!prod) return item.price || 0;

    if (prod.category === 'Pizzas') {
      let basePrice = prod.price;
      let smallPrice = prod.priceSmall ?? (prod.price > 4 ? prod.price - 4 : prod.price * 0.7);

      if (item.isHalfHalf && item.halfDetails) {
        const p1 = products.find(p => p.name === item.halfDetails!.half1Name);
        const p2 = products.find(p => p.name === item.halfDetails!.half2Name);
        const price1 = p1 ? p1.price : 0;
        const price2 = p2 ? p2.price : 0;
        basePrice = Math.max(price1, price2);
        
        const small1 = p1 ? (p1.priceSmall ?? (p1.price > 4 ? p1.price - 4 : p1.price * 0.7)) : 0;
        const small2 = p2 ? (p2.priceSmall ?? (p2.price > 4 ? p2.price - 4 : p2.price * 0.7)) : 0;
        smallPrice = Math.max(small1, small2);
      }

      const effectiveBasePrice = item.size === 'Pequeña' ? smallPrice : basePrice;
      
      const combinedExtras = item.isHalfHalf && item.halfDetails 
        ? [...(item.halfDetails.half1Extras || []), ...(item.halfDetails.half2Extras || [])]
        : (item.extras || []);
      
      const extrasTotal = combinedExtras.reduce((sum, e) => sum + (e.price || 0), 0);
      return Math.max(2.0, effectiveBasePrice + extrasTotal);
    }

    const extrasTotal = (item.extras || []).reduce((sum, e) => sum + (e.price || 0) * (e.quantity || 1), 0);
    if (extrasTotal > 0) {
      return (prod.price || 0) + extrasTotal;
    }
    return item.price || prod.price || 0;
  };

  const calculateTotal = (currentItems: OrderItem[]) => {
    const itemsSum = currentItems.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0);
    const fee = type === 'delivery' ? (parseFloat(String(deliveryFeeUSD)) || 0) : 0;
    return itemsSum + fee;
  };

  const updateItem = (index: number, updater: (item: OrderItem) => OrderItem) => {
    const updated = [...items];
    const newItem = updater(updated[index]);
    newItem.price = calculateItemPrice(newItem);
    updated[index] = newItem;
    setItems(updated);
  };

  const handleQuantityChange = (index: number, delta: number) => {
    const updated = [...items];
    const newQty = (updated[index].quantity || 1) + delta;
    if (newQty <= 0) {
      updated.splice(index, 1);
      setItems(updated);
    } else {
      updateItem(index, item => ({ ...item, quantity: newQty }));
    }
  };

  const handleRemoveItem = (index: number) => {
    const item = items[index];
    if (item && item.isPaidIndividually) {
      setError(`El producto "${item.productName}" ya fue pagado individualmente por ${item.paidByName || 'un cliente'}. Primero anula ese pago en el historial de pagos para poder eliminarlo.`);
      return;
    }
    setError('');
    const updated = [...items];
    updated.splice(index, 1);
    setItems(updated);
  };

  const handleAddProduct = () => {
    if (!selectedProductToAdd) return;
    const prod = products.find(p => p.id === selectedProductToAdd);
    if (!prod) return;

    setError('');
    const isJugo = prod.category === 'Bebidas' && prod.drinkType === 'jugo';
    const isPizza = prod.category === 'Pizzas';

    const newItem: OrderItem = {
      id: `it-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      productId: prod.id,
      productName: prod.name,
      price: prod.price,
      quantity: 1,
      size: isPizza ? 'Grande' : undefined,
      isNewOrModified: true,
      removedIngredients: [],
      extras: [],
      isHalfHalf: false,
      isTakeaway: false,
      sugarPreference: isJugo ? 'Con azúcar' : undefined,
    };
    
    if (isPizza) {
      newItem.price = calculateItemPrice(newItem);
    }

    setItems([...items, newItem]);
    setExpandedItemId(newItem.id);
    setSelectedProductToAdd('');
  };

  const handleSave = async () => {
    if (hasPaymentHistory) {
      setError('Anula primero todos los pagos y vueltos antes de modificar los productos.');
      return;
    }
    try {
      setIsSubmitting(true);
      const totalCOP = calculateTotal(items);
      const copRate = exchangeRates?.COP || 3100;
      const totalUSD = copRate > 0 ? totalCOP / copRate : 0;
      const deliveryFeeCOP = type === 'delivery' ? (parseFloat(String(deliveryFeeUSD)) || 0) : 0;
      const deliveryFeeUSDCalc = copRate > 0 ? deliveryFeeCOP / copRate : 0;
      await onSaveEdit(order.id, {
        items,
        kitchenNotes,
        totalUSD,
        totalCOP,
        customerName,
        tableNumber: tableNumber ? Number(tableNumber) : undefined,
        type: type === 'llevar' ? 'pickup' : type,
        deliveryFeeUSD: deliveryFeeUSDCalc,
        deliveryFeeCOP,
      });
      onClose();
    } catch (e) {
      console.error('Error al guardar edición:', e);
      setError(e instanceof Error ? e.message : 'No se pudo guardar la edición.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentTotal = calculateTotal(items);

  const toggleExpanded = (id: string) => {
    setExpandedItemId(prev => prev === id ? null : id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/75 backdrop-blur-md animate-fade-in">
      <div className="bg-[#1e293b] rounded-3xl shadow-2xl border border-slate-600 w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh] text-white">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-black/20 border border-white/20 flex items-center justify-center font-black">
              <IoCreateOutline className="text-2xl" />
            </div>
            <div>
              <h3 className="text-xl font-black tracking-tight">Edición Completa - Comanda #{order.orderNumber}</h3>
              <p className="text-xs text-emerald-100 font-bold">Modo Caja / Administrador: Modifica datos, productos o anula pagos</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-black/20 hover:bg-black/30 text-white flex items-center justify-center transition-colors"
          >
            <IoClose className="text-xl" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-[#0f172a]">
          {/* Metadata Section */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 rounded-2xl bg-[#1e293b] border border-slate-700">
            <div>
              <label className="block text-[11px] font-black text-slate-400 uppercase mb-1">Nombre Cliente</label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Cliente General"
                className="w-full px-3 py-2 rounded-xl border border-slate-600 bg-[#0f172a] font-bold text-sm text-white focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-black text-slate-400 uppercase mb-1">Mesa / Ubicación</label>
              <input
                type="number"
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value ? Number(e.target.value) : '')}
                placeholder="Nº Mesa"
                className="w-full px-3 py-2 rounded-xl border border-slate-600 bg-[#0f172a] font-bold text-sm text-white focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-black text-slate-400 uppercase mb-1">Tipo de Pedido</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as 'mesa' | 'llevar' | 'delivery')}
                className="w-full px-3 py-2 rounded-xl border border-slate-600 bg-[#0f172a] font-bold text-sm text-white focus:ring-2 focus:ring-emerald-500 outline-none capitalize"
              >
                <option value="mesa">Mesa (Comer Aquí)</option>
                <option value="llevar">Para Llevar</option>
                <option value="delivery">Delivery</option>
              </select>
            </div>
            {type === 'delivery' && (
              <div>
                <label className="block text-[11px] font-black text-emerald-400 uppercase mb-1">Costo Delivery (COP)</label>
                <input
                  type="number"
                  step="500"
                  value={deliveryFeeUSD}
                  onChange={(e) => setDeliveryFeeUSD(e.target.value ? parseFloat(e.target.value) : '')}
                  placeholder="2000"
                  className="w-full px-3 py-2 rounded-xl border border-emerald-500/50 bg-emerald-900/20 font-bold text-sm text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
            )}
          </div>

          {/* Item List Management */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider">Modificar Productos del Pedido</h4>
              <span className="text-xs font-bold text-emerald-300 bg-emerald-900/40 px-2.5 py-1 rounded-full border border-emerald-500/30">
                Nuevo Total: {Math.round(currentTotal).toLocaleString('es-CO')} COP (~ ${(exchangeRates.COP > 0 ? currentTotal / exchangeRates.COP : 0).toFixed(2)} USD)
              </span>
            </div>

            <div className="space-y-2">
              {items.map((item, idx) => {
                const isExpanded = expandedItemId === item.id;
                const prod = products.find(p => p.id === item.productId);
                const isPizza = prod?.category === 'Pizzas';
                const isJugo = prod?.category === 'Bebidas' && prod?.drinkType === 'jugo';

                return (
                  <div key={item.id || idx} className="rounded-2xl bg-[#1e293b] border border-slate-700 shadow-sm overflow-hidden transition-all">
                    {/* Header Row */}
                    <div className="p-3.5 flex items-center justify-between gap-3 bg-[#1e293b] hover:bg-slate-800 cursor-pointer" onClick={() => toggleExpanded(item.id)}>
                      <div className="flex items-center gap-2">
                        {isExpanded ? <IoChevronUpOutline className="text-slate-400" /> : <IoChevronDownOutline className="text-slate-400" />}
                        <div>
                          <div className="font-black text-white text-sm">
                            {item.productName} {item.isTakeaway && <span className="text-amber-400 ml-1">(📦 LLEVAR)</span>}
                          </div>
                          <div className="text-xs text-slate-400">
                            {Math.round(item.price || 0).toLocaleString('es-CO')} COP c/u
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => handleQuantityChange(idx, -1)}
                          className="w-8 h-8 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-black text-base flex items-center justify-center"
                        >
                          -
                        </button>
                        <span className="w-8 text-center font-black text-sm text-white">{item.quantity}</span>
                        <button
                          onClick={() => handleQuantityChange(idx, 1)}
                          className="w-8 h-8 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-black text-base flex items-center justify-center"
                        >
                          +
                        </button>
                        <button
                          onClick={() => handleRemoveItem(idx)}
                          className="p-2 rounded-lg bg-red-900/30 hover:bg-red-900/50 text-red-400 transition-colors ml-2"
                          title="Eliminar producto"
                        >
                          <IoTrashOutline className="text-lg" />
                        </button>
                      </div>
                    </div>

                    {/* Expanded Content */}
                    {isExpanded && (
                      <div className="p-4 bg-[#0f172a] border-t border-slate-700 space-y-4">
                        {/* Common Controls */}
                        <div className="flex flex-wrap items-center gap-4">
                          <label className="flex items-center gap-2 text-sm font-bold text-slate-300 cursor-pointer">
                            <input 
                              type="checkbox" 
                              checked={!!item.isTakeaway}
                              onChange={(e) => updateItem(idx, it => ({ ...it, isTakeaway: e.target.checked }))}
                              className="w-4 h-4 accent-emerald-500 rounded bg-[#1e293b] border-slate-600"
                            />
                            📦 Empacar para llevar
                          </label>
                        </div>
                        
                        <div>
                          <label className="block text-[11px] font-black text-slate-400 uppercase mb-1">Notas del ítem</label>
                          <input
                            type="text"
                            value={item.notes || ''}
                            onChange={(e) => updateItem(idx, it => ({ ...it, notes: e.target.value }))}
                            placeholder="Instrucciones específicas..."
                            className="w-full px-3 py-1.5 rounded-xl border border-slate-600 bg-[#1e293b] font-medium text-xs text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                          />
                        </div>

                        {/* Pizza Editor */}
                        {isPizza && (
                          <div className="space-y-4 pt-2 border-t border-slate-700">
                            <div className="flex flex-wrap gap-4">
                                <div>
                                  <label className="block text-[11px] font-black text-emerald-400 uppercase mb-1">Tamaño</label>
                                  <select
                                    value={item.size || 'Grande'}
                                    onChange={(e) => {
                                      const newSize = e.target.value as 'Grande' | 'Pequeña';
                                      updateItem(idx, (it) => {
                                        const updatedExtras = (it.extras || []).map((ex) => {
                                          const ing = ingredients.find((i) => i.name === ex.name);
                                          return { name: ex.name, price: getIngredientExtraPrice(ing, newSize, false) };
                                        });
                                        const updatedHalf1Extras = (it.halfDetails?.half1Extras || []).map((ex) => {
                                          const ing = ingredients.find((i) => i.name === ex.name);
                                          return { name: ex.name, price: getIngredientExtraPrice(ing, newSize, true) };
                                        });
                                        const updatedHalf2Extras = (it.halfDetails?.half2Extras || []).map((ex) => {
                                          const ing = ingredients.find((i) => i.name === ex.name);
                                          return { name: ex.name, price: getIngredientExtraPrice(ing, newSize, true) };
                                        });
                                        return {
                                          ...it,
                                          size: newSize,
                                          extras: updatedExtras,
                                          halfDetails: it.halfDetails
                                            ? {
                                                ...it.halfDetails,
                                                half1Extras: updatedHalf1Extras,
                                                half2Extras: updatedHalf2Extras,
                                              }
                                            : undefined,
                                        };
                                      });
                                    }}
                                    className="px-3 py-1.5 rounded-xl border border-emerald-500/50 bg-[#1e293b] font-bold text-xs text-white outline-none"
                                  >
                                    <option value="Grande">Grande</option>
                                    <option value="Pequeña">Pequeña</option>
                                  </select>
                                </div>

                              {!item.isHalfHalf && (
                                <div>
                                  <label className="block text-[11px] font-black text-emerald-400 uppercase mb-1">Pizza</label>
                                  <select
                                    value={item.productId}
                                    onChange={(e) => {
                                      const selectedPizza = allPizzaProducts.find((pizza) => pizza.id === e.target.value);
                                      if (!selectedPizza) return;
                                      updateItem(idx, (currentItem) => ({
                                        ...currentItem,
                                        productId: selectedPizza.id,
                                        productName: selectedPizza.name,
                                        removedIngredients: [],
                                        extras: [],
                                        isHalfHalf: false,
                                        halfDetails: undefined,
                                      }));
                                    }}
                                    className="px-3 py-1.5 rounded-xl border border-emerald-500/50 bg-[#1e293b] font-bold text-xs text-white outline-none"
                                  >
                                    {allPizzaProducts.map((pizza) => <option key={pizza.id} value={pizza.id}>{pizza.name}</option>)}
                                  </select>
                                </div>
                              )}
                              
                              <div>
                                <label className="block text-[11px] font-black text-emerald-400 uppercase mb-1">Tipo de Pizza</label>
                                <select
                                  value={item.isHalfHalf ? 'mitad' : 'entera'}
                                  onChange={(e) => {
                                    const isHalf = e.target.value === 'mitad';
                                    updateItem(idx, it => {
                                      if (isHalf && !it.halfDetails) {
                                        return {
                                          ...it,
                                          isHalfHalf: true,
                                          halfDetails: {
                                            half1Name: prod?.name || '',
                                            half2Name: prod?.name || '',
                                            half1Removed: [],
                                            half2Removed: [],
                                            half1Extras: [],
                                            half2Extras: []
                                          }
                                        };
                                      } else if (!isHalf) {
                                        return {
                                          ...it,
                                          isHalfHalf: false,
                                          halfDetails: undefined
                                        };
                                      }
                                      return it;
                                    });
                                  }}
                                  className="px-3 py-1.5 rounded-xl border border-emerald-500/50 bg-[#1e293b] font-bold text-xs text-white outline-none"
                                >
                                  <option value="entera">Entera</option>
                                  <option value="mitad">Mitad y Mitad</option>
                                </select>
                              </div>
                            </div>

                            {!item.isHalfHalf ? (
                              <div className="space-y-3">
                                <div>
                                  <label className="block text-[11px] font-black text-slate-400 uppercase mb-2">Ingredientes Base (Click para quitar/poner)</label>
                                  <div className="flex flex-wrap gap-2">
                                    {(prod?.baseIngredients || ['Salsa de Tomate', 'Queso Mozzarella', 'Orégano']).map(ing => {
                                      const isRemoved = item.removedIngredients?.includes(ing);
                                      return (
                                        <button
                                          key={ing}
                                          onClick={() => updateItem(idx, it => {
                                            const removed = it.removedIngredients || [];
                                            return {
                                              ...it,
                                              removedIngredients: isRemoved ? removed.filter(i => i !== ing) : [...removed, ing]
                                            };
                                          })}
                                          className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                                            isRemoved ? 'bg-red-900/30 border-red-500/50 text-red-400 line-through' : 'bg-[#1e293b] border-slate-600 text-slate-300 hover:bg-slate-700'
                                          }`}
                                        >
                                          {ing}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                                <div>
                                  <label className="block text-[11px] font-black text-emerald-400 uppercase mb-2">Extras Adicionales</label>
                                  <div className="flex flex-wrap gap-2">
                                    {availableExtras.map(ext => {
                                      const hasExtra = item.extras?.some(e => e.name === ext.name);
                                      const extraPrice = getIngredientExtraPrice(ext, item.size === 'Pequeña' ? 'Pequeña' : 'Grande', false);
                                      return (
                                        <button
                                          key={ext.id}
                                          onClick={() => updateItem(idx, it => {
                                            const extras = it.extras || [];
                                            return {
                                              ...it,
                                              extras: hasExtra 
                                                ? extras.filter(e => e.name !== ext.name)
                                                : [...extras, { name: ext.name, price: extraPrice }]
                                            };
                                          })}
                                          className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                                            hasExtra ? 'bg-emerald-900/50 border-emerald-500 text-emerald-400' : 'bg-[#1e293b] border-slate-600 text-slate-300 hover:bg-slate-700'
                                          }`}
                                        >
                                          {ext.name} (+{Math.round(extraPrice).toLocaleString('es-CO')} COP)
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {[1, 2].map(halfNum => {
                                  const halfKeyName = `half${halfNum}Name` as keyof typeof item.halfDetails;
                                  const halfKeyRemoved = `half${halfNum}Removed` as keyof typeof item.halfDetails;
                                  const halfKeyExtras = `half${halfNum}Extras` as keyof typeof item.halfDetails;
                                  
                                  const currentPizzaName = item.halfDetails?.[halfKeyName] as string || '';
                                  const currentPizzaProd = products.find(p => p.name === currentPizzaName);
                                  const currentRemoved = (item.halfDetails?.[halfKeyRemoved] as string[]) || [];
                                  const currentExtras = (item.halfDetails?.[halfKeyExtras] as {name: string, price: number}[]) || [];

                                  return (
                                    <div key={halfNum} className="p-3 bg-[#1e293b] rounded-xl border border-slate-700 space-y-3">
                                      <label className="block text-[11px] font-black text-amber-400 uppercase mb-1">Mitad {halfNum}</label>
                                      <select
                                        value={currentPizzaName}
                                        onChange={(e) => updateItem(idx, it => {
                                          const updatedHalfDetails: NonNullable<OrderItem['halfDetails']> = {
                                            ...it.halfDetails!,
                                            [halfKeyName]: e.target.value,
                                            [halfKeyRemoved]: [],
                                            [halfKeyExtras]: [],
                                          };
                                          return {
                                            ...it,
                                            productName: `Pizza 1/2 ${updatedHalfDetails.half1Name.replace('Pizza ', '')} + 1/2 ${updatedHalfDetails.half2Name.replace('Pizza ', '')} (${it.size})`,
                                            halfDetails: updatedHalfDetails,
                                          };
                                        })}
                                        className="w-full px-2 py-1.5 rounded-lg border border-slate-600 bg-[#0f172a] font-bold text-xs text-white outline-none mb-2"
                                      >
                                        {allPizzaProducts.map(p => (
                                          <option key={p.id} value={p.name}>{p.name}</option>
                                        ))}
                                      </select>
                                      
                                      <div>
                                        <div className="text-[10px] text-slate-400 font-bold mb-1">Ingredientes Base</div>
                                        <div className="flex flex-wrap gap-1">
                                          {(currentPizzaProd?.baseIngredients || ['Salsa de Tomate', 'Queso Mozzarella', 'Orégano']).map(ing => {
                                            const isRemoved = currentRemoved.includes(ing);
                                            return (
                                              <button
                                                key={ing}
                                                onClick={() => updateItem(idx, it => {
                                                  const newRemoved = isRemoved ? currentRemoved.filter(i => i !== ing) : [...currentRemoved, ing];
                                                  return { ...it, halfDetails: { ...it.halfDetails!, [halfKeyRemoved]: newRemoved } };
                                                })}
                                                className={`px-1.5 py-0.5 rounded text-[9px] font-bold border transition-colors ${
                                                  isRemoved ? 'bg-red-900/30 border-red-500/50 text-red-400 line-through' : 'bg-[#0f172a] border-slate-600 text-slate-300'
                                                }`}
                                              >
                                                {ing}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      </div>

                                      <div>
                                        <div className="text-[10px] text-emerald-400 font-bold mb-1">Extras</div>
                                        <div className="flex flex-wrap gap-1">
                                          {availableExtras.map(ext => {
                                            const hasExtra = currentExtras.some(e => e.name === ext.name);
                                            const extraPrice = getIngredientExtraPrice(ext, item.size === 'Pequeña' ? 'Pequeña' : 'Grande', true);
                                            return (
                                              <button
                                                key={ext.id}
                                                onClick={() => updateItem(idx, it => {
                                                  const newExtras = hasExtra 
                                                    ? currentExtras.filter(e => e.name !== ext.name)
                                                    : [...currentExtras, { name: ext.name, price: extraPrice }];
                                                  return { ...it, halfDetails: { ...it.halfDetails!, [halfKeyExtras]: newExtras } };
                                                })}
                                                className={`px-1.5 py-0.5 rounded text-[9px] font-bold border transition-colors ${
                                                  hasExtra ? 'bg-emerald-900/50 border-emerald-500 text-emerald-400' : 'bg-[#0f172a] border-slate-600 text-slate-300'
                                                }`}
                                              >
                                                {ext.name} (+${extraPrice.toFixed(2)})
                                              </button>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Jugo Editor */}
                        {isJugo && (
                          <div className="pt-2 border-t border-slate-700">
                            <label className="block text-[11px] font-black text-cyan-400 uppercase mb-2">Preferencia de Azúcar</label>
                            <div className="flex flex-wrap gap-2">
                              {['Con azúcar', 'Poca azúcar', 'Sin azúcar'].map(pref => {
                                const isSelected = item.sugarPreference === pref ||
                                  (pref === 'Con azúcar' && (item.sugarPreference === 'Normal' || !item.sugarPreference)) ||
                                  (pref === 'Poca azúcar' && item.sugarPreference === 'Poco azúcar');
                                return (
                                  <button
                                    key={pref}
                                    type="button"
                                    onClick={() => updateItem(idx, it => ({ ...it, sugarPreference: pref as any }))}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                                      isSelected
                                        ? 'bg-cyan-900/50 border-cyan-500 text-cyan-300 ring-1 ring-cyan-500'
                                        : 'bg-[#1e293b] border-slate-600 text-slate-300 hover:bg-slate-700'
                                    }`}
                                  >
                                    {pref === 'Con azúcar' ? '🍬 Con azúcar' : pref === 'Poca azúcar' ? '🥄 Poca azúcar' : '🍋 Sin azúcar'}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add Product Selector */}
            <div className="flex gap-2 pt-1">
              <select
                value={selectedProductToAdd}
                onChange={(e) => setSelectedProductToAdd(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl border border-slate-600 bg-[#1e293b] font-medium text-xs text-white outline-none"
              >
                <option value="">-- Añadir nuevo producto del menú --</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (${(p.priceSmall || p.price || 0).toFixed(2)})
                  </option>
                ))}
              </select>
              <button
                onClick={handleAddProduct}
                disabled={!selectedProductToAdd}
                className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors ${
                  selectedProductToAdd
                    ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                    : 'bg-slate-700 text-slate-400 cursor-not-allowed'
                }`}
              >
                <IoAddCircleOutline className="text-lg" />
                Añadir
              </button>
            </div>
          </div>

          {/* Kitchen Notes */}
          <div>
            <label className="block text-[11px] font-black text-slate-400 uppercase mb-1">Notas de Cocina / Observaciones</label>
            <textarea
              rows={2}
              value={kitchenNotes}
              onChange={(e) => setKitchenNotes(e.target.value)}
              placeholder="Instrucciones especiales para cocina..."
              className="w-full p-3 rounded-2xl border border-slate-600 bg-[#1e293b] font-medium text-xs text-white focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>

          {/* Payment History Audit & Correction Section */}
          {paymentHistory && paymentHistory.length > 0 && onDeletePaymentEntry && (
            <div className="p-4 rounded-2xl bg-amber-900/20 border border-amber-500/50 space-y-2">
              <h4 className="text-xs font-black uppercase text-amber-400 tracking-wider">Historial de Pagos y Vueltos</h4>
              <p className="text-[11px] text-amber-200/80">Anula primero cada pago o vuelto para poder cambiar los productos sin alterar el historial financiero.</p>

              <div className="space-y-1.5 pt-1">
                {paymentHistory.map((pm) => {
                  const isChange = (pm.changeGivenUSD || 0) > 0 || (pm.changeGivenCOP || 0) > 0 || (pm.changeGivenBs || 0) > 0;
                  const amount = isChange
                    ? pm.changeGivenUSD || pm.changeGivenCOP || pm.changeGivenBs || 0
                    : pm.cashTenderedUSD || pm.cashTenderedCOP || pm.cashTenderedBs || pm.amountPaidUSD || 0;
                  const currency = isChange
                    ? pm.changeGivenUSD ? 'USD' : pm.changeGivenCOP ? 'COP' : 'Bs'
                    : pm.cashTenderedUSD ? 'USD' : pm.cashTenderedCOP ? 'COP' : pm.cashTenderedBs ? 'Bs' : 'USD';
                  return (
                    <div key={pm.id} className="p-2.5 rounded-xl bg-[#0f172a] border border-amber-500/30 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-black text-white mr-2">{isChange ? 'Vuelto' : 'Pago'}: {amount.toLocaleString()} {currency}</span>
                        <span className="text-slate-400">({pm.paymentMethod})</span>
                        <span className="text-slate-500 block text-[10px]">Por: {pm.payerName || 'Cliente'}</span>
                      </div>
                      <button
                        onClick={async () => {
                          if (!window.confirm(`¿Seguro que deseas anular este ${isChange ? 'vuelto' : 'pago'}?`)) return;
                          setPaymentHistory((prev) => (prev || []).filter((p) => p.id !== pm.id));
                          try {
                            const updated = await onDeletePaymentEntry(order.id, pm.id);
                            if (updated && updated.paymentHistory) {
                              setPaymentHistory(updated.paymentHistory);
                            }
                          } catch (deletionError) {
                            if (order?.paymentHistory) {
                              setPaymentHistory(order.paymentHistory);
                            }
                            setError(deletionError instanceof Error ? deletionError.message : 'No se pudo anular el movimiento.');
                          }
                        }}
                        className="px-2.5 py-1 rounded-lg bg-red-900/30 hover:bg-red-900/50 text-red-400 font-bold text-[11px] flex items-center gap-1 transition-colors"
                      >
                        <IoTrashOutline /> Anular {isChange ? 'vuelto' : 'pago'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {error && <p className="rounded-xl border border-red-500/40 bg-red-900/20 p-3 text-xs font-bold text-red-300">{error}</p>}
        </div>

        {/* Footer */}
        <div className="p-4 bg-[#1e293b] border-t border-slate-700 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-bold text-xs transition-colors"
            >
              Cancelar
            </button>
            {onDeleteOrder && (
              <button
                type="button"
                onClick={async () => {
                  if (!window.confirm(`¿Seguro que deseas anular y eliminar completamente la comanda #${order.orderNumber}? Se liberará su número correlativo y se borrarán todos sus registros.`)) return;
                  try {
                    setIsSubmitting(true);
                    await onDeleteOrder(order.id);
                    onClose();
                  } catch (delError) {
                    setError(delError instanceof Error ? delError.message : 'No se pudo anular la comanda');
                    setIsSubmitting(false);
                  }
                }}
                className="px-4 py-2.5 rounded-xl bg-red-950/50 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/40 font-bold text-xs flex items-center gap-1.5 transition-colors"
                title="Anular y eliminar comanda completamente"
              >
                <IoTrashOutline /> Anular Comanda
              </button>
            )}
          </div>
          <button
            onClick={handleSave}
            disabled={isSubmitting || hasPaymentHistory}
            className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-black text-xs shadow-md transition-colors flex items-center gap-2"
          >
            <IoCheckmarkCircleOutline className="text-lg" />
            {isSubmitting ? 'Guardando...' : 'Guardar Cambios de Comanda'}
          </button>
        </div>
      </div>
    </div>
  );
};
