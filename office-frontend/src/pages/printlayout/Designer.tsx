import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ChevronLeft, Redo2, Undo2, X } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal, flushSync } from 'react-dom'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '../../components/Button'
import { ErrorNotice } from '../../components/Notice'
import { useLeaveGuard } from '../../components/useLeaveGuard'
import { useSubmitShortcut } from '../../components/useSubmitShortcut'
import { api, type ApiFile } from '../../lib/api'
import { originOf, type Origin } from '../../lib/origin'
import { onMac } from '../../lib/shortcuts'
import type { PrintLayout, PrintLayoutDefinition, PrintLayoutFields } from '../../lib/types'
import {
  dropElement,
  dropSection,
  duplicateSelection,
  existingSectionKey,
  nudgeSelection,
  removeSelection,
  type Snapshot,
} from '../../printlayout/commands'
import {
  defaultElementPosition,
  defaultSectionIndex,
  elementAt,
  moveSection,
  normalizeDefinition,
  refOf,
  repeatOf,
  updateElement,
  type ObjectKey,
} from '../../printlayout/definition'
import { designerReducer, initialDesignerState } from '../../printlayout/designerState'
import type { Located } from '../../printlayout/dropping'
import { canRedo, canUndo } from '../../printlayout/history'
import {
  elementFor,
  ghostSizeOf,
  sectionFor,
  type PaletteItem,
} from '../../printlayout/palette'
import { contentWidthOf, type PageView } from '../../printlayout/paper'
import { isTextEntry } from '../../printlayout/textEntry'
import { PX_PER_MM, roundToStep } from '../../printlayout/units'
import { hasErrors, validateDefinition } from '../../printlayout/validation'
import { useSamplePaymentPart } from '../../printlayout/usePrintLayouts'
import { Canvas } from './Canvas'
import { createDraftRegistry, DraftContext } from './drafts'
import { Inspector } from './Inspector'
import { Palette, type PaletteDragController, type PaletteTab } from './Palette'
import { PreviewDialog } from './PreviewDialog'
import type { PaletteDrag, SheetAction, SheetHandle } from './Sheet'
import { createStore, useStore, type Store } from './store'

/** Where the designer goes when it was opened without naming a screen to return to. */
const LIST: Origin = { from: '/druckvorlagen', label: 'Druckvorlagen' }

/** Below this width of the designer itself the two side panes become drawers, in rem. */
const WIDE_ENOUGH_REM = 68.75

/** How far the pointer has to travel before a press on a palette entry becomes a drag. */
const DRAG_THRESHOLD = 4

/** How long after a drag a click on the dragged entry is taken for the end of that drag. */
const CLICK_GUARD_MS = 300

const MAX_NAME_LENGTH = 60

type DesignerProps = {
  tenantId: number
  layout: PrintLayout
  catalogue: PrintLayoutFields
}

/**
 * The print form designer: the sheet in the middle, what can be put on it on the left, the
 * settings of whatever is selected on the right.
 *
 * <p>The form lives here as one value with its history. Everything else — the sheet, the
 * outline, the inspector — shows that value and hands back a changed one; nothing keeps a
 * copy. That is what makes undo, «ungespeichert» and the preview trivially right: they all
 * read the same form.
 */
