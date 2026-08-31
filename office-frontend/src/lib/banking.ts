import { api } from './api'
import type {
  BankAccount,
  BankAccountRequest,
  BankEntry,
  BankStatementImport,
  BankTransaction,
  ImportState,
  BankReferenceType,
  TransactionState,
} from './types'

/**
 * The bank statements of a tenant: where their screens live, what rights they run on, and the
 * calls behind them.
 *
 * <p>Its own building block rather than addresses typed into the screens, the same way
 * `dunning.ts` and `openItem.ts` do it: the imports are read by two masks, the items by a
 * third, and a query key written twice is a cache that goes stale in one of them.
 */

/** Path of the list of imported statements within the application. */
export const BANK_STATEMENT_PATH = '/bankauszuege'

/** Path of the list of single payments within the application. */
export const BANK_TRANSACTION_PATH = '/bankposten'

/** Path of the account master data within the application. */
export const BANK_ACCOUNT_PATH = '/bankkonten'

/** The module these screens belong to. */
export const BANKING_MODULE = 'BANKING' as const

/**
 * The two rights these screens run on.
 *
 * <p>`importFile` also carries the account master data, and deliberately so: whoever may feed
 * statements in must be able to say which accounts they come for. Splitting them would create
 * a right that can only ever be granted together with the other one.
 */
export const BANKING_RIGHTS = {
  read: 'BANK_STATEMENT_READ',
  importFile: 'BANK_STATEMENT_IMPORT',
} as const

/**
 * Largest file the backend takes.
 *
 * <p>Held against `BankingManagement.MAX_FILE_BYTES`. Checked in the browser as well so a
 * 30 MB file does not travel for a minute to be turned away.
 */
export const MAX_STATEMENT_BYTES = 20 * 1024 * 1024

/** What each state of an import is called on screen. */
export const IMPORT_STATES: Record<ImportState, string> = {
  RECEIVED: 'Wird gelesen',
  PARSED: 'Gelesen',
  FAILED: 'Fehlgeschlagen',
}

/** What each state of a single payment is called on screen. */
export const TRANSACTION_STATES: Record<TransactionState, string> = {
  NEW: 'Neu',
  MATCHED: 'Zugeordnet',
  POSTED: 'Verbucht',
  UNMATCHED: 'Nicht zuordenbar',
  IGNORED: 'Ignoriert',
}

/** The states in the order the filter offers them. */
export const TRANSACTION_STATE_ORDER: TransactionState[] = [
  'NEW',
  'MATCHED',
  'POSTED',
  'UNMATCHED',
  'IGNORED',
]

/** What each kind of reference is called on screen. */
export const REFERENCE_TYPES: Record<BankReferenceType, string> = {
  QRR: 'QR-Referenz',
  SCOR: 'Creditor Reference',
  OTHER: 'Andere Angabe',
  NONE: 'Keine Referenz',
}

/**
 * What one item says about its reference, in one sentence.
 *
 * <p>Two fields, not one: a QR reference whose check digit fails is a different problem from
 * a free text, and whoever hunts it is hunting a transposed digit. The list has to show the
 * difference (backend ADR-0107).
 *
 * @param transaction one item
 * @returns the sentence, ready to print
 */
export function referenceLabel(transaction: BankTransaction): string {
  const kind = REFERENCE_TYPES[transaction.referenceType]
  if (transaction.referenceType === 'NONE') return kind
  if (transaction.referenceValid) return kind
  return `${kind} — Prüfziffer stimmt nicht`
}

/**
 * Whether an item wants looking at because its reference does not hold.
 *
 * <p>Not «has no reference»: an unstructured payment is ordinary. What is worth a mark is a
 * reference that looks like one and is not.
 */
export function referenceIsBroken(transaction: BankTransaction): boolean {
  return transaction.referenceType !== 'NONE' && !transaction.referenceValid
}

/**
 * Whether an entry lost something on the way in.
 *
 * <p>The items are summed at import so a gap between the entry and its items is visible
 * instead of silent. A gap is not necessarily wrong — a bank charge inside the entry
 * explains one — but nobody should have to subtract two figures to notice it.
 */
export function entryHasGap(entry: BankEntry): boolean {
  if (entry.transactionCount === 0) return false
  if (entry.transactionSum === undefined) return false
  return Math.abs(entry.transactionSum - entry.amount) > 0.005
}

/**
 * @param tenantId the tenant
 * @returns cache key of the imports of that tenant
 */
export function bankStatementsKey(tenantId: number, query?: string): readonly unknown[] {
  return query === undefined
    ? ['bank-statements', tenantId]
    : ['bank-statements', tenantId, query]
}

/**
 * @param tenantId the tenant
 * @param importId the file
 * @returns cache key of the entries of one import
 */
export function bankEntriesKey(tenantId: number, importId: number): readonly unknown[] {
  return ['bank-statements', tenantId, importId, 'entries']
}

/**
 * @param tenantId the tenant
 * @returns cache key of the single payments of that tenant
 */
export function bankTransactionsKey(tenantId: number, query?: string): readonly unknown[] {
  return query === undefined
    ? ['bank-transactions', tenantId]
    : ['bank-transactions', tenantId, query]
}

