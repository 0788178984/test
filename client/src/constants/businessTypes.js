export const BUSINESS_TYPES = {
  SUPERMARKET: 'supermarket',
  CLINIC: 'clinic',
};

export function businessTypeLabel(type) {
  return type === BUSINESS_TYPES.CLINIC ? 'Clinic / drug shop' : 'Supermarket';
}

export function isClinicStore(user) {
  return user?.business_type === BUSINESS_TYPES.CLINIC;
}
