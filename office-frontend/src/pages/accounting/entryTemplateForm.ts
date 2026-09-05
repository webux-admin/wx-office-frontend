/**
 * What the two template dialogs and the rescue banner of the entry mask work out, without
 * React and without a request.
 *
 * <p>Kept beside the screens rather than in `lib/`: none of it is a call and none of it is
 * shared with another module — it is the arithmetic of one mask.
 */
import { emptyEntryRow, type EntryDraftRow, type EntryDraftState } from '../../lib/accounting'
import { formatDateTime, parseDecimal } from '../../lib/format'
import type {
  Account,
  EntrySide,
  EntryTemplate,
  EntryTemplateLine,
  EntryTemplateLineRequest,
  EntryTemplateRequest,
  TaxCode,
} from '../../lib/types'

/**
 * Everything a template needs that is not a row.
 *
 * <p>The two catalogues travel with it because a template stores the account **number** and the
 * **code** of the tax code, while the grid holds ids. Resolving them is the one thing that
 * cannot be done from the rows alone.
 */
export type TemplateHeader = {
  name: string
  description: string
  /** What the entry text is prefilled with on applying. May be empty. */
  entryDescription: string
  /** What the voucher field is prefilled with on applying. May be empty. */
  documentReference: string
  accounts: readonly Account[]
  taxCodes: readonly TaxCode[]
}

/** One `PUT` a reordering has to send: the template it moves and the whole body for it. */
export type TemplateOrderStep = {
  id: number
  request: EntryTemplateRequest
}

/** What the banner over the grid says about a rescued state, and what «Weiterschreiben» takes. */
export type RescuedDraft = {
  state: EntryDraftState
  /**
   * When it was written, ISO — the banner names the time of day.
   *
   * <p>Absent on a state an older version of the mask wrote, which carried no stamp at all.
   * {@link rescueHeadline} is what turns that into a sentence, and it says nothing rather than
   * «zuletzt -».
   */
  savedAt?: string
  /** How many rows carry something. «2 Zeilen» in the banner. */
  rowCount: number
  /** The entry text, empty where none was typed. */
  description: string
}

/**
 * Turns what stands in the grid into what a template stores.
 *
 * <p>Rows without an account are left out — the last row of a grid is almost always the empty
 * one somebody stopped typing in. Without amounts every line goes out with `amount: null`, and
 * applying the template then leaves the amount fields empty.
 *
 * <p>No line number and no booking date: the server numbers the lines, and a date belongs to an
 * entry and never to a template.
 *
 * @param rows the rows as they stand in the mask
 * @param header what the template is called and what it prefills, plus the two catalogues
 * @param withAmounts whether the typed amounts are kept
 * @returns the body of `POST /entry-templates`
 */
export function payloadOf(
  rows: readonly EntryDraftRow[],
  header: TemplateHeader,
  withAmounts: boolean,
): EntryTemplateRequest {
  const lines: EntryTemplateLineRequest[] = []
  rows.forEach((row) => {
    if (row.accountId === null) return
    const account = header.accounts.find((candidate) => candidate.id === row.accountId)
    if (account === undefined) return
    // Soll unless it stands in Haben: a row with neither amount still has a side, and this is
    // the reading that needs no guess.
    const credit = parseDecimal(row.credit)
    const side: EntrySide = credit === null ? 'DEBIT' : 'CREDIT'
    const amount = side === 'DEBIT' ? parseDecimal(row.debit) : credit
    const code = header.taxCodes.find((candidate) => candidate.id === row.taxCodeId)
    lines.push({
      accountNumber: account.accountNumber,
      side,
      amount: withAmounts ? amount : null,
      taxCode: code?.code ?? null,
      text: null,
    })
  })
  return {
    name: header.name.trim(),
    description: blankToNull(header.description),
    entryDescription: blankToNull(header.entryDescription),
    documentReference: blankToNull(header.documentReference),
    lines,
  }
}

/**
 * Turns a template into rows for the grid.
 *
 * <p><b>A line the tenant may not post on arrives without an account.</b> That covers both
 * findings the server reports: a number the chart no longer holds, and an account direct
 * posting is barred on. The number stays in the field so it is readable which account was
 * meant, and the grid marks the row red — the line is not sent, and the entry is refused here
 * rather than by a 500 out of the database.
 *
 * @param template the template as the list delivered it
 * @returns the rows, at least two, because an entry has two sides
 */
export function rowsFromTemplate(template: EntryTemplate): EntryDraftRow[] {
  return rowsFromLines(template.lines)
}

