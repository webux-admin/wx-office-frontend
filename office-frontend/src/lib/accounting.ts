/**
 * The accounting module: where its screens live, what rights they run on, and the calls behind
 * them.
 *
 * <p>Its own building block rather than addresses typed into the screens, the same way
 * `dunning.ts` and `banking.ts` do it: the settings are read by the state screen today and by
 * the archive later, the chart of accounts by one screen and three dialogs, and a query key
 * written twice is a cache that goes stale in one of them.
 */
import { api } from './api'
import type {
  Account,
  AccountRequest,
  AccountType,
  ChartCopyRequest,
  ChartCopyResult,
  ChartTemplate,
  Page,
  PositionHint,
  SystemKey,
  TaxCodeCatalogue,
} from './types'

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

// --- der Kontenplan ------------------------------------------------------------------------

/**
 * Path of the chart of accounts within the application.
 *
 * <p>Under `/buchhaltung/` although its menu entry sits in the module settings: the chart is
 * read by everything that posts, and its address should not move when the group «Buchhaltung»
 * appears (ADR-0044).
 */
export const CHART_OF_ACCOUNTS_PATH = '/buchhaltung/kontenplan'

/** Address everything the accounting of one tenant is served under. */
function accountingUrl(tenantId: number): string {
  return `/api/tenants/${tenantId}/accounting`
}

/**
 * @param tenantId the tenant, for the right check and the tenant scope
 * @returns address of the shipped chart templates
 */
export function chartTemplatesUrl(tenantId: number): string {
  return `${accountingUrl(tenantId)}/chart-templates`
}

/**
 * @param tenantId the tenant
 * @returns cache key of the shipped chart templates
 */
export function chartTemplatesKey(tenantId: number): readonly unknown[] {
  return ['chart-templates', tenantId]
}

/**
 * The templates a chart of accounts can be copied from.
 *
 * <p>May answer one template or none, and both are states the screen renders. **Whoever reads
 * this names no template of their own**: which ones are shipped is decided by the migration
 * (backend ADR-0112).
 *
 * @param tenantId the tenant
 * @returns the templates, the one the dialog preselects first
 */
export function fetchChartTemplates(tenantId: number): Promise<ChartTemplate[]> {
  return api.get<ChartTemplate[]>(chartTemplatesUrl(tenantId))
}

/**
 * @param tenantId the tenant
 * @param query the filter and paging values, as a query string without the `?`
 * @returns address of the chart of accounts
 */
export function accountsUrl(tenantId: number, query = ''): string {
  return `${accountingUrl(tenantId)}/accounts${query === '' ? '' : `?${query}`}`
}

/**
 * @param tenantId the tenant
 * @param query the filter and paging values the page was asked for
 * @returns cache key of one page of the chart of accounts
 */
export function accountsKey(tenantId: number, query = ''): readonly unknown[] {
  return ['accounts', tenantId, query]
}

/**
 * One page of the chart of accounts. Answers while the module is off.
 *
 * @param tenantId the tenant
 * @param query the filter and paging values, as a query string without the `?`
 * @returns the matching page, by account number unless another order was asked for
 */
export function fetchAccounts(tenantId: number, query = ''): Promise<Page<Account>> {
  return api.get<Page<Account>>(accountsUrl(tenantId, query))
}

/**
 * @param tenantId the tenant
 * @param accountId the account
 * @returns address of one account
 */
export function accountUrl(tenantId: number, accountId: number): string {
  return `${accountingUrl(tenantId)}/accounts/${accountId}`
}

/**
 * Lays the chart out as a copy of a shipped template. Runs once.
 *
 * @param tenantId the tenant
 * @param request which template, and how the equity is broken down
 * @returns how many accounts were created, and the source note now stored on the settings
 */
export function copyChartFromTemplate(
  tenantId: number,
  request: ChartCopyRequest,
): Promise<ChartCopyResult> {
  return api.post<ChartCopyResult>(`${accountingUrl(tenantId)}/accounts/from-template`, request)
}

/**
 * Adds an account to the chart.
 *
 * @param tenantId the tenant
 * @param request what somebody typed
 * @returns the stored account
 */
export function createAccount(tenantId: number, request: AccountRequest): Promise<Account> {
  return api.post<Account>(accountsUrl(tenantId), request)
}

/**
 * Changes number, name, account type, position, note and `active` of one account.
 *
 * <p>**Never the system key.** It is not in the payload, so a save leaves the stored key
 * exactly where it is.
 *
 * @param tenantId the tenant
 * @param accountId the account
 * @param request what somebody typed
 * @returns the stored account
 */
export function updateAccount(
  tenantId: number,
  accountId: number,
  request: AccountRequest,
): Promise<Account> {
  return api.put<Account>(accountUrl(tenantId, accountId), request)
}

