/** Header + receipt branding from the logged-in tenant (not the app product name). */
export function storeHeaderLabel(user) {
  if (!user) return 'Store';
  if (user.role === 'developer') return 'Developer';
  return user.business_code?.trim() || user.business_name?.trim() || 'Store';
}

export function storeReceiptBranding(user) {
  if (!user || user.role === 'developer') {
    return { name: 'Store', code: null };
  }
  return {
    name: user.business_name?.trim() || user.business_code?.trim() || 'Store',
    code: user.business_code?.trim() || null,
  };
}
