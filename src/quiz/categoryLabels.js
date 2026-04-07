const DUTCH_CATEGORY_DESCRIPTORS = Object.freeze({
  countries: Object.freeze({ label: 'land', article: 'dit' }),
  capitals: Object.freeze({ label: 'hoofdstad', article: 'deze' }),
  cities: Object.freeze({ label: 'stad', article: 'deze' }),
  water: Object.freeze({ label: 'water', article: 'dit' }),
  rivers: Object.freeze({ label: 'rivier', article: 'deze' }),
  mountains: Object.freeze({ label: 'berg', article: 'deze' }),
  lakes: Object.freeze({ label: 'meer', article: 'dit' }),
  islands: Object.freeze({ label: 'eiland', article: 'dit' }),
  regions: Object.freeze({ label: 'regio', article: 'deze' }),
  oceans: Object.freeze({ label: 'oceaan', article: 'deze' }),
  seas: Object.freeze({ label: 'zee', article: 'deze' }),
  areas: Object.freeze({ label: 'gebied', article: 'dit' }),
});

function normalizeCategory(category) {
  const normalizedCategory = String(category ?? '').trim().toLowerCase();
  return normalizedCategory;
}

export function getDutchCategoryLabel(category, emptyFallback = '') {
  const normalizedCategory = normalizeCategory(category);
  return DUTCH_CATEGORY_DESCRIPTORS[normalizedCategory]?.label ??
    (normalizedCategory || emptyFallback);
}

export function getDutchCategoryPromptDescriptor(category, emptyFallback = '') {
  const normalizedCategory = normalizeCategory(category);
  const descriptor = DUTCH_CATEGORY_DESCRIPTORS[normalizedCategory];

  if (descriptor) {
    return descriptor;
  }

  return {
    label: normalizedCategory || emptyFallback,
    article: 'dit',
  };
}