export function Designer({ tenantId, layout, catalogue }: DesignerProps) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  // Reached from the list of forms, but just as often from a Belegart that prints on this
  // one. The way back follows the way in, so nobody lands on a list they never came from.
  const origin = originOf(useLocation().state, LIST)

  const [state, dispatch] = useReducer(designerReducer, layout.definition, (stored) =>
    initialDesignerState(normalizeDefinition(stored)),
  )
  const { definition, selection } = state.history.present

  const [name, setName] = useState(layout.name)
  const json = useMemo(() => JSON.stringify(definition), [definition])
  // The canvas changes the form by dragging, which fires no input event; so «ungespeichert»
  // compares with what was stored instead of listening for typing.
  const [saved, setSaved] = useState(() => ({ name: layout.name, json }))
  const dirty = name !== saved.name || json !== saved.json

  const [view, setView] = useState<PageView>('first')
  const [tab, setTab] = useState<PaletteTab>('elements')
  const [showPaymentPart, setShowPaymentPart] = useState(true)
  const [drawer, setDrawer] = useState<'palette' | 'inspector' | null>(null)
  const [carrying, setCarrying] = useState(false)
  const [shownPreview, setShownPreview] = useState<{ file: ApiFile; url: string } | null>(null)

  const root = useRef<HTMLDivElement>(null)
  const wide = useWideEnough(root)
  const sheet = useRef<SheetHandle>(null)
  const [paletteDrag] = useState(() => createStore<PaletteDrag | null>(null))
  const nameId = useId()

  const problems = useMemo(
    () => validateDefinition(definition, catalogue),
    [definition, catalogue],
  )
  const warnings = useMemo(() => {
    const marks = new Map<ObjectKey, string>()
    for (const problem of problems) {
      if (problem.target !== 'page' && !marks.has(problem.target)) {
        marks.set(problem.target, problem.message)
      }
    }
    return marks
  }, [problems])
  const errors = problems.filter((problem) => problem.severity === 'error')
  const nameMissing = name.trim() === ''

  const paymentPart = useSamplePaymentPart(tenantId, showPaymentPart)

  // --- changing the form ---------------------------------------------------------------

  const select = useCallback(
    (keys: ObjectKey[]) => dispatch({ type: 'select', selection: keys }),
    [],
  )
  const commit = useCallback(
    (outcome: Snapshot & { announcement?: string }, mergeKey?: string) =>
      dispatch({ type: 'commit', outcome, mergeKey, at: Date.now() }),
    [],
  )
  const run = useCallback(
    (
      command: (snapshot: Snapshot) => (Snapshot & { announcement?: string }) | null,
      mergeKey?: string,
    ) => dispatch({ type: 'run', command, mergeKey, at: Date.now() }),
    [],
  )
  const change = useCallback(
    (next: PrintLayoutDefinition, mergeKey?: string, announcement?: string) =>
      run((snapshot) => ({ definition: next, selection: snapshot.selection, announcement }), mergeKey),
    [run],
  )

  // --- what is still being typed --------------------------------------------------------

  const [drafts] = useState(createDraftRegistry)
  /**
   * Hands in whatever is typed into a length field but not committed yet, and renders the
   * result at once, so whatever comes next works on a form that contains it.
   *
   * @returns false when a field holds something it cannot take, which it then says itself
   */
  const handInDrafts = useCallback(
    (target: EventTarget | null = null): boolean => {
      let accepted = true
      flushSync(() => {
        accepted = drafts.flush(target)
      })
      return accepted
    },
    [drafts],
  )
  // A press anywhere outside the field ends the typing — before the press itself is handled.
  // The order matters: a click on another element selects it first and only then takes the
  // focus away, and a field that commits on losing the focus would write the number typed for
  // one element into the next. Taken in the capture phase on the document, this runs ahead of
  // every handler of the designer, and the handlers then see the form with the value in it.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      handInDrafts(event.target)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [handInDrafts])

  // What save and preview send is read from here after the drafts were handed in: by then
  // the functions of this render still hold the form from before.
  const latest = useRef({ definition, json, name })
  useLayoutEffect(() => {
    latest.current = { definition, json, name }
  })

  // After something was added from the palette the keyboard should be on it, so the arrow
  // keys move the new thing and not the list it came from. And after something was deleted
  // the keyboard goes to the sheet, instead of falling to the page with the button that went.
  const focusNext = useRef(false)
  const focusSheetNext = useRef(false)
  useEffect(() => {
    if (selection.length === 0 && focusSheetNext.current) {
      focusSheetNext.current = false
      sheet.current?.focusSheet()
    }
    if (selection.length !== 1) return
    sheet.current?.reveal(selection[0])
    if (!focusNext.current) return
    focusNext.current = false
    sheet.current?.focus(selection[0])
  }, [selection])

  const duplicate = useCallback(() => {
    focusNext.current = true
    run((snapshot) => duplicateSelection(snapshot, catalogue))
  }, [run, catalogue])

  const remove = useCallback(() => {
    focusSheetNext.current = true
    run((snapshot) => removeSelection(snapshot, catalogue))
  }, [run, catalogue])

  const insert = useCallback(
    (item: PaletteItem) => {
      focusNext.current = true
      if (item.kind === 'section') setView('first')
      setDrawer(null)
      run((snapshot) => {
        if (item.kind === 'element') {
          const element = elementFor(item)
          const at = defaultElementPosition(snapshot.definition, element)
          return dropElement(snapshot, element, { kind: 'page', ...at }, catalogue, view)
        }
        // A document has its positions once. A second click on the entry is far more likely
        // a search for the first table than a wish for a second.
        const existing = existingSectionKey(snapshot.definition, item.type, item.field)
        if (existing !== undefined) {
          return {
            definition: snapshot.definition,
            selection: [existing],
            announcement: `${item.label} ist schon im Inhalt und jetzt ausgewählt.`,
          }
        }
        const section = sectionFor(item)
        const chosen = snapshot.selection.length === 1 ? refOf(snapshot.selection[0]) : null
        const after =
          chosen?.kind === 'section'
            ? chosen.index
            : chosen?.kind === 'child'
              ? chosen.section
              : undefined
        return dropSection(snapshot, section, defaultSectionIndex(snapshot.definition, section, after))
      })
    },
    [run, catalogue, view],
  )

  const drop = useCallback(
    (item: PaletteItem, located: Located) => {
      focusNext.current = true
      run((snapshot) => {
        const { target } = located
        if (item.kind === 'section') {
          if (target.kind !== 'order') return null
          const existing = existingSectionKey(snapshot.definition, item.type, item.field)
          const from = existing === undefined ? null : refOf(existing)
          if (from !== null && from.kind === 'section') {
            // Dragging what is already there means «put it here».
            const to = target.index > from.index ? target.index - 1 : target.index
            const moved = moveSection(snapshot.definition, from.index, to)
            return {
              definition: moved.definition,
              selection: [moved.key],
              announcement: `${item.label} verschoben.`,
            }
          }
          return dropSection(snapshot, sectionFor(item), target.index)
        }
        if (target.kind === 'order') return null
        const element = elementFor(item)
        const grid = (value: number) => roundToStep(value, 0.5)
        // A page number counts pages and cannot live in the content: it is fixed wherever
        // it is dropped.
        if (target.kind === 'page' || element.type === 'PAGE_NUMBER') {
          const at = { kind: 'page' as const, x: grid(located.point.x), y: grid(located.point.y) }
          return dropElement(snapshot, element, at, catalogue, view)
        }
        const at =
          target.kind === 'free'
            ? { ...target, x: grid(target.x), y: grid(target.y) }
            : { ...target, x: grid(target.x) }
        return dropElement(snapshot, element, at, catalogue, view)
      })
    },
    [run, catalogue, view],
  )

  const moveSectionBy = useCallback(
    (index: number, direction: -1 | 1) =>
      run((snapshot) => {
        const moved = moveSection(snapshot.definition, index, index + direction)
        if (moved.definition === snapshot.definition) return null
        const place = (refOf(moved.key)?.index ?? 0) + 1
        return {
          definition: moved.definition,
          selection: [moved.key],
          announcement: `Jetzt an Stelle ${place} von ${snapshot.definition.flow.sections.length}.`,
        }
      }),
    [run],
  )

  const removeKey = useCallback(
    (key: ObjectKey) =>
      run((snapshot) => removeSelection({ ...snapshot, selection: [key] }, catalogue)),
    [run, catalogue],
  )

  const onAction = useCallback(
    (action: SheetAction, key: ObjectKey | null) => {
      if (action === 'view-first') return setView('first')
      if (action === 'duplicate') return duplicate()
      if (action === 'remove') return remove()
      if (key === null) return
      const repeat = action === 'repeat-every' ? 'EVERY_PAGE' : 'FIRST_PAGE'
      run((snapshot) => {
        const element = elementAt(snapshot.definition, key)
        if (element === undefined || repeatOf(element) === repeat) return null
        return {
          definition: updateElement(snapshot.definition, key, { repeat }),
          selection: snapshot.selection,
          announcement:
            repeat === 'EVERY_PAGE' ? 'Erscheint jetzt auf jeder Seite.' : 'Erscheint jetzt nur auf Seite 1.',
        }
      })
    },
    [run, duplicate, remove],
  )

  const selectFromList = useCallback(
    (keys: ObjectKey[]) => {
      // Something that prints on the first page only is not on the page shown otherwise.
      setView('first')
      setDrawer(null)
      select(keys)
    },
    [select],
  )

  // --- dragging from the palette -------------------------------------------------------

  const carried = useRef<{
    item: PaletteItem
    pointerId: number
    startX: number
    startY: number
    active: boolean
  } | null>(null)
  const clickGuardUntil = useRef(0)
  const drag = useMemo<PaletteDragController>(
    () => ({
      press: (item, event) => {
        carried.current = {
          item,
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          active: false,
        }
      },
      move: (event) => {
        const current = carried.current
        if (current === null || event.pointerId !== current.pointerId) return
        if (!current.active) {
          const far = Math.hypot(event.clientX - current.startX, event.clientY - current.startY)
          if (far < DRAG_THRESHOLD) return
          current.active = true
          event.currentTarget.setPointerCapture?.(event.pointerId)
          setCarrying(true)
        }
        const scale = sheet.current?.scale() ?? PX_PER_MM
        const size = ghostSizeOf(current.item, contentWidthOf(definition.page))
        paletteDrag.set({
          item: current.item,
          clientX: event.clientX,
          clientY: event.clientY,
          located:
            sheet.current?.locate(
              event.clientX,
              event.clientY,
              current.item.kind === 'section' ? 'section' : 'element',
              event.shiftKey,
            ) ?? null,
          ghostWidth: size.width * scale,
          ghostHeight: size.height * scale,
        })
      },
      release: (event) => {
        const current = carried.current
        if (current === null || event.pointerId !== current.pointerId) return
        const last = paletteDrag.get()
        carried.current = null
        paletteDrag.set(null)
        if (!current.active) return
        setCarrying(false)
        // The browser sends a click after this release; it is the end of the drag, not a wish
        // to insert a second one.
        clickGuardUntil.current = performance.now() + CLICK_GUARD_MS
        if (last?.located === undefined || last.located === null) return
        setDrawer(null)
        drop(current.item, last.located)
      },
      cancel: () => {
        carried.current = null
        paletteDrag.set(null)
        setCarrying(false)
      },
      consumeClick: () => {
        const guarded = performance.now() < clickGuardUntil.current
        clickGuardUntil.current = 0
        return guarded
      },
    }),
    [definition.page, paletteDrag, drop],
  )

  // --- saving and previewing -----------------------------------------------------------

  const save = useMutation({
    mutationFn: (payload: { name: string; definition: PrintLayoutDefinition; json: string }) =>
      api.put<PrintLayout>(`/api/tenants/${tenantId}/print-layouts/${layout.id}`, {
        name: payload.name,
        definition: payload.definition,
      }),
    onSuccess: (_, payload) => {
      setName(payload.name)
      setSaved({ name: payload.name, json: payload.json })
      dispatch({ type: 'announce', message: 'Gespeichert.' })
      void queryClient.invalidateQueries({ queryKey: ['print-layout', tenantId] })
      void queryClient.invalidateQueries({ queryKey: ['print-layouts', tenantId] })
    },
  })
  const canSave = !hasErrors(problems) && !nameMissing && !save.isPending

  /**
   * The form as it stands once every typed value is in it — or nothing, when a field holds a
   * value it cannot take or the form with it would be refused. Then the field or the strip
   * above the sheet says why, and neither save nor preview goes out with half a form.
   */
  const settledForm = () => {
    if (!handInDrafts()) {
      dispatch({ type: 'announce', message: 'Bitte zuerst die markierte Eingabe korrigieren.' })
      return null
    }
    const now = latest.current
    if (now.name.trim() === '' || hasErrors(validateDefinition(now.definition, catalogue))) {
      return null
    }
    return { name: now.name.trim(), definition: now.definition, json: now.json }
  }
  const submit = () => {
    const form = settledForm()
    if (form !== null) save.mutate(form)
  }

  const preview = useMutation({
    mutationFn: (form: { name: string; definition: PrintLayoutDefinition }) =>
      api.file(
        `/api/tenants/${tenantId}/print-layouts/preview?paymentPart=${showPaymentPart}`,
        { name: form.name, definition: form.definition },
      ),
    onSuccess: (file) =>
      setShownPreview({
        file,
        url: typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file.blob) : '',
      }),
  })
  const closePreview = () => {
    if (shownPreview !== null && shownPreview.url !== '') URL.revokeObjectURL(shownPreview.url)
    setShownPreview(null)
  }

  // --- the keyboard --------------------------------------------------------------------

  // Bound once and before the leave guard below, so Escape first lets go of a selection and
  // only an Escape with nothing selected leaves the designer. Listeners on one target run in
  // the order they were added; re-adding this one on every change of the selection would put
  // it behind the guard. So it stays, and reads what it needs through a ref.
  const onKey = useRef<(event: KeyboardEvent) => void>(() => {})
  useEffect(() => {
    onKey.current = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (document.querySelector('[role="dialog"]') !== null) return
      const target = event.target instanceof Element ? event.target : null
      // In a text field the keys belong to the text. On a checkbox, a radio button or a
      // button they do not: Ctrl+Z with the focus on «Fett» undoes the form.
      if (isTextEntry(target)) return

      const modifier = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()
      const take = () => event.preventDefault()

      if (modifier && !event.altKey && key === 'z') {
        take()
        return dispatch({ type: event.shiftKey ? 'redo' : 'undo' })
      }
      if (modifier && !event.altKey && !event.shiftKey && key === 'y') {
        take()
        return dispatch({ type: 'redo' })
      }
      if (event.key === 'Escape' && !modifier && !event.shiftKey && !event.altKey) {
        if (selection.length === 0) return
        take()
        return select([])
      }

      // Everything below belongs to the sheet. With the focus on a button of the palette or
      // a switch of the inspector, the arrow keys and Delete are that control's own.
      const onSheet =
        target === null ||
        target === document.body ||
        (target.closest('[data-canvas]') !== null && target.closest('[data-flow-top]') === null)
      if (!onSheet) return

      if (modifier && !event.shiftKey && !event.altKey) {
        if (key === 'd') {
          take()
          return duplicate()
        }
        if (key === 'c' && selection.length > 0) {
          take()
          return dispatch({ type: 'copy' })
        }
        if (key === 'v') {
          take()
          focusNext.current = true
          return dispatch({ type: 'paste', at: Date.now() })
        }
        return
      }
      if (modifier) return

      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selection.length === 0) return
        take()
        return remove()
      }
      const direction = ARROWS[event.key]
      if (direction === undefined || selection.length === 0) return
      take()
      const step = event.altKey ? 0.1 : event.shiftKey ? 5 : 0.5
      run(
        (snapshot) =>
          nudgeSelection(snapshot, direction.x * step, direction.y * step, catalogue),
        'nudge',
      )
    }
  }, [selection, catalogue, run, select, duplicate, remove])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => onKey.current(event)
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  useSubmitShortcut(canSave ? submit : undefined)
  const { onBack, question } = useLeaveGuard(dirty, () => void navigate(origin.from))

  // --- the screen ----------------------------------------------------------------------

  const palette = (
    <Palette
      tab={tab}
      onTabChange={setTab}
      definition={definition}
      selection={selection}
      catalogue={catalogue}
      view={view}
      warnings={warnings}
      drag={drag}
      onInsert={insert}
      onSelect={selectFromList}
      onMoveSection={moveSectionBy}
      onRemove={removeKey}
    />
  )
  const inspector = (
    <Inspector
      definition={definition}
      selection={selection}
      catalogue={catalogue}
      problems={problems}
      sheet={sheet}
      onChange={change}
      onRun={run}
      onSelect={selectFromList}
      onMoveSection={moveSectionBy}
      onDuplicate={duplicate}
      onRemove={remove}
    />
  )
  const usedBy = (layout.usedBy ?? []).map((type) => type.name)
  const undoKeys = onMac() ? '⌘Z' : 'Strg+Z'
  const redoKeys = onMac() ? '⌘⇧Z' : 'Strg+Y'

  return (
    <DraftContext.Provider value={drafts}>
    <div ref={root} className="flex min-h-0 flex-1 basis-0 flex-col overflow-hidden">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line-subtle px-4 py-2.5">
        <div className="min-w-[min(100%,16rem)] flex-1">
          <Link
            to={origin.from}
            onClick={onBack}
            className="inline-flex items-center gap-1 text-small text-text-secondary transition-colors hover:text-text-primary"
          >
            <ChevronLeft size={14} aria-hidden />
            {origin.label}
          </Link>
          <h1 className="sr-only">Druckvorlage {layout.name} gestalten</h1>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <label htmlFor={nameId} className="sr-only">
              Bezeichnung der Druckvorlage
            </label>
            <input
              id={nameId}
              value={name}
              maxLength={MAX_NAME_LENGTH}
              onChange={(event) => setName(event.target.value)}
              aria-invalid={nameMissing || undefined}
              autoComplete="off"
              className={`-ml-1.5 w-[22rem] min-w-0 max-w-full rounded-[var(--radius-sm)] border bg-transparent px-1.5 py-0.5 text-title font-semibold tracking-tight outline-none transition-colors focus:bg-surface ${
                nameMissing
                  ? 'border-danger'
                  : 'border-transparent hover:border-line focus:border-accent'
              }`}
            />
            <span className="font-mono text-small text-text-secondary">{layout.code}</span>
            {usedBy.length > 0 && (
              <span className="text-small text-text-tertiary">
                Gedruckt von: {usedBy.join(', ')}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-small text-text-tertiary" aria-live="polite">
            {dirty ? 'Nicht gespeichert' : 'Gespeichert'}
          </span>
          <HeaderIconButton
            label={`Rückgängig (${undoKeys})`}
            disabled={!canUndo(state.history)}
            onClick={() => dispatch({ type: 'undo' })}
          >
            <Undo2 size={16} aria-hidden />
          </HeaderIconButton>
          <HeaderIconButton
            label={`Wiederholen (${redoKeys})`}
            disabled={!canRedo(state.history)}
            onClick={() => dispatch({ type: 'redo' })}
          >
            <Redo2 size={16} aria-hidden />
          </HeaderIconButton>
          <Button
            variant="secondary"
            onClick={() => {
              const form = settledForm()
              if (form !== null) preview.mutate(form)
            }}
            busy={preview.isPending}
            disabled={errors.length > 0}
          >
            Vorschau (PDF)
          </Button>
          <Button onClick={submit} busy={save.isPending} disabled={!canSave} shortcut>
            Speichern
          </Button>
        </div>
      </header>

      {(errors.length > 0 || nameMissing || save.error !== null || preview.error !== null) && (
        <div className="grid grid-cols-1 gap-2 border-b border-line-subtle px-4 py-2.5">
          {nameMissing && (
            <ErrorNotice error={new Error('Eine Druckvorlage braucht eine Bezeichnung.')} />
          )}
          {errors.length > 0 && (
            <div
              role="alert"
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius-md)] border border-danger/40 bg-danger/8 px-4 py-2.5 text-body"
            >
              <AlertTriangle size={16} aria-hidden className="shrink-0 text-danger" />
              <span className="min-w-0 flex-1">
                <span className="font-medium">Speichern ist so nicht möglich. </span>
                {errors[0].message}
                {errors.length > 1 && ` (und ${errors.length - 1} weitere)`}
              </span>
              <button
                type="button"
                onClick={() => {
                  const where = errors[0].target
                  selectFromList(where === 'page' ? [] : [where])
                  setDrawer(wide ? null : 'inspector')
                }}
                className="shrink-0 rounded-[var(--radius-sm)] border border-line bg-surface px-2.5 py-1 text-small font-medium transition-colors hover:bg-sunken"
              >
                Anzeigen
              </button>
            </div>
          )}
          {save.error !== null && <ErrorNotice error={save.error} />}
          {preview.error !== null && <ErrorNotice error={preview.error} />}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {wide && (
          <aside
            aria-label="Elemente, Felder und Aufbau"
            className="w-pane shrink-0 border-r border-line-subtle bg-surface"
          >
            {palette}
          </aside>
        )}
        <Canvas
          sheet={sheet}
          definition={definition}
          selection={selection}
          catalogue={catalogue}
          problems={problems}
          view={view}
          onViewChange={setView}
          showPaymentPart={showPaymentPart}
          onShowPaymentPartChange={setShowPaymentPart}
          paymentPartUrl={paymentPart.url}
          paletteDrag={paletteDrag}
          message={state.message}
          messageId={state.messageId}
          onSelect={select}
          onCommit={commit}
          onAction={onAction}
          onOpenPalette={wide ? undefined : () => setDrawer('palette')}
          onOpenInspector={wide ? undefined : () => setDrawer('inspector')}
        />
        {wide && (
          <aside
            aria-label="Einstellungen"
            className="w-inspector shrink-0 overflow-y-auto border-l border-line-subtle bg-surface"
          >
            {inspector}
          </aside>
        )}
      </div>

      {!wide && (
        <>
          <Drawer
            side="left"
            title="Elemente, Felder und Aufbau"
            open={drawer === 'palette'}
            // While an entry is carried to the sheet the drawer steps aside but stays in the
            // tree: the entry holds the pointer, and removing it would drop the drag.
            hidden={carrying}
            onClose={() => setDrawer(null)}
          >
            {palette}
          </Drawer>
          <Drawer
            side="right"
            title="Einstellungen"
            open={drawer === 'inspector'}
            hidden={false}
            onClose={() => setDrawer(null)}
          >
            {inspector}
          </Drawer>
        </>
      )}

      <DragGhost store={paletteDrag} />
      <PreviewDialog shown={shownPreview} onClose={closePreview} />
      {question}
    </div>
    </DraftContext.Provider>
  )
}

const ARROWS: Record<string, { x: number; y: number } | undefined> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
}

