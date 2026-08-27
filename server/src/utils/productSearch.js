/** Escape `%` and `_` for SQL LIKE patterns. */
function escapeLikePattern(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}

function compactAlphanumeric(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[\s\-_]+/g, '');
}

/**
 * Build a WHERE fragment for flexible product lookup:
 * - case-insensitive (lower + LIKE)
 * - each word/token must match name, SKU, or barcode (any order)
 * - also matches with spaces removed (e.g. "cocacola" → "Coca Cola")
 */
function buildProductSearchFilter(search, alias = 'p') {
  const trimmed = String(search || '').trim();
  if (!trimmed) {
    return { clause: '', params: [] };
  }

  const tokens = trimmed
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map(escapeLikePattern);

  const params = [];
  const tokenClauses = [];

  for (const token of tokens) {
    const pattern = `%${token}%`;
    tokenClauses.push(`(
      lower(${alias}.name) LIKE ? ESCAPE '\\' OR
      lower(COALESCE(${alias}.sku, '')) LIKE ? ESCAPE '\\' OR
      lower(COALESCE(${alias}.barcode, '')) LIKE ? ESCAPE '\\'
    )`);
    params.push(pattern, pattern, pattern);
  }

  const compact = compactAlphanumeric(trimmed);
  const compactEscaped = escapeLikePattern(compact);
  const compactPattern = `%${compactEscaped}%`;
  const compactClause = `(
    lower(replace(replace(replace(${alias}.name, ' ', ''), '-', ''), '_', '')) LIKE ? ESCAPE '\\' OR
    lower(COALESCE(${alias}.sku, '')) LIKE ? ESCAPE '\\' OR
    lower(COALESCE(${alias}.barcode, '')) LIKE ? ESCAPE '\\'
  )`;

  const clause =
    tokenClauses.length > 0
      ? ` AND ((${tokenClauses.join(' AND ')}) OR ${compactClause})`
      : ` AND ${compactClause}`;

  params.push(compactPattern, compactPattern, compactPattern);

  return { clause, params };
}

module.exports = {
  escapeLikePattern,
  compactAlphanumeric,
  buildProductSearchFilter,
};
