import { cartAuditAPI } from '../api/client';

export function logCartAction(payload) {
  cartAuditAPI.log(payload).catch(() => {});
}
