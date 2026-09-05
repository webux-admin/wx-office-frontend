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
import { parseDecimal } from './format'
import { listQuery } from './paging'
import {
  clearSessionFamily,
  clearSessionText,
  readSessionText,
  writeSessionText,
} from './preferences'
import type {
  Account,
  AccountRequest,
  AccountType,
  BoundarySource,
  ChainIntegrity,
  ChartCopyRequest,
  ChartCopyResult,
  ChartTemplate,
  Entry,
  EntryAttention,
  EntryRequest,
  EntrySuggestion,
  EntryTemplate,
  EntryTemplateRequest,
  FiscalYear,
  FiscalYearList,
  FiscalYearPreview,
  FiscalYearRequest,
  FiscalYearStatus,
  JournalRow,
  Page,
  PositionHint,
  PostRunPreview,
  PostRunResult,
  ReversalRequest,
  SystemKey,
  TaxCode,
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

// --- die Buchung ---------------------------------------------------------------------------

/**
 * Path of the entry screen within the application.
 *
 * <p>`/buchhaltung/buchen/:id` opens the same mask on a draft that is already stored. One mask
 * and not two: what is typed is the same thing either way, and a second one would be the second
 * place the live difference is worked out (ADR-0045).
 */
export const ENTRY_PATH = '/buchhaltung/buchen'

/** Path of the draft list within the application. */
export const DRAFT_PATH = '/buchhaltung/entwuerfe'

/** Path of the journal within the application. */
export const JOURNAL_PATH = '/buchhaltung/journal'

/**
 * The fields the two lists may be sorted by.
 *
 * <p>Word for word the whitelist of `PageRequests`: the server answers 400 for anything else, so
 * a column offering a sort the endpoint does not know would be a table nobody can click.
 */
export const ENTRY_SORT_FIELDS: readonly string[] = [
  'entryNumber',
  'description',
  'documentReference',
  'bookingDate',
  'postedAt',
  'createdAt',
]

/**
 * @param tenantId the tenant
 * @param query the filter and paging values, as a query string without the `?`
 * @returns address of the drafts of that tenant
 */
export function entriesUrl(tenantId: number, query = ''): string {
  return `${accountingUrl(tenantId)}/entries${query === '' ? '' : `?${query}`}`
}

/**
 * @param tenantId the tenant
 * @param query the filter and paging values the page was asked for
 * @returns cache key of one page of drafts
 */
export function entriesKey(tenantId: number, query = ''): readonly unknown[] {
  return ['accounting-entries', tenantId, query]
}

/**
 * @param tenantId the tenant
 * @param entryId the entry
 * @returns address of one entry, draft or posted
 */
export function entryUrl(tenantId: number, entryId: number): string {
  return `${accountingUrl(tenantId)}/entries/${entryId}`
}

/**
 * @param tenantId the tenant
 * @param entryId the entry
 * @returns cache key of one entry
 */
export function entryKey(tenantId: number, entryId: number): readonly unknown[] {
  return ['accounting-entry', tenantId, entryId]
}

/**
 * @param tenantId the tenant
 * @returns address of what the draft list says about itself
 */
export function attentionUrl(tenantId: number): string {
  return `${accountingUrl(tenantId)}/entries/attention`
}

/**
 * @param tenantId the tenant
 * @returns cache key of the draft summary
 */
export function attentionKey(tenantId: number): readonly unknown[] {
  return ['accounting-attention', tenantId]
}

/**
 * @param tenantId the tenant
 * @param query the filter and paging values, as a query string without the `?`
 * @returns address of the journal
 */
export function journalUrl(tenantId: number, query = ''): string {
  return `${accountingUrl(tenantId)}/journal${query === '' ? '' : `?${query}`}`
}

/**
 * @param tenantId the tenant
 * @param query the filter and paging values the page was asked for
 * @returns cache key of one page of the journal
 */
export function journalKey(tenantId: number, query = ''): readonly unknown[] {
  return ['accounting-journal', tenantId, query]
}

/**
 * @param tenantId the tenant
 * @returns address of the run over the hash chain
 */
export function integrityUrl(tenantId: number): string {
  return `${accountingUrl(tenantId)}/integrity`
}

/**
 * @param tenantId the tenant
 * @returns cache key of the integrity answer
 */
export function integrityKey(tenantId: number): readonly unknown[] {
  return ['accounting-integrity', tenantId]
}

/**
 * One page of drafts. Answers while the module is off.
 *
 * @param tenantId the tenant
 * @param query the filter and paging values, as a query string without the `?`
 * @returns the matching page, oldest booking date first unless another order was asked for
 */
export function fetchEntries(tenantId: number, query = ''): Promise<Page<Entry>> {
  return api.get<Page<Entry>>(entriesUrl(tenantId, query))
}

/**
 * One entry with its lines.
 *
 * @param tenantId the tenant
 * @param entryId the entry
 * @returns the entry, posted or not
 */
export function fetchEntry(tenantId: number, entryId: number): Promise<Entry> {
  return api.get<Entry>(entryUrl(tenantId, entryId))
}

/**
 * How many drafts are waiting, what they add up to and since when.
 *
 * @param tenantId the tenant
 * @returns the summary the draft list carries above its rows
 */
export function fetchAttention(tenantId: number): Promise<EntryAttention> {
  return api.get<EntryAttention>(attentionUrl(tenantId))
}

/**
 * One page of the journal. Posted entries only, and it answers while the module is off — what is
 * booked stays readable (OR Art. 958f).
 *
 * @param tenantId the tenant
 * @param query the filter and paging values, the fiscal year among them
 * @returns the matching page
 */
export function fetchJournal(tenantId: number, query = ''): Promise<Page<JournalRow>> {
  return api.get<Page<JournalRow>>(journalUrl(tenantId, query))
}

/**
 * Walks the hash chain and says whether it is intact.
 *
 * @param tenantId the tenant
 * @returns what the run found, with the German sentence to show
 */
export function fetchIntegrity(tenantId: number): Promise<ChainIntegrity> {
  return api.get<ChainIntegrity>(integrityUrl(tenantId))
}

/**
 * Stores a draft.
 *
 * <p>Answers 400 where the entry does not balance, has fewer than two lines, sits outside its
 * fiscal year or breaks one of the posting rules. The sentence comes from the backend and names
 * both sums — the screen never writes one of its own.
 *
 * @param tenantId the tenant
 * @param request what somebody typed
 * @returns the stored draft, its lines numbered 1..n
 */
export function createEntry(tenantId: number, request: EntryRequest): Promise<Entry> {
  return api.post<Entry>(entriesUrl(tenantId), request)
}

/**
 * Changes a draft that is not posted yet.
 *
 * @param tenantId the tenant
 * @param entryId the draft
 * @param request what somebody typed
 * @returns the stored draft
 */
export function updateEntry(
  tenantId: number,
  entryId: number,
  request: EntryRequest,
): Promise<Entry> {
  return api.put<Entry>(entryUrl(tenantId, entryId), request)
}

/**
 * Removes a draft. Answers 409 once it is posted — from then on only a counter entry corrects
 * it.
 *
 * @param tenantId the tenant
 * @param entryId the draft
 */
export function deleteEntry(tenantId: number, entryId: number): Promise<void> {
  return api.delete<void>(entryUrl(tenantId, entryId))
}

/**
 * Posts one draft: journal number, chain position, the frozen columns and the tax line.
 *
 * <p>After this nothing about the entry can be changed or removed any more.
 *
 * @param tenantId the tenant
 * @param entryId the draft
 * @returns the entry as it now stands in the journal
 */
export function postEntry(tenantId: number, entryId: number): Promise<Entry> {
  return api.post<Entry>(`${entryUrl(tenantId, entryId)}/post`, {})
}

/**
 * Reverses a posted entry with a counter entry that is posted at once.
 *
 * @param tenantId the tenant
 * @param entryId the posted entry
 * @param request the reason, and the day the counter entry sits on
 * @returns the counter entry
 */
export function reverseEntry(
  tenantId: number,
  entryId: number,
  request: ReversalRequest,
): Promise<Entry> {
  return api.post<Entry>(`${entryUrl(tenantId, entryId)}/reverse`, request)
}

/**
 * How many characters of a reversal reason fit, given the journal number it is written beside.
 *
 * <p>The reason is not stored on its own. The backend builds «Storno zu &lt;Journalnummer&gt;:
 * &lt;Grund&gt;» out of it and writes that sentence to the description of the counter entry and
 * to the text of every one of its lines — two `VARCHAR(200)` columns. So the room is 200 less
 * the prefix, and it shrinks as the journal number grows: 177 characters beside «2026-000045».
 *
 * <p><b>The three constants are copied from `PostingManagement`, not guessed.</b> The mask uses
 * this to stop the typing where the endpoint stops it, so nobody writes two sentences and reads
 * a refusal only after pressing the button. The refusal itself stays where it belongs: this is
 * a convenience, and the backend remains the one that decides.
 *
 * @param entryNumber the journal number of the entry being reversed
 * @returns how many characters the reason may have, never below zero
 */
export function reversalReasonRoom(entryNumber: string): number {
  const room = REVERSAL_TEXT_LIMIT - REVERSAL_PREFIX.length - entryNumber.length
    - REVERSAL_SEPARATOR.length
  return Math.max(0, room)
}

/** `accounting_entry.description` and `accounting_entry_line.text` are both `VARCHAR(200)`. */
const REVERSAL_TEXT_LIMIT = 200
const REVERSAL_PREFIX = 'Storno zu '
const REVERSAL_SEPARATOR = ': '

/**
 * What a posting run would do, before anything is written.
 *
 * <p>The one reading way of this module that answers 409 while the module is off: it writes
 * nothing but it announces a write. `firstNumber` and `lastNumber` come back empty in this
 * stage, so the dialog names no number range (backend ADR-0114).
 *
 * @param tenantId the tenant
 * @param entryIds the drafts that were ticked
 * @returns which would be posted, and why the others would not
 */
export function previewPostRun(
  tenantId: number,
  entryIds: readonly number[],
): Promise<PostRunPreview> {
  const query = listQuery({ entryIds: entryIds.map(String) })
  return api.get<PostRunPreview>(
    `${accountingUrl(tenantId)}/entries/post-run/preview${query === '' ? '' : `?${query}`}`,
  )
}

/**
 * Posts the ticked drafts, one transaction each.
 *
 * <p>The run does not tip over: a draft that cannot be posted lands in `skipped` or `failed`
 * with its sentence, and the others go into the journal all the same.
 *
 * @param tenantId the tenant
 * @param entryIds the drafts that were ticked; empty posts nothing
 * @returns the three result lists
 */
export function runPost(tenantId: number, entryIds: readonly number[]): Promise<PostRunResult> {
  return api.post<PostRunResult>(`${accountingUrl(tenantId)}/entries/post-run`, {
    entryIds: [...entryIds],
  })
}

// --- die Buchungsvorlagen und der Textvorschlag ---------------------------------------------

/**
 * The address a tenant's posting templates are served under, relative to its accounting.
 *
 * <p>Not a screen path like {@link ENTRY_PATH}: templates have no route of their own. They hang
 * off the entry mask, and the two dialogs that maintain them open from its split button.
 */
export const ENTRY_TEMPLATE_PATH = 'entry-templates'

/** How many suggestions the text field asks for. The server caps at the same number. */
export const SUGGESTION_LIMIT = 8

/** From how many characters the text field asks at all. Under it the server answers empty. */
export const SUGGESTION_MINIMUM = 2

/**
 * @param tenantId the tenant
 * @returns the address of its posting templates
 */
export function entryTemplatesUrl(tenantId: number): string {
  return `${accountingUrl(tenantId)}/${ENTRY_TEMPLATE_PATH}`
}

/**
 * @param tenantId the tenant
 * @param templateId the template
 * @returns the address of that one template
 */
export function entryTemplateUrl(tenantId: number, templateId: number): string {
  return `${entryTemplatesUrl(tenantId)}/${templateId}`
}

/**
 * The address of the text suggestions.
 *
 * <p>The term is encoded, so a `%`, an `&` or a space in what somebody typed stays part of the
 * search instead of becoming a second parameter.
 *
 * @param tenantId the tenant
 * @param term what has been typed into the text field so far
 * @param limit how many suggestions to ask for; the server cuts a bigger wish quietly
 * @returns the address of the suggestion endpoint
 */
export function suggestionsUrl(tenantId: number, term: string, limit = SUGGESTION_LIMIT): string {
  return `${accountingUrl(tenantId)}/entries/suggestions`
    + `?q=${encodeURIComponent(term)}&limit=${limit}`
}

/**
 * @param tenantId the tenant
 * @returns the cache key of its template list
 */
export function entryTemplatesKey(tenantId: number): readonly unknown[] {
  return ['accounting-entry-templates', tenantId]
}

/**
 * @param tenantId the tenant
 * @param term the settled term the list was asked for
 * @returns the cache key of one suggestion list
 */
export function suggestionsKey(tenantId: number, term: string): readonly unknown[] {
  return ['accounting-entry-suggestions', tenantId, term]
}

/**
 * Reads the posting templates of one tenant, in menu order.
 *
 * <p>A bare array and no page: a template list is a picking list, and ADR-0026 leaves short
 * holdings unpaginated. It answers while the module is switched off as well.
 *
 * @param tenantId the tenant
 * @returns its templates, each with its lines, its version and its problems
 */
export function fetchEntryTemplates(tenantId: number): Promise<EntryTemplate[]> {
  return api.get<EntryTemplate[]>(entryTemplatesUrl(tenantId))
}

/**
 * Stores a new posting template.
 *
 * <p>It is appended: whatever `sortOrder` the payload names is ignored. The left half of the
 * split button fires the **first** template, so a new one at the top would rehang the main
 * button on every save.
 *
 * @param tenantId the tenant
 * @param request name, description, the two header fields and the lines
 * @returns the stored template, with the place it was given
 */
export function createEntryTemplate(
  tenantId: number,
  request: EntryTemplateRequest,
): Promise<EntryTemplate> {
  return api.post<EntryTemplate>(entryTemplatesUrl(tenantId), request)
}

/**
 * Changes a posting template: its name, its description, its lines or its place in the menu.
 *
 * <p>The payload carries the `version` the list delivered, and that is the whole optimistic
 * lock. A template somebody else changed in the meantime answers 409 rather than overwriting
 * their work; the answer carries the new version for the next `PUT`.
 *
 * @param tenantId the tenant
 * @param templateId the template
 * @param request the whole template — the endpoint replaces what it is given
 * @returns the changed template, with its new version
 */
export function updateEntryTemplate(
  tenantId: number,
  templateId: number,
  request: EntryTemplateRequest,
): Promise<EntryTemplate> {
  return api.put<EntryTemplate>(entryTemplateUrl(tenantId, templateId), request)
}

/**
 * Removes a posting template.
 *
 * <p>The one delete of this module: a template carries no booking date and no journal number,
 * and entries already posted from it stay untouched.
 *
 * @param tenantId the tenant
 * @param templateId the template
 */
export function deleteEntryTemplate(tenantId: number, templateId: number): Promise<void> {
  return api.delete<void>(entryTemplateUrl(tenantId, templateId))
}

/**
 * What has been posted under a text like this before, with the accounts it went to.
 *
 * <p>Only posted entries: the text of a draft is no fact yet, and a typo in an open draft would
 * otherwise be suggested forever — while its author is correcting it.
 *
 * @param tenantId the tenant
 * @param term the settled term; under two characters nothing is asked at all
 * @param limit how many to ask for
 * @returns the suggestions, most used first; empty while the term is too short
 */
export function fetchEntrySuggestions(
  tenantId: number,
  term: string,
  limit = SUGGESTION_LIMIT,
): Promise<EntrySuggestion[]> {
  const needle = term.trim()
  if (needle.length < SUGGESTION_MINIMUM) return Promise.resolve([])
  return api.get<EntrySuggestion[]>(suggestionsUrl(tenantId, needle, limit))
}

// --- was die Erfassungsmaske selbst rechnet ------------------------------------------------

/**
 * One row of the entry grid while it is being typed.
 *
 * <p>The amounts are the raw field values and not numbers: a field somebody is in the middle of
 * typing holds «1'2» for a moment, and turning that into a number would move the caret. The one
 * place they become numbers is {@link entryBalance} and the request builder.
 */
export type EntryDraftRow = {
  /** Identifies the row inside the mask. Never sent — the server numbers the lines. */
  key: number
  accountId: number | null
  /** What stands in the account field, so a half typed number survives a page change too. */
  accountText: string
  debit: string
  credit: string
  taxCodeId: number | null
}

/** What the entry mask keeps while somebody is typing. */
export type EntryDraftState = {
  bookingDate: string
  documentReference: string
  description: string
  rows: EntryDraftRow[]
  /**
   * When it was last rescued, ISO. Written by the mask, read by the banner that offers it back
   * — «zuletzt heute um 14:12». Absent on a state that was never in the rescue store.
   */
  savedAt?: string
}

/**
 * The family of keys the rescued typing state is kept under, without the `webux.` prefix.
 *
 * <p>The tenant id is part of the key and has to be: without it, whoever switches tenant would
 * get the half typed entry of **another business** into their mask — account numbers and
 * amounts included (ADR-0045).
 */
export const ENTRY_DRAFT_PREFIX = 'accounting.draft.'

/**
 * @param tenantId the tenant
 * @returns the key of the rescued typing state, without the `webux.` prefix
 */
export function entryDraftKey(tenantId: number): string {
  return `${ENTRY_DRAFT_PREFIX}${tenantId}`
}

/**
 * The typing state left behind for this tenant, and nothing else.
 *
 * <p>Reading also throws away what was left lying for **every other** tenant, which is what
 * makes a tenant change clear the mask. A value that cannot be read as a state is dropped
 * rather than reported: a rescued draft is a convenience, and a broken one is worth no error
 * message.
 *
 * @param tenantId the tenant the mask is open for
 * @returns what was typed, or null where nothing was left
 */
export function readEntryDraft(tenantId: number): EntryDraftState | null {
  clearSessionFamily(ENTRY_DRAFT_PREFIX, entryDraftKey(tenantId))
  const stored = readSessionText(entryDraftKey(tenantId))
  if (stored === null) return null
  try {
    const state: unknown = JSON.parse(stored)
    return isEntryDraftState(state) ? state : null
  } catch {
    return null
  }
}

/**
 * Whether a parsed value really is a state this mask can open with.
 *
 * <p><b>Parsing is not reading.</b> `JSON.parse` succeeds on anything well formed, and what
 * comes back is handed straight to code that trims strings and walks rows. A stored value of
 * another shape — a tampered key, or a row shape a later version of this file changes — throws
 * inside the `useState` initialiser of the mask, and a throw there means the screen does not
 * open at all. That is the opposite of what the function above promises, and far worse than
 * losing a rescued draft: the rescue is a convenience, the mask is the work.
 *
 * <p>Checked field by field rather than through a schema library: five names and one row shape
 * do not carry a dependency. `savedAt` is let through when absent — it is optional by
 * declaration, and a state without it is what the mask holds before the first rescue.
 */
function isEntryDraftState(value: unknown): value is EntryDraftState {
  if (typeof value !== 'object' || value === null) return false
  const state = value as Partial<EntryDraftState>
  if (typeof state.bookingDate !== 'string') return false
  if (typeof state.documentReference !== 'string') return false
  if (typeof state.description !== 'string') return false
  if (state.savedAt !== undefined && typeof state.savedAt !== 'string') return false
  if (!Array.isArray(state.rows)) return false
  return state.rows.every((row: unknown) => {
    if (typeof row !== 'object' || row === null) return false
    const line = row as Partial<EntryDraftRow>
    return (
      typeof line.key === 'number' &&
      typeof line.accountText === 'string' &&
      typeof line.debit === 'string' &&
      typeof line.credit === 'string' &&
      (line.accountId === null || typeof line.accountId === 'number') &&
      (line.taxCodeId === null || typeof line.taxCodeId === 'number')
    )
  })
}

/**
 * Keeps what is being typed, so a page change does not lose it.
 *
 * @param tenantId the tenant the mask is open for
 * @param state what stands in the mask
 */
export function writeEntryDraft(tenantId: number, state: EntryDraftState): void {
  writeSessionText(entryDraftKey(tenantId), JSON.stringify(state))
}

/**
 * Throws the rescued state away.
 *
 * <p>Called after a successful save. Without it a state stays behind that looks like an unsaved
 * entry, and the next person types the same booking a second time (ADR-0045).
 *
 * @param tenantId the tenant the mask is open for
 */
export function clearEntryDraft(tenantId: number): void {
  clearSessionText(entryDraftKey(tenantId))
}

/** An empty mask: today, no voucher, no text, and two rows, because an entry has two sides. */
export function emptyEntryDraft(today: string): EntryDraftState {
  return {
    bookingDate: today,
    documentReference: '',
    description: '',
    rows: [emptyEntryRow(1), emptyEntryRow(2)],
  }
}

/**
 * @param key the row key
 * @returns a row with nothing in it
 */
export function emptyEntryRow(key: number): EntryDraftRow {
  return { key, accountId: null, accountText: '', debit: '', credit: '', taxCodeId: null }
}

/**
 * The accounts a typed term may mean, by number **or** by name.
 *
 * <p>Somebody types «miete» and gets «6000 Raumaufwand»; somebody types «6000» and gets the
 * same. Accounts that are switched off or that only the closing posts to do not appear at all —
 * **a convenience and no barrier**: the barrier stands in `PostingRules` and in a database guard
 * (ADR-0045).
 *
 * @param accounts the chart as it was read
 * @param term what stands in the field, trimmed
 * @param limit how many to offer at most
 * @returns the matches, by account number
 */
export function searchAccounts(
  accounts: readonly Account[],
  term: string,
  limit = 8,
): Account[] {
  const needle = term.trim().toLowerCase()
  const open = accounts.filter((account) => account.active && account.directPostingAllowed)
  const matching =
    needle === ''
      ? open
      : open.filter(
          (account) =>
            account.accountNumber.toLowerCase().startsWith(needle)
            || account.name.toLowerCase().includes(needle),
        )
  return [...matching]
    .sort((one, other) => one.accountNumber.localeCompare(other.accountNumber))
    .slice(0, limit)
}

/** What the two columns of the grid add up to, and what is missing between them. */
export type EntryBalance = {
  debit: number
  credit: number
  /** Debit minus credit. Zero is the only value the entry may be stored with. */
  difference: number
}

/**
 * Adds the two columns up as they stand in the fields.
 *
 * <p>Counted in whole rappen rather than in francs: adding 0.1 and 0.2 as binary fractions
 * leaves a difference of 0.00000000000000004, which would be shown as 0.00 and be red.
 *
 * <p><b>This is a display and no validation.</b> The server adds the same two columns in
 * `EntryBalance` and is the only one that says «ausgeglichen»; the figure is not sent along
 * (ADR-0045).
 *
 * @param rows the rows as they stand in the mask
 * @returns both sums and the difference between them
 */
export function entryBalance(
  rows: readonly { debit: string; credit: string }[],
): EntryBalance {
  const rappen = (raw: string) => Math.round((parseDecimal(raw) ?? 0) * 100)
  const debit = rows.reduce((sum, row) => sum + rappen(row.debit), 0)
  const credit = rows.reduce((sum, row) => sum + rappen(row.credit), 0)
  return { debit: debit / 100, credit: credit / 100, difference: (debit - credit) / 100 }
}

/**
 * What one line does to its account, in words — the weak read-back of ADR-0045.
 *
 * <p>It stands **at one place only**, under its line in the box «So wird gebucht», and nowhere
 * else: not as a column heading, not as a placeholder, not in the journal. Soll and Haben stay
 * the only vocabulary everywhere else.
 *
 * <p>A `CLOSING` account gets none. It is not in the table the decision names, and the only one
 * shipped cannot be posted to by hand at all.
 *
 * @param accountType the type of the account the line sits on
 * @param side which column carries the amount
 * @returns the sentence without the amount, or undefined where there is nothing to say
 */
export function effectPhrase(
  accountType: AccountType | null | undefined,
  side: 'debit' | 'credit',
): string | undefined {
  if (!accountType) return undefined
  const phrases = EFFECT_PHRASES[accountType]
  return phrases === undefined ? undefined : phrases[side]
}

/** The table of ADR-0045 section 3, and the only place it is written down. */
const EFFECT_PHRASES: Partial<Record<AccountType, { debit: string; credit: string }>> = {
  ASSET: { debit: 'Guthaben steigt um', credit: 'Guthaben sinkt um' },
  LIABILITY: { debit: 'Schuld sinkt um', credit: 'Schuld steigt um' },
  EQUITY: { debit: 'Eigenkapital sinkt um', credit: 'Eigenkapital steigt um' },
  EXPENSE: { debit: 'Aufwand steigt um', credit: 'Aufwand sinkt um' },
  REVENUE: { debit: 'Ertrag sinkt um', credit: 'Ertrag steigt um' },
}

/** What a gross amount falls apart into at one rate. */
export type TaxSplit = { net: number; tax: number }

/**
 * Takes the tax out of a gross amount, the way `TaxSplit.splitOf` does it.
 *
 * <p>Two decimals, half up, and the tax as gross minus net rather than rounded on its own, so
 * the three figures always add up exactly. A rate of zero splits nothing.
 *
 * <p><b>A preview and no calculation of record.</b> The server works the same split out again
 * when the entry is posted, and what it writes is what counts.
 *
 * @param gross what stands in the field
 * @param rate the percentage of the tax code, three decimals
 * @returns the net that stays on the typed account and the tax that moves, or null at rate zero
 */
export function taxSplitOf(gross: number, rate: number): TaxSplit | null {
  if (!Number.isFinite(gross) || !Number.isFinite(rate) || rate === 0) return null
  const grossRappen = Math.round(gross * 100)
  const netRappen = Math.round(grossRappen / (1 + rate / 100))
  const taxRappen = grossRappen - netRappen
  if (taxRappen === 0) return null
  return { net: netRappen / 100, tax: taxRappen / 100 }
}

/** One line of the box «So wird gebucht». */
export type PostingPreviewLine = {
  accountNumber: string
  accountName: string
  accountType: AccountType | null
  side: 'debit' | 'credit'
  amount: number
  /** What the application writes itself: the tax line. It is no input row. */
  generated: boolean
  /** The text the generated line carries, word for word the one the backend writes. */
  text?: string
}

/**
 * The finished entry as posting will write it, tax line included.
 *
 * <p>Mirrors the order of the backend: the typed lines first, in the order they stand, then the
 * generated tax lines. Where a line carries a tax code with a rate, the typed amount shrinks to
 * the net and the tax moves to the tax account **on the same side** — that is what keeps the
 * entry balanced (backend `TaxSplit`).
 *
 * <p><b>«zu Zeile n» counts the lines that are sent, not the rows of the grid.</b>
 * {@link entryRequestOf} leaves out what carries no account, and the backend numbers what
 * arrives 1..n. Counting the grid instead would let an empty row above a taxed one name a line
 * number the journal never shows.
 *
 * @param rows the rows as they stand in the mask
 * @param accounts the chart, to resolve number, name and type
 * @param taxCodes the tax codes of the tenant
 * @returns the lines to show, empty while nothing usable is typed
 */
export function postingPreviewOf(
  rows: readonly EntryDraftRow[],
  accounts: readonly Account[],
  taxCodes: readonly TaxCode[],
): PostingPreviewLine[] {
  const typed: PostingPreviewLine[] = []
  const generated: PostingPreviewLine[] = []
  let lineNumber = 0
  rows.forEach((row) => {
    if (row.accountId === null) return
    lineNumber += 1
    const account = accounts.find((candidate) => candidate.id === row.accountId)
    if (account === undefined) return
    const debit = parseDecimal(row.debit) ?? 0
    const credit = parseDecimal(row.credit) ?? 0
    const side: 'debit' | 'credit' = debit !== 0 ? 'debit' : 'credit'
    const gross = debit !== 0 ? debit : credit
    if (gross === 0) return

    const code = taxCodes.find((candidate) => candidate.id === row.taxCodeId)
    const split = code === undefined ? null : taxSplitOf(gross, code.rate)
    typed.push({
      accountNumber: account.accountNumber,
      accountName: account.name,
      accountType: account.accountType,
      side,
      amount: split === null ? gross : split.net,
      generated: false,
    })
    if (split === null || code === undefined || !code.taxAccountNumber) return
    const taxAccount = accounts.find(
      (candidate) => candidate.accountNumber === code.taxAccountNumber,
    )
    generated.push({
      accountNumber: code.taxAccountNumber,
      accountName: code.taxAccountName ?? '',
      accountType: taxAccount?.accountType ?? null,
      side,
      amount: split.tax,
      generated: true,
      text: `MWST ${code.code} zu Zeile ${lineNumber}`,
    })
  })
  return [...typed, ...generated]
}

/**
 * Turns the mask into what the endpoint takes.
 *
 * <p>Rows without an account and without an amount are left out: the last row of a grid is
 * almost always the empty one somebody stopped typing in.
 *
 * @param state what stands in the mask
 * @returns the payload of `POST /entries` and `PUT /entries/{id}`
 */
export function entryRequestOf(state: EntryDraftState): EntryRequest {
  return {
    bookingDate: state.bookingDate,
    description: state.description,
    documentReference: state.documentReference,
    lines: state.rows
      .filter((row) => row.accountId !== null)
      .map((row) => ({
        accountId: row.accountId as number,
        debit: parseDecimal(row.debit),
        credit: parseDecimal(row.credit),
        taxCodeId: row.taxCodeId,
      })),
  }
}
