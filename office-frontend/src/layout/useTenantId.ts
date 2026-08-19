import { useAuth } from '../auth/useAuth'

/**
 * The tenant this session works in.
 *
 * <p>Almost every screen needs it, because nearly every path of the API starts with
 * `/api/tenants/{tenantId}`. A superuser belongs to no tenant and gets `null` until they pick
 * one in the sidebar.
 *
 * @returns the active tenant, or `null` while none is chosen
 */
export function useTenantId(): number | null {
  const { user } = useAuth()
  return user?.activeTenantId ?? null
}
