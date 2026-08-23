import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useParams } from 'react-router-dom'
import { Button } from '../components/Button'
import { useSubmitShortcut } from '../components/useSubmitShortcut'
import { ErrorNotice, LoadingBlock } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { TextField } from '../components/TextField'
import { RequireTenant } from '../layout/RequireTenant'
import { api } from '../lib/api'
import { showFile } from '../lib/files'
import { originOf, type Origin } from '../lib/origin'
import type { LayoutBlockType, PrintLayout, PrintLayoutDefinition } from '../lib/types'
import {
  BLOCK_LABELS,
  DEFAULT_PAGE,
  isPlaced,
  newBlock,
  pageProblemOf,
  withAddedBlock,
  withBlock,
  withMovedBodyBlock,
  withoutBlock,
  type Band,
} from '../printlayout/layout'
import { usePrintoutFields } from '../printlayout/usePrintLayouts'
import { BlockProperties } from './printlayout/BlockProperties'
import { DesignCanvas } from './printlayout/DesignCanvas'

/** Where the designer goes when it was opened without naming a screen to return to. */
const LIST: Origin = { from: '/druckvorlagen', label: 'Druckvorlagen' }

/** Blocks that are dragged onto the head or the foot. */
const PLACED_TYPES: LayoutBlockType[] = ['TEXT', 'FIELD', 'ADDRESS', 'IMAGE', 'LINE']

/** Blocks that flow in the body, in the order they were added. */
const FLOWING_TYPES: LayoutBlockType[] = [
  'DOCUMENT_TEXT',
  'POSITIONS',
  'VAT_SUMMARY',
  'TOTALS',
  'PAYMENT_TERMS',
  'DISCOUNT_STAGES',
]

/** One form: what it is called, and where every block on it sits. */
export function PrintLayoutPage() {
  return (
    <RequireTenant permission="PRINT_LAYOUT_WRITE">
      {(tenantId) => <LayoutLoader tenantId={tenantId} />}
    </RequireTenant>
  )
}

function LayoutLoader({ tenantId }: { tenantId: number }) {
  const { id } = useParams()

  const layout = useQuery({
    queryKey: ['print-layout', tenantId, id],
    queryFn: () => api.get<PrintLayout>(`/api/tenants/${tenantId}/print-layouts/${id}`),
  })

  if (layout.isPending) return <LoadingBlock label="Druckvorlage wird geladen" />
  if (layout.error) {
    return (
      <div className="p-8">
        <ErrorNotice error={layout.error} />
      </div>
    )
  }
  return <Designer tenantId={tenantId} layout={layout.data} />
}

