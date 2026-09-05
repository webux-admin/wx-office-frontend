import { useRef, useState } from 'react'
import {
  effectPhrase,
  emptyEntryRow,
  entryBalance,
  postingPreviewOf,
  searchAccounts,
  type EntryDraftRow,
} from '../lib/accounting'
import { formatAmount } from '../lib/format'
import { isSubmitShortcut } from '../lib/shortcuts'
import type { Account, TaxCode } from '../lib/types'
import { useDebouncedValue } from './useDebouncedValue'

/** The four columns somebody types in. In this order, and the grid has no more. */
const COLUMNS = [
  { key: 'account', header: 'Konto', width: 'flex-1', align: 'left' as const },
  { key: 'debit', header: 'Soll', width: 'w-[132px]', align: 'right' as const },
  { key: 'credit', header: 'Haben', width: 'w-[132px]', align: 'right' as const },
  { key: 'tax', header: 'Steuercode', width: 'w-[200px]', align: 'left' as const },
]

const LAST_COLUMN = COLUMNS.length - 1

type EntryGridProps = {
  rows: EntryDraftRow[]
  onRowsChange: (rows: EntryDraftRow[]) => void
  /** The chart, for the account field. Switched off accounts are filtered out on reading. */
  accounts: readonly Account[]
  taxCodes: readonly TaxCode[]
  /** The ledger currency, written once beside the sums instead of on every row. */
  currencyCode: string
  /** What Ctrl+S and Ctrl+Enter do — the primary action of the mask around the grid. */
  onSubmit?: () => void
  /** Off while a save is running, so nothing changes underneath a request. */
  disabled?: boolean
  /**
   * The rows whose amounts came out of a posting template, by row key.
   *
   * <p><b>An amount from a template is a proposal and no value.</b> It is drawn as a changed
   * proposal and freely overwritten, the way the position proposal of the chart of accounts is
   * drawn; the first keystroke in the cell turns it into an ordinary amount.
   */
  suggestedAmounts?: readonly number[]
  /** Called on the first keystroke in a proposed amount cell, so the mark goes. */
  onAmountTyped?: (key: number) => void
}

/**
 * The entry grid: as many lines as an entry needs, the live difference under them, and the box
 * «So wird gebucht».
 *
 * <p><b>A real ARIA grid and not a table with a role pinned on</b>, after the pattern of
 * `MatchGrid`: `role="grid"`, exactly one tab stop (roving tabindex), and the arrow keys reach
 * every cell. What is different is the direction — `MatchGrid` is a reading list somebody moves
 * through, this is an input form in grid shape, and its cells hold controls (ADR-0045).
 *
 * <p><b>The sum row and the box belong to the grid</b> rather than to the screen around it. Both
 * are worked out of the very rows this component owns and have to be redrawn on every keystroke;
 * lifting them out would mean the screen recalculating what the grid already knows.
 *
 * <p><b>The two figures are a display and no validation.</b> The server adds the same two
 * columns again and is the only one that says «ausgeglichen».
 *
 * <p>Keys, after ADR-0012 and the clearing basket: Tab and Enter move to the next field, Enter
 * on the last column adds the next row, Escape discards the row, Ctrl+S and Ctrl+Enter save.
 * The up and down arrows always move between rows — while the account list is open they move
 * inside it, and that is the one exception.
 */
