import { Bold, Italic, List, ListOrdered } from 'lucide-react'
import {
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { editorLines, writeLines, type LiteLine } from '../lib/markdownLite'
import {
  autoList,
  caretAt,
  carries,
  comparePoints,
  endOf,
  insertText,
  isCaret,
  listed,
  marksAt,
  NO_MARKS,
  spanOf,
  splitBlock,
  toggleList,
  toggleMark,
  unlist,
  type Change,
  type Mark,
  type Marks,
  type Point,
  type Span,
} from '../lib/richTextModel'
import { Field } from './Field'
import { describedBy } from './fieldDescription'
import { readBlocks, readSelection, renderBlocks, selectSpan, type Boundary } from './richTextDom'

/** The rows the box grows to before it scrolls. */
const MAX_ROWS = 10

/** How many steps «Rückgängig» goes back. */
const HISTORY_STEPS = 100

/** Typing with pauses shorter than this goes back in one step. */
const TYPING_PAUSE_MS = 1000

/** The lines and the selection at one moment, to go back to. */
type Snapshot = { blocks: LiteLine[]; selection: Span }

/** Which buttons of the bar show as pressed. */
type Pressed = { bold: boolean; italic: boolean; bullet: boolean; number: boolean }

const NOTHING_PRESSED: Pressed = { bold: false, italic: false, bullet: false, number: false }

/**
 * A text field for a text with a little formatting — bold, italic, a list and a numbered list —
 * that shows it as it will read: a bold word stands bold, a list has its points, and no marker is
 * ever seen. Stored is the small Markdown of `lib/markdownLite`, never HTML (frontend ADR-0091).
 *
 * <p>A box of several lines with a bar on top: the four formats, pressed where the selection
 * carries them, and a counter once the text nears its limit. The keyboard does the same: Ctrl+B
 * and Ctrl+I, Ctrl+Shift+8 and Ctrl+Shift+7 for the lists, «- » or «1. » at the start of a line
 * starts one. The buttons take no tab stop, so Tab goes from the field before straight into the
 * text. Pasted text comes in plain; «Rückgängig» and «Wiederholen» are the field's own.
 *
 * <p>Shift+Enter starts a new line, going on with a list. Enter does the same, or with
 * `enterKey="form"` it is left to the form, so a line of the time tracking saves from here as from
 * every other field (frontend ADR-0082).
 *
 * @param maxLength the most characters the stored text may have, its markers included
 * @param rows the lines the box is high when empty; it grows up to ten
 * @param enterKey what Enter does: a new line, or left to the form
 */
export function RichTextField({
  label,
  value,
  onChange,
  maxLength,
  placeholder,
  error,
  hint,
  tooltip,
  rows = 3,
  enterKey = 'newLine',
  className,
}: {
  label: string
  value: string
  onChange: (next: string) => void
  maxLength: number
  placeholder?: string
  error?: string
  hint?: ReactNode
  tooltip?: ReactNode
  rows?: number
  enterKey?: 'newLine' | 'form'
  className?: string
}) {
  const id = useId()
  const hintId = `${id}-hint`
  const tooltipId = `${id}-tooltip`
  const labelId = `${id}-label`
  const box = useRef<HTMLDivElement>(null)
  // The lines as drawn, and the text last handed out — a value that comes back unchanged is
  // not drawn again, which would throw the caret to the start.
  const lines = useRef<LiteLine[]>(editorLines(''))
  const written = useRef<string | null>(null)
  // The state before an edit the browser makes itself, for «Rückgängig» and the limit.
  const prior = useRef<Snapshot | null>(null)
  // A mark set at a caret, for what is typed there next.
  const pending = useRef<{ at: Point; marks: Marks } | null>(null)
  // Steps back and forth; `typedTo` is where the last typing left the caret, so typing on from
  // there goes back in one step and anything else in a step of its own.
  const history = useRef(freshHistory())
  const [focused, setFocused] = useState(false)
  const [pressed, setPressed] = useState<Pressed>(NOTHING_PRESSED)

  useLayoutEffect(() => {
    const root = box.current
    if (root === null || value === written.current) return
    const next = editorLines(value)
    lines.current = next
    written.current = value
    history.current = freshHistory()
    pending.current = null
    renderBlocks(root, next, placeholder)
  }, [value, placeholder])

  const selection = (): Span => {
    const root = box.current
    return (root === null ? null : readSelection(root)) ?? caretAt(endOf(lines.current))
  }

  const snapshot = (): Snapshot => ({ blocks: lines.current, selection: selection() })

  const draw = (blocks: LiteLine[], span: Span) => {
    const root = box.current
    if (root === null) return
    renderBlocks(root, blocks, placeholder)
    if (root.ownerDocument.activeElement === root) selectSpan(root, span)
  }

  const press = (span: Span) => {
    const marks = pending.current?.marks
    setPressed({
      bold: marks?.bold ?? carries(lines.current, span, 'bold'),
      italic: marks?.italic ?? carries(lines.current, span, 'italic'),
      bullet: listed(lines.current, span, 'bullet'),
      number: listed(lines.current, span, 'number'),
    })
  }

  const emit = (blocks: LiteLine[]) => {
    const text = writeLines(blocks)
    if (text === written.current) return
    written.current = text
    onChange(text)
  }

  const remember = (before: Snapshot, typing: boolean, after: Span) => {
    const kept = history.current
    const now = Date.now()
    const goesOn =
      typing &&
      kept.typedTo !== null &&
      now - kept.typedAt < TYPING_PAUSE_MS &&
      isCaret(before.selection) &&
      comparePoints(before.selection.start, kept.typedTo) === 0
    if (!goesOn) kept.past = [...kept.past, before].slice(-HISTORY_STEPS)
    kept.future = []
    kept.typedTo = typing ? after.end : null
    kept.typedAt = now
  }

  /**
   * Takes a step: a text over the limit is not taken, and the box shows what stood before.
   *
   * @param typing whether the step typed characters, which «Rückgängig» takes back together
   */
  const commit = ({ blocks, selection: span }: Change, before: Snapshot, typing: boolean) => {
    if (writeLines(blocks).length > maxLength) {
      draw(before.blocks, before.selection)
      return
    }
    remember(before, typing, span)
    lines.current = blocks
    pending.current = null
    draw(blocks, span)
    press(span)
    emit(blocks)
  }

  const travel = (back: boolean) => {
    const kept = history.current
    const target = (back ? kept.past : kept.future).at(-1)
    if (target === undefined) return
    const now = snapshot()
    if (back) {
      kept.past = kept.past.slice(0, -1)
      kept.future = [...kept.future, now]
    } else {
      kept.future = kept.future.slice(0, -1)
      kept.past = [...kept.past, now]
    }
    kept.typedTo = null
    lines.current = target.blocks
    pending.current = null
    draw(target.blocks, target.selection)
    press(target.selection)
    emit(target.blocks)
  }

  const mark = (which: Mark) => {
    const span = selection()
    if (!isCaret(span)) {
      commit(toggleMark(lines.current, span, which), snapshot(), false)
      return
    }
    const here = pending.current
    const base =
      here !== null && comparePoints(here.at, span.start) === 0
        ? here.marks
        : marksAt(lines.current, span.start)
    pending.current = { at: span.start, marks: { ...base, [which]: !base[which] } }
    press(span)
  }

  const list = (kind: 'bullet' | 'number') =>
    commit(toggleList(lines.current, selection(), kind), snapshot(), false)

  const newLine = () => commit(splitBlock(lines.current, selection()), snapshot(), false)

  /** Inserts as much of the text as the limit leaves room for. */
  const insert = (text: string, marks: Marks, typing: boolean) => {
    const span = selection()
    const before = snapshot()
    const fits = (part: string) =>
      writeLines(insertText(lines.current, span, part, marks).blocks).length <= maxLength
    let length = text.length
    if (!fits(text)) {
      let low = 0
      let high = text.length - 1
      while (low < high) {
        const middle = Math.ceil((low + high) / 2)
        if (fits(text.slice(0, middle))) low = middle
        else high = middle - 1
      }
      length = low
    }
    commit(insertText(lines.current, span, text.slice(0, length), marks), before, typing)
  }

  /**
   * Reads back what the browser wrote, and draws it again the way the editor draws it.
   *
   * @param inputType what the browser did, from its `input` event; empty where it does not say
   * @param data the characters it typed, if it typed
   */
  const sync = (inputType: string, data: string | null) => {
    const typing = inputType === 'insertText' || inputType === 'insertCompositionText'
    const root = box.current
    if (root === null) return
    const chosen = root.ownerDocument.getSelection()
    const ends: Boundary[] =
      chosen?.anchorNode && chosen.focusNode && root.contains(chosen.anchorNode) && root.contains(chosen.focusNode)
        ? [
            { node: chosen.anchorNode, offset: chosen.anchorOffset },
            { node: chosen.focusNode, offset: chosen.focusOffset },
          ]
        : []
    const read = readBlocks(root, ends)
    let change: Change = {
      blocks: read.blocks,
      selection: ends.length === 2 ? spanOf(read.points[0], read.points[1]) : caretAt(endOf(read.blocks)),
    }
    if (inputType === 'insertText' && data === ' ' && isCaret(change.selection)) {
      change = autoList(change.blocks, change.selection.start) ?? change
    }
    const before = prior.current ?? { blocks: lines.current, selection: change.selection }
    prior.current = null
    commit(change, before, typing)
  }

  const onBeforeInput = useEffectEvent((event: InputEvent) => {
    switch (event.inputType) {
      case 'historyUndo':
        event.preventDefault()
        travel(true)
        return
      case 'historyRedo':
        event.preventDefault()
        travel(false)
        return
      case 'insertParagraph':
      case 'insertLineBreak':
        event.preventDefault()
        newLine()
        return
      case 'insertFromDrop':
      case 'deleteByDrag':
        event.preventDefault()
        return
    }
    if (event.inputType.startsWith('format')) {
      // Underline, strike-through, colours: the text keeps only bold and italic.
      event.preventDefault()
      if (event.inputType === 'formatBold') mark('bold')
      if (event.inputType === 'formatItalic') mark('italic')
      return
    }
    const here = pending.current
    if (event.inputType === 'insertText' && event.data && here !== null) {
      const span = selection()
      if (isCaret(span) && comparePoints(span.start, here.at) === 0) {
        event.preventDefault()
        insert(event.data, here.marks, true)
        return
      }
    }
    prior.current = snapshot()
  })

  const onSelectionChange = useEffectEvent(() => {
    const root = box.current
    if (root === null || root.ownerDocument.activeElement !== root) return
    const span = selection()
    const here = pending.current
    if (here !== null && !(isCaret(span) && comparePoints(here.at, span.start) === 0)) {
      pending.current = null
    }
    press(span)
  })

  useEffect(() => {
    const root = box.current
    if (root === null) return
    const beforeInput = (event: Event) => onBeforeInput(event as InputEvent)
    const selectionChange = () => onSelectionChange()
    root.addEventListener('beforeinput', beforeInput)
    root.ownerDocument.addEventListener('selectionchange', selectionChange)
    return () => {
      root.removeEventListener('beforeinput', beforeInput)
      root.ownerDocument.removeEventListener('selectionchange', selectionChange)
    }
  }, [])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const command = event.ctrlKey || event.metaKey
    if (command && !event.altKey) {
      const key = event.key.toLowerCase()
      const shortcut = shortcutOf(key, event.code, event.shiftKey)
      if (shortcut === null) return
      event.preventDefault()
      if (shortcut === 'bold' || shortcut === 'italic') mark(shortcut)
      else if (shortcut === 'bullet' || shortcut === 'number') list(shortcut)
      else if (shortcut === 'undo') travel(true)
      else if (shortcut === 'redo') travel(false)
      return
    }
    if (event.key === 'Enter' && !event.altKey) {
      if (event.nativeEvent.isComposing) return
      // Left to the form, which saves from here as from any other field.
      if (!event.shiftKey && enterKey === 'form') return
      event.preventDefault()
      newLine()
      return
    }
    if (event.key === 'Backspace' && !event.shiftKey && !event.altKey) {
      const span = selection()
      const line = lines.current[span.start.block]
      if (isCaret(span) && span.start.offset === 0 && line.kind !== 'text') {
        // At the start of an entry the list goes first; the next press joins the lines.
        event.preventDefault()
        commit(unlist(lines.current, span.start), snapshot(), false)
      }
    }
  }

  const onInput = (event: FormEvent<HTMLDivElement>) => {
    const typed = event.nativeEvent as InputEvent
    if (typed.isComposing) return
    sync(typed.inputType ?? '', typed.data ?? null)
  }

  const onPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    // Plain text only: what a page or a word processor puts on the clipboard as HTML stays out.
    event.preventDefault()
    const text = event.clipboardData.getData('text/plain')
    if (text !== '') insert(text, NO_MARKS, false)
  }

  const nearLimit = value.length >= maxLength * 0.8

  return (
    <Field
      label={label}
      htmlFor={id}
      labelId={labelId}
      onLabelClick={() => box.current?.focus()}
      hint={hint}
      hintId={hintId}
      tooltipId={tooltipId}
      focused={focused}
      error={error}
      tooltip={tooltip}
      className={className}
    >
      <div className="flex w-full min-w-0 flex-col self-stretch">
        <div
          role="toolbar"
          aria-label={`${label} formatieren`}
          aria-controls={id}
          className="flex items-center gap-0.5 border-b border-line-subtle px-1.5 py-1"
        >
          <FormatButton label="Fett" keys="Control+B" title="Fett (Strg+B)" pressed={pressed.bold} onClick={() => mark('bold')}>
            <Bold size={14} aria-hidden />
          </FormatButton>
          <FormatButton label="Kursiv" keys="Control+I" title="Kursiv (Strg+I)" pressed={pressed.italic} onClick={() => mark('italic')}>
            <Italic size={14} aria-hidden />
          </FormatButton>
          <span aria-hidden className="mx-1 h-4 w-px bg-line-subtle" />
          <FormatButton
            label="Aufzählung"
            keys="Control+Shift+8"
            title="Aufzählung (Strg+Umschalt+8)"
            pressed={pressed.bullet}
            onClick={() => list('bullet')}
          >
            <List size={14} aria-hidden />
          </FormatButton>
          <FormatButton
            label="Nummerierte Liste"
            keys="Control+Shift+7"
            title="Nummerierte Liste (Strg+Umschalt+7)"
            pressed={pressed.number}
            onClick={() => list('number')}
          >
            <ListOrdered size={14} aria-hidden />
          </FormatButton>
          {nearLimit && (
            <span className="ml-auto pr-1 text-caption tabular-nums text-text-tertiary">
              {value.length} / {maxLength}
            </span>
          )}
        </div>
        <div
          ref={box}
          id={id}
          role="textbox"
          aria-multiline="true"
          aria-labelledby={labelId}
          aria-placeholder={placeholder}
          aria-invalid={error !== undefined || undefined}
          aria-describedby={describedBy(hintId, tooltipId, { hint, error, tooltip })}
          contentEditable
          suppressContentEditableWarning
          onKeyDown={onKeyDown}
          onInput={onInput}
          onCompositionEnd={() => sync('insertCompositionText', null)}
          onPaste={onPaste}
          onDrop={(event) => event.preventDefault()}
          onFocus={() => {
            setFocused(true)
            press(selection())
          }}
          onBlur={() => {
            setFocused(false)
            pending.current = null
          }}
          style={{
            minHeight: `calc(${rows} * 1.5rem + 1rem)`,
            maxHeight: `calc(${MAX_ROWS} * 1.5rem + 1rem)`,
          }}
          className="rich-text w-full overflow-y-auto whitespace-pre-wrap break-words px-3 py-2 text-control leading-6 text-text-primary outline-none"
        />
      </div>
    </Field>
  )
}

