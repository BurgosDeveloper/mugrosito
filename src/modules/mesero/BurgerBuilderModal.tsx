import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Product, Ingredient, BurgerUnitConfig, OrderItem } from '../../data/mockData';
import { getExtraPrice } from '../../utils/burgerPricing';
import { getCleanItemNote, normalizeProteinName, areProteinsDefault, formatRemovedIngredients, getProteinIcon } from '../../utils/burgerProteins';
import {
  IoClose,
  IoAdd,
  IoRemove,
  IoCheckmark,
  IoCloseCircle,
  IoChevronDown,
  IoChevronUp,
  IoCopyOutline,
  IoRefreshOutline,
} from 'react-icons/io5';

export const AVAILABLE_BURGER_PROTEINS = [
  { id: 'novillo', name: 'CARNE DE NOVILLO', icon: '🥩' },
  { id: 'pollo_crispy', name: 'POLLO CRISPY', icon: '🍗' },
  { id: 'pollo_plancha', name: 'PECHUGA DE POLLO A LA PLANCHA', icon: '🍳' },
  { id: 'chuleta', name: 'CHULETA DE CERDO AHUMADA', icon: '🥓' },
  { id: 'mechada', name: 'CARNE MECHADA', icon: '🍲' },
  { id: 'smash', name: 'SMASH DE CARNE', icon: '🥩' },
];

export const STRICT_FREE_TOPPINGS: Array<{ id: string; name: string }> = [];

const DEFAULT_BURGER_BASE_INGREDIENTS = [
  'Pan Brioche',
  'Queso Cheddar',
  'Lechuga',
  'Tomate',
  'Cebolla',
  'Salsa Crispy Especial',
];

const getInitialProteins = (
  burger: Product,
  dbProteins: { id: string; name: string; icon: string }[] = AVAILABLE_BURGER_PROTEINS
): string[] => {
  const count = burger.proteinCount !== undefined && burger.proteinCount !== null ? burger.proteinCount : 1;
  const nameLower = (burger.name || '').toLowerCase();
  const descLower = (burger.description || '').toLowerCase();

  if (count === 0 || nameLower.includes('papas') || nameLower.includes('nuggets')) {
    return [];
  }

  // Si el producto tiene defaultProteins configuradas en la BD, resolverlas con dbProteins
  if (burger.defaultProteins && Array.isArray(burger.defaultProteins) && burger.defaultProteins.length > 0) {
    return burger.defaultProteins.map((dp) => {
      const match = dbProteins.find(
        (p) =>
          p.name.toUpperCase() === String(dp || '').toUpperCase() ||
          normalizeProteinName(p.name) === normalizeProteinName(dp)
      );
      return match ? match.name : String(dp || '').toUpperCase();
    });
  }

  // Fallback si no hay defaultProteins explícitos: buscar la proteína que coincida en la BD
  const findProtein = (keyword: string) =>
    dbProteins.find(
      (p) =>
        p.name.toLowerCase().includes(keyword) ||
        normalizeProteinName(p.name).includes(keyword)
    )?.name;

  const novillo = findProtein('novillo') || findProtein('carne') || findProtein('res') || dbProteins[0]?.name || 'CARNE DE NOVILLO';
  const polloCrispy = findProtein('crispy') || findProtein('pollo') || novillo;
  const chuleta = findProtein('chuleta') || findProtein('cerdo') || findProtein('pork') || novillo;
  const smash = findProtein('smash') || novillo;
  const mechada = findProtein('mechada') || findProtein('street') || novillo;
  const plancha = findProtein('plancha') || findProtein('pechuga') || findProtein('grill') || polloCrispy;

  if (nameLower.includes('3.0') || nameLower.includes('triple') || count === 3) {
    return [novillo, polloCrispy, chuleta];
  }
  if (nameLower.includes('mixtura')) {
    return [novillo, polloCrispy];
  }
  if (nameLower.includes('house')) {
    return [polloCrispy, chuleta];
  }
  if (nameLower.includes('super smash') || nameLower.includes('tasty')) {
    return [smash, smash];
  }
  if (nameLower.includes('doble') || count === 2) {
    return [novillo, novillo];
  }
  if (nameLower.includes('mr pork') || descLower.includes('chuleta')) {
    return [chuleta];
  }
  if (nameLower.includes('street') || descLower.includes('mechada')) {
    return [mechada];
  }
  if (nameLower.includes('chicken grill') || descLower.includes('plancha')) {
    return [plancha];
  }
  if (nameLower.includes('crispy') || descLower.includes('pollo')) {
    return [polloCrispy];
  }
  return [novillo];
};

const createInitialUnitConfig = (
  unitIndex: number,
  burger: Product,
  defaultTakeaway: boolean,
  defaultDelivery: boolean = false,
  dbProteins: { id: string; name: string; icon: string }[] = AVAILABLE_BURGER_PROTEINS
): BurgerUnitConfig => ({
  unitIndex,
  proteins: getInitialProteins(burger, dbProteins),
  removedIngredients: [],
  selectedFreeToppings: [],
  selectedPaidExtras: [],
  isTakeaway: defaultTakeaway && !defaultDelivery,
  isDelivery: defaultDelivery,
  isCut: false,
  cutPreference: 'Entera',
  notes: '',
  subtotalUSD: burger.price,
});

const createEditUnitConfig = (
  unitIndex: number,
  burger: Product,
  item: OrderItem,
  dbProteins: { id: string; name: string; icon: string }[] = AVAILABLE_BURGER_PROTEINS
): BurgerUnitConfig => {
  const allExtras = Array.isArray(item.extras) ? item.extras : [];
  const freeTops = allExtras
    .filter((e) => Number(e.price) === 0)
    .map((e) => (e.name || '').replace(/\s*\(GRATIS\)\s*/gi, '').trim())
    .filter(Boolean);
  const paidExtras = allExtras
    .filter((e) => Number(e.price) > 0)
    .map((e) => {
      const cleanName = (e.name || '').replace(/^\+?\s*(ADD|EXTRA):?\s*/i, '').trim();
      const match = cleanName.match(/^(\d+)x\s*(.*)$/i);
      const quantity = e.quantity || (match ? parseInt(match[1], 10) : 1);
      const name = match ? match[2].trim() : cleanName;
      const totalPrice = Number(e.price);
      const unitPrice = e.unitPrice || (quantity > 0 ? totalPrice / quantity : totalPrice);
      return {
        name,
        price: totalPrice,
        unitPrice,
        quantity,
      };
    });

  const paidExtrasTotal = paidExtras.reduce((sum, e) => sum + e.price, 0);

  return {
    unitIndex,
    proteins: item.proteins && item.proteins.length > 0 ? item.proteins : getInitialProteins(burger, dbProteins),
    removedIngredients: item.removedIngredients || [],
    selectedFreeToppings: freeTops,
    selectedPaidExtras: paidExtras,
    isTakeaway: !!item.isTakeaway && !item.isDelivery,
    isDelivery: !!item.isDelivery,
    isCut: !!item.isCut || item.cutPreference === 'Picada',
    cutPreference: item.cutPreference || (item.isCut ? 'Picada' : 'Entera'),
    notes: getCleanItemNote(item.notes) || '',
    subtotalUSD: (burger.price || item.price || 0) + paidExtrasTotal,
  };
};

