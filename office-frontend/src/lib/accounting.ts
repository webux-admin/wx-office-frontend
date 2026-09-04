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
  BoundarySource,
  ChartCopyRequest,
  ChartCopyResult,
  ChartTemplate,
  FiscalYear,
  FiscalYearList,
  FiscalYearPreview,
  FiscalYearRequest,
  FiscalYearStatus,
  Page,
  PositionHint,
  SystemKey,
  TaxCodeCatalogue,
} from './types'

/** Name of the backend `LicensedModule` value. */
export const ACCOUNTING_MODULE = 'ACCOUNTING'

/**
 * Path of the settings screen within the application.
 *
 * <p>Its menu entry was called «Zustand» until the fiscal year gave it something to set; the
 * address never moved. A label is cheap to change, an address people have learnt is not.
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

// --- die Geschaeftsjahre -------------------------------------------------------------------

/**
 * Path of the fiscal year screen within the application.
 *
 * <p>Under `/buchhaltung/` beside the chart of accounts and the tax codes although its menu
 * entry sits in the module settings: the fiscal year is read by everything that posts, and its
 * address should not move when the group «Buchhaltung» appears (ADR-0044).
 */
export const FISCAL_YEARS_PATH = '/buchhaltung/geschaeftsjahre'

/**
 * The code of the number range a fiscal year brings with it.
 *
 * <p>Reserved: the backend refuses it on the ordinary number range endpoint, because the range
 * is laid out and removed together with the year it counts for. The number range screen leaves
 * it out of its table and out of its picker for the same reason — a range that cannot be
 * changed does not belong in a mask that invites changing it (backend ADR-0113).
 */
export const JOURNAL_NUMBER_RANGE_CODE = 'JOURNAL'

/**
 * What a fiscal year is called in each of its three states.
 *
 * <p>A closed set: a state missing here would not compile. No catalogue behind it — unlike the
 * account types these are not renamable, because the closing writes what `CLOSED` means.
 */
export const FISCAL_YEAR_STATUS: Record<FiscalYearStatus, string> = {
  OPEN: 'Offen',
  LOCKED: 'Gesperrt',
  CLOSED: 'Abgeschlossen',
}

/**
 * What holds the one posting boundary, in words.
 *
 * <p>Shown beside the sentence the backend sends, as the short name of the bolt. `NONE` reads
 * as a statement rather than as a blank, because the footer keeps its row either way.
 */
export const BOUNDARY_SOURCES: Record<BoundarySource, string> = {
  NONE: 'Nichts gesperrt',
  FISCAL_YEAR: 'Geschäftsjahr',
  LOCK_DATE: 'Sperrdatum der Buchhaltung',
  VAT_PERIOD: 'MWST-Abrechnung',
}

/**
 * @param tenantId the tenant
 * @returns address of the fiscal years of that tenant
 */
export function fiscalYearsUrl(tenantId: number): string {
  return `${accountingUrl(tenantId)}/fiscal-years`
}

/**
 * @param tenantId the tenant
 * @returns cache key of the fiscal years of that tenant
 */
export function fiscalYearsKey(tenantId: number): readonly unknown[] {
  return ['accounting-fiscal-years', tenantId]
}

/**
 * @param tenantId the tenant
 * @param fiscalYearId the year
 * @returns address of one fiscal year
 */
export function fiscalYearUrl(tenantId: number, fiscalYearId: number): string {
  return `${fiscalYearsUrl(tenantId)}/${fiscalYearId}`
}

/**
 * @param tenantId the tenant
 * @param fiscalYearId the year
 * @returns address the state of one fiscal year is switched at
 */
export function fiscalYearStatusUrl(tenantId: number, fiscalYearId: number): string {
  return `${fiscalYearUrl(tenantId, fiscalYearId)}/status`
}

/**
 * Address of the calculator behind the create dialog.
 *
 * <p>`label` and `numberYear` are what somebody has typed over the proposal. Sent, the backend
 * judges <b>those</b> instead of the two values it reads off the dates — which is what lets the
 * second period of a split year be laid out at all: its dates suggest a series that is already
 * taken, and only the typed one is free.
 *
 * @param tenantId the tenant
 * @param start the first day as it stands in the field
 * @param end the last day as it stands in the field
 * @param label the name somebody typed, left out while nobody has
 * @param numberYear the series somebody typed, left out while it is not a year yet
 * @returns address of the calculator behind the create dialog
 */
export function fiscalYearPreviewUrl(
  tenantId: number,
  start: string,
  end: string,
  label?: string,
  numberYear?: number,
): string {
  const overrides =
    (label === undefined || label === '' ? '' : `&label=${encodeURIComponent(label)}`)
    + (numberYear === undefined ? '' : `&numberYear=${numberYear}`)
  return `${fiscalYearsUrl(tenantId)}/preview`
    + `?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}${overrides}`
}

/**
 * Cache key of one preview.
 *
 * <p>It carries the two overrides beside the dates, and it has to: the answer depends on them.
 * A key on the dates alone left the dialog stuck on a series error the reader had already
 * corrected — same key, so no request went out and the sentence never cleared.
 *
 * @param tenantId the tenant
 * @param start the first day as it stands in the field
 * @param end the last day as it stands in the field
 * @param label the name somebody typed, left out while nobody has
 * @param numberYear the series somebody typed, left out while it is not a year yet
 * @returns cache key of one preview
 */
export function fiscalYearPreviewKey(
  tenantId: number,
  start: string,
  end: string,
  label?: string,
  numberYear?: number,
): readonly unknown[] {
  return [
    'accounting-fiscal-year-preview',
    tenantId,
    start,
    end,
    label ?? '',
    numberYear ?? null,
  ]
}