/**
 * Removes an account that was never used.
 *
 * <p>Answers 409 for an account that carries a system key and, from the first posting on, for
 * one an entry line points at. The sentence for both comes from the backend.
 *
 * @param tenantId the tenant
 * @param accountId the account
 */
export function deleteAccount(tenantId: number, accountId: number): Promise<void> {
  return api.delete<void>(accountUrl(tenantId, accountId))
}

/**
 * @param tenantId the tenant
 * @returns address of the system keys with their questions
 */
export function systemKeysUrl(tenantId: number): string {
  return `${accountingUrl(tenantId)}/accounts/system-keys`
}

/**
 * @param tenantId the tenant
 * @returns cache key of the system keys
 */
export function systemKeysKey(tenantId: number): readonly unknown[] {
  return ['accounting-system-keys', tenantId]
}

/**
 * All system keys with their question and the account that answers each.
 *
 * <p>Answers while the module is off. **The questions come from here**, so no second copy of
 * them lives in this frontend.
 *
 * @param tenantId the tenant
 * @returns the keys in the order the backend declares them
 */
export function fetchSystemKeys(tenantId: number): Promise<SystemKey[]> {
  return api.get<SystemKey[]>(systemKeysUrl(tenantId))
}

/**
 * Points a system key at an account. The only way a key ever moves.
 *
 * @param tenantId the tenant
 * @param key the constant name of the key, as `GET /accounts/system-keys` gave it
 * @param accountId the account that takes it over
 * @returns the new carrier
 */
export function assignSystemKey(
  tenantId: number,
  key: string,
  accountId: number,
): Promise<Account> {
  return api.put<Account>(`${accountingUrl(tenantId)}/accounts/system-key/${key}`, { accountId })
}

/**
 * @param tenantId the tenant
 * @param accountNumber the number as it stands in the field
 * @returns cache key of the position proposal for that number
 */
export function positionSuggestionKey(
  tenantId: number,
  accountNumber: string,
): readonly unknown[] {
  return ['accounting-position-suggestion', tenantId, accountNumber]
}

/**
 * What the backend proposes as the position for a number being typed.
 *
 * <p>Answers `null` where there is no proposal — the endpoint replies 204 then, and the field
 * stays empty and compulsory, which is better than a proposal that is wrong. Never `undefined`:
 * a query function that answers nothing at all is an error in TanStack Query.
 *
 * @param tenantId the tenant
 * @param accountNumber the number as it stands in the field
 * @returns the proposal, or null where the template holds no neighbour
 */
export async function fetchPositionSuggestion(
  tenantId: number,
  accountNumber: string,
): Promise<PositionHint | null> {
  const hint = await api.get<PositionHint | null>(
    `${accountingUrl(tenantId)}/accounts/position-suggestion`
      + `?accountNumber=${encodeURIComponent(accountNumber)}`,
  )
  return hint ?? null
}

/**
 * What each account type is called while the catalogue `account-type` has not answered.
 *
 * <p>The catalogue is the source of the wording — a tenant may rename the values, and they are
 * shipped in four languages. This map is the fallback and, more importantly, the **closed** set:
 * a type missing here would not compile, and the filter would silently offer five of six.
 */
export const ACCOUNT_TYPES: Record<AccountType, string> = {
  ASSET: 'Aktivum',
  LIABILITY: 'Passivum',
  EQUITY: 'Eigenkapital',
  REVENUE: 'Ertrag',
  EXPENSE: 'Aufwand',
  CLOSING: 'Abschluss',
}

/**
 * The order the filter and the account dialog offer the types in.
 *
 * <p>Balance sheet, then profit and loss statement, then the closing — the order of the report,
 * not the order of the catalogue. A tenant may reorder the catalogue, and that would put
 * «Abschluss» between «Aktivum» and «Passivum» for no gain.
 */
export const ACCOUNT_TYPE_ORDER: readonly AccountType[] = [
  'ASSET',
  'LIABILITY',
  'EQUITY',
  'REVENUE',
  'EXPENSE',
  'CLOSING',
]

/**
 * What one account type is called, with the tenant's own wording winning.
 *
 * <p>Not `labelForCode`: that one answers the raw code while the catalogue is on its way, and
 * «ASSET» in the account column reads as a fault of the software rather than as a moment of
 * waiting.
 *
 * @param entries the catalogue `account-type` as the API returned it, empty while loading
 * @param type the type an account carries
 * @returns the label of the tenant, the shipped German word while the catalogue is on its way
 */
export function accountTypeLabel(
  entries: readonly { code: string; name: string }[],
  type: AccountType,
): string {
  return entries.find((entry) => entry.code === type)?.name ?? ACCOUNT_TYPES[type]
}