/**
 * The same for the lines of a text suggestion, which travel in the very same shape.
 *
 * <p>One function for both, because both are read against today's chart: the server resolves
 * the number of a template and the account id of a posted line into the same payload, and the
 * grid has one way of taking it.
 *
 * @param lines the lines of a template or of a suggestion
 * @returns the rows, at least two, because an entry has two sides
 */
export function rowsFromLines(lines: readonly EntryTemplateLine[]): EntryDraftRow[] {
  const rows = lines.map((line, index) => ({
    key: index + 1,
    accountId: line.postable ? (line.accountId ?? null) : null,
    accountText:
      line.postable && line.accountName
        ? `${line.accountNumber} ${line.accountName}`
        : line.accountNumber,
    debit: line.side === 'DEBIT' ? amountText(line.amount) : '',
    credit: line.side === 'CREDIT' ? amountText(line.amount) : '',
    taxCodeId: line.taxCodeId ?? null,
  }))
  return rows.length === 0 ? [emptyEntryRow(1), emptyEntryRow(2)] : rows
}

/**
 * The whole body of a `PUT`, out of a template that was read.
 *
 * <p>The endpoint replaces what it is given, so renaming one field means sending all of them —
 * a payload of nothing but a name would drop the lines. **The version goes with it**: it is
 * what the row stood at when it was read, and it is the whole optimistic lock.
 *
 * <p><b>Every field of the body may be overridden but the version</b>, which is not the
 * caller's to set. The two header fields belong in that list as much as the lines do:
 * «Überschreiben» is the one documented way to change a template, and a type that let only the
 * name, the description and the lines through silently kept the old entry text and the old
 * voucher on every overwrite.
 *
 * @param template the template as the list delivered it
 * @param over the fields that change
 * @returns the body of `PUT /entry-templates/{id}`
 */
export function templateRequestOf(
  template: EntryTemplate,
  over: Omit<Partial<EntryTemplateRequest>, 'version'> = {},
): EntryTemplateRequest {
  return {
    name: template.name,
    description: template.description ?? null,
    sortOrder: template.sortOrder,
    version: template.version,
    entryDescription: template.entryDescription ?? null,
    documentReference: template.documentReference ?? null,
    lines: template.lines.map((line) => ({
      accountNumber: line.accountNumber,
      side: line.side,
      amount: line.amount ?? null,
      taxCode: line.taxCode ?? null,
      text: line.text ?? null,
    })),
    ...over,
  }
}

/**
 * Moves one template past its neighbour and returns the `PUT`s that does.
 *
 * <p>There is no endpoint for a whole order, so one arrow press is one request per moved row.
 * <b>Every one of them carries its own version</b> — the one its own row was read at. Without
 * it not a single arrow press would go through, and a shared version would answer 409 on the
 * second request of the pair.
 *
 * @param templates the templates in the order they are shown
 * @param index the row that is moving
 * @param direction -1 for one place up, 1 for one place down
 * @returns the templates whose place changes, usually two; empty where the move is impossible
 */
export function orderPayload(
  templates: readonly EntryTemplate[],
  index: number,
  direction: -1 | 1,
): TemplateOrderStep[] {
  const target = index + direction
  if (index < 0 || index >= templates.length) return []
  if (target < 0 || target >= templates.length) return []

  const moved = templates[index]
  const neighbour = templates[target]
  if (moved.sortOrder !== neighbour.sortOrder) {
    return [step(moved, neighbour.sortOrder), step(neighbour, moved.sortOrder)]
  }
  // Both sit on the same place, so one of them has to leave it. Downwards, and upwards from
  // anything but zero, the moved one steps aside; at zero it cannot, because the server refuses
  // a negative place, so the neighbour steps down instead.
  if (direction === 1) return [step(moved, moved.sortOrder + 1)]
  if (moved.sortOrder > 0) return [step(moved, moved.sortOrder - 1)]
  return [step(neighbour, neighbour.sortOrder + 1)]
}

/**
 * Stamps the moment onto what is being typed, so the banner can name it.
 *
 * <p>The stamp is part of the rescued state and of nothing else: it is never sent, and an entry
 * carries no such field. Whoever finds a mask filled on opening has to be told **when** they
 * left it, or the two lines of the banner say nothing they could decide on.
 *
 * @param state what stands in the mask
 * @param savedAt the moment, ISO
 * @returns the state as it goes into the rescue store
 */
export function rescueStateOf(state: EntryDraftState, savedAt: string): EntryDraftState {
  return { ...state, savedAt }
}