/**
 * The fiscal years of one tenant with the posting boundary and the expiry warning.
 *
 * <p>Answers while the module is off: the books stay readable under GeBüV Art. 6 Abs. 1. The
 * screen still shows its module notice — what stays readable is the endpoint, not the mask.
 *
 * @param tenantId the tenant
 * @returns the years together with the boundary and the expiry
 */
export function fetchFiscalYears(tenantId: number): Promise<FiscalYearList> {
  return api.get<FiscalYearList>(fiscalYearsUrl(tenantId))
}

/**
 * What a range would become: name, series, length, the following year, and the two sentences.
 *
 * <p>A calculator and no store. Asked on every change to start, end, name or series, debounced.
 *
 * <p>`label` and `numberYear` in the <b>answer</b> stay the proposal read off the dates, also
 * where the two arguments were sent — only `error` speaks about what was typed. That is what
 * lets a dialog go on offering the proposal wherever nobody has typed and still hear whether
 * what somebody did type will be accepted.
 *
 * @param tenantId the tenant
 * @param start the first day
 * @param end the last day
 * @param label the name somebody typed, left out while nobody has
 * @param numberYear the series somebody typed, left out while it is not a year yet
 * @returns the proposal with `warning` and `error` filled where they apply
 */
export function fetchFiscalYearPreview(
  tenantId: number,
  start: string,
  end: string,
  label?: string,
  numberYear?: number,
): Promise<FiscalYearPreview> {
  return api.get<FiscalYearPreview>(
    fiscalYearPreviewUrl(tenantId, start, end, label, numberYear),
  )
}

/**
 * Lays out a fiscal year, and the following one where the tick stands.
 *
 * <p>One request and one transaction: where the following year collides, neither of the two is
 * stored, and the sentence says so.
 *
 * @param tenantId the tenant
 * @param request what somebody typed
 * @returns the whole list again, so boundary and expiry need no second round trip
 */
export function createFiscalYear(
  tenantId: number,
  request: FiscalYearRequest,
): Promise<FiscalYearList> {
  return api.post<FiscalYearList>(fiscalYearsUrl(tenantId), request)
}

/**
 * Changes name, series and dates of a year that carries no posting yet.
 *
 * @param tenantId the tenant
 * @param fiscalYearId the year
 * @param request what somebody typed
 * @returns the stored year
 */
export function updateFiscalYear(
  tenantId: number,
  fiscalYearId: number,
  request: FiscalYearRequest,
): Promise<FiscalYear> {
  return api.put<FiscalYear>(fiscalYearUrl(tenantId, fiscalYearId), request)
}

/**
 * Removes a fiscal year together with its log.
 *
 * <p>Answers 409 once a journal number has been drawn from it — then the year is corrected
 * rather than removed.
 *
 * @param tenantId the tenant
 * @param fiscalYearId the year
 */
export function deleteFiscalYear(tenantId: number, fiscalYearId: number): Promise<void> {
  return api.delete<void>(fiscalYearUrl(tenantId, fiscalYearId))
}

/**
 * Locks an open year or opens a locked one.
 *
 * <p>Only those two directions. `CLOSED` is reached by the closing run and never from here.
 *
 * @param tenantId the tenant
 * @param fiscalYearId the year
 * @param status the state it moves to
 * @returns the stored year
 */
export function setFiscalYearStatus(
  tenantId: number,
  fiscalYearId: number,
  status: FiscalYearStatus,
): Promise<FiscalYear> {
  return api.put<FiscalYear>(fiscalYearStatusUrl(tenantId, fiscalYearId), { status })
}

/**
 * The first day the create dialog opens with.
 *
 * <p>A prefill and nothing more: the preview corrects name, series and the two sentences the
 * moment it answers, and it is the backend that decides whether the range is allowed. Where
 * years exist the next one starts the day after the last one ends, because a gap in the middle
 * of a running bookkeeping is refused anyway. Where none exist the fiscal year the tenant is in
 * right now is proposed, read off its start month.
 *
 * @param years the years the tenant has, in any order
 * @param fiscalYearStartMonth the start month of the tenant, 1 to 12
 * @param today the day the dialog is opened on
 * @returns the first day as `yyyy-MM-dd`
 */
export function suggestFiscalYearStart(
  years: readonly { endDate: string }[],
  fiscalYearStartMonth: number,
  today: Date,
): string {
  const latest = [...years].map((year) => year.endDate).sort().at(-1)
  if (latest !== undefined) return addDays(latest, 1)
  const month = Math.min(Math.max(fiscalYearStartMonth, 1), 12)
  const year = today.getMonth() + 1 >= month ? today.getFullYear() : today.getFullYear() - 1
  return `${year}-${`${month}`.padStart(2, '0')}-01`
}

/**
 * The last day the create dialog opens with: twelve months on from the first, minus a day.
 *
 * <p>The same prefill reasoning as {@link suggestFiscalYearStart}. A 29th of February that has
 * no counterpart a year later lands on the 28th, which is the day a reader expects.
 *
 * @param startDate the first day as `yyyy-MM-dd`
 * @returns the last day as `yyyy-MM-dd`
 */
export function suggestFiscalYearEnd(startDate: string): string {
  const [year, month, day] = startDate.split('-').map(Number)
  return addDays(`${year + 1}-${`${month}`.padStart(2, '0')}-${`${day}`.padStart(2, '0')}`, -1)
}

/** Moves an ISO day by whole days, in UTC so no time zone can shift the date. */
function addDays(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number)
  const moved = new Date(Date.UTC(year, month - 1, date + days))
  return moved.toISOString().slice(0, 10)
}