/** No step to go back to, and no typing to go on with. */
function freshHistory() {
  return { past: [] as Snapshot[], future: [] as Snapshot[], typedTo: null as Point | null, typedAt: 0 }
}

type Shortcut = Mark | 'bullet' | 'number' | 'undo' | 'redo' | 'swallow'

/**
 * What a key with Ctrl or Cmd does in the box. The lists go by the key's place, not its
 * character: Shift+8 is «(» on a Swiss keyboard and «*» on an American one.
 *
 * @returns the step, or `null` for a key the box leaves to the browser
 */
function shortcutOf(key: string, code: string, shift: boolean): Shortcut | null {
  if (!shift && key === 'b') return 'bold'
  if (!shift && key === 'i') return 'italic'
  // Underline is no format of the text; the browser would set it all the same.
  if (!shift && key === 'u') return 'swallow'
  if (!shift && key === 'z') return 'undo'
  if ((shift && key === 'z') || (!shift && key === 'y')) return 'redo'
  if (shift && code === 'Digit8') return 'bullet'
  if (shift && code === 'Digit7') return 'number'
  return null
}

/** A button of the bar; it keeps the selection in the text, which a click would otherwise drop. */
function FormatButton({
  label,
  keys,
  title,
  pressed,
  onClick,
  children,
}: {
  label: string
  keys: string
  title: string
  pressed: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      aria-keyshortcuts={keys}
      aria-pressed={pressed}
      title={title}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`grid size-icon-button place-items-center rounded-[var(--radius-sm)] transition-colors hover:bg-sunken hover:text-text-primary ${
        pressed ? 'bg-sunken text-text-primary' : 'text-text-tertiary'
      }`}
    >
      {children}
    </button>
  )
}
