import { Product } from '../data/mockData';

/**
 * Determina si un producto es una bebida (refrescos, aguas, cervezas, jugos, etc.)
 */
export function isDrinkProduct(product: Product | null | undefined): boolean {
  if (!product) return false;
  const cat = (product.category || '').toLowerCase().trim();
  if (cat.includes('bebida') || cat.includes('drink')) return true;
  if (product.drinkType) return true;
  const name = (product.name || '').toLowerCase().trim();
  return (
    name.includes('refresco') ||
    name.includes('agua') ||
    name.includes('cerveza') ||
    name.includes('nestea') ||
    name.includes('granizado') ||
    name.includes('jugo') ||
    name.includes('soda')
  );
}

/**
 * Determina si un producto corresponde a papas (fritas, ración de papas, etc.)
 * Por regla de negocio: las papas NO son personalizables; funcionan como las bebidas:
 * 1 clic las agrega y múltiples clics van sumando la cantidad sin abrir modal.
 */
export function isPotatoProduct(product: Product | null | undefined): boolean {
  if (!product) return false;
  const name = (product.name || '').toLowerCase().trim();
  const id = (product.id || '').toLowerCase().trim();
  return name.includes('papa') || id.includes('papa');
}

/**
 * Determina si un producto es comida personalizable (hot dogs, hamburguesas, platos especiales)
 * que debe abrir el configurador (BurgerBuilderModal) para elegir carnes, salsas, etc.
 */
export function isCustomizableProduct(product: Product | null | undefined): boolean {
  if (!product) return false;
  // Bebidas nunca son personalizables en burger builder
  if (isDrinkProduct(product)) return false;
  // Papas NO son personalizables por regla explícita del negocio
  if (isPotatoProduct(product)) return false;

  const cat = (product.category || '').toLowerCase().trim();
  const name = (product.name || '').toLowerCase().trim();

  // Si es hot dog, hamburguesa o plato
  if (cat.includes('hamburguesa') || cat.includes('hot dog') || cat.includes('perro') || cat.includes('mugrosito') || cat.includes('plato')) {
    return true;
  }

  // Si tiene ingredientes base para personalizar
  if (Array.isArray(product.baseIngredients) && product.baseIngredients.length > 0) {
    return true;
  }

  return /burger|hamburguesa|smash|tasty|mixtura|hot\s*dog|perro|mugrosito/i.test(name);
}

/**
 * Clasificación principal del catálogo para separar en secciones a simple vista
 */
export function getProductSection(product: Product): 'comidas' | 'bebidas' {
  return isDrinkProduct(product) ? 'bebidas' : 'comidas';
}

/**
 * Determina si un producto, ítem o ingrediente corresponde a salsa
 */
export function isSalsaItem(item: any): boolean {
  if (!item) return false;
  const cat = String(item.category || item.ingredientType || '').toLowerCase().trim();
  const name = String(item.productName || item.name || '').toLowerCase().trim();
  return (
    cat === 'salsas' ||
    cat === 'salsa' ||
    name.startsWith('salsa ') ||
    name.includes('salsa de') ||
    name.includes('salsa tártara') ||
    name.includes('salsa tartara') ||
    name.includes('salsa bbq')
  );
}