/**
 * Which position codes an account of a given type may carry, by their prefix.
 *
 * <p>Word for word the rule of `AccountingRules.positionAllowedFor` and of the database check
 * `ck_accounting_account_position`. **In the browser it is a convenience, never a barrier**: the
 * two barriers stand in the backend, and `accountPosition.test.ts` holds all 234 pairs against
 * the same table `AccountingRulesTest` does, so the three cannot drift apart.
 *
 * <p>`ABSCHLUSS` is spelt out rather than given a prefix of its own: no other of the 39 codes
 * begins with it, so a prefix match and the equality the backend uses answer the same thing.
 */
export const POSITION_PREFIXES: Record<AccountType, readonly string[]> = {
  ASSET: ['UV_', 'AV_'],
  LIABILITY: ['KFK_', 'LFK_'],
  EQUITY: ['EK_'],
  REVENUE: ['ER_'],
  EXPENSE: ['ER_'],
  CLOSING: ['ABSCHLUSS'],
}

/**
 * The two positions that are computed from the others and therefore carry no account.
 *
 * <p>The result of the year appears in the profit and loss statement once, computed; an account
 * on it would print it twice. `ABSCHLUSS` carries account 9200 but is no reported position at
 * all.
 *
 * <p>**The database lets both through** — `ER_JAHRESERGEBNIS` begins with `ER_` and passes the
 * check. Refused they are by `AccountingManagement.saveAccount`; that they never appear in the
 * picker is the third of the three places, and the friendliest (backend ADR-0112).
 */
export const COMPUTED_POSITIONS: readonly string[] = ['ER_JAHRESERGEBNIS', 'ABSCHLUSS']

/**
 * The class of an account number: its first digit.
 *
 * <p>**Presentation and nothing else.** The chart draws a rule with the class heading wherever
 * the digit changes; no rule of this application ever reads it. The one selector for the
 * accounts of the profit and loss statement is `accountType`, because a self-built chart may
 * number as it likes (backend ADR-0112).
 *
 * @param accountNumber the number as the account carries it
 * @returns the class, or undefined for anything that does not begin with a digit
 */
export function accountClassOf(accountNumber: string): number | undefined {
  const first = (accountNumber ?? '').charAt(0)
  if (first < '0' || first > '9') return undefined
  return Number(first)
}

/**
 * What the rule above a class of accounts says.
 *
 * <p>Own wording, deliberately short: these are headings of a screen, not lines of a chart of
 * accounts. The source note in the footer covers the numbers and names that are quoted.
 */
export const ACCOUNT_CLASS_TITLES: Record<number, string> = {
  1: 'Aktiven',
  2: 'Passiven',
  3: 'Betriebsertrag',
  4: 'Material-, Waren- und Dienstleistungsaufwand',
  5: 'Personalaufwand',
  6: 'Übriger betrieblicher Aufwand',
  7: 'Betrieblicher Nebenerfolg',
  8: 'Ausserordentlicher, einmaliger oder periodenfremder Aufwand und Ertrag',
  9: 'Abschluss',
}

/**
 * The heading of one class, for the rule the chart draws.
 *
 * @param accountClass the first digit of the account number
 * @returns the heading, or a bare «Klasse 0» for a class this application has no word for
 */
export function accountClassTitle(accountClass: number): string {
  return ACCOUNT_CLASS_TITLES[accountClass] ?? `Klasse ${accountClass}`
}

// --- die Steuercodes -----------------------------------------------------------------------

/**
 * Path of the tax code screen within the application.
 *
 * <p>Under `/buchhaltung/` beside the chart of accounts although its menu entry sits in the
 * module settings: the codes are read by everything that posts, and their address should not
 * move when the group «Buchhaltung» appears (ADR-0044).
 */
export const TAX_CODES_PATH = '/buchhaltung/steuercodes'

/**
 * @param tenantId the tenant
 * @returns address of the tax codes of that tenant
 */
export function taxCodesUrl(tenantId: number): string {
  return `${accountingUrl(tenantId)}/tax-codes`
}

/**
 * @param tenantId the tenant
 * @returns cache key of the tax codes of that tenant
 */
export function taxCodesKey(tenantId: number): readonly unknown[] {
  return ['accounting-tax-codes', tenantId]
}

/**
 * The tax codes of one tenant, unpaged and in the one business order.
 *
 * <p>Answers while the module is off: which code posts on which account under which digit
 * belongs to the bookkeeping and is kept for ten years (OR Art. 958f).
 *
 * <p>**Where the list is empty, `emptyReason` says why.** The screen never works that out
 * itself — the VAT position of the tenant is read with a right this screen does not require
 * (backend ADR-0118).
 *
 * @param tenantId the tenant
 * @returns the catalogue, empty with a reason where the tenant has none
 */
export function fetchTaxCodes(tenantId: number): Promise<TaxCodeCatalogue> {
  return api.get<TaxCodeCatalogue>(taxCodesUrl(tenantId))
}
