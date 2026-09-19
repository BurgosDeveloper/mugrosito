import React from 'react';
import { Product, Ingredient } from '../../data/mockData';
import { IoSearch, IoClose, IoAdd } from 'react-icons/io5';
import { isDrinkProduct, isPotatoProduct, isCustomizableProduct } from '../../utils/productClassifier';

interface ProductTextCatalogProps {
  products: Product[];
  onSelectProduct: (product: Product) => void;
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  exchangeRates?: { COP: number; Bs: number };
  salsas?: Ingredient[];
  onSelectSalsa?: (salsa: Ingredient) => void;
}

export const ProductTextCatalog: React.FC<ProductTextCatalogProps> = ({
  products,
  onSelectProduct,
  selectedCategory,
  onSelectCategory,
  searchQuery,
  onSearchChange,
  exchangeRates = { COP: 3100, Bs: 3.2 },
  salsas = [],
  onSelectSalsa,
}) => {
  // Categorías fijas y claras: 'Todas', 'Comidas', 'Bebidas', 'Salsas'
  const filterCategories = ['Todas', 'Comidas', 'Bebidas', 'Salsas'];

  // Función de coincidencia de búsqueda
  const matchesSearch = (product: Product): boolean => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      product.name.toLowerCase().includes(q) ||
      (product.description && product.description.toLowerCase().includes(q)) ||
      (product.baseIngredients && product.baseIngredients.some((ing) => ing.toLowerCase().includes(q)))
    );
  };

  const matchesSearchSalsa = (salsa: Ingredient): boolean => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return salsa.name.toLowerCase().includes(q);
  };

  // Separar productos en Comidas y Bebidas, filtrando por búsqueda y ordenando alfabéticamente (A-Z)
  const foodProducts = products
    .filter((p) => !isDrinkProduct(p))
    .filter(matchesSearch)
    .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));

  const drinkProducts = products
    .filter((p) => isDrinkProduct(p))
    .filter(matchesSearch)
    .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));

  const salsaProducts = (salsas || [])
    .filter((s) => s.ingredientType === 'salsa' || s.category === 'Salsas')
    .filter((s) => s.available !== false)
    .filter(matchesSearchSalsa)
    .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));

  const showFoods = selectedCategory === 'Todas' || selectedCategory === 'Comidas';
  const showDrinks = selectedCategory === 'Todas' || selectedCategory === 'Bebidas';
  const showSalsas = selectedCategory === 'Todas' || selectedCategory === 'Salsas';

  const totalVisible =
    (showFoods ? foodProducts.length : 0) +
    (showDrinks ? drinkProducts.length : 0) +
    (showSalsas ? salsaProducts.length : 0);

  return (
    <div className="flex flex-col h-full space-y-2">
      {/* Barra Superior: Buscador y Chips de Filtrado */}
      <div className="flex flex-wrap items-center gap-2.5 pb-2 border-b border-gray-200 shrink-0">
        {/* Input de Búsqueda */}
        <div className="relative flex-1 min-w-[170px]">
          <IoSearch className="absolute left-3 top-3 text-gray-400 text-sm" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar hot dog, papas, bebida o ingrediente..."
            className="w-full pl-9 pr-9 py-2 rounded-xl bg-gray-50 border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 font-bold"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-2.5 text-gray-400 hover:text-black cursor-pointer p-0.5"
            >
              <IoClose className="text-base" />
            </button>
          )}
        </div>

        {/* Chips de Categorías */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 scrollbar-none">
          {filterCategories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => onSelectCategory(cat)}
              className={`px-3.5 py-2 rounded-xl text-sm sm:text-base font-black whitespace-nowrap transition-all cursor-pointer text-center ${
                selectedCategory === cat
                  ? 'bg-yellow-400 text-black border-2 border-yellow-500 shadow-xs scale-[1.02]'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-800 border border-transparent'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* LISTA CON AMBAS SECCIONES SEPARADAS A SIMPLE VISTA */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-3.5 scrollbar-thin">
        {totalVisible === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center text-gray-400 text-sm font-bold">
            <p>No se encontraron productos para "{searchQuery}"</p>
          </div>
        ) : (
          <>
            {/* SECCIÓN 1: COMIDAS (Hot Dogs, Platos, Acompañantes/Papas) - Color Rojo Crema Suave */}
            {showFoods && foodProducts.length > 0 && (
              <div>
                {/* Encabezado de Sección Comidas */}
                <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-red-100/70 border border-red-200 text-red-950 mb-2 select-none">
                  <div className="flex items-center gap-2 font-black text-sm sm:text-base tracking-wide">
                    <span className="text-lg">🌭</span>
                    <span className="uppercase">Comidas y Hot Dogs</span>
                    <span className="text-xs font-bold text-red-800/80 normal-case hidden sm:inline">
                      (Hot Dogs personalizables y raciones)
                    </span>
                  </div>
                  <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-red-200/90 text-red-950">
                    {foodProducts.length} {foodProducts.length === 1 ? 'ítem' : 'ítems'}
                  </span>
                </div>

                {/* Grilla de Tarjetas de Comidas con Textos Centrados */}
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
                  {foodProducts.map((product) => {
                    const priceCOP = product.price;
                    const equivUSD = exchangeRates.COP > 0 ? (priceCOP / exchangeRates.COP).toFixed(2) : '0.00';
                    const isCustom = isCustomizableProduct(product);
                    const isPotato = isPotatoProduct(product);

                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => onSelectProduct(product)}
                        className="p-3 rounded-2xl bg-[#fff8f8] hover:bg-red-50 border-2 border-red-200/90 hover:border-red-400 text-center transition-all shadow-xs hover:shadow-md flex flex-col items-center justify-between gap-1.5 group active:scale-[0.98] cursor-pointer min-h-[108px]"
                        title={
                          isPotato
                            ? `${product.name} - ${Math.round(priceCOP).toLocaleString('es-CO')} COP (~ $${equivUSD} USD)`
                            : `${product.name} - ${Math.round(priceCOP).toLocaleString('es-CO')} COP (~ $${equivUSD} USD)`
                        }
                      >
                        <div className="flex flex-col items-center justify-center text-center w-full min-w-0">
                          <span className="font-black text-sm sm:text-base text-red-950 group-hover:text-red-900 leading-tight text-center line-clamp-2">
                            {product.name}
                          </span>
                          <span className="text-xs font-bold text-red-700/80 leading-none mt-1 text-center">
                            {isPotato ? 'Directo (+1)' : isCustom ? 'Personalizable' : 'Comida'}
                          </span>
                        </div>
                        <span className="font-black text-xs sm:text-sm text-red-950 bg-red-100/90 group-hover:bg-red-200 px-2.5 py-1 rounded-xl border border-red-300 shrink-0 shadow-2xs text-center">
                          {Math.round(priceCOP).toLocaleString('es-CO')} COP
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SECCIÓN 2: BEBIDAS (Refrescos, Aguas, Cervezas, Jugos) - Color Azul Crema Suave */}
            {showDrinks && drinkProducts.length > 0 && (
              <div>
                {/* Encabezado de Sección Bebidas */}
                <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-sky-100/70 border border-sky-200 text-sky-950 mb-2 select-none">
                  <div className="flex items-center gap-2 font-black text-sm sm:text-base tracking-wide">
                    <span className="text-lg">🥤</span>
                    <span className="uppercase">Bebidas</span>
                    <span className="text-xs font-bold text-sky-800/80 normal-case hidden sm:inline">
                      (Refrescos, aguas, tés y cervezas)
                    </span>
                  </div>
                  <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-sky-200/90 text-sky-950">
                    {drinkProducts.length} {drinkProducts.length === 1 ? 'ítem' : 'ítems'}
                  </span>
                </div>

                {/* Grilla de Tarjetas de Bebidas con Textos Centrados */}
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
                  {drinkProducts.map((product) => {
                    const priceCOP = product.price;
                    const equivUSD = exchangeRates.COP > 0 ? (priceCOP / exchangeRates.COP).toFixed(2) : '0.00';

                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => onSelectProduct(product)}
                        className="p-3 rounded-2xl bg-[#f0f7ff] hover:bg-sky-50 border-2 border-sky-200/90 hover:border-sky-400 text-center transition-all shadow-xs hover:shadow-md flex flex-col items-center justify-between gap-1.5 group active:scale-[0.98] cursor-pointer min-h-[108px]"
                        title={`${product.name} - ${Math.round(priceCOP).toLocaleString('es-CO')} COP (~ $${equivUSD} USD)`}
                      >
                        <div className="flex flex-col items-center justify-center text-center w-full min-w-0">
                          <span className="font-black text-sm sm:text-base text-sky-950 group-hover:text-sky-900 leading-tight text-center line-clamp-2">
                            {product.name}
                          </span>
                          <span className="text-xs font-bold text-sky-700/80 leading-none mt-1 flex items-center justify-center gap-1 text-center">
                            <IoAdd className="text-xs" />
                            <span>Directo (+1)</span>
                          </span>
                        </div>
                        <span className="font-black text-xs sm:text-sm text-sky-950 bg-sky-100/90 group-hover:bg-sky-200 px-2.5 py-1 rounded-xl border border-sky-300 shrink-0 shadow-2xs text-center">
                          {Math.round(priceCOP).toLocaleString('es-CO')} COP
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SECCIÓN 3: SALSAS (Porciones para Cocina / Directo +1 / Sin Costo Contable) - Color Ámbar / Miel Suave */}
            {showSalsas && salsaProducts.length > 0 && (
              <div>
                {/* Encabezado de Sección Salsas */}
                <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-amber-100/80 border border-amber-300 text-amber-950 mb-2 select-none">
                  <div className="flex items-center gap-2 font-black text-sm sm:text-base tracking-wide">
                    <span className="text-lg">🥣</span>
                    <span className="uppercase">Salsas</span>
                    <span className="text-xs font-bold text-amber-800/80 normal-case hidden sm:inline">
                      (Porciones para cocina - Sin costo contable)
                    </span>
                  </div>
                  <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-amber-200/90 text-amber-950">
                    {salsaProducts.length} {salsaProducts.length === 1 ? 'ítem' : 'ítems'}
                  </span>
                </div>

                {/* Grilla de Tarjetas de Salsas con Textos Centrados */}
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
                  {salsaProducts.map((salsa) => (
                    <button
                      key={salsa.id}
                      type="button"
                      onClick={() => onSelectSalsa && onSelectSalsa(salsa)}
                      className="p-3 rounded-2xl bg-[#fffbeb] hover:bg-amber-50 border-2 border-amber-200/90 hover:border-amber-400 text-center transition-all shadow-xs hover:shadow-md flex flex-col items-center justify-between gap-1.5 group active:scale-[0.98] cursor-pointer min-h-[108px]"
                      title={`${salsa.name} - Clic para agregar directo a la comanda (+1)`}
                    >
                      <div className="flex flex-col items-center justify-center text-center w-full min-w-0">
                        <span className="font-black text-sm sm:text-base text-amber-950 group-hover:text-amber-900 leading-tight text-center line-clamp-2">
                          {salsa.name}
                        </span>
                        <span className="text-xs font-bold text-amber-700/80 leading-none mt-1 flex items-center justify-center gap-1 text-center">
                          <IoAdd className="text-xs" />
                          <span>Directo (+1)</span>
                        </span>
                      </div>
                      <span className="font-black text-xs sm:text-sm text-amber-950 bg-amber-200/90 group-hover:bg-amber-300 px-3 py-1 rounded-xl border border-amber-300 shrink-0 shadow-2xs text-center uppercase tracking-wide">
                        0 COP (Gratis)
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