/**
 * @param tenantId the tenant
 * @returns cache key of the account master data of that tenant
 */
export function bankAccountsKey(tenantId: number): readonly unknown[] {
  return ['bank-accounts', tenantId]
}

/** What the list of imports can be narrowed by. */
export type ImportQuery = {
  accountId?: number
  from?: string
  to?: string
  state?: ImportState
  limit?: number
}

/** What the list of single payments can be narrowed by. */
export type TransactionQuery = {
  importId?: number
  accountIban?: string
  state?: TransactionState
  from?: string
  to?: string
  creditsOnly?: boolean
  limit?: number
}

/**
 * Turns a filter into a query string.
 *
 * <p>Empty values are left out rather than sent as `''`: an empty parameter would narrow the
 * list to nothing on the server, and the cache key would differ from the one without it.
 *
 * @param query what to narrow by
 * @returns the query string, `''` when nothing is set
 */
export function queryStringOf(query: Record<string, unknown>): string {
  const parts = new URLSearchParams()
  for (const [name, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '' || value === false) continue
    parts.set(name, String(value))
  }
  const text = parts.toString()
  return text === '' ? '' : `?${text}`
}

/**
 * @param tenantId the tenant
 * @param query what to narrow by
 * @returns the imports, newest first
 */
export function fetchBankStatements(
  tenantId: number,
  query: ImportQuery = {},
): Promise<BankStatementImport[]> {
  return api.get<BankStatementImport[]>(
    `/api/tenants/${tenantId}/bank-statements${queryStringOf(query)}`,
  )
}

/**
 * @param tenantId the tenant
 * @param importId the file
 * @returns what was imported and what came of it
 */
export function fetchBankStatement(
  tenantId: number,
  importId: number,
): Promise<BankStatementImport> {
  return api.get<BankStatementImport>(`/api/tenants/${tenantId}/bank-statements/${importId}`)
}

/**
 * @param tenantId the tenant
 * @param importId the file
 * @returns its bookings, in the order the file held them
 */
export function fetchBankEntries(tenantId: number, importId: number): Promise<BankEntry[]> {
  return api.get<BankEntry[]>(`/api/tenants/${tenantId}/bank-statements/${importId}/entries`)
}

/**
 * @param tenantId the tenant
 * @param query what to narrow by
 * @returns the single payments, newest value date first
 */
export function fetchBankTransactions(
  tenantId: number,
  query: TransactionQuery = {},
): Promise<BankTransaction[]> {
  return api.get<BankTransaction[]>(
    `/api/tenants/${tenantId}/bank-transactions${queryStringOf(query)}`,
  )
}

/**
 * Sends a statement file.
 *
 * <p>Answers as soon as the bytes are stored, with the import still unread. The screen then
 * asks for it again until its state turns — reading a month of items takes longer than a
 * browser is willing to wait (backend ADR-0107).
 *
 * @param tenantId the tenant
 * @param file the camt file
 * @returns the stored import, in state `RECEIVED`
 */
export function uploadBankStatement(
  tenantId: number,
  file: File,
): Promise<BankStatementImport> {
  return api.upload<BankStatementImport>(`/api/tenants/${tenantId}/bank-statements`, file)
}

/**
 * @param tenantId the tenant
 * @param importId the file
 * @returns the address the original file is fetched from
 */
export function bankStatementFileUrl(tenantId: number, importId: number): string {
  return `/api/tenants/${tenantId}/bank-statements/${importId}/file`
}

/**
 * @param tenantId the tenant
 * @returns its accounts, closed ones last
 */
export function fetchBankAccounts(tenantId: number): Promise<BankAccount[]> {
  return api.get<BankAccount[]>(`/api/tenants/${tenantId}/bank-accounts`)
}

/**
 * Adds an account, or changes label, QR flag and switch on an existing one.
 *
 * <p>IBAN and currency are only read when adding. Stored bookings carry the IBAN, and moving
 * it would rewrite a booking voucher.
 */
export function saveBankAccount(
  tenantId: number,
  request: BankAccountRequest,
): Promise<BankAccount> {
  return api.put<BankAccount>(`/api/tenants/${tenantId}/bank-accounts`, request)
}

/**
 * Whether an import is still being read.
 *
 * <p>What the screen polls on: the upload answers before the reading starts, so the figures
 * are all zero until this turns false.
 */
export function isBeingRead(head: BankStatementImport): boolean {
  return head.state === 'RECEIVED'
}

/**
 * What an import produced, in one sentence.
 *
 * <p><b>The duplicates are named, not hidden.</b> Somebody who imports the camt.053 after the
 * camt.054 sees «0 neu» and has to be able to tell that this is the right answer and not a
 * lost file (backend ADR-0107).
 *
 * @param head one import
 * @returns the sentence
 */
export function importSummary(head: BankStatementImport): string {
  if (head.state === 'RECEIVED') return 'Wird gelesen …'
  if (head.state === 'FAILED') return head.failureReason ?? 'Konnte nicht gelesen werden'
  const parts = [`${head.storedCount} neu`]
  if (head.duplicateCount > 0) parts.push(`${head.duplicateCount} doppelt`)
  if (head.skippedCount > 0) parts.push(`${head.skippedCount} übersprungen`)
  return parts.join(', ')
}
