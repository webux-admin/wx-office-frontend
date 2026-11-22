import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { Button } from '../components/Button'
import { EmptyState, ErrorNotice, LoadingBlock } from '../components/Notice'
import { RequireTenant } from '../layout/RequireTenant'
import { api } from '../lib/api'
import type { PrintLayout } from '../lib/types'
import { usePrintoutFields } from '../printlayout/usePrintLayouts'
import { Designer } from './printlayout/Designer'

/**
 * One print form in the designer: the sheet, what can be put on it, and the settings of
 * whatever is selected.
 */
export function PrintLayoutPage() {
  return (
    <RequireTenant permission="PRINT_LAYOUT_WRITE">
      {(tenantId) => <LayoutLoader tenantId={tenantId} />}
    </RequireTenant>
  )
}

/**
 * Waits for the two things the designer cannot start without: the form, and the catalogue it
 * draws the sample document from.
 */
function LayoutLoader({ tenantId }: { tenantId: number }) {
  const { id } = useParams()

  const layout = useQuery({
    queryKey: ['print-layout', tenantId, id],
    queryFn: () => api.get<PrintLayout>(`/api/tenants/${tenantId}/print-layouts/${id}`),
    // A refetch while somebody is drawing would bring nothing they want: the designer holds
    // the form from the moment it opens until it is saved.
    refetchOnWindowFocus: false,
  })
  const catalogue = usePrintoutFields(tenantId)

  if (layout.isPending || catalogue.isPending) {
    return <LoadingBlock label="Druckvorlage wird geladen" />
  }
  if (layout.error !== null || catalogue.error !== null) {
    return (
      <div className="grid gap-4 p-8">
        <ErrorNotice error={layout.error ?? catalogue.error}>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                void layout.refetch()
                void catalogue.refetch()
              }}
            >
              Erneut versuchen
            </Button>
            <BackToList />
          </div>
        </ErrorNotice>
      </div>
    )
  }
  if (!layout.data.designed) {
    // A shipped form has no drawing. Opening it would show an empty sheet under its name, and
    // saving that sheet would be refused — it is copied before it is changed.
    return (
      <EmptyState
        title="Diese Vorlage ist mitgeliefert"
        description={`«${layout.data.name}» lässt sich nicht direkt gestalten. Kopieren Sie sie in der Liste der Druckvorlagen — die Kopie gehört Ihnen und lässt sich frei anpassen.`}
      >
        <BackToList />
      </EmptyState>
    )
  }
  // Keyed by the form, so opening another one starts a fresh history instead of offering to
  // undo into the form before.
  return (
    <Designer
      key={layout.data.id}
      tenantId={tenantId}
      layout={layout.data}
      catalogue={catalogue.data}
    />
  )
}

function BackToList() {
  return (
    <Link
      to="/druckvorlagen"
      className="text-body text-accent-text underline-offset-2 hover:underline"
    >
      Zu den Druckvorlagen
    </Link>
  )
}
