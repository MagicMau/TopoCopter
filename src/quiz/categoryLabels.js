const DUTCH_CATEGORY_LABELS = Object.freeze({
  countries: 'land',
  capitals: 'hoofdstad',
  cities: 'stad',
  water: 'water',
  rivers: 'rivier',
  mountains: 'berg',
  lakes: 'meer',
  islands: 'eiland',
  regions: 'regio',
  oceans: 'oceaan',
  seas: 'zee',
  areas: 'gebied',
});

export function getDutchCategoryLabel(category, emptyFallback = '') {
  const normalizedCategory = String(category ?? '').trim().toLowerCase();
  return DUTCH_CATEGORY_LABELS[normalizedCategory] ?? (normalizedCategory || emptyFallback);
}

