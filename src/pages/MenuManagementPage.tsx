import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Product, Ingredient, Table, RecipeIngredient, DualPrintersConfig } from '../data/mockData';
import { AdminPinModal } from '../components/AdminPinModal';

import {
  IoAdd,
  IoTrash,
  IoClose,
  IoSparkles,
  IoBeer,
  IoLockClosed,
  IoShieldCheckmark,
  IoKeypad,
  IoCheckmarkCircle,
  IoPrintOutline,
  IoRestaurantOutline,
  IoCardOutline,
  IoLayersOutline,
} from 'react-icons/io5';

export const MenuManagementPage: React.FC = () => {
  const {
    products,
    ingredients,
    tables,
    addProduct,
    updateProduct,
    deleteProduct,
    addIngredient,
    updateIngredient,
    deleteIngredient,
    addTable,
    updateTable,
    deleteTable,
    getAdminPin,
    updateAdminPin,
    getPrintersConfig,
    updatePrintersConfig,
    testPrinter,
    userSession,
    exchangeRates,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'pizzas' | 'bebidas' | 'ingredientes' | 'mesas' | 'seguridad' | 'impresoras'>('pizzas');
  const [isCashierUnlocked, setIsCashierUnlocked] = useState<boolean>(userSession?.role === 'admin');
  const [currentPin, setCurrentPin] = useState<string>('1234');
  const [newPinInput, setNewPinInput] = useState<string>('');
  const [confirmPinInput, setConfirmPinInput] = useState<string>('');
  const [pinFeedback, setPinFeedback] = useState<string>('');
  const [pinError, setPinError] = useState<string>('');
  const [isSavingPin, setIsSavingPin] = useState<boolean>(false);

  // Estado de Configuración de Impresoras Duales
  const [printersConfig, setPrintersConfig] = useState<DualPrintersConfig>({
    cocina: { name: 'Impresora Cocina / KDS', enabled: true, host: '192.168.1.200', port: 9100, timeoutMs: 5000, copies: 1, connectionType: 'lan', paperWidth: '80mm', usbDeviceName: '' },
    caja: { name: 'Impresora Caja / Mostrador', enabled: true, host: '192.168.1.201', port: 9100, timeoutMs: 5000, copies: 1, connectionType: 'usb', paperWidth: '58mm', usbDeviceName: 'POS-58' },
  });
  const [isSavingPrinters, setIsSavingPrinters] = useState(false);
  const [printersFeedback, setPrintersFeedback] = useState('');
  const [printersError, setPrintersError] = useState('');
  const [testingPrinterKey, setTestingPrinterKey] = useState<string | null>(null);

  useEffect(() => {
    if (userSession?.role === 'admin' || isCashierUnlocked) {
      void getAdminPin().then((pin) => setCurrentPin(pin)).catch(() => {});
      void getPrintersConfig().then((cfg) => {
        if (cfg) setPrintersConfig(cfg);
      }).catch(() => {});
    }
  }, [userSession, isCashierUnlocked, getAdminPin, getPrintersConfig]);

  // Modal Hamburguesa (Crear / Editar)
  const [isAddPizzaOpen, setIsAddPizzaOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [pizzaName, setPizzaName] = useState('');
  const [dishCategory, setDishCategory] = useState<string>('Hot Dogs');
  const [pizzaPrice, setPizzaPrice] = useState('');
  const [pizzaDesc, setPizzaDesc] = useState('');
  const [burgerProteinCount, setBurgerProteinCount] = useState<number>(1);
  const [burgerDefaultProteins, setBurgerDefaultProteins] = useState<string[]>([]);
  const [selectedBaseIngredients, setSelectedBaseIngredients] = useState<string[]>([]);

  const handleSetSlotProtein = (slotIdx: number, proteinName: string) => {
    setBurgerDefaultProteins((prev) => {
      const next = [...prev];
      while (next.length <= slotIdx) {
        next.push('');
      }
      next[slotIdx] = proteinName;
      return next;
    });
  };

  const handleStartEditPizza = (product: Product) => {
    setEditingProductId(product.id);
    setPizzaName(product.name);
    setDishCategory(product.category || 'Hot Dogs');
    setPizzaPrice(product.price.toString());
    setPizzaDesc(product.description || '');
    setSelectedBaseIngredients(product.baseIngredients || []);
    setBurgerProteinCount(product.proteinCount || 1);
    setBurgerDefaultProteins(product.defaultProteins || []);
    setIsAddPizzaOpen(true);
  };

  const handleCreatePizza = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pizzaName || !pizzaPrice) return;

    const pPrice = parseFloat(pizzaPrice) || 0;
    const finalDefaultProteins = burgerDefaultProteins
      .slice(0, burgerProteinCount)
      .map((p) => (p || '').trim())
      .filter(Boolean);

    const productData = {
      name: pizzaName,
      category: dishCategory || 'Hot Dogs',
      price: pPrice,
      description: pizzaDesc || 'Delicioso hot dog artesanal Mugrosito.',
      image: '/logo_default.png',
      baseIngredients: selectedBaseIngredients,
      proteinCount: burgerProteinCount,
      defaultProteins: finalDefaultProteins,
      recipe: [] as RecipeIngredient[],
      shift: userSession?.shift || 'ambos'
    };

    if (editingProductId) {
      await updateProduct(editingProductId, productData);
    } else {
      await addProduct(productData);
    }

    setEditingProductId(null);
    setPizzaName('');
    setDishCategory('Hot Dogs');
    setPizzaPrice('');
    setPizzaDesc('');
    setSelectedBaseIngredients([]);
    setBurgerProteinCount(1);
    setBurgerDefaultProteins([]);
    setIsAddPizzaOpen(false);
  };

  // Modal Nueva Bebida / Editar
  const [isAddDrinkOpen, setIsAddDrinkOpen] = useState(false);
  const [editingDrinkId, setEditingDrinkId] = useState<string | null>(null);
  const [drinkName, setDrinkName] = useState('');
  const [drinkType, setDrinkType] = useState<string>('refresco');
  const [drinkPrice, setDrinkPrice] = useState('');
  const [drinkDesc, setDrinkDesc] = useState('');
  const [drinkFlavors, setDrinkFlavors] = useState<string[]>([]);
  const [flavorInput, setFlavorInput] = useState('');

  const handleStartEditDrink = (p: Product) => {
    setEditingDrinkId(p.id);
    setDrinkName(p.name);
    setDrinkType(p.drinkType || 'refresco');
    setDrinkPrice(p.price.toString());
    setDrinkDesc(p.description || '');
    setDrinkFlavors(p.flavors || []);
    setFlavorInput('');
    setIsAddDrinkOpen(true);
  };

  const handleCreateDrink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!drinkName || !drinkPrice) return;

    const currentList = [...drinkFlavors];
    if (flavorInput.trim()) {
      const parts = flavorInput.split(',').map((f) => f.trim()).filter(Boolean);
      for (const p of parts) {
        if (!currentList.some((ex) => ex.toLowerCase() === p.toLowerCase())) {
          currentList.push(p);
        }
      }
    }
    const finalFlavors = currentList.map((f) => (f || '').trim()).filter(Boolean);

    const drinkData = {
      name: drinkName,
      category: 'Bebidas' as const,
      drinkType: drinkType,
      price: parseFloat(drinkPrice) || 0,
      description: drinkDesc || 'Bebida bien fría.',
      image: '/logo_default.png',
      flavors: finalFlavors,
      recipe: [] as RecipeIngredient[],
      shift: userSession?.shift || 'ambos'
    };

    if (editingDrinkId) {
      await updateProduct(editingDrinkId, drinkData);
    } else {
      await addProduct(drinkData);
    }

    setEditingDrinkId(null);
    setDrinkName('');
    setDrinkPrice('');
    setDrinkDesc('');
    setDrinkFlavors([]);
    setFlavorInput('');
    setIsAddDrinkOpen(false);
  };

  // Modal Nuevo Ingrediente / Editar
  const [isAddIngOpen, setIsAddIngOpen] = useState(false);
  const [editingIngredientId, setEditingIngredientId] = useState<string | null>(null);
  const [ingName, setIngName] = useState('');
  const [ingType, setIngType] = useState<'proteina' | 'gratis' | 'adicional' | 'base' | 'salsa'>('adicional');
  const [ingPriceUSD, setIngPriceUSD] = useState('1.00');
  const [ingredientFilter, setIngredientFilter] = useState<'todos' | 'proteina' | 'gratis' | 'adicional' | 'base' | 'salsa'>('todos');

  const handleStartEditIngredient = (ing: Ingredient) => {
    setEditingIngredientId(ing.id);
    setIngName(ing.name);
    const resolvedType = ing.ingredientType || (ing.category === 'Salsas' ? 'salsa' : ing.category === 'Gratis' ? 'gratis' : ing.category === 'Proteínas' ? 'proteina' : ing.isBaseForPizza ? 'base' : 'adicional');
    setIngType(resolvedType);
    setIngPriceUSD(((ing.priceUSD !== undefined ? ing.priceUSD : ing.priceGrandeCompleta) || 0).toString());
    setIsAddIngOpen(true);
  };

  const handleCreateIngredient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ingName) return;

    const pUSD = (ingType === 'adicional' || ingType === 'proteina' || ingType === 'salsa') ? (parseFloat(ingPriceUSD) || 0) : 0;

    const ingData = {
      name: ingName,
      ingredientType: ingType,
      priceUSD: pUSD,
      priceGrandeCompleta: pUSD,
      priceGrandeMitad: pUSD > 0 ? pUSD / 2 : 0,
      pricePequenaCompleta: pUSD,
      pricePequenaMitad: pUSD > 0 ? pUSD / 2 : 0,
      isBaseForPizza: ingType === 'base',
      isExtraForPizza: ingType === 'adicional' || ingType === 'proteina' || ingType === 'salsa',
      category: ingType === 'salsa' ? 'Salsas' : ingType === 'proteina' ? 'Proteínas' : ingType === 'gratis' ? 'Gratis' : ingType === 'adicional' ? 'Adicionales' : 'Base',
      shift: userSession?.shift || 'ambos'
    };

    if (editingIngredientId) {
      await updateIngredient(editingIngredientId, ingData);
    } else {
      await addIngredient(ingData);
    }

    setEditingIngredientId(null);
    setIngName('');
    setIngType('adicional');
    setIngPriceUSD('1.00');
    setIsAddIngOpen(false);
  };

  // Modal Nueva Mesa / Editar
  const [isAddTableOpen, setIsAddTableOpen] = useState(false);
  const [editingTableId, setEditingTableId] = useState<string | null>(null);
  const [tableNumber, setTableNumber] = useState('');
  const [tableName, setTableName] = useState('');
  const [tableCapacity, setTableCapacity] = useState('4');
  const [tableZone, setTableZone] = useState('Salón Principal');

  const handleStartEditTable = (t: Table) => {
    setEditingTableId(t.id);
    setTableNumber(t.number.toString());
    setTableName(t.name || `Mesa #${t.number}`);
    setTableCapacity(t.capacity.toString());
    setTableZone(t.zone || 'Salón Principal');
    setIsAddTableOpen(true);
  };

  const handleCreateTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tableNumber) return;

    const num = parseInt(tableNumber, 10);
    const tableData = {
      number: num,
      name: tableName || `Mesa #${num}`,
      capacity: parseInt(tableCapacity, 10) || 4,
      zone: tableZone || 'Salón Principal',
    };

    if (editingTableId) {
      await updateTable(editingTableId, tableData);
    } else {
      await addTable(tableData);
    }

    setEditingTableId(null);
    setTableNumber('');
    setTableName('');
    setTableCapacity('4');
    setTableZone('Salón Principal');
    setIsAddTableOpen(false);
  };

  const toggleBaseIngredientSelection = (name: string) => {
    setSelectedBaseIngredients((prev: string[]) =>
      prev.includes(name) ? prev.filter((n: string) => n !== name) : [...prev, name]
    );
  };

  const shiftProducts = products.filter(p => !p.shift || p.shift === 'ambos' || p.shift === userSession?.shift).sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  const pizzas = shiftProducts.filter((p) => p.category !== 'Bebidas').sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  const bebidas = shiftProducts.filter((p) => p.category === 'Bebidas').sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  const shiftIngredients = ingredients.filter(i => !i.shift || i.shift === 'ambos' || i.shift === userSession?.shift).sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  const baseIngredientsAvailable = shiftIngredients.filter((i) => i.ingredientType === 'base' || i.isBaseForPizza).sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  const proteinsAvailable = ingredients.filter((i) => i.ingredientType === 'proteina' || i.category === 'Proteínas').sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));

  const filteredIngredients = shiftIngredients.filter((ing) => {
    if (ingredientFilter === 'todos') return true;
    const type = ing.ingredientType || (ing.category === 'Salsas' ? 'salsa' : ing.category === 'Gratis' ? 'gratis' : ing.category === 'Proteínas' ? 'proteina' : ing.isBaseForPizza ? 'base' : 'adicional');
    return type === ingredientFilter;
  });

  return (
    <div className="p-4 sm:p-8 space-y-8 max-w-7xl mx-auto text-slate-900">
      {/* Header Banner Simplificado */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 p-5 rounded-3xl bg-white border border-yellow-400/50 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-yellow-400 border border-yellow-500 flex items-center justify-center text-2xl shadow-sm">
            🌭
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">Creación de Menú</h1>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-black uppercase">
                ADMINISTRADOR
              </span>
            </div>
          </div>
        </div>

        {/* Tab Buttons (Sin barra de scroll, completamente visibles con flex-wrap) */}
        <div className="flex flex-wrap items-center gap-2 p-1.5 rounded-2xl bg-stone-50 border border-gray-200 shadow-xs">
          <button
            onClick={() => setActiveTab('pizzas')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'pizzas' ? 'bg-yellow-400 text-black border border-yellow-500 shadow-xs' : 'text-gray-700 hover:text-black hover:bg-stone-200'
            }`}
          >
            <span>🌭 HOT DOGS ({pizzas.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('bebidas')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'bebidas' ? 'bg-yellow-400 text-black border border-yellow-500 shadow-xs' : 'text-gray-700 hover:text-black hover:bg-stone-200'
            }`}
          >
            <span>🥤 BEBIDAS ({bebidas.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('ingredientes')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'ingredientes' ? 'bg-yellow-400 text-black border border-yellow-500 shadow-xs' : 'text-gray-700 hover:text-black hover:bg-stone-200'
            }`}
          >
            <span>🍟 INGREDIENTES & EXTRAS ({shiftIngredients.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('mesas')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'mesas' ? 'bg-yellow-400 text-black border border-yellow-500 shadow-xs' : 'text-gray-700 hover:text-black hover:bg-stone-200'
            }`}
          >
            <IoLayersOutline />
            <span>MESAS ({tables.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('seguridad')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'seguridad' ? 'bg-yellow-400 text-black border border-yellow-500 shadow-xs' : 'text-gray-700 hover:text-black hover:bg-stone-200'
            }`}
          >
            <IoLockClosed />
            <span>🔐 PIN DE SEGURIDAD</span>
          </button>

          <button
            onClick={() => setActiveTab('impresoras')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'impresoras' ? 'bg-yellow-400 text-black border border-yellow-500 shadow-xs' : 'text-gray-700 hover:text-black hover:bg-stone-200'
            }`}
          >
            <IoPrintOutline />
            <span>🖨️ IMPRESORAS</span>
          </button>
        </div>
      </div>

      {/* TAB 1: HOT DOGS */}
      {activeTab === 'pizzas' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-black text-black flex items-center gap-2">
              <span className="text-xl">🌭</span>
              <span>CATÁLOGO DE HOT DOGS & COMBOS</span>
            </h2>

            <button
              onClick={() => {
                setEditingProductId(null);
                setPizzaName('');
                setDishCategory('Hot Dogs');
                setPizzaPrice('');
                setPizzaDesc('');
                setSelectedBaseIngredients([]);
                setBurgerProteinCount(1);
                setBurgerDefaultProteins([]);
                setIsAddPizzaOpen(true);
              }}
              className="px-4 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-black font-black text-xs transition-all flex items-center gap-1.5 border border-yellow-500 shadow-xs"
            >
              <IoAdd className="text-lg" />
              <span>NUEVO HOT DOG</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pizzas.map((p) => (
              <div key={p.id} className="p-4 rounded-2xl bg-white border border-gray-200 hover:border-yellow-400 shadow-xs flex flex-col justify-between space-y-3 transition-all">
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-black text-black">{p.name}</h3>
                    <span className="px-2 py-0.5 rounded-md bg-yellow-100 text-black border border-yellow-300 text-[10px] font-black uppercase shrink-0">
                      {p.category || 'HOT DOG'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">{p.description}</p>
                  
                  {/* Proteínas incluidas */}
                  <div className="flex items-center gap-1 text-[11px] font-black text-amber-900 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg w-fit">
                    🥩 {p.proteinCount || 1} Carne / Proteína{(p.proteinCount || 1) > 1 ? 's' : ''}
                  </div>

                  {/* Proteínas por defecto */}
                  {p.defaultProteins && p.defaultProteins.length > 0 && (
                    <div>
                      <span className="text-[10px] font-bold text-gray-400 block mb-0.5">
                        Proteínas por Defecto:
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {p.defaultProteins.map((prot, idx) => (
                          <span key={idx} className="text-[10px] px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-blue-800 font-bold">
                            🥩 {prot}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Ingredientes base */}
                  {p.baseIngredients && p.baseIngredients.length > 0 && (
                    <div>
                      <span className="text-[10px] font-bold text-gray-400 block mb-0.5">
                        Ingredientes Base:
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {p.baseIngredients.map((ing, idx) => (
                          <span key={idx} className="text-[10px] px-2 py-0.5 rounded-md bg-gray-100 border border-gray-200 text-gray-800 font-bold">
                            ✓ {ing}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <span className="text-lg font-black text-black bg-yellow-400 px-2 py-0.5 rounded border border-yellow-500">
                    {p.price.toLocaleString('es-CO')} COP
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleStartEditPizza(p)}
                      className="px-3 py-1.5 rounded-xl bg-gray-100 text-gray-800 hover:bg-yellow-400 hover:text-black border border-gray-300 transition-all text-xs font-bold flex items-center gap-1"
                    >
                      ✏️ Editar
                    </button>
                    <button onClick={() => deleteProduct(p.id)} className="p-2 rounded-xl bg-red-50 text-red-600 hover:bg-red-500 hover:text-white border border-red-200 transition-all">
                      <IoTrash size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: BEBIDAS */}
      {activeTab === 'bebidas' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-black text-black flex items-center gap-2">
              <IoBeer className="text-yellow-600 text-xl" />
              <span>BEBIDAS & REFRESCOS</span>
            </h2>

            <button
              onClick={() => {
                setEditingDrinkId(null);
                setDrinkName('');
                setDrinkType('refresco');
                setDrinkPrice('');
                setDrinkDesc('');
                setIsAddDrinkOpen(true);
              }}
              className="px-4 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-black font-black text-xs transition-all flex items-center gap-1.5 border border-yellow-500 shadow-xs cursor-pointer"
            >
              <IoAdd className="text-lg" />
              <span>NUEVA BEBIDA</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {bebidas.map((p) => (
              <div key={p.id} className="p-4 rounded-2xl bg-white border border-gray-200 hover:border-yellow-400 shadow-xs flex flex-col justify-between space-y-3 transition-all">
                <div className="space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-black text-black">{p.name}</h3>
                    <span className="px-2 py-0.5 rounded-md bg-yellow-100 text-black border border-yellow-300 text-[10px] font-black uppercase shrink-0">
                      {p.drinkType?.toUpperCase() || 'BEBIDA'}
                    </span>
                  </div>
                  {p.description && (
                    <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">{p.description}</p>
                  )}
                  {p.flavors && p.flavors.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {p.flavors.map((flv, idx) => (
                        <span
                          key={idx}
                          className="bg-sky-50 text-sky-800 text-[10px] font-bold px-1.5 py-0.5 rounded border border-sky-200"
                        >
                          🥤 {flv}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <span className="text-lg font-black text-black bg-yellow-400 px-2 py-0.5 rounded border border-yellow-500">
                    {p.price.toLocaleString('es-CO')} COP
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleStartEditDrink(p)}
                      className="px-3 py-1.5 rounded-xl bg-gray-100 text-gray-800 hover:bg-yellow-400 hover:text-black border border-gray-300 transition-all text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                      ✏️ Editar
                    </button>
                    <button onClick={() => deleteProduct(p.id)} className="p-2 rounded-xl bg-red-50 text-red-600 hover:bg-red-500 hover:text-white border border-red-200 transition-all cursor-pointer">
                      <IoTrash size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: INGREDIENTES, PROTEÍNAS & ADICIONALES */}
      {activeTab === 'ingredientes' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
            <div>
              <h2 className="text-lg font-black text-black flex items-center gap-2">
                <IoSparkles className="text-yellow-500 text-xl" />
                <span>CATÁLOGO DE INGREDIENTES, PROTEÍNAS & ADICIONALES</span>
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Clasifica ingredientes como Proteína, Gratuito, Adicional con Costo o Base.
              </p>
            </div>

            <button
              onClick={() => {
                setEditingIngredientId(null);
                setIngName('');
                setIngType('adicional');
                setIngPriceUSD('1.00');
                setIsAddIngOpen(true);
              }}
              className="px-4 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-black font-black text-xs transition-all flex items-center gap-1.5 border border-yellow-500 shadow-xs cursor-pointer shrink-0"
            >
              <IoAdd className="text-lg" />
              <span>NUEVO INGREDIENTE</span>
            </button>
          </div>

          {/* Filtros rápidos por Clasificación */}
          <div className="flex flex-wrap items-center gap-2">
            {[
              { key: 'todos', label: `Todos (${shiftIngredients.length})` },
              { key: 'salsa', label: `🥣 Salsas (${shiftIngredients.filter(i => (i.ingredientType || (i.category === 'Salsas' ? 'salsa' : '')) === 'salsa').length})` },
              { key: 'proteina', label: `🥩 Proteínas (${shiftIngredients.filter(i => (i.ingredientType || (i.category === 'Proteínas' ? 'proteina' : '')) === 'proteina').length})` },
              { key: 'gratis', label: `🆓 Gratuitos (${shiftIngredients.filter(i => (i.ingredientType || (i.category === 'Gratis' ? 'gratis' : '')) === 'gratis').length})` },
              { key: 'adicional', label: `➕ Adicionales (${shiftIngredients.filter(i => (i.ingredientType || (i.category === 'Adicionales' ? 'adicional' : (i.isExtraForPizza ? 'adicional' : ''))) === 'adicional').length})` },
              { key: 'base', label: `🥬 Base (${shiftIngredients.filter(i => (i.ingredientType || (i.isBaseForPizza ? 'base' : '')) === 'base').length})` },
            ].map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setIngredientFilter(f.key as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer border ${
                  ingredientFilter === f.key
                    ? 'bg-yellow-400 text-black border-yellow-500 shadow-xs'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-stone-100 hover:text-black'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-xs">
            <table className="w-full text-left text-xs text-gray-700">
              <thead className="bg-stone-50 text-gray-900 uppercase text-[10px] font-black border-b border-gray-200">
                <tr>
                  <th className="p-4">Ingrediente / Topping</th>
                  <th className="p-4">Clasificación</th>
                  <th className="p-4">Precio Adicional (COP)</th>
                  <th className="p-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredIngredients.map((ing) => {
                  const resolvedType = ing.ingredientType || (ing.category === 'Salsas' ? 'salsa' : ing.category === 'Gratis' ? 'gratis' : ing.category === 'Proteínas' ? 'proteina' : ing.isBaseForPizza ? 'base' : 'adicional');
                  const pUSD = (ing.priceUSD !== undefined ? ing.priceUSD : ing.priceGrandeCompleta) || 0;

                  return (
                    <tr key={ing.id} className="hover:bg-stone-50 transition-colors">
                      <td className="p-4 font-bold text-gray-900">
                        <span>{ing.name}</span>
                      </td>
                      <td className="p-4">
                        {resolvedType === 'salsa' && (
                          <span className="px-2.5 py-1 rounded-lg bg-orange-100 text-orange-950 border border-orange-300 text-[11px] font-black inline-flex items-center gap-1">
                            🥣 SALSA (NO CONTABLE / COCINA)
                          </span>
                        )}
                        {resolvedType === 'proteina' && (
                          <span className="px-2.5 py-1 rounded-lg bg-blue-100 text-blue-900 border border-blue-200 text-[11px] font-black inline-flex items-center gap-1">
                            🥩 PROTEÍNA
                          </span>
                        )}
                        {resolvedType === 'gratis' && (
                          <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-900 border border-emerald-200 text-[11px] font-black inline-flex items-center gap-1">
                            🆓 GRATUITO (0 COP)
                          </span>
                        )}
                        {resolvedType === 'base' && (
                          <span className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-800 border border-gray-300 text-[11px] font-black inline-flex items-center gap-1">
                            🥬 BASE (0 COP)
                          </span>
                        )}
                        {resolvedType === 'adicional' && (
                          <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 border border-yellow-300 text-[11px] font-black inline-flex items-center gap-1">
                            ➕ ADICIONAL CON COSTO
                          </span>
                        )}
                      </td>
                      <td className="p-4 font-black">
                        {resolvedType === 'salsa' ? (
                          <span className="text-orange-800 bg-orange-50 px-2 py-0.5 rounded border border-orange-200 font-bold">
                            0 COP (No contable)
                          </span>
                        ) : (resolvedType === 'adicional' || resolvedType === 'proteina') && pUSD > 0 ? (
                          <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            +{pUSD.toLocaleString('es-CO')} COP
                          </span>
                        ) : (
                          <span className="text-gray-400 font-medium">
                            0 COP (Sin Costo)
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleStartEditIngredient(ing)}
                            className="px-3 py-1.5 rounded-xl bg-gray-100 text-gray-800 hover:bg-yellow-400 hover:text-black border border-gray-300 transition-all text-xs font-bold flex items-center gap-1 cursor-pointer"
                          >
                            ✏️ Editar
                          </button>
                          <button
                            onClick={() => deleteIngredient(ing.id)}
                            className="p-2 rounded-xl bg-red-50 text-red-600 hover:bg-red-500 hover:text-white border border-red-200 transition-all cursor-pointer"
                          >
                            <IoTrash size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: MESAS */}
      {activeTab === 'mesas' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-black text-black flex items-center gap-2">
              <span className="text-xl">🪑</span>
              <span>CONFIGURACIÓN DE MESAS DEL RESTAURANTE</span>
            </h2>

            <button
              onClick={() => {
                setEditingTableId(null);
                setTableNumber('');
                setTableName('');
                setTableCapacity('4');
                setTableZone('Salón Principal');
                setIsAddTableOpen(true);
              }}
              className="px-4 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-black font-black text-xs transition-all flex items-center gap-1.5 border border-yellow-500 shadow-xs cursor-pointer"
            >
              <IoAdd className="text-lg" />
              <span>NUEVA MESA</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {tables.map((t) => {
              const sizeTag = t.capacity <= 2 ? 'Pequeña (2p)' : t.capacity <= 4 ? 'Mediana (4p)' : 'Grande (6-8p)';
              return (
                <div key={t.id} className="p-4 rounded-2xl bg-white border border-gray-200 hover:border-yellow-400 shadow-xs flex flex-col justify-between space-y-3 transition-all">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded-md bg-yellow-100 text-yellow-900 border border-yellow-300 text-[10px] font-black uppercase">
                        {sizeTag}
                      </span>
                      <span className="text-[10px] text-gray-500 font-bold uppercase">{t.zone || 'Salón'}</span>
                    </div>

                    <div className="flex items-center gap-2 mt-2.5">
                      <span className="text-2xl">🪑</span>
                      <h3 className="text-base font-black text-black">{t.name || `Mesa #${t.number}`}</h3>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Capacidad: <span className="text-black font-bold">{t.capacity} personas</span></p>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                    <span className="text-xs font-bold text-gray-400">N° {t.number}</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleStartEditTable(t)}
                        className="px-3 py-1.5 rounded-xl bg-gray-100 text-gray-800 hover:bg-yellow-400 hover:text-black border border-gray-300 transition-all text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        ✏️ Editar
                      </button>
                      <button
                        onClick={() => deleteTable(t.id)}
                        className="p-2 rounded-xl bg-red-50 text-red-600 hover:bg-red-500 hover:text-white border border-red-200 transition-all cursor-pointer"
                      >
                        <IoTrash size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 5: SEGURIDAD Y PIN */}
      {activeTab === 'seguridad' && (
        <div className="space-y-6 max-w-2xl mx-auto">
          <div className="p-6 sm:p-8 rounded-3xl bg-white border border-yellow-400/40 shadow-lg space-y-6">
            <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
              <div className="w-12 h-12 rounded-2xl bg-yellow-400/30 border border-yellow-500/40 flex items-center justify-center text-yellow-800 text-2xl">
                <IoShieldCheckmark />
              </div>
              <div>
                <h2 className="text-lg font-black text-black uppercase">PIN de Seguridad y Autorizaciones</h2>
                <p className="text-xs text-gray-500 font-medium">
                  Configura el PIN de 4 dígitos requerido para autorizar acciones sensibles en Caja (Editar comanda, Anular, Unificar, Historial, Reportes y Cierre).
                </p>
              </div>
            </div>

            {/* PIN Actual Informativo */}
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-between">
              <div>
                <span className="text-xs font-black uppercase text-amber-900 block">PIN de Administrador Configurado:</span>
                <span className="text-2xl font-black text-black tracking-widest">
                  {currentPin ? currentPin.split('').map(() => '•').join(' ') + ` (${currentPin})` : '1234'}
                </span>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-yellow-400 text-black font-black text-xs border border-yellow-500">
                ACTIVO
              </div>
            </div>

            {/* Formulario de Cambio de PIN */}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setPinFeedback('');
                setPinError('');
                if (!/^\d{4}$/.test(newPinInput)) {
                  setPinError('El nuevo PIN debe contener exactamente 4 dígitos numéricos.');
                  return;
                }
                if (newPinInput !== confirmPinInput) {
                  setPinError('La confirmación del PIN no coincide con el nuevo PIN.');
                  return;
                }
                setIsSavingPin(true);
                try {
                  await updateAdminPin(newPinInput);
                  setCurrentPin(newPinInput);
                  setNewPinInput('');
                  setConfirmPinInput('');
                  setPinFeedback('✅ ¡PIN de seguridad actualizado exitosamente a ' + newPinInput + '!');
                } catch (err: any) {
                  setPinError(err.message || 'Error al actualizar el PIN.');
                } finally {
                  setIsSavingPin(false);
                }
              }}
              className="space-y-4"
            >
              <h3 className="text-xs font-black text-black uppercase tracking-wider">Modificar PIN de Seguridad:</h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">Nuevo PIN (4 dígitos):</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    required
                    value={newPinInput}
                    onChange={(e) => {
                      setNewPinInput(e.target.value.replace(/\D/g, '').slice(0, 4));
                      setPinFeedback('');
                      setPinError('');
                    }}
                    placeholder="••••"
                    className="w-full px-4 py-3 rounded-xl bg-stone-50 border border-gray-300 text-base font-black text-center tracking-widest text-black outline-none focus:border-yellow-400 shadow-inner"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">Confirmar Nuevo PIN:</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    required
                    value={confirmPinInput}
                    onChange={(e) => {
                      setConfirmPinInput(e.target.value.replace(/\D/g, '').slice(0, 4));
                      setPinFeedback('');
                      setPinError('');
                    }}
                    placeholder="••••"
                    className="w-full px-4 py-3 rounded-xl bg-stone-50 border border-gray-300 text-base font-black text-center tracking-widest text-black outline-none focus:border-yellow-400 shadow-inner"
                  />
                </div>
              </div>

              {pinFeedback && (
                <div className="p-3 rounded-xl bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs font-black text-center flex items-center justify-center gap-1.5">
                  <IoCheckmarkCircle className="text-base" />
                  <span>{pinFeedback}</span>
                </div>
              )}

              {pinError && (
                <div className="p-3 rounded-xl bg-red-100 border border-red-300 text-red-800 text-xs font-black text-center">
                  ⚠️ {pinError}
                </div>
              )}

              <button
                type="submit"
                disabled={newPinInput.length !== 4 || confirmPinInput.length !== 4 || isSavingPin}
                className="w-full py-3.5 rounded-2xl bg-yellow-400 hover:bg-yellow-500 disabled:opacity-50 text-black font-black text-xs border border-yellow-500 shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <IoKeypad />
                <span>{isSavingPin ? 'GUARDANDO PIN...' : 'GUARDAR NUEVO PIN'}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 6: IMPRESORAS TÉRMICAS DUALES (LAN / USB Y 80MM / 58MM) */}
      {activeTab === 'impresoras' && (
        <div className="space-y-6 max-w-4xl mx-auto">
          {/* Header Info */}
          <div className="p-6 rounded-3xl bg-white border border-yellow-400/40 shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-yellow-400/30 border border-yellow-500/40 flex items-center justify-center text-yellow-800 text-2xl">
                <IoPrintOutline />
              </div>
              <div>
                <h2 className="text-lg font-black text-black uppercase">Sistema de Impresoras Térmicas Duales</h2>
                <p className="text-xs text-gray-500 font-medium">
                  Soporta <strong>Cocina (80mm LAN/Red)</strong> y <strong>Caja (58mm/80mm USB o LAN)</strong>.
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={testingPrinterKey !== null}
              onClick={async () => {
                setTestingPrinterKey('ambas');
                setPrintersFeedback('');
                setPrintersError('');
                try {
                  await testPrinter('ambas');
                  setPrintersFeedback('✅ ¡Impresión de prueba enviada exitosamente a AMBAS impresoras!');
                } catch (err: any) {
                  setPrintersError(err.message || 'Error en test de impresoras.');
                } finally {
                  setTestingPrinterKey(null);
                }
              }}
              className="px-4 py-2.5 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-black border border-yellow-500 font-black text-xs flex items-center gap-2 shadow-xs transition-all whitespace-nowrap cursor-pointer"
            >
              <IoLayersOutline className="text-base" />
              <span>{testingPrinterKey === 'ambas' ? 'PROBANDO...' : 'PROBAR AMBAS'}</span>
            </button>
          </div>

          {printersFeedback && (
            <div className="p-3.5 rounded-2xl bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs font-black text-center flex items-center justify-center gap-2 shadow-xs">
              <IoCheckmarkCircle className="text-lg" />
              <span>{printersFeedback}</span>
            </div>
          )}

          {printersError && (
            <div className="p-3.5 rounded-2xl bg-red-100 border border-red-300 text-red-800 text-xs font-black text-center shadow-xs">
              ⚠️ {printersError}
            </div>
          )}

          {/* Formulario 2 Columnas para Cocina y Caja */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* PANEL 1: IMPRESORA DE COCINA */}
            <div className={`p-6 rounded-3xl border shadow-xs space-y-4 transition-all ${
              printersConfig.cocina.enabled
                ? 'bg-white border-yellow-400/50'
                : 'bg-stone-50 border-gray-200 opacity-80'
            }`}>
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-yellow-400/30 text-yellow-800 flex items-center justify-center text-xl">
                    <IoRestaurantOutline />
                  </div>
                  <div>
                    <h3 className="font-black text-base text-black">🍳 Impresora de Cocina</h3>
                    <span className="text-[10px] text-gray-500 font-bold block">Comandas y Adiciones de Cocina</span>
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={printersConfig.cocina.enabled}
                    onChange={(e) => setPrintersConfig(prev => ({
                      ...prev,
                      cocina: { ...prev.cocina, enabled: e.target.checked }
                    }))}
                    className="w-5 h-5 rounded accent-yellow-500 cursor-pointer"
                  />
                  <span className={`text-xs font-black ${printersConfig.cocina.enabled ? 'text-emerald-700' : 'text-gray-400'}`}>
                    {printersConfig.cocina.enabled ? '🟢 ACTIVA' : '🔴 INACTIVA'}
                  </span>
                </label>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-bold text-gray-700 block mb-1">Nombre / Identificador:</label>
                  <input
                    type="text"
                    value={printersConfig.cocina.name}
                    onChange={(e) => setPrintersConfig(prev => ({
                      ...prev,
                      cocina: { ...prev.cocina, name: e.target.value }
                    }))}
                    placeholder="Impresora Cocina"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-stone-50 border border-gray-300 font-bold text-black outline-none focus:border-yellow-400"
                  />
                </div>

                {/* Tipo de Conexión */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-bold text-gray-700 block mb-1">Tipo de Conexión:</label>
                    <select
                      value={printersConfig.cocina.connectionType || 'lan'}
                      onChange={(e) => setPrintersConfig(prev => ({
                        ...prev,
                        cocina: { ...prev.cocina, connectionType: e.target.value as 'lan' | 'usb' }
                      }))}
                      className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-gray-300 font-bold text-black outline-none focus:border-yellow-400"
                    >
                      <option value="lan">🌐 Red / LAN (Ethernet)</option>
                      <option value="usb">🔌 USB Directo (Windows)</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-bold text-gray-700 block mb-1">Ancho de Papel:</label>
                    <select
                      value={printersConfig.cocina.paperWidth || '80mm'}
                      onChange={(e) => setPrintersConfig(prev => ({
                        ...prev,
                        cocina: { ...prev.cocina, paperWidth: e.target.value as '80mm' | '58mm' }
                      }))}
                      className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-gray-300 font-bold text-black outline-none focus:border-yellow-400"
                    >
                      <option value="80mm">📄 80 mm (Cocina Estándar)</option>
                      <option value="58mm">🧾 58 mm (Compacto)</option>
                    </select>
                  </div>
                </div>

                {/* Campos LAN vs USB */}
                {printersConfig.cocina.connectionType !== 'usb' ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="font-bold text-gray-700 block mb-1">Dirección IP (Host):</label>
                      <input
                        type="text"
                        value={printersConfig.cocina.host}
                        onChange={(e) => setPrintersConfig(prev => ({
                          ...prev,
                          cocina: { ...prev.cocina, host: e.target.value }
                        }))}
                        placeholder="192.168.1.200"
                        className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-gray-300 font-mono font-bold text-black outline-none focus:border-yellow-400"
                      />
                    </div>

                    <div>
                      <label className="font-bold text-gray-700 block mb-1">Puerto (Port):</label>
                      <input
                        type="number"
                        value={printersConfig.cocina.port}
                        onChange={(e) => setPrintersConfig(prev => ({
                          ...prev,
                          cocina: { ...prev.cocina, port: parseInt(e.target.value, 10) || 9100 }
                        }))}
                        placeholder="9100"
                        className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-gray-300 font-mono font-bold text-black outline-none focus:border-yellow-400"
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="font-bold text-gray-700 block mb-1">Nombre Impresora USB en Windows:</label>
                    <input
                      type="text"
                      value={printersConfig.cocina.usbDeviceName || ''}
                      onChange={(e) => setPrintersConfig(prev => ({
                        ...prev,
                        cocina: { ...prev.cocina, usbDeviceName: e.target.value }
                      }))}
                      placeholder="Ej: POS-80, Thermal Printer"
                      className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-gray-300 font-bold text-black outline-none focus:border-yellow-400"
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-gray-700 block mb-1">Copias por Ticket:</label>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={printersConfig.cocina.copies}
                      onChange={(e) => setPrintersConfig(prev => ({
                        ...prev,
                        cocina: { ...prev.cocina, copies: parseInt(e.target.value, 10) || 1 }
                      }))}
                      className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-gray-300 font-bold text-black outline-none focus:border-yellow-400"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-gray-700 block mb-1">Timeout (ms):</label>
                    <input
                      type="number"
                      step={500}
                      value={printersConfig.cocina.timeoutMs}
                      onChange={(e) => setPrintersConfig(prev => ({
                        ...prev,
                        cocina: { ...prev.cocina, timeoutMs: parseInt(e.target.value, 10) || 5000 }
                      }))}
                      className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-gray-300 font-mono text-black outline-none focus:border-yellow-400"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    disabled={testingPrinterKey !== null || !printersConfig.cocina.enabled}
                    onClick={async () => {
                      setTestingPrinterKey('cocina');
                      setPrintersFeedback('');
                      setPrintersError('');
                      try {
                        await testPrinter('cocina');
                        setPrintersFeedback('✅ ¡Impresión de prueba enviada exitosamente a Cocina!');
                      } catch (err: any) {
                        setPrintersError(err.message || 'Error al conectar con la impresora de cocina.');
                      } finally {
                        setTestingPrinterKey(null);
                      }
                    }}
                    className="w-full py-2.5 rounded-xl bg-yellow-400 hover:bg-yellow-500 disabled:opacity-50 text-black font-black text-xs border border-yellow-500 shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <IoPrintOutline />
                    <span>{testingPrinterKey === 'cocina' ? 'PROBANDO...' : '🧪 IMPRESIÓN DE PRUEBA COCINA'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* PANEL 2: IMPRESORA DE CAJA */}
            <div className={`p-6 rounded-3xl border shadow-xs space-y-4 transition-all ${
              printersConfig.caja.enabled
                ? 'bg-white border-yellow-400/50'
                : 'bg-stone-50 border-gray-200 opacity-80'
            }`}>
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-yellow-400/30 text-yellow-800 flex items-center justify-center text-xl">
                    <IoCardOutline />
                  </div>
                  <div>
                    <h3 className="font-black text-base text-black">💳 Impresora de Caja</h3>
                    <span className="text-[10px] text-gray-500 font-bold block">Pre-Cuentas, Reportes y Cierres</span>
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={printersConfig.caja.enabled}
                    onChange={(e) => setPrintersConfig(prev => ({
                      ...prev,
                      caja: { ...prev.caja, enabled: e.target.checked }
                    }))}
                    className="w-5 h-5 rounded accent-yellow-500 cursor-pointer"
                  />
                  <span className={`text-xs font-black ${printersConfig.caja.enabled ? 'text-emerald-700' : 'text-gray-400'}`}>
                    {printersConfig.caja.enabled ? '🟢 ACTIVA' : '🔴 INACTIVA'}
                  </span>
                </label>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-bold text-gray-700 block mb-1">Nombre / Identificador:</label>
                  <input
                    type="text"
                    value={printersConfig.caja.name}
                    onChange={(e) => setPrintersConfig(prev => ({
                      ...prev,
                      caja: { ...prev.caja, name: e.target.value }
                    }))}
                    placeholder="Impresora Caja"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-stone-50 border border-gray-300 font-bold text-black outline-none focus:border-yellow-400"
                  />
                </div>

                {/* Tipo de Conexión y Ancho */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-bold text-gray-700 block mb-1">Tipo de Conexión:</label>
                    <select
                      value={printersConfig.caja.connectionType || 'usb'}
                      onChange={(e) => setPrintersConfig(prev => ({
                        ...prev,
                        caja: { ...prev.caja, connectionType: e.target.value as 'lan' | 'usb' }
                      }))}
                      className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-gray-300 font-bold text-black outline-none focus:border-yellow-400"
                    >
                      <option value="usb">🔌 USB Directo (Windows)</option>
                      <option value="lan">🌐 Red / LAN (Ethernet)</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-bold text-gray-700 block mb-1">Ancho de Papel:</label>
                    <select
                      value={printersConfig.caja.paperWidth || '58mm'}
                      onChange={(e) => setPrintersConfig(prev => ({
                        ...prev,
                        caja: { ...prev.caja, paperWidth: e.target.value as '80mm' | '58mm' }
                      }))}
                      className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-gray-300 font-bold text-black outline-none focus:border-yellow-400"
                    >
                      <option value="58mm">🧾 58 mm (Caja Estándar USB)</option>
                      <option value="80mm">📄 80 mm (Estándar)</option>
                    </select>
                  </div>
                </div>

                {/* Campos LAN vs USB */}
                {printersConfig.caja.connectionType === 'lan' ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="font-bold text-gray-700 block mb-1">Dirección IP (Host):</label>
                      <input
                        type="text"
                        value={printersConfig.caja.host}
                        onChange={(e) => setPrintersConfig(prev => ({
                          ...prev,
                          caja: { ...prev.caja, host: e.target.value }
                        }))}
                        placeholder="192.168.1.201"
                        className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-gray-300 font-mono font-bold text-black outline-none focus:border-yellow-400"
                      />
                    </div>

                    <div>
                      <label className="font-bold text-gray-700 block mb-1">Puerto (Port):</label>
                      <input
                        type="number"
                        value={printersConfig.caja.port}
                        onChange={(e) => setPrintersConfig(prev => ({
                          ...prev,
                          caja: { ...prev.caja, port: parseInt(e.target.value, 10) || 9100 }
                        }))}
                        placeholder="9100"
                        className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-gray-300 font-mono font-bold text-black outline-none focus:border-yellow-400"
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="font-bold text-gray-700 block mb-1">Nombre Impresora USB en Windows:</label>
                    <input
                      type="text"
                      value={printersConfig.caja.usbDeviceName || 'POS-58'}
                      onChange={(e) => setPrintersConfig(prev => ({
                        ...prev,
                        caja: { ...prev.caja, usbDeviceName: e.target.value }
                      }))}
                      placeholder="Ej: POS-58, Generic / Text Only"
                      className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-gray-300 font-bold text-black outline-none focus:border-yellow-400"
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-gray-700 block mb-1">Copias por Ticket:</label>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={printersConfig.caja.copies}
                      onChange={(e) => setPrintersConfig(prev => ({
                        ...prev,
                        caja: { ...prev.caja, copies: parseInt(e.target.value, 10) || 1 }
                      }))}
                      className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-gray-300 font-bold text-black outline-none focus:border-yellow-400"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-gray-700 block mb-1">Timeout (ms):</label>
                    <input
                      type="number"
                      step={500}
                      value={printersConfig.caja.timeoutMs}
                      onChange={(e) => setPrintersConfig(prev => ({
                        ...prev,
                        caja: { ...prev.caja, timeoutMs: parseInt(e.target.value, 10) || 5000 }
                      }))}
                      className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-gray-300 font-mono text-black outline-none focus:border-yellow-400"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    disabled={testingPrinterKey !== null || !printersConfig.caja.enabled}
                    onClick={async () => {
                      setTestingPrinterKey('caja');
                      setPrintersFeedback('');
                      setPrintersError('');
                      try {
                        await testPrinter('caja');
                        setPrintersFeedback('✅ ¡Impresión de prueba enviada exitosamente a Caja!');
                      } catch (err: any) {
                        setPrintersError(err.message || 'Error al conectar con la impresora de caja.');
                      } finally {
                        setTestingPrinterKey(null);
                      }
                    }}
                    className="w-full py-2.5 rounded-xl bg-yellow-400 hover:bg-yellow-500 disabled:opacity-50 text-black font-black text-xs border border-yellow-500 shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <IoPrintOutline />
                    <span>{testingPrinterKey === 'caja' ? 'PROBANDO...' : '🧪 IMPRESIÓN DE PRUEBA CAJA'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Botón Guardar Cambios */}
          <div className="pt-4">
            <button
              type="button"
              disabled={isSavingPrinters}
              onClick={async () => {
                setIsSavingPrinters(true);
                setPrintersFeedback('');
                setPrintersError('');
                try {
                  const updated = await updatePrintersConfig(printersConfig);
                  setPrintersConfig(updated);
                  setPrintersFeedback('✅ ¡Configuración de impresoras guardada exitosamente!');
                } catch (err: any) {
                  setPrintersError(err.message || 'Error al guardar la configuración de impresoras.');
                } finally {
                  setIsSavingPrinters(false);
                }
              }}
              className="w-full py-3.5 rounded-2xl bg-yellow-400 hover:bg-yellow-500 disabled:opacity-50 text-black font-black text-xs border border-yellow-500 shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <IoPrintOutline className="text-base" />
              <span>{isSavingPrinters ? 'GUARDANDO CONFIGURACIÓN...' : '💾 GUARDAR CONFIGURACIÓN DE IMPRESORAS'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Modal de Desbloqueo por PIN para Usuario Caja */}
      {userSession?.role === 'caja' && !isCashierUnlocked && (
        <AdminPinModal
          isOpen={true}
          title="🔐 ACCESO ADMINISTRATIVO"
          description="Para ingresar a la gestión del menú y configuración ingrese el PIN de 4 dígitos:"
          actionName="Panel de Administración"
          onSuccess={() => setIsCashierUnlocked(true)}
          onClose={() => window.history.back()}
        />
      )}

      {/* MODAL CREAR / EDITAR HOT DOG */}
      {isAddPizzaOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="relative w-full max-w-lg p-6 bg-white border border-yellow-400/50 rounded-3xl shadow-2xl space-y-4 text-black max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center pb-3 border-b border-gray-100">
              <h3 className="text-base font-black flex items-center gap-2">
                <span>🌭</span>
                <span>{editingProductId ? 'EDITAR HOT DOG' : 'NUEVO HOT DOG EN EL MENÚ'}</span>
              </h3>
              <button
                onClick={() => { setIsAddPizzaOpen(false); setEditingProductId(null); }}
                className="text-gray-400 hover:text-black cursor-pointer"
              >
                <IoClose size={20} />
              </button>
            </div>

            <form onSubmit={handleCreatePizza} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Nombre del Hot Dog / Comida:</label>
                <input
                  type="text"
                  required
                  value={pizzaName}
                  onChange={(e) => setPizzaName(e.target.value)}
                  placeholder="Ej: Mugrosito Especial, Perro Caliente Doble, Salchipapa..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-stone-50 border border-gray-300 text-xs text-black outline-none focus:border-yellow-400 font-bold"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-gray-700">Precio en Pesos (COP):</label>
                  {pizzaPrice && Number(pizzaPrice) > 0 && (
                    <span className="text-[10px] font-black text-gray-500">
                      ≈ ${(exchangeRates.COP > 0 ? Number(pizzaPrice) / exchangeRates.COP : 0).toFixed(2)} USD
                    </span>
                  )}
                </div>
                <input
                  type="number"
                  step="500"
                  required
                  value={pizzaPrice}
                  onChange={(e) => setPizzaPrice(e.target.value)}
                  placeholder="Ej: 15000"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-stone-50 border border-gray-300 text-sm text-black outline-none focus:border-yellow-400 font-black"
                />
              </div>

              {/* Selector de Cantidad de Proteínas Incluidas */}
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">
                  Cantidad de Carnes / Proteínas Incluidas:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setBurgerProteinCount(num)}
                      className={`py-2 rounded-xl text-xs font-black transition-all cursor-pointer border ${
                        burgerProteinCount === num
                          ? 'bg-yellow-400 text-black border-yellow-500 shadow-xs'
                          : 'bg-stone-50 text-gray-700 border-gray-200 hover:bg-stone-100'
                      }`}
                    >
                      🥩 {num} Proteína{num > 1 ? 's' : ''}
                    </button>
                  ))}
                </div>
              </div>

              {/* Selección de Proteínas por Defecto por Ranura */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gray-700 block">
                    Proteínas por Defecto ({burgerProteinCount} {burgerProteinCount === 1 ? 'ranura' : 'ranuras'}):
                  </label>
                  <span className="text-[11px] text-gray-500 font-semibold">
                    (Directo de ingredientes de la BD)
                  </span>
                </div>

                <div className="space-y-2 p-2.5 bg-stone-50 rounded-xl border border-gray-200">
                  {Array.from({ length: burgerProteinCount }).map((_, slotIdx) => {
                    const currentVal = burgerDefaultProteins[slotIdx] || '';
                    return (
                      <div key={slotIdx} className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-700 w-24 shrink-0 flex items-center gap-1">
                          <span>🥩 Ranura {slotIdx + 1}:</span>
                        </span>
                        <select
                          value={currentVal}
                          onChange={(e) => handleSetSlotProtein(slotIdx, e.target.value)}
                          className="flex-1 text-xs font-bold bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 cursor-pointer"
                        >
                          <option value="">-- Seleccionar Proteína (BD) --</option>
                          {proteinsAvailable.map((prot) => (
                            <option key={prot.id} value={prot.name}>
                              {prot.name}
                            </option>
                          ))}
                          {currentVal && !proteinsAvailable.some((p) => p.name.toUpperCase() === currentVal.toUpperCase()) && (
                            <option value={currentVal}>{currentVal} (Actual)</option>
                          )}
                        </select>
                      </div>
                    );
                  })}
                  {proteinsAvailable.length === 0 && (
                    <span className="text-xs text-gray-400 p-1 block">
                      No hay ingredientes clasificados como "Proteína" en la base de datos.
                    </span>
                  )}
                </div>
              </div>

              {/* Selección de Ingredientes Base */}
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">
                  Ingredientes Base (que vienen con el hot dog / producto y se pueden quitar):
                </label>
                <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto custom-scrollbar p-2.5 bg-stone-50 rounded-xl border border-gray-200">
                  {baseIngredientsAvailable.map((ing) => {
                    const isSelected = selectedBaseIngredients.includes(ing.name);
                    return (
                      <button
                        key={ing.id}
                        type="button"
                        onClick={() => toggleBaseIngredientSelection(ing.name)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-yellow-400 text-black border-yellow-500 font-black'
                            : 'bg-white text-gray-700 border-gray-200 hover:bg-stone-100'
                        }`}
                      >
                        {isSelected ? '✓ ' : '+ '}{ing.name}
                      </button>
                    );
                  })}
                  {baseIngredientsAvailable.length === 0 && (
                    <span className="text-xs text-gray-400 p-1">No hay ingredientes base configurados.</span>
                  )}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Descripción Breve:</label>
                <input
                  type="text"
                  value={pizzaDesc}
                  onChange={(e) => setPizzaDesc(e.target.value)}
                  placeholder="Ej: Pan artesanal, salchicha premium, queso, papitas y salsas especiales"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-stone-50 border border-gray-300 text-xs text-black outline-none focus:border-yellow-400 font-medium"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3.5 rounded-2xl bg-yellow-400 hover:bg-yellow-500 text-black font-black text-xs border border-yellow-500 shadow-md cursor-pointer transition-all"
              >
                {editingProductId ? 'ACTUALIZAR ÍTEM' : 'GUARDAR ÍTEM EN EL MENÚ'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CREAR / EDITAR BEBIDA */}
      {isAddDrinkOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="relative w-full max-w-md p-6 bg-white border border-yellow-400/50 rounded-3xl shadow-2xl space-y-4 text-black max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center pb-3 border-b border-gray-100">
              <h3 className="text-base font-black flex items-center gap-2">
                <span>🥤</span>
                <span>{editingDrinkId ? 'EDITAR BEBIDA' : 'NUEVA BEBIDA EN EL MENÚ'}</span>
              </h3>
              <button
                onClick={() => setIsAddDrinkOpen(false)}
                className="text-gray-400 hover:text-black cursor-pointer"
              >
                <IoClose size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateDrink} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Nombre de la Bebida:</label>
                <input
                  type="text"
                  required
                  value={drinkName}
                  onChange={(e) => setDrinkName(e.target.value)}
                  placeholder="Ej: Coca-Cola 350ml, Jugo de Naranja..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-stone-50 border border-gray-300 text-xs text-black outline-none focus:border-yellow-400 font-bold"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Tipo de Bebida:</label>
                <select
                  value={drinkType}
                  onChange={(e) => setDrinkType(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-stone-50 border border-gray-300 text-xs text-black outline-none focus:border-yellow-400 font-bold"
                >
                  <option value="refresco">Refresco / Gaseosa</option>
                  <option value="jugo">Jugo Natural</option>
                  <option value="granizado">Granizado / Slush</option>
                  <option value="te">Té Frío</option>
                  <option value="agua">Agua Mineral</option>
                  <option value="licor">Cerveza / Licor</option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-gray-700">Precio en Pesos (COP):</label>
                  {drinkPrice && Number(drinkPrice) > 0 && (
                    <span className="text-[10px] font-black text-gray-500">
                      ≈ ${(exchangeRates.COP > 0 ? Number(drinkPrice) / exchangeRates.COP : 0).toFixed(2)} USD
                    </span>
                  )}
                </div>
                <input
                  type="number"
                  step="500"
                  required
                  value={drinkPrice}
                  onChange={(e) => setDrinkPrice(e.target.value)}
                  placeholder="Ej: 5000"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-stone-50 border border-gray-300 text-sm text-black outline-none focus:border-yellow-400 font-black"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Descripción Breve:</label>
                <input
                  type="text"
                  value={drinkDesc}
                  onChange={(e) => setDrinkDesc(e.target.value)}
                  placeholder="Ej: Lata bien fría"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-stone-50 border border-gray-300 text-xs text-black outline-none focus:border-yellow-400 font-medium"
                />
              </div>

              {/* Sabores / Subtipos */}
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">
                  Sabores / Subtipos (Opcional):
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={flavorInput}
                    onChange={(e) => setFlavorInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const parts = flavorInput.split(',').map((f) => f.trim()).filter(Boolean);
                        if (parts.length > 0) {
                          const next = [...drinkFlavors];
                          for (const p of parts) {
                            if (!next.some((ex) => ex.toLowerCase() === p.toLowerCase())) {
                              next.push(p);
                            }
                          }
                          setDrinkFlavors(next);
                          setFlavorInput('');
                        }
                      }
                    }}
                    placeholder="Ej: Limón, Durazno, Manzana..."
                    className="flex-1 px-3 py-2 rounded-xl bg-stone-50 border border-gray-300 text-xs text-black outline-none focus:border-yellow-400 font-bold"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const parts = flavorInput.split(',').map((f) => f.trim()).filter(Boolean);
                      if (parts.length > 0) {
                        const next = [...drinkFlavors];
                        for (const p of parts) {
                          if (!next.some((ex) => ex.toLowerCase() === p.toLowerCase())) {
                            next.push(p);
                          }
                        }
                        setDrinkFlavors(next);
                        setFlavorInput('');
                      }
                    }}
                    className="px-3 py-2 bg-yellow-400 hover:bg-yellow-500 text-black text-xs font-black rounded-xl border border-yellow-500 cursor-pointer"
                  >
                    + Agregar
                  </button>
                </div>
                {drinkFlavors.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 p-2 bg-stone-50 rounded-xl border border-gray-200">
                    {drinkFlavors.map((flv, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-sky-100 text-sky-950 border border-sky-300"
                      >
                        <span>{flv}</span>
                        <button
                          type="button"
                          onClick={() => setDrinkFlavors(drinkFlavors.filter((_, i) => i !== idx))}
                          className="hover:text-red-600 font-black cursor-pointer text-sm leading-none"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <span className="text-[11px] text-gray-500 font-medium block mt-1">
                  Si defines sabores, el mesero o cajero seleccionará el sabor antes de agregar la bebida.
                </span>
              </div>

              <button
                type="submit"
                className="w-full py-3.5 rounded-2xl bg-yellow-400 hover:bg-yellow-500 text-black font-black text-xs border border-yellow-500 shadow-md cursor-pointer transition-all"
              >
                {editingDrinkId ? 'ACTUALIZAR BEBIDA' : 'GUARDAR BEBIDA EN EL MENÚ'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CREAR / EDITAR INGREDIENTE */}
      {isAddIngOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="relative w-full max-w-md p-6 bg-white border border-yellow-400/50 rounded-3xl shadow-2xl space-y-4 text-black max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center pb-3 border-b border-gray-100">
              <h3 className="text-base font-black flex items-center gap-2">
                <span>🍟</span>
                <span>{editingIngredientId ? 'EDITAR INGREDIENTE' : 'NUEVO INGREDIENTE EN EL MENÚ'}</span>
              </h3>
              <button
                onClick={() => setIsAddIngOpen(false)}
                className="text-gray-400 hover:text-black cursor-pointer"
              >
                <IoClose size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateIngredient} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Nombre del Ingrediente:</label>
                <input
                  type="text"
                  required
                  value={ingName}
                  onChange={(e) => setIngName(e.target.value)}
                  placeholder="Ej: Salchicha, Tocineta, Queso, Papitas, Cebolla..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-stone-50 border border-gray-300 text-xs text-black outline-none focus:border-yellow-400 font-bold"
                />
              </div>

              {/* Selector de Clasificación de 5 Tipos */}
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">Clasificación del Ingrediente:</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { type: 'salsa', label: '🥣 Salsa', desc: 'Sección Salsas (cocina, no contable)' },
                    { type: 'proteina', label: '🥩 Proteína', desc: 'Salchicha, carne, pollo' },
                    { type: 'gratis', label: '🆓 Gratuito', desc: 'Topping sin costo extra' },
                    { type: 'adicional', label: '➕ Adicional', desc: 'Extra con costo cobrable' },
                    { type: 'base', label: '🥬 Base', desc: 'Viene por defecto en el producto' },
                  ].map((item) => (
                    <button
                      key={item.type}
                      type="button"
                      onClick={() => {
                        setIngType(item.type as any);
                        if (item.type === 'salsa' || item.type === 'gratis' || item.type === 'base') {
                          setIngPriceUSD('0.00');
                        }
                      }}
                      className={`p-2.5 rounded-xl text-left border transition-all cursor-pointer ${
                        ingType === item.type
                          ? 'bg-yellow-400 text-black border-yellow-500 shadow-xs'
                          : 'bg-stone-50 text-gray-700 border-gray-200 hover:bg-stone-100'
                      }`}
                    >
                      <span className="block text-xs font-black">{item.label}</span>
                      <span className="text-[10px] text-gray-600 block mt-0.5 leading-tight">{item.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Precio USD (Solo si es Adicional o Proteína, o Salsa referencial) */}
              {(ingType === 'adicional' || ingType === 'proteina') ? (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-gray-700">
                      Precio Adicional en Pesos (COP):
                    </label>
                    {ingPriceUSD && Number(ingPriceUSD) > 0 && (
                      <span className="text-[10px] font-black text-gray-500">
                        ≈ ${(exchangeRates.COP > 0 ? Number(ingPriceUSD) / exchangeRates.COP : 0).toFixed(2)} USD
                      </span>
                    )}
                  </div>
                  <input
                    type="number"
                    step="500"
                    min="0"
                    required
                    value={ingPriceUSD}
                    onChange={(e) => setIngPriceUSD(e.target.value)}
                    placeholder="Ej: 3000"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-stone-50 border border-gray-300 text-sm font-black text-black outline-none focus:border-yellow-400"
                  />
                </div>
              ) : ingType === 'salsa' ? (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-700 block">
                    Costo / Precio referencial en USD ($):
                  </label>
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    value={ingPriceUSD}
                    onChange={(e) => setIngPriceUSD(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-stone-50 border border-gray-300 text-sm font-black text-black outline-none focus:border-yellow-400"
                  />
                  <div className="p-3 bg-orange-50 rounded-xl border border-orange-200 text-orange-950 text-xs font-medium leading-relaxed">
                    🥣 <strong>Ítem no contable:</strong> Las salsas se ordenan siempre al final en la comanda de cocina y se excluyen automáticamente de las pre-cuentas y balances de cobro.
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-800 text-xs font-black">
                  ✓ Precio: $0.00 USD (Incluido / Sin costo adicional)
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3.5 rounded-2xl bg-yellow-400 hover:bg-yellow-500 text-black font-black text-xs border border-yellow-500 shadow-md cursor-pointer transition-all"
              >
                {editingIngredientId ? 'ACTUALIZAR INGREDIENTE' : 'GUARDAR INGREDIENTE'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CREAR / EDITAR MESA */}
      {isAddTableOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="relative w-full max-w-md p-6 bg-white border border-yellow-400/50 rounded-3xl shadow-2xl space-y-4 text-black max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center pb-3 border-b border-gray-100">
              <h3 className="text-base font-black flex items-center gap-2">
                <span>🪑</span>
                <span>{editingTableId ? 'EDITAR MESA' : 'NUEVA MESA'}</span>
              </h3>
              <button
                onClick={() => setIsAddTableOpen(false)}
                className="text-gray-400 hover:text-black cursor-pointer"
              >
                <IoClose size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateTable} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Número de Mesa:</label>
                <input
                  type="number"
                  required
                  value={tableNumber}
                  onChange={(e) => setTableNumber(e.target.value)}
                  placeholder="Ej: 9"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-stone-50 border border-gray-300 text-xs text-black outline-none focus:border-yellow-400 font-bold"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Nombre o Referencia de Mesa:</label>
                <input
                  type="text"
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  placeholder="Ej: Mesa #9 (Terraza)"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-stone-50 border border-gray-300 text-xs text-black outline-none focus:border-yellow-400 font-medium"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Tamaño / Capacidad:</label>
                <select
                  value={tableCapacity}
                  onChange={(e) => setTableCapacity(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-stone-50 border border-gray-300 text-xs text-black outline-none focus:border-yellow-400 font-bold"
                >
                  <option value="2">Pequeña (2 Personas)</option>
                  <option value="4">Mediana (4 Personas)</option>
                  <option value="6">Grande (6 Personas)</option>
                  <option value="8">Familiar (8 Personas)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Ubicación / Zona:</label>
                <input
                  type="text"
                  value={tableZone}
                  onChange={(e) => setTableZone(e.target.value)}
                  placeholder="Salón Principal, Terraza, VIP..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-stone-50 border border-gray-300 text-xs text-black outline-none focus:border-yellow-400 font-medium"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3.5 rounded-2xl bg-yellow-400 hover:bg-yellow-500 text-black font-black text-xs border border-yellow-500 shadow-md cursor-pointer transition-all"
              >
                {editingTableId ? 'ACTUALIZAR MESA' : 'GUARDAR MESA'}
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