/**
 * What the banner over the grid offers back — and nothing where there is nothing to offer.
 *
 * <p>Never restored on its own: a mask that fills itself with two account rows on opening looks
 * like an entry that already exists. So this only produces what the banner **says**, and the
 * state travels with it for the moment somebody presses «Weiterschreiben».
 *
 * @param rescued what was left in the rescue store, null where nothing was or where it could
 *   not be read back
 * @returns the offer, or undefined where nothing is worth offering
 */
export function stateFromRescue(rescued: EntryDraftState | null): RescuedDraft | undefined {
  if (rescued === null) return undefined
  if (!Array.isArray(rescued.rows)) return undefined
  const rowCount = rescued.rows.filter(carriesSomething).length
  const description = rescued.description ?? ''
  if (rowCount === 0 && description.trim() === '') return undefined
  // The stamp is passed on as it was found, missing included. Filling an empty string in here
  // would only move the problem into the banner, where it reads «zuletzt -».
  return {
    state: rescued,
    savedAt: rescued.savedAt,
    rowCount,
    description,
  }
}

/**
 * The first line of the banner over the grid.
 *
 * <p>Names the moment only where there is a readable one. A state written by an older version
 * of the mask carries no stamp at all, and «zuletzt -.» is worse than saying nothing: it reads
 * as a broken screen at the moment somebody is deciding whether to trust what is offered back.
 *
 * @param savedAt when it was rescued, ISO; absent or unreadable on a state an older version
 *   wrote
 * @returns the finished German sentence
 */
export function rescueHeadline(savedAt: string | undefined): string {
  const stamp = savedAt?.trim() ?? ''
  if (stamp === '' || Number.isNaN(new Date(stamp).getTime())) {
    return 'Sie hatten hier etwas angefangen.'
  }
  return `Sie hatten hier etwas angefangen — zuletzt ${formatDateTime(stamp)}.`
}

/**
 * What applying a template would replace in the mask, as the question in front of it says it.
 *
 * <p><b>The two header fields count as much as the rows.</b> Applying replaces the entry text
 * and the voucher too — a template that carries neither leaves them empty — so somebody who
 * typed a reference and a booking text and has not filled a row yet has just as much to lose
 * as somebody with three rows, and used to lose it without ever being asked.
 *
 * <p><b>And a row counts on its tax code alone.</b> Applying replaces the rows outright, so a
 * chosen tax code is gone with them — asking about the account but not about the tax code threw
 * away a decision the mask itself had thought worth keeping.
 *
 * <p>The booking date is not in it: a template carries none, and the date stays.
 *
 * @param draft what stands in the mask
 * @returns the finished German sentence, or undefined where there is nothing to replace and the
 *   template can simply be taken
 */
export function replacementWarning(draft: EntryDraftState): string | undefined {
  const rows = draft.rows.filter(carriesSomething).length
  const parts: string[] = []
  if (rows > 0) parts.push(rows === 1 ? 'die getippte Zeile' : `die ${rows} getippten Zeilen`)
  if (draft.description.trim() !== '') parts.push('der getippte Text')
  if (draft.documentReference.trim() !== '') parts.push('der getippte Beleg')
  if (parts.length === 0) return undefined

  const listed =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(', ')} und ${parts[parts.length - 1]}`
  const verb = rows > 1 || parts.length > 1 ? 'werden' : 'wird'
  return `${listed.charAt(0).toUpperCase()}${listed.slice(1)} ${verb} ersetzt.`
}

/**
 * Whether a row holds anything at all. An empty row is no reason to offer a state back.
 *
 * <p><b>A chosen tax code counts.</b> It is a decision somebody made — «das ist mit Vorsteuer» —
 * and it is the one field of a row that carries no text of its own, so leaving it out read as
 * an empty row. The mask keeps such a row (`isDirty` asks for the tax code by name), and
 * counting it differently here meant applying a template threw that choice away without a
 * question, and a reload offered a rescued state back that said «0 Zeilen».
 */
function carriesSomething(row: EntryDraftRow): boolean {
  return (
    row.accountId !== null
    || row.accountText.trim() !== ''
    || row.debit.trim() !== ''
    || row.credit.trim() !== ''
    || row.taxCodeId !== null
  )
}

/** One `PUT` of a reordering: the same body, with a new place and its own version. */
function step(template: EntryTemplate, sortOrder: number): TemplateOrderStep {
  return { id: template.id, request: templateRequestOf(template, { sortOrder }) }
}

/** An empty field is no value: the server tells «not given» and «empty» apart. */
function blankToNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/** How an amount from a template stands in the grid, which holds raw text and not numbers. */
function amountText(amount: number | null | undefined): string {
  return amount === null || amount === undefined ? '' : amount.toFixed(2)
}