export function EntryGrid({
  rows,
  onRowsChange,
  accounts,
  taxCodes,
  currencyCode,
  onSubmit,
  disabled = false,
  suggestedAmounts = [],
  onAmountTyped,
}: EntryGridProps) {
  const [wanted, setWanted] = useState({ row: 0, column: 0 })
  const gridRef = useRef<HTMLDivElement>(null)

  // Clamped while reading rather than corrected in an effect: a discarded row would otherwise
  // be drawn once with a cursor pointing past the end (the same reasoning as in `MatchGrid`).
  const focus = {
    row: Math.min(wanted.row, Math.max(0, rows.length - 1)),
    column: Math.min(wanted.column, LAST_COLUMN),
  }

  const balance = entryBalance(rows)
  const preview = postingPreviewOf(rows, accounts, taxCodes)
  const balanced = balance.difference === 0

  function change(index: number, patch: Partial<EntryDraftRow>) {
    onRowsChange(rows.map((row, position) => (position === index ? { ...row, ...patch } : row)))
  }

  /** Appends a row and puts the cursor in its first cell. */
  function addRow() {
    const nextKey = rows.reduce((highest, row) => Math.max(highest, row.key), 0) + 1
    onRowsChange([...rows, emptyEntryRow(nextKey)])
    setWanted({ row: rows.length, column: 0 })
  }

  /**
   * Throws one row away. The last one is emptied instead of removed: a grid without a row has
   * nowhere to put the cursor, and an entry needs two sides anyway.
   */
  function discardRow(index: number) {
    const nextKey = rows.reduce((highest, row) => Math.max(highest, row.key), 0) + 1
    if (rows.length === 1) {
      onRowsChange([emptyEntryRow(nextKey)])
      setWanted({ row: 0, column: 0 })
      return
    }
    onRowsChange(rows.filter((_, position) => position !== index))
    setWanted({ row: Math.max(0, index - 1), column: focus.column })
  }

  function move(rowDelta: number, columnDelta: number) {
    setWanted({
      row: clamp(focus.row + rowDelta, rows.length - 1),
      column: clamp(focus.column + columnDelta, LAST_COLUMN),
    })
  }

  /**
   * Whether the left or right arrow may leave the cell.
   *
   * <p>In a text field it only does so once the caret sits at the edge of what is written —
   * otherwise the arrow keys would stop working inside the field somebody is typing in. A
   * dropdown has no caret and hands the key over at once.
   */
  function mayLeaveCell(target: EventTarget | null, towards: 'left' | 'right'): boolean {
    if (!(target instanceof HTMLInputElement)) return true
    const { selectionStart, selectionEnd, value } = target
    if (selectionStart === null || selectionEnd === null) return true
    if (selectionStart !== selectionEnd) return false
    return towards === 'left' ? selectionStart === 0 : selectionStart === value.length
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (isSubmitShortcut(event)) {
      // Ctrl+S would otherwise be the browser offering to save the page. Stopped here as well,
      // because the mask around the grid binds the same keys on the document for the header
      // fields — without this the press would save twice.
      event.preventDefault()
      event.stopPropagation()
      onSubmit?.()
      return
    }
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        move(1, 0)
        return
      case 'ArrowUp':
        event.preventDefault()
        move(-1, 0)
        return
      case 'ArrowRight':
        if (!mayLeaveCell(event.target, 'right')) return
        event.preventDefault()
        move(0, 1)
        return
      case 'ArrowLeft':
        if (!mayLeaveCell(event.target, 'left')) return
        event.preventDefault()
        move(0, -1)
        return
      case 'Home':
        event.preventDefault()
        setWanted(event.ctrlKey ? { row: 0, column: 0 } : { row: focus.row, column: 0 })
        return
      case 'End':
        event.preventDefault()
        setWanted(
          event.ctrlKey
            ? { row: rows.length - 1, column: LAST_COLUMN }
            : { row: focus.row, column: LAST_COLUMN },
        )
        return
      case 'Enter':
        event.preventDefault()
        if (focus.column === LAST_COLUMN) addRow()
        else move(0, 1)
        return
      case 'Escape':
        event.preventDefault()
        discardRow(focus.row)
        return
      default:
    }
  }

  return (
    <div className="grid gap-4">
      <div
        ref={gridRef}
        role="grid"
        aria-label="Buchungszeilen"
        aria-rowcount={rows.length + 1}
        aria-colcount={COLUMNS.length}
        className="w-full text-[13px]"
        onKeyDown={onKeyDown}
      >
        <div role="row" aria-rowindex={1} className="flex gap-2 border-b border-line px-2 py-1.5">
          {COLUMNS.map((column, index) => (
            <span
              key={column.key}
              role="columnheader"
              aria-colindex={index + 1}
              className={`${column.width} text-[11px] uppercase tracking-wide text-text-tertiary ${
                column.align === 'right' ? 'text-right' : ''
              }`}
            >
              {column.header}
            </span>
          ))}
        </div>

        {rows.map((row, rowIndex) => (
          <div
            key={row.key}
            role="row"
            aria-rowindex={rowIndex + 2}
            className="flex items-center gap-2 border-b border-line-subtle px-2 py-1"
          >
            <span role="gridcell" aria-colindex={1} className={`${COLUMNS[0].width} min-w-0`}>
              <AccountCell
                row={row}
                rowNumber={rowIndex + 1}
                accounts={accounts}
                disabled={disabled}
                focused={focus.row === rowIndex && focus.column === 0}
                inGrid={() => gridRef.current?.contains(document.activeElement) ?? false}
                onFocused={() => setWanted({ row: rowIndex, column: 0 })}
                onChange={(patch) => change(rowIndex, patch)}
                onAdvance={() => setWanted({ row: rowIndex, column: 1 })}
              />
            </span>

            <AmountCell
              column={1}
              width={COLUMNS[1].width}
              label={`Soll Zeile ${rowIndex + 1}`}
              value={row.debit}
              disabled={disabled}
              suggested={suggestedAmounts.includes(row.key)}
              focused={focus.row === rowIndex && focus.column === 1}
              inGrid={() => gridRef.current?.contains(document.activeElement) ?? false}
              onFocused={() => setWanted({ row: rowIndex, column: 1 })}
              // One side per line: typing into the one column empties the other, so nobody
              // has to remember to clear it.
              onChange={(next) => {
                onAmountTyped?.(row.key)
                change(rowIndex, { debit: next, credit: '' })
              }}
            />

            <AmountCell
              column={2}
              width={COLUMNS[2].width}
              label={`Haben Zeile ${rowIndex + 1}`}
              value={row.credit}
              disabled={disabled}
              suggested={suggestedAmounts.includes(row.key)}
              focused={focus.row === rowIndex && focus.column === 2}
              inGrid={() => gridRef.current?.contains(document.activeElement) ?? false}
              onFocused={() => setWanted({ row: rowIndex, column: 2 })}
              onChange={(next) => {
                onAmountTyped?.(row.key)
                change(rowIndex, { credit: next, debit: '' })
              }}
            />

            <span role="gridcell" aria-colindex={4} className={`${COLUMNS[3].width} min-w-0`}>
              <select
                aria-label={`Steuercode Zeile ${rowIndex + 1}`}
                value={row.taxCodeId === null ? '' : String(row.taxCodeId)}
                disabled={disabled}
                tabIndex={focus.row === rowIndex && focus.column === 3 ? 0 : -1}
                ref={(element) => {
                  if (
                    element
                    && focus.row === rowIndex
                    && focus.column === 3
                    && gridRef.current?.contains(document.activeElement)
                  ) {
                    element.focus()
                  }
                }}
                onFocus={() => setWanted({ row: rowIndex, column: 3 })}
                onChange={(event) =>
                  change(rowIndex, {
                    taxCodeId: event.target.value === '' ? null : Number(event.target.value),
                  })
                }
                className="h-8 w-full rounded-[var(--radius-sm)] border border-transparent bg-transparent px-2 text-[13px] text-text-primary outline-none hover:border-line focus:border-accent"
              >
                <option value="">— ohne MWST —</option>
                {taxCodes.map((code) => (
                  <option key={code.id} value={code.id}>
                    {code.code} · {code.name}
                  </option>
                ))}
              </select>
            </span>
          </div>
        ))}
      </div>

      {/* Always there, also at 0.00: a figure that only appears when something is wrong is read
          as an error message and clicked away (ADR-0045). */}
      <p
        data-balanced={balanced ? 'true' : 'false'}
        aria-live="polite"
        className="px-2 text-[13px] tabular-nums"
      >
        <span className="text-text-secondary">Soll</span> {formatAmount(balance.debit)}{' '}
        {balanced ? '=' : '≠'} <span className="text-text-secondary">Haben</span>{' '}
        {formatAmount(balance.credit)} <span className="text-text-tertiary">·</span>{' '}
        <span className={balanced ? 'text-text-secondary' : 'font-semibold text-danger'}>
          Differenz {formatAmount(balance.difference)} {currencyCode}
        </span>
      </p>

      <section className="rounded-[var(--radius-lg)] border border-line-subtle bg-sunken/60 p-4">
        <h2 className="text-[13px] font-semibold">So wird gebucht</h2>
        {preview.length === 0 ? (
          <p className="mt-2 text-[13px] text-text-secondary">
            Sobald ein Konto und ein Betrag stehen, steht hier der fertige Buchungssatz.
          </p>
        ) : (
          <ul className="mt-2 grid gap-2">
            {preview.map((line, index) => {
              const phrase = effectPhrase(line.accountType, line.side)
              return (
                <li key={`${line.accountNumber}-${index}`} className="text-[13px]">
                  <span className="flex flex-wrap items-baseline gap-2">
                    <span className="w-[52px] shrink-0 text-text-secondary">
                      {line.side === 'debit' ? 'Soll' : 'Haben'}
                    </span>
                    <span className="font-mono text-[12px] text-text-tertiary">
                      {line.accountNumber}
                    </span>
                    <span className="min-w-0 flex-1">{line.accountName}</span>
                    <span className="tabular-nums">{formatAmount(line.amount)}</span>
                  </span>
                  <span className="mt-0.5 block pl-[60px] text-[12px] text-text-secondary">
                    {line.generated ? line.text : phrase && `${phrase} ${formatAmount(line.amount)}`}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

/**
 * The account field of one row: one field, and it matches on number **or** on name.
 *
 * <p>Not `QuickSearchField` — that is the building block for the header of a list. What is
 * shared is `useDebouncedValue`, which holds the term the list is narrowed by back until the
 * typing stops. <b>The list stands only over that settled term.</b> While it is catching up
 * there is no list, because a list of an older term is read as the answer to what was just
 * typed and Enter takes its first line.
 *
 * <p><b>The typed text is `row.accountText` and nothing else.</b> The cell keeps no copy of it:
 * the mask starts a new entry on the same row keys, so React keeps these cells and a copy of
 * its own would go on showing an account the row no longer carries — the next entry gets typed
 * on top of an account that looks set and is not.
 *
 * <p>Accounts that are switched off or that only the closing posts to never appear. <b>That is
 * a convenience and no barrier</b>: the barrier stands in `PostingRules` and in a database
 * guard (ADR-0045).
 */
function AccountCell({
  row,
  rowNumber,
  accounts,
  disabled,
  focused,
  inGrid,
  onFocused,
  onChange,
  onAdvance,
}: {
  row: EntryDraftRow
  rowNumber: number
  accounts: readonly Account[]
  disabled: boolean
  focused: boolean
  /** Whether the cursor is inside the grid at all; without it the page would steal the focus. */
  inGrid: () => boolean
  onFocused: () => void
  onChange: (patch: Partial<EntryDraftRow>) => void
  /** Called after a pick, so the cursor moves on to the amount. */
  onAdvance: () => void
}) {
  const text = row.accountText.trim()
  const term = useDebouncedValue(text)
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  // The match set belongs to `term`, and `term` lags the field by the debounce. So it is only
  // worth anything while the two agree: in the 200 ms after a keystroke `searchAccounts` still
  // answers the term before it, and at the first keystroke that term is the empty one — which
  // is the whole chart of accounts, unfiltered. An empty term therefore yields no matches here
  // rather than all of them, so no path can put that list on the screen.
  const settled = term === text
  const matches = settled && text !== '' ? searchAccounts(accounts, term) : []
  const active = Math.min(highlight, Math.max(0, matches.length - 1))
  // Tied to the matches and not to `open` alone: `open` is state of this cell, and the cell
  // outlives the row it was drawn for — the mask begins the next entry on the same row keys.
  // Without the text of the row in the condition, an emptied row would be met by the list of
  // the entry before it; without the settled term, Enter within the debounce window took the
  // first line of a list that was answering an older term. Somebody typed «6000», pressed
  // Enter and got «1020 Bankguthaben» on the row — which is plausible, wrong, and nobody reads
  // it a second time. While nothing is drawn, Enter belongs to the grid and moves on to the
  // amount; the account a whole number names is already on the row, `type` sets it undebounced.
  const listOpen = open && matches.length > 0
  const listId = `entry-accounts-${row.key}`
  const optionId = (account: Account) => `${listId}-${account.id}`

  // A row with text and no account is a dead end: `entryRequestOf` drops it, and the server
  // then complains about the line that is missing instead of the one that is wrong. Somebody
  // who writes «6000 Raumaufwand» out in full rather than picking it lands there. While the
  // list stands open there is nothing to say yet — that is somebody choosing; and while the
  // term is still settling there is nothing to say either, or the note would flash on every
  // keystroke of an account that is about to be found.
  const unresolved = settled && text !== '' && row.accountId === null && !listOpen
  const noteId = `entry-account-note-${row.key}`

  function pick(account: Account) {
    onChange({ accountId: account.id, accountText: `${account.accountNumber} ${account.name}` })
    setOpen(false)
    onAdvance()
  }

  function type(next: string) {
    setHighlight(0)
    setOpen(next.trim() !== '')
    // Whoever types a whole account number is done; the list would only be in the way.
    //
    // Looked up on the whole chart and not through `searchAccounts`: that one matches the NAME
    // too and answers a limited, number-sorted slice. Two accounts carrying «6000» in their name
    // and sorting below it would push 6000 out of the slice, and a complete, valid number would
    // leave the row without an account. Since Enter no longer picks anything while the term
    // settles, this is the only way an account reaches the row inside the debounce window.
    const exact = accounts.find((account) => account.accountNumber === next.trim())
    onChange({ accountId: exact?.id ?? null, accountText: next })
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    // Escape is answered while this cell is being typed in, list drawn or not. `listOpen` stays
    // false for the whole debounce window, and letting Escape through there hands it to the
    // grid, which discards the ENTIRE row — account, Soll, Haben and Steuercode together.
    // Somebody taking back a single character would lose the line. `open` is set on every
    // keystroke and is the honest answer to «is this cell being edited».
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      return
    }
    if (!listOpen) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      event.stopPropagation()
      setHighlight(clamp(active + (event.key === 'ArrowDown' ? 1 : -1), matches.length - 1))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      pick(matches[active])
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
    }
  }

  return (
    <span className="relative block">
      <input
        aria-label={`Konto Zeile ${rowNumber}`}
        role="combobox"
        // All three follow the list that is actually drawn, not the wish to open one: with no
        // match there is no `ul`, and `aria-expanded="true"` beside an `aria-controls` pointing
        // at nothing is what made the field announce a list that was not there.
        aria-expanded={listOpen}
        aria-autocomplete="list"
        aria-controls={listOpen ? listId : undefined}
        // The counterpart of what `SplitButton` does by moving the focus onto the highlighted
        // entry. A menu may do that; a combobox may not — the focus has to stay in the field
        // somebody is typing in, so the highlight is handed to the screen reader instead of the
        // focus. Without it the arrow keys move a purely visual bar and announce nothing.
        aria-activedescendant={listOpen ? optionId(matches[active]) : undefined}
        aria-invalid={unresolved || undefined}
        aria-describedby={unresolved ? noteId : undefined}
        value={row.accountText}
        disabled={disabled}
        placeholder="Nummer oder Bezeichnung"
        tabIndex={focused ? 0 : -1}
        ref={(element) => {
          if (element && focused && inGrid()) element.focus()
        }}
        onFocus={onFocused}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        onChange={(event) => type(event.target.value)}
        className={`h-8 w-full rounded-[var(--radius-sm)] border bg-transparent px-2 text-[13px] text-text-primary outline-none placeholder:text-text-tertiary focus:border-accent ${
          unresolved ? 'border-danger' : 'border-transparent hover:border-line'
        }`}
      />
      {/* Where the state arises, not only in the answer of the server afterwards. It names the
          consequence rather than the rule: the line is the thing that goes missing. */}
      {unresolved && (
        <span id={noteId} className="mt-0.5 block px-2 text-[11px] text-danger">
          Kein Konto gewählt. Diese Zeile wird nicht gespeichert.
        </span>
      )}
      {listOpen && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Kontovorschläge"
          className="absolute left-0 top-9 z-10 max-h-64 w-[320px] overflow-y-auto rounded-[var(--radius-md)] border border-line bg-surface py-1 shadow-lg"
        >
          {matches.map((account, index) => (
            <li
              key={account.id}
              id={optionId(account)}
              role="option"
              aria-selected={index === active}
              // The field keeps the focus, so the click lands as a pick and not as a blur.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(account)}
              className={`cursor-pointer px-3 py-1.5 text-[13px] ${
                index === active ? 'bg-accent/12' : 'hover:bg-sunken'
              }`}
            >
              <span className="font-mono text-[12px] text-text-tertiary">
                {account.accountNumber}
              </span>{' '}
              {account.name}
            </li>
          ))}
        </ul>
      )}
    </span>
  )
}

/**
 * One of the two amount cells. Right aligned, because a column of amounts is read as one.
 *
 * <p>An amount out of a posting template is marked as a **proposal**: it is written in, it is
 * freely overwritten, and it says of itself that it has to be checked. The first keystroke in
 * the cell takes the mark away and it becomes an ordinary amount.
 */
function AmountCell({
  column,
  width,
  label,
  value,
  disabled,
  suggested,
  focused,
  inGrid,
  onFocused,
  onChange,
}: {
  column: number
  width: string
  label: string
  value: string
  disabled: boolean
  /** Whether this amount came out of a template and is still nothing but a proposal. */
  suggested: boolean
  focused: boolean
  inGrid: () => boolean
  onFocused: () => void
  onChange: (next: string) => void
}) {
  const marked = suggested && value !== ''
  return (
    <span role="gridcell" aria-colindex={column + 1} className={`${width} min-w-0`}>
      <input
        aria-label={label}
        inputMode="decimal"
        value={value}
        disabled={disabled}
        data-suggested={marked ? 'true' : undefined}
        title={marked ? 'Vorschlag aus der Vorlage — bitte prüfen.' : undefined}
        tabIndex={focused ? 0 : -1}
        ref={(element) => {
          if (element && focused && inGrid()) element.focus()
        }}
        onFocus={onFocused}
        onChange={(event) => onChange(event.target.value)}
        className={`h-8 w-full rounded-[var(--radius-sm)] border bg-transparent px-2 text-right font-mono text-[13px] tabular-nums outline-none hover:border-line focus:border-accent ${
          marked
            ? 'border-dashed border-accent/60 text-accent-text'
            : 'border-transparent text-text-primary'
        }`}
      />
    </span>
  )
}

function clamp(value: number, max: number): number {
  if (value < 0) return 0
  return value > max ? max : value
}
