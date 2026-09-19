export function normalizeProteinName(name: string = ''): string {
  const n = String(name || '').trim().toLowerCase();
  if (n.includes('salchicha') || n.includes('perro') || n.includes('hot dog')) return 'salchicha';
  if (n.includes('mechada') || n.includes('street')) return 'carne mechada';
  if (n.includes('smash')) return 'smash';
  if (n.includes('chuleta') || n.includes('pork') || n.includes('cerdo')) return 'chuleta de cerdo ahumada';
  if (n.includes('plancha') || n.includes('grill') || n.includes('pechuga')) return 'pechuga de pollo a la plancha';
  if (n.includes('crispy') || (n.includes('pollo') && !n.includes('plancha'))) return 'pollo crispy';
  if (n.includes('novillo') || n.includes('carne') || n.includes('res')) return 'carne de novillo';
  return n;
}

export function getCleanItemNote(rawNotes?: string | null): string {
  if (!rawNotes || typeof rawNotes !== 'string') return '';
  const cleaned = rawNotes
    .replace(/\[#\d+\]/g, '')
    .replace(/^[*•-]\s*/g, '')
    .replace(/^(nota|notas):?\s*/gi, '')
    .trim();
  const lower = cleaned.toLowerCase();
  if (
    !cleaned ||
    lower === 'null' ||
    lower === 'undefined' ||
    lower === 'sin notas' ||
    lower === 'sin nota' ||
    lower === 'nota' ||
    lower === 'notas' ||
    lower === 'ninguna' ||
    lower === '-' ||
    lower === '.'
  ) {
    return '';
  }
  return cleaned;
}

export function getProteinIcon(name: string = ''): string {
  const n = String(name || '').toLowerCase().trim();
  if (n.includes('salchicha') || n.includes('perro') || n.includes('hot dog')) return '🌭';
  if (n.includes('pollo') || n.includes('crispy')) return '🍗';
  if (n.includes('plancha') || n.includes('pechuga') || n.includes('grill')) return '🍳';
  if (n.includes('chuleta') || n.includes('pork') || n.includes('cerdo')) return '🥓';
  if (n.includes('mechada') || n.includes('street')) return '🍲';
  if (n.includes('smash')) return '🥩';
  if (n.includes('novillo') || n.includes('carne') || n.includes('res') || n.includes('bife') || n.includes('angus')) return '🥩';
  return '🥩';
}

export function areProteinsDefault(burgerName: string, proteins?: string[], defaultProteins?: string[]): boolean {
  if (!proteins || !Array.isArray(proteins) || proteins.length === 0) return true;
  const nameLower = String(burgerName || '').toLowerCase().trim();
  if (nameLower.includes('papas') || nameLower.includes('nugget')) return true;

  // Si el producto tiene defaultProteins configurados en la base de datos, validar contra ellos
  if (defaultProteins && Array.isArray(defaultProteins) && defaultProteins.length > 0) {
    const pSorted = [...proteins].map((p) => p.trim().toUpperCase()).sort();
    const dSorted = [...defaultProteins].map((d) => d.trim().toUpperCase()).sort();
    if (pSorted.length === dSorted.length && pSorted.every((val, idx) => val === dSorted[idx])) {
      return true;
    }
    const pNorm = [...proteins].map(normalizeProteinName).sort();
    const dNorm = [...defaultProteins].map(normalizeProteinName).sort();
    if (pNorm.length === dNorm.length && pNorm.every((val, idx) => val === dNorm[idx])) {
      return true;
    }
    return false;
  }

  const pSorted = [...proteins].map(normalizeProteinName).sort();

  // 1. Super Smash o Tasty: ambas o única proteína son smash
  if (nameLower.includes('super smash') || nameLower.includes('tasty') || nameLower.includes('smash')) {
    return pSorted.length > 0 && pSorted.every((p) => p === 'smash');
  }

  // 2. 3.0 / Triple: 3 proteínas (carne novillo + pollo crispy + chuleta ahumada)
  if (nameLower.includes('3.0') || nameLower.includes('triple')) {
    const expected = ['carne de novillo', 'chuleta de cerdo ahumada', 'pollo crispy'];
    return pSorted.length === 3 && pSorted.every((p, i) => p === expected[i]);
  }

  // 3. Mixtura: 2 proteínas (carne novillo + pollo crispy)
  if (nameLower.includes('mixtura')) {
    const expected = ['carne de novillo', 'pollo crispy'];
    return pSorted.length === 2 && pSorted.every((p, i) => p === expected[i]);
  }

  // 4. House: 2 proteínas (pollo crispy + chuleta ahumada)
  if (nameLower.includes('house')) {
    const expected = ['chuleta de cerdo ahumada', 'pollo crispy'];
    return pSorted.length === 2 && pSorted.every((p, i) => p === expected[i]);
  }

  // 5. Doble (2 carnes de novillo)
  if (nameLower.includes('doble')) {
    return pSorted.length === 2 && pSorted.every((p) => p === 'carne de novillo');
  }

  // 6. Productos individuales de 1 proteína
  if (nameLower.includes('mugrosito') || nameLower.includes('perro') || nameLower.includes('hot dog')) {
    return pSorted.length === 1 && pSorted[0] === 'salchicha';
  }
  if (nameLower.includes('mr pork') || nameLower.includes('pork')) {
    return pSorted.length === 1 && pSorted[0] === 'chuleta de cerdo ahumada';
  }
  if (nameLower.includes('street')) {
    return pSorted.length === 1 && pSorted[0] === 'carne mechada';
  }
  if (nameLower.includes('chicken grill') || nameLower.includes('grill')) {
    return pSorted.length === 1 && pSorted[0] === 'pechuga de pollo a la plancha';
  }
  if (nameLower.includes('crispy') || nameLower.includes('crispys')) {
    return pSorted.length === 1 && pSorted[0] === 'pollo crispy';
  }
  if (nameLower.includes('bistro')) {
    return pSorted.length === 1 && pSorted[0] === 'carne de novillo';
  }

  // Default general: 1 proteína (salchicha o carne)
  return pSorted.length === 1 && (pSorted[0] === 'salchicha' || pSorted[0] === 'carne de novillo');
}

export function formatRemovedIngredients(removed?: string[]): string[] {
  if (!removed || !Array.isArray(removed) || removed.length === 0) return [];
  const hasLechuga = removed.some((r) => /lechuga/i.test(r));
  const hasTomate = removed.some((r) => /tomate/i.test(r));
  const hasCebolla = removed.some((r) => /cebolla/i.test(r));

  if (hasLechuga && hasTomate && hasCebolla) {
    const others = removed.filter((r) => !/lechuga|tomate|cebolla/i.test(r));
    return ['Vegetales', ...others];
  }
  return removed;
}