/**
 * Whether the designer has room for three panes side by side.
 *
 * <p>Measured on the designer itself, not on the window: how much of the window it gets
 * depends on whether the sidebar of the application is folded.
 *
 * @param root the outermost element of the designer
 * @returns true while it is wide enough, and until it has been measured
 */
function useWideEnough(root: React.RefObject<HTMLDivElement | null>): boolean {
  const [wide, setWide] = useState(true)
  useEffect(() => {
    const node = root.current
    if (node === null || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
      setWide(node.clientWidth >= WIDE_ENOUGH_REM * rem)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [root])
  return wide
}

function HeaderIconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-button place-items-center rounded-[var(--radius-md)] text-text-secondary transition-colors hover:bg-sunken hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}

/**
 * A side pane as a drawer over the sheet, for a screen too narrow for three panes.
 *
 * <p>Slides in from its side, closes on the backdrop, on its button and on Escape — which it
 * takes for itself, so the same press does not also deselect or leave the designer.
 */
function Drawer({
  side,
  title,
  open,
  hidden,
  onClose,
  children,
}: {
  side: 'left' | 'right'
  title: string
  open: boolean
  /** Invisible and untouchable, but still in the tree. */
  hidden: boolean
  onClose: () => void
  children: ReactNode
}) {
  const still = useReducedMotion()

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (document.querySelector('[role="dialog"]') !== null) return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className={`fixed inset-0 z-40 ${hidden ? 'pointer-events-none opacity-0' : ''}`}>
      <button
        type="button"
        aria-label={`${title} schliessen`}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink/40"
      />
      <motion.aside
        aria-label={title}
        initial={{ x: side === 'left' ? '-100%' : '100%' }}
        animate={{ x: 0 }}
        transition={{ duration: still === true ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] }}
        className={`absolute inset-y-0 flex w-[min(22rem,90vw)] flex-col bg-surface shadow-card ${
          side === 'left' ? 'left-0 border-r border-line' : 'right-0 border-l border-line'
        }`}
      >
        <div className="flex items-center justify-between border-b border-line-subtle px-3 py-2">
          <span className="text-control font-semibold">{title}</span>
          <button
            type="button"
            aria-label="Schliessen"
            onClick={onClose}
            className="grid size-11 place-items-center rounded-[var(--radius-sm)] text-text-tertiary transition-colors hover:bg-sunken hover:text-text-primary"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </motion.aside>
    </div>
  )
}

/**
 * The outline that follows the pointer while a palette entry is carried: the real size of
 * what will land, at the zoom of the sheet.
 */
function DragGhost({ store }: { store: Store<PaletteDrag | null> }) {
  const drag = useStore(store)
  if (drag === null) return null
  return createPortal(
    <div
      aria-hidden
      className={`pointer-events-none fixed z-[70] overflow-hidden rounded-[var(--radius-xs)] border border-dashed border-sheet-selection bg-sheet-selection/10 ${
        drag.located === null ? 'opacity-50' : ''
      }`}
      style={{
        left: drag.clientX,
        top: drag.clientY,
        width: drag.ghostWidth,
        height: drag.ghostHeight,
      }}
    >
      <span className="absolute left-0 top-0 whitespace-nowrap rounded-br-[var(--radius-xs)] bg-sheet-selection px-1.5 py-0.5 text-caption text-on-accent">
        {drag.item.label}
      </span>
    </div>,
    document.body,
  )
}