function Designer({ tenantId, layout }: { tenantId: number; layout: PrintLayout }) {
  const queryClient = useQueryClient()
  const catalogue = usePrintoutFields(tenantId)
  // Reached from the list of forms, but just as often from a Belegart that prints on this
  // one. The way back follows the way in, so nobody lands on a list they never came from.
  const origin = originOf(useLocation().state, LIST)

  const [name, setName] = useState(layout.name)
  const [definition, setDefinition] = useState<PrintLayoutDefinition>(
    layout.definition ?? { page: DEFAULT_PAGE, header: [], body: [], footer: [] },
  )
  const [selection, setSelection] = useState<{ band: Band; index: number } | null>(null)
  const [target, setTarget] = useState<Band>('header')

  const problem = pageProblemOf(definition.page)

  const save = useMutation({
    mutationFn: () =>
      api.put<PrintLayout>(`/api/tenants/${tenantId}/print-layouts/${layout.id}`, {
        name: name.trim(),
        definition,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['print-layout', tenantId] })
      void queryClient.invalidateQueries({ queryKey: ['print-layouts', tenantId] })
    },
  })

  const preview = useMutation({
    mutationFn: () =>
      api.file(`/api/tenants/${tenantId}/print-layouts/preview`, {
        name: name.trim(),
        definition,
      }),
    onSuccess: showFile,
  })

  const add = (type: LayoutBlockType) => {
    const band: Band = isPlaced(type) ? target : 'body'
    const next = withAddedBlock(definition, band, newBlock(type, { x: 5, y: 5 }))
    setDefinition(next)
    setSelection({ band, index: next[band].length - 1 })
  }

  const selected =
    selection === null ? undefined : definition[selection.band][selection.index]


  // Ctrl+S and Ctrl+Enter do what the primary button does, so a mask can be filled in
  // and finished without reaching for the mouse.
  useSubmitShortcut(problem === undefined && !save.isPending ? () => save.mutate() : undefined)

  return (
    <>
      <PageHeader
        title={layout.name}
        back={{ to: origin.from, label: origin.label }}
        subtitle={
          <span className="font-mono text-[12px] text-text-secondary">{layout.code}</span>
        }
      >
        <Button variant="secondary" onClick={() => preview.mutate()} busy={preview.isPending}>
          Vorschau
        </Button>
        <Button onClick={() => save.mutate()} busy={save.isPending} disabled={problem !== undefined} shortcut>
          Speichern
        </Button>
      </PageHeader>

      <div className="grid gap-6 px-8 pb-12">
        {problem !== undefined && (
          <p
            role="alert"
            className="rounded-[var(--radius-md)] border border-danger/40 bg-danger/8 px-4 py-3 text-[13px] text-text-primary"
          >
            {problem}
          </p>
        )}
        {save.error !== null && <ErrorNotice error={save.error} />}
        {preview.error !== null && <ErrorNotice error={preview.error} />}

        <div className="flex flex-wrap items-start gap-6">
          <div className="grid w-[260px] shrink-0 gap-6">
            <Panel title="Vorlage">
              <TextField
                label="Bezeichnung"
                value={name}
                maxLength={60}
                onChange={(event) => setName(event.target.value)}
              />
            </Panel>

            <Panel title="Bausteine" description="Erst das Band wählen, dann den Baustein.">
              <div className="grid gap-3">
                <div className="flex gap-2">
                  {(['header', 'footer'] as const).map((band) => (
                    <button
                      key={band}
                      type="button"
                      onClick={() => setTarget(band)}
                      className={`rounded-[var(--radius-sm)] border px-2 py-1 text-[12px] transition-colors ${
                        target === band
                          ? 'border-accent text-accent-text'
                          : 'border-line text-text-secondary hover:border-accent'
                      }`}
                    >
                      {band === 'header' ? 'Kopf' : 'Fuss'}
                    </button>
                  ))}
                </div>
                <div className="grid gap-1.5">
                  {PLACED_TYPES.map((type) => (
                    <PaletteButton key={type} type={type} onClick={() => add(type)} />
                  ))}
                </div>
                <span className="mt-2 text-[11px] uppercase tracking-wide text-text-tertiary">
                  Körper
                </span>
                <div className="grid gap-1.5">
                  {FLOWING_TYPES.map((type) => (
                    <PaletteButton key={type} type={type} onClick={() => add(type)} />
                  ))}
                </div>
              </div>
            </Panel>

            <Panel title="Seite" description="Ränder und Höhe der beiden festen Bänder, in mm.">
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    ['marginTop', 'Rand oben'],
                    ['marginBottom', 'Rand unten'],
                    ['marginLeft', 'Rand links'],
                    ['marginRight', 'Rand rechts'],
                    ['headerHeight', 'Höhe Kopf'],
                    ['footerHeight', 'Höhe Fuss'],
                  ] as const
                ).map(([key, label]) => (
                  <TextField
                    key={key}
                    label={label}
                    numeric
                    inputMode="decimal"
                    value={String(definition.page[key])}
                    onChange={(event) => {
                      const parsed = Number(event.target.value.replace(',', '.'))
                      if (Number.isNaN(parsed)) return
                      setDefinition({
                        ...definition,
                        page: { ...definition.page, [key]: parsed },
                      })
                    }}
                  />
                ))}
              </div>
            </Panel>
          </div>

          <DesignCanvas
            definition={definition}
            selection={selection}
            onSelect={setSelection}
            onMove={(band, index, position) =>
              setDefinition(
                withBlock(definition, band, index, {
                  ...definition[band][index],
                  ...position,
                }),
              )
            }
            onResize={(band, index, size) =>
              setDefinition(
                withBlock(definition, band, index, {
                  ...definition[band][index],
                  ...size,
                }),
              )
            }
          />

          <div className="w-[280px] shrink-0">
            <Panel title="Eigenschaften">
              {selected === undefined || selection === null ? (
                <p className="text-[13px] text-text-secondary">
                  Nichts gewählt. Klicke einen Baustein auf der Seite an.
                </p>
              ) : (
                <BlockProperties
                  block={selected}
                  fields={catalogue.data?.fields ?? []}
                  columns={catalogue.data?.columns ?? []}
                  onChange={(block) =>
                    setDefinition(withBlock(definition, selection.band, selection.index, block))
                  }
                  onRemove={() => {
                    setDefinition(withoutBlock(definition, selection.band, selection.index))
                    setSelection(null)
                  }}
                  onMoveUp={
                    selection.band === 'body' && selection.index > 0
                      ? () => {
                          setDefinition(withMovedBodyBlock(definition, selection.index, -1))
                          setSelection({ band: 'body', index: selection.index - 1 })
                        }
                      : undefined
                  }
                  onMoveDown={
                    selection.band === 'body' && selection.index < definition.body.length - 1
                      ? () => {
                          setDefinition(withMovedBodyBlock(definition, selection.index, 1))
                          setSelection({ band: 'body', index: selection.index + 1 })
                        }
                      : undefined
                  }
                />
              )}
            </Panel>
          </div>
        </div>
      </div>
    </>
  )
}

function PaletteButton({ type, onClick }: { type: LayoutBlockType; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[var(--radius-sm)] border border-line px-2 py-1.5 text-left text-[12px] text-text-secondary transition-colors hover:border-accent hover:text-text-primary"
    >
      + {BLOCK_LABELS[type]}
    </button>
  )
}