function areUnitsIdentical(a: BurgerUnitConfig, b: BurgerUnitConfig): boolean {
  if (Boolean(a.isTakeaway) !== Boolean(b.isTakeaway)) return false;
  if (Boolean(a.isDelivery) !== Boolean(b.isDelivery)) return false;
  if (a.isCut !== b.isCut) return false;
  if (a.cutPreference !== b.cutPreference) return false;
  if (getCleanItemNote(a.notes) !== getCleanItemNote(b.notes)) return false;

  const aProt = [...(a.proteins || [])].map(normalizeProteinName).sort().join('|');
  const bProt = [...(b.proteins || [])].map(normalizeProteinName).sort().join('|');
  if (aProt !== bProt) return false;

  const aRem = [...a.removedIngredients].sort().join('|');
  const bRem = [...b.removedIngredients].sort().join('|');
  if (aRem !== bRem) return false;

  const aFree = [...a.selectedFreeToppings].sort().join('|');
  const bFree = [...b.selectedFreeToppings].sort().join('|');
  if (aFree !== bFree) return false;

  const aPaid = (a.selectedPaidExtras || []).map((e) => `${e.name}:${e.quantity || 1}:${e.price}`).sort().join('|');
  const bPaid = (b.selectedPaidExtras || []).map((e) => `${e.name}:${e.quantity || 1}:${e.price}`).sort().join('|');
  if (aPaid !== bPaid) return false;

  return true;
}

export interface BurgerOrderConfirmationItem {
  burger: Product;
  quantity: number;
  proteins?: string[];
  removedIngredients: string[];
  extras: Array<{ name: string; price: number; quantity?: number; unitPrice?: number }>;
  isTakeaway: boolean;
  isDelivery?: boolean;
  isCut: boolean;
  cutPreference?: 'Entera' | 'Picada';
  notes?: string;
  finalPrice: number;
}

interface BurgerBuilderModalProps {
  burger: Product | null;
  availableExtras: Ingredient[];
  availableProteins?: Ingredient[];
  availableFreeToppings?: Ingredient[];
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (config: BurgerOrderConfirmationItem | BurgerOrderConfirmationItem[]) => void;
  defaultTakeaway?: boolean;
  defaultDelivery?: boolean;
  exchangeRates?: { COP: number; Bs: number };
  inline?: boolean;
  initialEditItem?: OrderItem | null;
}

