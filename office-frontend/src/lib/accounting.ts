/**
 * The accounting module: where its screen lives, what rights it runs on, and the call behind
 * it.
 *
 * <p>Its own building block rather than addresses typed into the screen, the same way
 * `dunning.ts` and `banking.ts` do it: the settings are read by the state screen today and by
 * the archive later, and a query key written twice is a cache that goes stale in one of them.
 */

/** Name of the backend `LicensedModule` value. */
export const ACCOUNTING_MODULE = 'ACCOUNTING'

/**
 * Path of the state screen within the application.
 *
 * <p>The menu entry is called «Zustand» today and «Einstellungen» from the fiscal year on. The
 * address stays as it is: a label is cheap to change, an address people have learnt is not.
 */
export const ACCOUNTING_SETTINGS_PATH = '/buchhaltung/einstellungen'

/**
 * The five rights of the module.
 *
 * <p>`post` and `close` are deliberately not `write`: posting is the step after which nothing
 * is correctable any more, and closing a year is an act at the fiscal year (backend ADR-0110).
 *
 * <p>The lock date runs on `configure` and not on `close`: it is a row in the settings, not an
 * act at a fiscal year (backend ADR-0119).
 */
export const ACCOUNTING_RIGHTS = {
  read: 'ACCOUNTING_READ',
  write: 'ACCOUNTING_WRITE',
  post: 'ACCOUNTING_POST',
  configure: 'ACCOUNTING_CONFIGURE',
  close: 'ACCOUNTING_CLOSE',
} as const

/**
 * @param tenantId the tenant
 * @returns address of the accounting settings of that tenant
 */
export function accountingSettingsUrl(tenantId: number): string {
  return `/api/tenants/${tenantId}/accounting/settings`
}

/**
 * @param tenantId the tenant
 * @returns cache key of the accounting settings of that tenant
 */
export function accountingSettingsKey(tenantId: number): readonly unknown[] {
  return ['accounting-settings', tenantId]
}

/**
 * Whether any role of this tenant carries one of the five accounting rights.
 *
 * <p>A pure function over the role list, so the screen does not have to know the codes. The
 * roles are read from `user`, because that is the module the answer belongs to — the
 * accounting endpoints carry no such field on purpose (backend ADR-0110).
 *
 * @param roles the roles of the tenant, absent while they are still being read
 * @returns true as soon as one role holds one of the five rights
 */
export function someRoleHoldsAccounting(
  roles: readonly { permissions: readonly string[] }[] | undefined,
): boolean {
  const rights = new Set<string>(Object.values(ACCOUNTING_RIGHTS))
  return (roles ?? []).some((role) => role.permissions.some((code) => rights.has(code)))
}
