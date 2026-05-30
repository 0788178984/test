import { businessTypeLabel, isClinicStore } from '../constants/businessTypes';

/** Header + receipt branding from the logged-in tenant (not the app product name). */
export function storeHeaderLabel(user) {
  if (!user) return 'Store';
  if (user.role === 'developer') return 'Developer';
  const code = user.business_code?.trim();
  const name = user.business_name?.trim();
  if (code) return code;
  if (name) return name;
  return isClinicStore(user) ? 'Clinic' : 'Store';
}

export function storeTypeBadge(user) {
  if (!user?.business_id) return null;
  return businessTypeLabel(user.business_type);
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
