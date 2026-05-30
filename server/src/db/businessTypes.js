/** Store kinds: supermarket (default) or clinic / drug shop. */
const BUSINESS_TYPES = Object.freeze({
  SUPERMARKET: 'supermarket',
  CLINIC: 'clinic',
});

const SUPERMARKET_CATEGORIES = Object.freeze([
  'Food',
  'Beverages',
  'Bakery',
  'Dairy',
  'Cleaning',
  'Electronics',
  'Clothing',
  'Other',
]);

const CLINIC_CATEGORIES = Object.freeze([
  'Tablets',
  'Capsules',
  'Syrups',
  'Cream',
  'Injections',
  'Other',
]);

function normalizeBusinessType(raw) {
  const t = raw !== undefined && raw !== null ? String(raw).trim().toLowerCase() : '';
  if (t === BUSINESS_TYPES.CLINIC || t === 'drugshop' || t === 'drug_shop' || t === 'pharmacy') {
    return BUSINESS_TYPES.CLINIC;
  }
  return BUSINESS_TYPES.SUPERMARKET;
}

function getProductCategories(businessType) {
  return normalizeBusinessType(businessType) === BUSINESS_TYPES.CLINIC
    ? [...CLINIC_CATEGORIES]
    : [...SUPERMARKET_CATEGORIES];
}

function normalizeProductCategory(category, businessType) {
  if (category === undefined || category === null || String(category).trim() === '') {
    return null;
  }
  const value = String(category).trim();
  const allowed = getProductCategories(businessType);
  const exact = allowed.find((c) => c === value);
  if (exact) return exact;
  const insensitive = allowed.find((c) => c.toLowerCase() === value.toLowerCase());
  if (insensitive) return insensitive;
  if (value.toLowerCase() === 'others' || value.toLowerCase() === 'other') {
    return 'Other';
  }
  return null;
}

function businessTypeLabel(businessType) {
  return normalizeBusinessType(businessType) === BUSINESS_TYPES.CLINIC
    ? 'Clinic / drug shop'
    : 'Supermarket';
}

module.exports = {
  BUSINESS_TYPES,
  SUPERMARKET_CATEGORIES,
  CLINIC_CATEGORIES,
  normalizeBusinessType,
  getProductCategories,
  normalizeProductCategory,
  businessTypeLabel,
};