export const BurgerBuilderModal: React.FC<BurgerBuilderModalProps> = ({
  burger,
  availableExtras,
  availableProteins,
  availableFreeToppings,
  isOpen,
  onClose,
  onConfirm,
  defaultTakeaway = false,
  defaultDelivery = false,
  exchangeRates = { COP: 3100, Bs: 3.2 },
  inline = false,
  initialEditItem,
}) => {
  const [units, setUnits] = useState<BurgerUnitConfig[]>([]);
  const [activeUnitIndex, setActiveUnitIndex] = useState<number>(0);
  const [showProteinas, setShowProteinas] = useState<boolean>(false);
  const [showAdicionales, setShowAdicionales] = useState<boolean>(false);
  const [copyToast, setCopyToast] = useState<string>('');

  // Sincronizar proteínas disponibles dinámicas de la base de datos
  const effectiveProteins = useMemo(() => {
    if (availableProteins && availableProteins.length > 0) {
      return availableProteins.map((ing) => ({
        id: ing.id,
        name: ing.name,
        icon: getProteinIcon(ing.name),
      }));
    }
    return AVAILABLE_BURGER_PROTEINS;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableProteins ? availableProteins.map((p) => `${p.id}:${p.name}`).join('|') : '']);

  // Ref para controlar que la inicialización de unidades solo ocurra al abrir el modal o cambiar de hamburguesa/edición
  // Esto previene que re-renders del padre o eventos Socket.IO deseleccionen ingredientes
  const activeBurgerIdRef = React.useRef<string | null>(null);

  useEffect(() => {
    if (isOpen && burger) {
      const activeKey = initialEditItem ? `edit-${initialEditItem.id}` : `create-${burger.id}`;
      if (activeBurgerIdRef.current !== activeKey) {
        activeBurgerIdRef.current = activeKey;
        if (initialEditItem) {
          const qty = Math.max(1, initialEditItem.quantity || 1);
          const editUnits: BurgerUnitConfig[] = [];
          for (let i = 0; i < qty; i++) {
            editUnits.push(createEditUnitConfig(i, burger, initialEditItem, effectiveProteins));
          }
          setUnits(editUnits);
        } else {
          setUnits([createInitialUnitConfig(0, burger, defaultTakeaway, defaultDelivery, effectiveProteins)]);
        }
        setActiveUnitIndex(0);
        setShowProteinas(false);
        setShowAdicionales(false);
        setCopyToast('');
      }
    } else if (!isOpen) {
      activeBurgerIdRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, burger?.id, initialEditItem?.id]);

  // Lista dinámica de Toppings Gratis (leídos exclusivamente desde la BD vía availableFreeToppings o filtrados de availableExtras)
  const freeToppingsList = useMemo(() => {
    let list: Ingredient[] = [];
    if (availableFreeToppings && availableFreeToppings.length > 0) {
      list = availableFreeToppings.filter(
        (i) =>
          (i.ingredientType?.toLowerCase() === 'gratis' ||
            i.category?.toLowerCase() === 'gratis' ||
            i.category?.toLowerCase() === 'toppings gratis') &&
          i.available !== false
      );
    } else if (availableExtras && availableExtras.length > 0) {
      list = availableExtras.filter(
        (i) =>
          (i.ingredientType?.toLowerCase() === 'gratis' ||
            i.category?.toLowerCase() === 'gratis' ||
            i.category?.toLowerCase() === 'toppings gratis') &&
          i.available !== false
      );
    }

    if (list.length > 0) {
      return list.map((ing) => ({
        id: ing.id,
        // Limpiar sufijo "(GRATIS)" para la etiqueta visual de los botones
        name: ing.name.replace(/\s*\(GRATIS\)\s*/gi, '').trim(),
        rawName: ing.name,
      }));
    }

    return [];
  }, [availableFreeToppings, availableExtras]);

  // Lista de Adicionales Pagos (excluyendo cualquier adicional gratis de la BD para evitar duplicados)
  const paidExtrasList = useMemo(() => {
    const freeNames = freeToppingsList.map((t) => t.name.toLowerCase().trim());
    const freeRawNames = freeToppingsList.map((t) => (t.rawName || t.name).toLowerCase().trim());
    const freeIds = freeToppingsList.map((t) => t.id.toLowerCase());

    return availableExtras.filter((extra) => {
      const extraId = (extra.id || '').toLowerCase();
      const extraName = (extra.name || '').toLowerCase().trim();
      const cleanExtraName = extraName.replace(/\s*\(gratis\)\s*/gi, '').trim();
      const price = getExtraPrice(extra);

      // Excluir si es tipo gratis o categoría gratis
      if (extra.ingredientType === 'gratis' || extra.category?.toLowerCase() === 'gratis') {
        return false;
      }
      if (freeIds.includes(extraId)) return false;
      if (freeNames.includes(cleanExtraName) || freeRawNames.includes(extraName)) return false;

      return price >= 0;
    });
  }, [availableExtras, freeToppingsList]);

  // Proteínas predeterminadas de la receta original
  const defaultRecipeProteins = useMemo(() => {
    if (!burger) return [];
    return getInitialProteins(burger, effectiveProteins);
  }, [burger, effectiveProteins]);

  if (!isOpen || !burger || units.length === 0) return null;

  const currentUnit = units[activeUnitIndex] || units[0];

  // Helper para modificar la unidad activa
  const updateCurrentUnit = (updater: (prev: BurgerUnitConfig) => BurgerUnitConfig) => {
    setUnits((prev) =>
      prev.map((u, idx) => (idx === activeUnitIndex ? updater(u) : u))
    );
  };

  // Manejo de Cantidad
  const handleIncreaseQuantity = () => {
    setUnits((prev) => {
      const nextIndex = prev.length;
      const source = prev[activeUnitIndex] || prev[0];
      const newUnit: BurgerUnitConfig = {
        ...source,
        unitIndex: nextIndex,
        proteins: [...source.proteins],
        removedIngredients: [...source.removedIngredients],
        selectedFreeToppings: [...source.selectedFreeToppings],
        selectedPaidExtras: source.selectedPaidExtras.map((e) => ({ ...e })),
      };
      return [...prev, newUnit];
    });
    // Cambiar automáticamente a la nueva unidad para que el usuario pueda personalizarla si desea
    setActiveUnitIndex(units.length);
  };

  const handleDecreaseQuantity = () => {
    if (units.length <= 1) return;
    setUnits((prev) => prev.slice(0, prev.length - 1));
    if (activeUnitIndex >= units.length - 1) {
      setActiveUnitIndex(Math.max(0, units.length - 2));
    }
  };

  // Copiar configuración activa a todas las demás
  const handleCopyActiveToAll = () => {
    const active = units[activeUnitIndex];
    if (!active) return;
    setUnits((prev) =>
      prev.map((u, idx) =>
        idx === activeUnitIndex
          ? u
          : {
              ...active,
              unitIndex: idx,
              proteins: [...active.proteins],
              removedIngredients: [...active.removedIngredients],
              selectedFreeToppings: [...active.selectedFreeToppings],
              selectedPaidExtras: active.selectedPaidExtras.map((e) => ({ ...e })),
            }
      )
    );
    setCopyToast(`¡Personalización de #${activeUnitIndex + 1} copiada a las ${units.length} unidades!`);
    setTimeout(() => setCopyToast(''), 2500);
  };

  // Resetear unidad activa a valores iniciales
  const handleResetCurrentUnit = () => {
    if (!burger) return;
    const fresh = createInitialUnitConfig(activeUnitIndex, burger, defaultTakeaway, defaultDelivery, effectiveProteins);
    updateCurrentUnit(() => fresh);
    setCopyToast(`Ítem #${activeUnitIndex + 1} restablecido a su receta base.`);
    setTimeout(() => setCopyToast(''), 2000);
  };

  // Base ingredients for this burger, filtrando proteínas porque las proteínas tienen su propio selector
  const rawBaseIngredients =
    burger.baseIngredients && burger.baseIngredients.length > 0
      ? burger.baseIngredients
      : DEFAULT_BURGER_BASE_INGREDIENTS;

  const isProteinName = (name: string) =>
    /carne|pollo|chuleta|mechada|smash|res|novillo|pechuga|proteina|proteína/i.test(name);

  const customizableBaseIngredients = rawBaseIngredients.filter((ing) => !isProteinName(ing));

  const toggleRemoveBase = (ingName: string) => {
    updateCurrentUnit((prev) => {
      const alreadyRemoved = prev.removedIngredients.some(
        (i) => i.toLowerCase().trim() === ingName.toLowerCase().trim()
      );
      return {
        ...prev,
        removedIngredients: alreadyRemoved
          ? prev.removedIngredients.filter(
              (i) => i.toLowerCase().trim() !== ingName.toLowerCase().trim()
            )
          : [...prev.removedIngredients, ingName],
      };
    });
  };

  const isAllVegetablesRemoved =
    currentUnit.removedIngredients.some((i) => /lechuga/i.test(i)) &&
    currentUnit.removedIngredients.some((i) => /tomate/i.test(i)) &&
    currentUnit.removedIngredients.some((i) => /cebolla/i.test(i));

  const toggleAllVegetables = () => {
    updateCurrentUnit((prev) => {
      const isAll =
        prev.removedIngredients.some((i) => /lechuga/i.test(i)) &&
        prev.removedIngredients.some((i) => /tomate/i.test(i)) &&
        prev.removedIngredients.some((i) => /cebolla/i.test(i));
      if (isAll) {
        return {
          ...prev,
          removedIngredients: prev.removedIngredients.filter(
            (i) => !/lechuga|tomate|cebolla/i.test(i)
          ),
        };
      } else {
        const base = prev.removedIngredients.filter(
          (i) => !/lechuga|tomate|cebolla/i.test(i)
        );
        // Garantizar que los 3 vegetales (Lechuga, Tomate, Cebolla) se incluyan exactamente
        // con el nombre que tengan en la receta base (o fallback a mayúsculas)
        const findVegName = (regex: RegExp, fallback: string) => {
          const found = customizableBaseIngredients.find((ing) => regex.test(ing));
          return found || fallback;
        };
        const vegNames = [
          findVegName(/lechuga/i, 'LECHUGA'),
          findVegName(/tomate/i, 'TOMATE'),
          findVegName(/cebolla/i, 'CEBOLLA'),
        ];
        return {
          ...prev,
          removedIngredients: [...base, ...vegNames],
        };
      }
    });
  };

  const toggleFreeTopping = (toppingName: string) => {
    updateCurrentUnit((prev) => ({
      ...prev,
      selectedFreeToppings: prev.selectedFreeToppings.includes(toppingName)
        ? prev.selectedFreeToppings.filter((t) => t !== toppingName)
        : [...prev.selectedFreeToppings, toppingName],
    }));
  };

  const togglePaidExtra = (extraIng: Ingredient) => {
    const unitPrice = getExtraPrice(extraIng);
    updateCurrentUnit((prev) => {
      const existingIndex = prev.selectedPaidExtras.findIndex(
        (e) => e.name.toLowerCase().trim() === extraIng.name.toLowerCase().trim()
      );

      if (existingIndex === -1) {
        return {
          ...prev,
          selectedPaidExtras: [
            ...prev.selectedPaidExtras,
            { name: extraIng.name, price: unitPrice, unitPrice, quantity: 1 },
          ],
        };
      }

      const existing = prev.selectedPaidExtras[existingIndex];
      const currentQty = existing.quantity || 1;

      if (currentQty < 3) {
        const nextQty = currentQty + 1;
        const basePrice = existing.unitPrice ?? unitPrice;
        const updatedExtras = [...prev.selectedPaidExtras];
        updatedExtras[existingIndex] = {
          ...existing,
          quantity: nextQty,
          unitPrice: basePrice,
          price: basePrice * nextQty,
        };
        return {
          ...prev,
          selectedPaidExtras: updatedExtras,
        };
      }

      return {
        ...prev,
        selectedPaidExtras: prev.selectedPaidExtras.filter((_, idx) => idx !== existingIndex),
      };
    });
  };

  const copRate = exchangeRates?.COP || 3100;
  const bsRate = exchangeRates?.Bs || 3.2;

  const currentUnitExtrasTotal = currentUnit.selectedPaidExtras.reduce((sum, e) => sum + e.price, 0);
  const currentUnitPrice = burger.price + currentUnitExtrasTotal;
  const currentUnitUSD = copRate > 0 ? currentUnitPrice / copRate : 0;
  const currentUnitBs = bsRate > 0 ? currentUnitPrice / bsRate : 0;

  const grandTotalPrice = units.reduce(
    (total, u) => total + (burger.price + u.selectedPaidExtras.reduce((sum, e) => sum + e.price, 0)),
    0
  );
  const grandTotalUSD = copRate > 0 ? grandTotalPrice / copRate : 0;
  const grandTotalBs = bsRate > 0 ? grandTotalPrice / bsRate : 0;

  const handleSave = () => {
    if (!burger || units.length === 0) return;

    // Agrupar unidades que tengan la MISMA configuración exacta
    const groups: { unit: BurgerUnitConfig; quantity: number }[] = [];

    for (const u of units) {
      const match = groups.find((g) => areUnitsIdentical(g.unit, u));
      if (match) {
        match.quantity += 1;
      } else {
        groups.push({ unit: u, quantity: 1 });
      }
    }

    const itemsToEmit: BurgerOrderConfirmationItem[] = groups.map(({ unit: u, quantity }) => {
      const combinedExtras: Array<{ name: string; price: number; quantity?: number; unitPrice?: number }> = [
        ...u.selectedFreeToppings.map((name) => ({ name, price: 0, quantity: 1 })),
        ...u.selectedPaidExtras.map((e) => ({
          name: e.name,
          price: e.price,
          unitPrice: e.unitPrice ?? (e.quantity ? e.price / e.quantity : e.price),
          quantity: e.quantity || 1,
        })),
      ];
      const extrasCost = u.selectedPaidExtras.reduce((sum, e) => sum + e.price, 0);
      const unitPrice = burger.price + extrasCost;

      // NOTA: Únicamente si el usuario escribió una nota real en el input.
      // NUNCA agregar tags artificiales como [#1], [#2] si el usuario no escribió nada.
      const userNote = getCleanItemNote(u.notes);

      return {
        burger,
        quantity,
        proteins: u.proteins.length > 0 ? u.proteins : undefined,
        removedIngredients: u.removedIngredients,
        extras: combinedExtras,
        isTakeaway: Boolean(u.isTakeaway),
        isDelivery: Boolean(u.isDelivery),
        isCut: u.isCut,
        cutPreference: u.cutPreference,
        notes: userNote || undefined,
        finalPrice: unitPrice,
      };
    });

    if (itemsToEmit.length === 1) {
      onConfirm(itemsToEmit[0]);
    } else {
      onConfirm(itemsToEmit);
    }

    onClose();
  };

  const modalContent = (
    <div className={inline ? "flex flex-col h-full bg-stone-100 text-gray-900 w-full overflow-hidden select-none" : "fixed inset-0 z-[100] flex flex-col bg-stone-100 text-gray-900 w-full h-full max-h-screen overflow-hidden select-none"}>
      {/* 1. TOP HEADER (CORTE COMPACTO Y CLARO) */}
      <header className={`bg-white text-gray-900 ${inline ? 'px-3.5 py-2' : 'px-4 sm:px-6 py-3.5'} flex items-center justify-between border-b-2 border-yellow-400 shrink-0 shadow-xs`}>
        <div className="flex items-center gap-3 flex-wrap">
          <span className={inline ? "text-2xl sm:text-3xl" : "text-3xl sm:text-4xl"}>🌭</span>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className={`${inline ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl'} font-black text-gray-950 tracking-wide flex items-center gap-2`}>
                {initialEditItem && (
                  <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded-lg font-black tracking-wider uppercase shadow-xs">
                    ✏️ Editando
                  </span>
                )}
                <span>{burger.name.toUpperCase()}</span>
              </h2>
              <span className="bg-yellow-400 text-black text-xs sm:text-sm px-2.5 py-0.5 rounded-xl font-black shadow-xs border border-yellow-500">
                {currentUnit.proteins.length === 0
                  ? 'Plato / Ración'
                  : currentUnit.proteins.length === 1
                  ? 'Sencilla'
                  : currentUnit.proteins.length === 2
                  ? 'Doble Carne'
                  : 'Triple Carne'}
              </span>
              {units.length > 1 && (
                <span className="bg-stone-900 text-white text-xs sm:text-sm px-2.5 py-0.5 rounded-xl font-black">
                  {units.length} UNIDADES EN PEDIDO
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs sm:text-base font-black text-gray-700 flex-wrap">
              <span className="text-black text-base sm:text-lg font-black">🇨🇴 {Math.round(currentUnitPrice).toLocaleString('es-CO')} COP</span>
              {currentUnitExtrasTotal > 0 && (
                <span className="text-emerald-700 text-xs sm:text-sm font-bold">(Base {Math.round(burger.price).toLocaleString('es-CO')} + Adic. {Math.round(currentUnitExtrasTotal).toLocaleString('es-CO')} COP)</span>
              )}
              <span className="text-gray-400">•</span>
              <span>🇺🇸 ${currentUnitUSD.toFixed(2)} USD</span>
              <span className="text-gray-400">•</span>
              <span>🇻🇪 {currentUnitBs.toFixed(2)} Bs</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="px-3 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-gray-800 hover:text-black transition-colors cursor-pointer flex items-center gap-1.5 font-black text-xs sm:text-sm shadow-2xs border border-gray-300"
          title={inline ? "Volver al catálogo" : "Cerrar modal"}
        >
          <IoClose className={inline ? "text-xl text-gray-700" : "text-2xl"} />
          <span className="hidden sm:inline">Volver al Menú</span>
        </button>
      </header>

      {/* 2. BODY SCROLLABLE (ESPACIOSO Y SIN CORTES) */}
      <main className={`flex-1 min-h-0 overflow-y-auto ${inline ? 'p-2.5 space-y-2.5 pb-2' : 'p-3.5 sm:p-5 space-y-4 max-w-7xl mx-auto w-full pb-8'}`}>
        {/* BARRA SUPERIOR COMPACTA: CANTIDAD, PARA LLEVAR Y PICADA / ENTERA */}
        <section className={`bg-white ${inline ? 'p-2.5 rounded-2xl' : 'p-3 sm:p-4 rounded-2xl'} border border-gray-200 shadow-xs flex flex-wrap items-center justify-between gap-2.5`}>
          {/* Selector de Cantidad */}
          <div className="flex items-center gap-2.5">
            <span className="text-xs sm:text-sm font-black text-gray-900 uppercase">Cantidad Total:</span>
            <div className="flex items-center border-2 border-yellow-400 rounded-xl bg-white shadow-xs overflow-hidden">
              <button
                type="button"
                onClick={handleDecreaseQuantity}
                className="px-3.5 py-1.5 hover:bg-yellow-100 text-black font-black text-lg transition-colors cursor-pointer"
                title="Disminuir unidades"
              >
                <IoRemove />
              </button>
              <span className="px-4 py-1 text-base sm:text-xl font-black text-black min-w-[2.5rem] text-center">
                {units.length}
              </span>
              <button
                type="button"
                onClick={handleIncreaseQuantity}
                className="px-3.5 py-1.5 hover:bg-yellow-100 text-black font-black text-lg transition-colors cursor-pointer"
                title="Agregar otra unidad para personalizar"
              >
                <IoAdd />
              </button>
            </div>
          </div>

          {/* Opciones Rápidas: Para Llevar y Picada / Entera de la unidad activa */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Destino del Producto: Salón / Llevar / Delivery */}
            <div className="flex items-center border border-gray-300 rounded-xl bg-white p-1 shadow-xs">
              <button
                type="button"
                onClick={() =>
                  updateCurrentUnit((prev) => ({
                    ...prev,
                    isTakeaway: false,
                    isDelivery: false,
                  }))
                }
                className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-black transition-all cursor-pointer ${
                  !currentUnit.isTakeaway && !currentUnit.isDelivery
                    ? 'bg-yellow-400 text-black shadow-xs'
                    : 'text-gray-600 hover:text-black'
                }`}
              >
                🍽️ SALÓN
              </button>
              <button
                type="button"
                onClick={() =>
                  updateCurrentUnit((prev) => ({
                    ...prev,
                    isTakeaway: true,
                    isDelivery: false,
                  }))
                }
                className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-black transition-all cursor-pointer ${
                  currentUnit.isTakeaway && !currentUnit.isDelivery
                    ? 'bg-amber-400 text-black shadow-xs'
                    : 'text-gray-600 hover:text-black'
                }`}
              >
                🛍️ LLEVAR
              </button>
              <button
                type="button"
                onClick={() =>
                  updateCurrentUnit((prev) => ({
                    ...prev,
                    isTakeaway: false,
                    isDelivery: true,
                  }))
                }
                className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-black transition-all cursor-pointer ${
                  currentUnit.isDelivery
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-gray-600 hover:text-black'
                }`}
              >
                🛵 DELIVERY
              </button>
            </div>

            {/* Picada vs Entera */}
            <div className="flex items-center border border-gray-300 rounded-xl bg-white p-1 shadow-xs">
              <button
                type="button"
                onClick={() =>
                  updateCurrentUnit((prev) => ({
                    ...prev,
                    isCut: false,
                    cutPreference: 'Entera',
                  }))
                }
                className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-black transition-all cursor-pointer ${
                  !currentUnit.isCut
                    ? 'bg-yellow-400 text-black shadow-xs'
                    : 'text-gray-600 hover:text-black'
                }`}
              >
                🌭 ENTERO
              </button>
              <button
                type="button"
                onClick={() =>
                  updateCurrentUnit((prev) => ({
                    ...prev,
                    isCut: true,
                    cutPreference: 'Picada',
                  }))
                }
                className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-black transition-all cursor-pointer flex items-center gap-1 ${
                  currentUnit.isCut
                    ? 'bg-red-500 text-white shadow-xs'
                    : 'text-gray-600 hover:text-black'
                }`}
              >
                <span>🔪 PICADA</span>
              </button>
            </div>
          </div>
        </section>

        {/* PESTAÑAS MULTI-UNIDAD CUANDO HAY MÁS DE 1 HAMBURGUESA */}
        {units.length > 1 && (
          <section className="bg-yellow-50/80 p-3.5 rounded-2xl border-2 border-yellow-300 shadow-xs space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm font-black text-yellow-950 uppercase tracking-wide flex items-center gap-1.5">
                  <span>🌭</span>
                  <span>SELECCIONA LA UNIDAD A PERSONALIZAR ({units.length}):</span>
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleCopyActiveToAll}
                  className="px-3.5 py-1.5 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-black text-xs sm:text-sm font-black border border-yellow-500 shadow-xs flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
                  title="Copiar los ingredientes, adicionales y notas de esta unidad a todas las demás"
                >
                  <IoCopyOutline className="text-base" />
                  <span>Copiar #{activeUnitIndex + 1} a todas</span>
                </button>

                <button
                  type="button"
                  onClick={handleResetCurrentUnit}
                  className="px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-gray-800 text-xs sm:text-sm font-bold border border-gray-300 shadow-xs flex items-center gap-1 cursor-pointer transition-all"
                  title="Restablecer esta unidad a su receta original"
                >
                  <IoRefreshOutline className="text-base" />
                  <span>Reset #{activeUnitIndex + 1}</span>
                </button>
              </div>
            </div>

            {copyToast && (
              <div className="text-xs sm:text-sm font-black text-emerald-900 bg-emerald-100 border border-emerald-300 px-3 py-1.5 rounded-xl animate-in fade-in">
                {copyToast}
              </div>
            )}

            {/* Fila de Botones de Pestaña */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {units.map((u, idx) => {
                const isActive = idx === activeUnitIndex;
                const isModified =
                  u.removedIngredients.length > 0 ||
                  u.selectedFreeToppings.length > 0 ||
                  u.selectedPaidExtras.length > 0 ||
                  u.isCut ||
                  u.isTakeaway !== defaultTakeaway ||
                  !areProteinsDefault(burger.name, u.proteins) ||
                  Boolean(getCleanItemNote(u.notes));

                const unitExtrasSum = u.selectedPaidExtras.reduce((s, e) => s + e.price, 0);

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActiveUnitIndex(idx)}
                    className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all border-2 flex items-center gap-2 shrink-0 cursor-pointer ${
                      isActive
                        ? 'bg-yellow-400 text-black border-yellow-500 shadow-sm scale-[1.02] ring-2 ring-yellow-400'
                        : 'bg-white text-gray-800 border-gray-200 hover:border-yellow-300 hover:bg-yellow-50/50'
                    }`}
                  >
                    <span>🌭 #{idx + 1}</span>
                    {isModified ? (
                      <span className="text-[11px] font-black px-2 py-0.5 rounded-md bg-amber-200 text-amber-950">
                        Modificada
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-gray-100 text-gray-700">
                        Base
                      </span>
                    )}
                    {unitExtrasSum > 0 && (
                      <span className="text-[11px] font-black text-emerald-900 bg-emerald-100 px-1.5 py-0.5 rounded-md">
                        +${unitExtrasSum.toFixed(2)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* 3. ADICIONALES Y TOPPINGS GRATIS DE LA BASE DE DATOS (Solo se muestra si existen en la BD) */}
        {freeToppingsList.length > 0 && (
          <section className="bg-amber-50/60 p-3.5 sm:p-4 rounded-2xl border border-yellow-300 shadow-xs space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-xs sm:text-sm font-black text-yellow-950 uppercase tracking-wide flex items-center gap-1.5">
                <span>✨</span>
                <span>
                  TOPPINGS & SALSAS GRATIS ({units.length > 1 ? `ÍTEM #${activeUnitIndex + 1}` : 'DISPONIBLES'}):
                </span>
              </h3>
              <span className="text-xs font-black text-amber-900 bg-yellow-200/90 px-2.5 py-0.5 rounded-lg border border-yellow-300">
                {currentUnit.selectedFreeToppings.length} seleccionados
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
              {freeToppingsList.map((top) => {
                const isSelected = currentUnit.selectedFreeToppings.includes(top.name);
                return (
                  <button
                    key={top.id}
                    type="button"
                    onClick={() => toggleFreeTopping(top.name)}
                    className={`p-3 rounded-2xl text-center font-black text-xs sm:text-sm transition-all border-2 flex items-center justify-center gap-1.5 cursor-pointer ${
                      isSelected
                        ? 'bg-yellow-400 text-black border-yellow-500 shadow-sm scale-[1.02]'
                        : 'bg-white text-gray-800 border-gray-200 hover:border-yellow-400 hover:bg-yellow-50/30'
                    }`}
                  >
                    <span className="truncate">{top.name}</span>
                    <span className="font-black text-base">{isSelected ? '✓' : '+'}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* 4. BOTONES DESPLEGABLES DE PROTEÍNAS Y ADICIONALES + SECCIÓN DE PERSONALIZAR ABIERTA */}
        <section className="space-y-3">
          <div className={`grid grid-cols-1 ${currentUnit.proteins.length > 0 ? 'sm:grid-cols-2' : ''} gap-2.5`}>
            {/* BOTÓN 1: PROTEÍNAS (Despliega cambio de carnes solo si aplica) */}
            {currentUnit.proteins.length > 0 && (
              <button
                type="button"
                onClick={() => setShowProteinas((prev) => !prev)}
                className={`p-3.5 rounded-2xl border font-black text-xs sm:text-sm flex items-center justify-between transition-all cursor-pointer shadow-xs ${
                  showProteinas
                    ? 'bg-stone-800 text-white border-stone-900 ring-2 ring-yellow-400'
                    : 'bg-white text-black border-gray-200 hover:border-yellow-400'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">🥩</span>
                  <div className="text-left">
                    <div className="font-black leading-tight text-sm sm:text-base">
                      {units.length > 1 ? `PROTEÍNAS #${activeUnitIndex + 1}` : 'PROTEÍNA / CARNES'}
                    </div>
                    <div className="text-xs font-bold text-gray-500 truncate max-w-[150px] sm:max-w-xs mt-0.5">
                      {currentUnit.proteins.join(' + ')}
                    </div>
                  </div>
                </div>
                {showProteinas ? <IoChevronUp className="text-xl" /> : <IoChevronDown className="text-xl" />}
              </button>
            )}

            {/* BOTÓN 2: ADICIONALES CON COSTO */}
            <button
              type="button"
              onClick={() => setShowAdicionales((prev) => !prev)}
              className={`p-3.5 rounded-2xl border font-black text-xs sm:text-sm flex items-center justify-between transition-all cursor-pointer shadow-xs ${
                showAdicionales
                  ? 'bg-stone-800 text-white border-stone-900 ring-2 ring-yellow-400'
                  : 'bg-white text-black border-gray-200 hover:border-yellow-400'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">➕</span>
                <div className="text-left">
                  <div className="font-black leading-tight text-sm sm:text-base">
                    {units.length > 1
                      ? `ADICIONALES COP #${activeUnitIndex + 1}`
                      : 'ADICIONALES CON COSTO (COP)'}
                  </div>
                  <div className="text-xs font-bold text-gray-500 mt-0.5">
                    {currentUnit.selectedPaidExtras.length > 0
                      ? `+${currentUnit.selectedPaidExtras.reduce((s, e) => s + (e.quantity || 1), 0)} porción(es) (+${Math.round(currentUnitExtrasTotal).toLocaleString('es-CO')} COP)`
                      : 'Sin adicionales con costo'}
                  </div>
                </div>
              </div>
              {showAdicionales ? <IoChevronUp className="text-xl" /> : <IoChevronDown className="text-xl" />}
            </button>
          </div>

          {/* DESPLIEGUE 1: PROTEÍNAS (Con textos centrados) */}
          {showProteinas && currentUnit.proteins.length > 0 && (
            <div className="bg-amber-50/40 p-3.5 sm:p-4 rounded-2xl border border-yellow-300 space-y-3 shadow-xs animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs sm:text-sm font-black text-gray-900 uppercase">
                  Selecciona la proteína para cada carne:
                </span>
                <span className="text-xs font-black text-amber-950 bg-yellow-300 px-3 py-1 rounded-xl border border-yellow-400">
                  {currentUnit.proteins.length === 1 ? '1 Carne' : `${currentUnit.proteins.length} Carnes`}
                </span>
              </div>

              <div className="space-y-3">
                {currentUnit.proteins.map((currentProtein, slotIndex) => {
                  const defaultProteinForSlot = defaultRecipeProteins[slotIndex];

                  return (
                    <div key={slotIndex} className="bg-white p-3.5 rounded-2xl border border-gray-200 space-y-2.5 shadow-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-xs sm:text-sm font-black text-gray-900">
                          {currentUnit.proteins.length === 1
                            ? 'Proteína principal:'
                            : `Carne / Proteína #${slotIndex + 1}:`}
                        </span>
                        <div className="flex items-center gap-2">
                          {defaultProteinForSlot && (
                            <span className="text-xs font-bold text-gray-600 bg-stone-100 px-2.5 py-0.5 rounded-lg border border-gray-200">
                              Receta: {defaultProteinForSlot}
                            </span>
                          )}
                          <span className="text-xs sm:text-sm font-black text-black bg-yellow-400 px-3 py-1 rounded-xl border border-yellow-500 shadow-xs">
                            {currentProtein}
                          </span>
                        </div>
                      </div>

                      {/* Tarjetas de Proteínas Centrables */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                        {effectiveProteins.map((prot) => {
                          const isSelected =
                            currentProtein.toUpperCase() === prot.name.toUpperCase() ||
                            normalizeProteinName(currentProtein) === normalizeProteinName(prot.name);
                          const isOriginal = Boolean(
                            defaultProteinForSlot &&
                            (defaultProteinForSlot.toUpperCase() === prot.name.toUpperCase() ||
                             normalizeProteinName(defaultProteinForSlot) === normalizeProteinName(prot.name))
                          );

                          return (
                            <button
                              key={prot.id}
                              type="button"
                              onClick={() => {
                                updateCurrentUnit((prev) => {
                                  const updated = [...prev.proteins];
                                  updated[slotIndex] = prot.name;
                                  return { ...prev, proteins: updated };
                                });
                              }}
                              className={`p-3 rounded-2xl text-center font-black text-xs sm:text-sm flex flex-col items-center justify-between gap-1.5 transition-all border cursor-pointer min-h-[90px] ${
                                isSelected
                                  ? 'bg-yellow-400 text-black border-yellow-500 shadow-xs scale-[1.02]'
                                  : 'bg-stone-50 text-gray-800 border-gray-200 hover:bg-gray-100'
                              }`}
                            >
                              <span className="text-2xl">{prot.icon}</span>
                              <span className="leading-tight text-center line-clamp-2">{prot.name}</span>
                              {isOriginal && (
                                <span
                                  className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md mt-0.5 ${
                                    isSelected
                                      ? 'bg-amber-950/20 text-amber-950 border border-amber-950/30'
                                      : 'bg-yellow-100 text-yellow-900 border border-yellow-300'
                                  }`}
                                  title="Proteína predeterminada de la receta original"
                                >
                                  ⭐ Original
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* DESPLIEGUE 3: ADICIONALES CON COSTO (Centrados) */}
          {showAdicionales && (
            <div className="bg-white p-4 rounded-2xl border border-gray-200 space-y-3 shadow-xs animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs sm:text-sm font-black text-gray-900 uppercase">
                  Adicionales con costo ($):
                </span>
                <span className="text-xs font-bold text-gray-500">Toca para sumar o retirar</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                {paidExtrasList.map((extra) => {
                  const existingExtra = currentUnit.selectedPaidExtras.find((e) => e.name.toLowerCase().trim() === extra.name.toLowerCase().trim());
                  const count = existingExtra?.quantity || (existingExtra ? 1 : 0);
                  const unitPrice = getExtraPrice(extra);
                  const displayPrice = count > 0 ? unitPrice * count : unitPrice;

                  return (
                    <button
                      key={extra.id}
                      type="button"
                      onClick={() => togglePaidExtra(extra)}
                      className={`p-3 rounded-2xl text-center font-black text-xs sm:text-sm transition-all border flex flex-col items-center justify-center gap-1 cursor-pointer min-h-[76px] select-none ${
                        count === 3
                          ? 'bg-emerald-600 text-white border-emerald-700 shadow-md scale-[1.03]'
                          : count === 2
                          ? 'bg-orange-500 text-white border-orange-600 shadow-sm scale-[1.02]'
                          : count === 1
                          ? 'bg-yellow-400 text-black border-yellow-500 shadow-xs scale-[1.01]'
                          : 'bg-stone-50 text-gray-800 border-gray-200 hover:border-yellow-400'
                      }`}
                      title={`${extra.name} (Toca para ciclar 1x, 2x, 3x o retirar)`}
                    >
                      <span className="truncate leading-tight text-center max-w-full">{extra.name}</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {count > 0 && (
                          <span
                            className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${
                              count === 3 || count === 2
                                ? 'bg-black/30 text-white'
                                : 'bg-black/15 text-black'
                            }`}
                          >
                            {count}x
                          </span>
                        )}
                        <span
                          className={`font-black text-xs sm:text-sm px-2 py-0.5 rounded-lg ${
                            count === 3 || count === 2
                              ? 'bg-black/20 text-white'
                              : count === 1
                              ? 'bg-black/10 text-stone-950'
                              : 'bg-black/5 text-stone-900'
                          }`}
                        >
                          +{Math.round(displayPrice).toLocaleString('es-CO')} COP
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* SECCIÓN PERSONALIZAR INGREDIENTES BASE ("SIN ...") - Con Textos Centrados */}
          <div className={`bg-white ${inline ? 'p-3 rounded-2xl space-y-2' : 'p-3.5 sm:p-4 rounded-2xl space-y-2.5'} border border-gray-200 shadow-xs`}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs sm:text-sm font-black text-gray-900 uppercase flex items-center gap-1.5">
                <span>🛠️</span>
                <span>PERSONALIZAR INGREDIENTES ({units.length > 1 ? `ÍTEM #${activeUnitIndex + 1}` : 'TOCA PARA QUITAR "SIN"'}):</span>
              </span>
              <span className="text-xs font-bold text-red-600 bg-red-50 px-2.5 py-0.5 rounded-lg border border-red-200">
                {currentUnit.removedIngredients.length > 0
                  ? `🚫 SIN: ${formatRemovedIngredients(currentUnit.removedIngredients).join(', ').toUpperCase()}`
                  : 'Lleva todos sus ingredientes'}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2">
              {/* Botón rápido para los 3 vegetales (Lechuga, Tomate, Cebolla) */}
              <button
                type="button"
                onClick={toggleAllVegetables}
                className={`p-2.5 rounded-xl text-center font-black text-xs sm:text-sm transition-all border flex items-center justify-center gap-1.5 cursor-pointer ${
                  isAllVegetablesRemoved
                    ? 'bg-red-600 text-white border-red-700 shadow-sm'
                    : 'bg-emerald-50 text-emerald-900 border-emerald-300 hover:bg-emerald-100'
                }`}
                title="Quitar o restaurar los 3 vegetales (Lechuga, Tomate y Cebolla) a la vez"
              >
                <span className="truncate">🥗 {isAllVegetablesRemoved ? 'SIN VEGETALES' : 'QUITAR VEGETALES'}</span>
                {isAllVegetablesRemoved && <IoCloseCircle className="text-white text-base shrink-0 ml-1" />}
              </button>

              {customizableBaseIngredients.map((ing) => {
                const isRemoved = currentUnit.removedIngredients.some(
                  (r) => r.toLowerCase().trim() === ing.toLowerCase().trim()
                );
                return (
                  <button
                    key={ing}
                    type="button"
                    onClick={() => toggleRemoveBase(ing)}
                    className={`p-2.5 rounded-xl text-center font-black text-xs sm:text-sm transition-all border flex items-center justify-center gap-1.5 cursor-pointer ${
                      isRemoved
                        ? 'bg-red-50 text-red-700 border-red-300 line-through'
                        : 'bg-stone-50 text-gray-800 border-gray-200 hover:border-red-300'
                    }`}
                  >
                    <span className="truncate">{isRemoved ? `SIN ${ing}` : ing}</span>
                    {isRemoved && <IoCloseCircle className="text-red-600 text-base shrink-0 ml-1" />}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* 5. NOTAS DE COCINA DE LA UNIDAD ACTIVA */}
        <section className={`bg-white ${inline ? 'p-3 rounded-2xl space-y-1.5' : 'p-4 rounded-2xl space-y-2'} border border-gray-200 shadow-xs`}>
          <label className="block text-xs sm:text-sm font-black uppercase text-gray-900 tracking-wider">
            {units.length > 1
              ? `Notas de preparación para Cocina (Ítem #${activeUnitIndex + 1}):`
              : 'Notas de preparación para Cocina:'}
          </label>
          <input
            type="text"
            value={currentUnit.notes}
            onChange={(e) => updateCurrentUnit((prev) => ({ ...prev, notes: e.target.value }))}
            placeholder="Ej: Salsa aparte, bien caliente..."
            className="w-full px-3.5 py-2 text-sm bg-stone-50 border border-gray-300 rounded-xl text-gray-900 font-bold focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 shadow-2xs"
          />
        </section>
      </main>

      {/* 6. BOTTOM FOOTER (CORTE COMPACTO Y CLARO) */}
      <footer className={`bg-white text-gray-900 ${inline ? 'px-4 py-2.5' : 'px-6 py-3.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]'} border-t-2 border-yellow-400 flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-lg`}>
        <div>
          <span className="text-xs font-black uppercase tracking-wider text-gray-500 block">
            Total a sumar ({units.length} {units.length > 1 ? 'ítems' : 'ítem'}):
          </span>
          <div className="flex items-baseline gap-2.5 flex-wrap">
            <span className={`${inline ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl'} font-black text-black`}>
              {Math.round(grandTotalPrice).toLocaleString('es-CO')} <span className="text-xs sm:text-sm font-bold text-gray-500">COP</span>
            </span>
            <span className="text-xs sm:text-sm font-bold text-gray-700">
              🇺🇸 ${grandTotalUSD.toFixed(2)} USD
            </span>
            <span className="text-xs sm:text-sm font-bold text-gray-700">
              🇻🇪 {grandTotalBs.toFixed(2)} Bs
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black text-gray-600 hover:bg-gray-100 hover:text-black transition-colors cursor-pointer"
          >
            CANCELAR
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-6 py-3 rounded-2xl bg-yellow-400 hover:bg-yellow-500 text-black font-black text-xs sm:text-sm border-2 border-yellow-500 flex items-center gap-2 shadow-md transition-all active:scale-[0.98] cursor-pointer"
          >
            <IoCheckmark className="text-xl" />
            <span>{initialEditItem ? `GUARDAR CAMBIOS (${units.length})` : `AGREGAR AL PEDIDO (${units.length})`}</span>
          </button>
        </div>
      </footer>
    </div>
  );

  if (inline) {
    return modalContent;
  }

  return createPortal(modalContent, document.body);
};
