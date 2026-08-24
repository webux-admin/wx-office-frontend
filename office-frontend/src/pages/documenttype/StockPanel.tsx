import { useQuery } from '@tanstack/react-query'
import { Panel } from '../../components/Panel'
import { SelectField } from '../../components/SelectField'
import { api } from '../../lib/api'
import {
  showsLocationChoice,
  stockLocationLabel,
  stockLocationsKey,
  stockLocationsUrl,
} from '../../lib/inventory'
import type { Page, Product, StockLocation } from '../../lib/types'
import { STOCK_EFFECTS, type DocumentTypeForm } from './documentTypeForm'

/**
 * What issuing a document of this kind does to the stock, and where.
 *
 * <p>Hidden entirely for a Gutschrift: it corrects money, and where it corrects goods it does
 * so as the counter document of a Storno, which books back on its own (ADR-0064 of the
 * backend). Offering the setting there would invite a double booking nobody could see.
 *
 * <p>The location field follows the rule of ADR-0014: it appears from two active locations on,
 * and a tenant with one sees its name as text. What the mask does not offer it does not send —
 * the server then books at the tenant's default location, which is the same location the text
 * names.
 *
 * @param tenantId the tenant
 * @param form the mask as it stands
 * @param mayWrite whether the user may change the catalogue
 * @param onChange applies one changed field
 */
export function StockPanel({
  tenantId,
  form,
  mayWrite,
  onChange,
}: {
  tenantId: number
  form: DocumentTypeForm
  mayWrite: boolean
  onChange: (patch: Partial<DocumentTypeForm>) => void
}) {
  const locations = useQuery({
    queryKey: stockLocationsKey(tenantId),
    queryFn: () => api.get<StockLocation[]>(`${stockLocationsUrl(tenantId)}?activeOnly=true`),
  })

  // One row is enough: the panel only asks whether the tenant follows any stock at all, and a
  // setting that cannot move anything yet deserves a sentence rather than a select.
  const followed = useQuery({
    queryKey: ['stock-managed-products', tenantId],
    queryFn: () =>
      api.get<Page<Product>>(`/api/tenants/${tenantId}/products?stockManaged=true&size=1`),
  })

  if (form.category === 'CREDIT_NOTE') return null

  const active = locations.data ?? []
  const nothingFollowed = followed.data !== undefined && followed.data.totalElements === 0
  const effect = STOCK_EFFECTS.find((entry) => entry.value === form.stockEffect)

  return (
    <Panel
      title="Lager"
      description="Was das Ausstellen eines solchen Belegs mit dem Bestand macht."
    >
      {active.length === 0 ? (
        <p className="text-[13px] text-text-secondary">
          Es gibt noch keinen Lagerort. Diese Einstellung bewegt darum vorerst nichts.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Lagerwirkung"
            value={form.stockEffect}
            disabled={!mayWrite}
            onChange={(event) =>
              onChange({ stockEffect: event.target.value as DocumentTypeForm['stockEffect'] })
            }
            hint={effect?.hint}
          >
            {STOCK_EFFECTS.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </SelectField>

          {showsLocationChoice(active) ? (
            <SelectField
              label="Lagerort"
              value={form.stockLocationId}
              disabled={!mayWrite || form.stockEffect === 'NONE'}
              onChange={(event) => onChange({ stockLocationId: event.target.value })}
              hint="Ohne Wahl bucht der Beleg im Vorgabe-Lagerort des Mandanten."
            >
              <option value="">Vorgabe-Lagerort</option>
              {active.map((location) => (
                <option key={location.id} value={`${location.id}`}>
                  {stockLocationLabel(location)}
                </option>
              ))}
            </SelectField>
          ) : (
            <div className="grid gap-0.5 text-[13px]">
              <span className="text-[12px] text-text-tertiary">Lagerort</span>
              <span>{stockLocationLabel(active[0])}</span>
            </div>
          )}
        </div>
      )}

      {nothingFollowed && active.length > 0 && (
        <p className="mt-3 text-[12px] text-text-tertiary">
          Es ist noch kein Produkt lagergeführt. Diese Einstellung bewegt darum vorerst nichts.
        </p>
      )}
      {form.stockEffect !== 'NONE' && (
        <p className="mt-3 text-[12px] text-text-tertiary">
          Die Änderung gilt für künftige Belege. Bereits gebuchte Bestände bleiben, wie sie sind.
        </p>
      )}
    </Panel>
  )
}
