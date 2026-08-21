import { ExternalLink, FileText } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { ErrorNotice } from '../../components/Notice'
import { Panel } from '../../components/Panel'
import { useAuth } from '../../auth/useAuth'
import { originState } from '../../lib/origin'
import type { PrintLayout } from '../../lib/types'
import { PrintLayoutSelect } from '../../printlayout/PrintLayoutSelect'
import { useLayoutPreview } from '../../printlayout/useLayoutPreview'
import { usePrintLayouts } from '../../printlayout/usePrintLayouts'

/**
 * The form a kind of document prints on, with everything needed to judge the choice.
 *
 * <p>A dropdown alone was the whole connection until now: a name, no code, no way to see
 * what the form looks like, and no way to reach it. So this says which form it is, whether
 * it was drawn or shipped, who else prints on it, and offers the two ways on — a sample as
 * PDF, and the designer itself.
 *
 * @param tenantId the tenant
 * @param documentTypeId the kind being edited, absent while it is being created
 * @param documentTypeName what it is called, for the way back out of the designer
 * @param value the id of the chosen form, as a string
 * @param onChange called with the id that was picked
 * @param disabled true where the user may look but not write
 */
export function PrintPanel({
  tenantId,
  documentTypeId,
  documentTypeName,
  value,
  onChange,
  disabled = false,
}: {
  tenantId: number
  documentTypeId: number | undefined
  documentTypeName: string
  value: string
  onChange: (layoutId: string) => void
  disabled?: boolean
}) {
  const { can } = useAuth()
  const preview = useLayoutPreview(tenantId, documentTypeId)
  const layouts = usePrintLayouts(tenantId)
  const chosen = (layouts.data ?? []).find((form) => `${form.id}` === value)

  return (
    <Panel
      title="Druckvorlage"
      description="Wie ein Beleg dieser Art aussieht. Jede Belegart druckt auf genau einer Vorlage."
    >
      <div className="grid gap-4">
        <PrintLayoutSelect
          tenantId={tenantId}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />

        {chosen !== undefined && (
          <LayoutFacts form={chosen} documentTypeId={documentTypeId} />
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            disabled={value === ''}
            busy={preview.isPending}
            onClick={() => preview.mutate(Number(value))}
          >
            <FileText size={15} aria-hidden />
            Musterbeleg als PDF
          </Button>
          {/* Only a form the tenant drew can be opened in the designer. A shipped one has no
              drawing: the designer would show an empty page under its name, and saving that
              page fails — a shipped form is copied before it is changed. */}
          {can('PRINT_LAYOUT_WRITE') && chosen !== undefined && chosen.designed && (
            <Link
              to={`/druckvorlagen/${chosen.id}`}
              state={originState(
                documentTypeId === undefined ? '/belegarten' : `/belegarten/${documentTypeId}`,
                documentTypeId === undefined ? 'Belegarten' : documentTypeName,
              )}
              className="inline-flex items-center gap-1 text-[12px] text-text-secondary transition-colors hover:text-accent-text"
            >
              Vorlage öffnen
              <ExternalLink size={13} aria-hidden />
            </Link>
          )}
          {can('PRINT_LAYOUT_WRITE') && chosen !== undefined && !chosen.designed && (
            <Link
              to="/druckvorlagen"
              className="inline-flex items-center gap-1 text-[12px] text-text-secondary transition-colors hover:text-accent-text"
            >
              Zum Gestalten kopieren
              <ExternalLink size={13} aria-hidden />
            </Link>
          )}
        </div>

        {preview.error !== null && <ErrorNotice error={preview.error} />}
      </div>
    </Panel>
  )
}

/**
 * What is worth knowing about the chosen form: its code, where it comes from, and who else
 * prints on it.
 *
 * <p>The last sentence is the one that answers the question this whole screen exists for.
 * A change to the form hits every kind named here, and until now nothing said so.
 */
function LayoutFacts({
  form,
  documentTypeId,
}: {
  form: PrintLayout
  documentTypeId: number | undefined
}) {
  const others = (form.usedBy ?? []).filter((type) => type.id !== documentTypeId)

  return (
    <span className="grid gap-1.5">
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[12px] text-text-secondary">{form.code}</span>
        {form.system ? (
          <Badge tone="neutral">Mitgeliefert</Badge>
        ) : (
          <Badge tone="accent">Selbst gestaltet</Badge>
        )}
        {!form.active && <Badge tone="muted">Deaktiviert</Badge>}
      </span>
      {!form.active && (
        <span className="text-[12px] text-text-tertiary">
          Diese Vorlage ist deaktiviert. Gedruckt wird weiterhin darauf, neu wählen lässt sie
          sich aber nicht mehr.
        </span>
      )}
      <span className="text-[12px] text-text-tertiary">
        {others.length === 0
          ? 'Keine andere Belegart druckt auf dieser Vorlage.'
          : `Wird ausserdem benutzt von: ${others.map((type) => type.name).join(', ')}.`}
      </span>
    </span>
  )
}
