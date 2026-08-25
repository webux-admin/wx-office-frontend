import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { CheckboxField } from '../../components/CheckboxField'
import { Dialog } from '../../components/Dialog'
import { ErrorNotice } from '../../components/Notice'
import { SelectField } from '../../components/SelectField'
import { TextField } from '../../components/TextField'
import { api } from '../../lib/api'
import {
  showsLocationChoice,
  stockLocationLabel,
  stockLocationsKey,
  stockLocationsUrl,
  stocktakesUrl,
} from '../../lib/inventory'
import type { StockLocation, Stocktake } from '../../lib/types'

/**
 * Sets a count list up.
 *
 * <p>A dialog on the list and not a mask of its own: there are five fields, and a count is not
 * written but started. The lines are built when it is opened for counting, and the number is
 * drawn when it is booked (backend ADR-0070).
 *
 * @param tenantId the tenant
 * @param open whether the dialog is on screen
 * @param onClose closes it without creating anything
 * @param onCreated called with the new list, so the caller can open it
 */
export function NewStocktakeDialog({
  tenantId,
  open,
  onClose,
  onCreated,
}: {
  tenantId: number
  open: boolean
  onClose: () => void
  onCreated: (stocktake: Stocktake) => void
}) {
  const queryClient = useQueryClient()
  const [locationId, setLocationId] = useState('')
  const [blindCount, setBlindCount] = useState(false)
  const [countingDate, setCountingDate] = useState(today())
  const [note, setNote] = useState('')

  const locations = useQuery({
    queryKey: stockLocationsKey(tenantId),
    queryFn: () => api.get<StockLocation[]>(`${stockLocationsUrl(tenantId)}?activeOnly=true`),
    enabled: open,
  })
  const active = locations.data ?? []
  // The rule of Frontend-ADR-0014: the field appears from two active locations on. With one
  // there is nothing to choose, and it is used silently.
  const showsLocations = showsLocationChoice(active)
  const chosen = locationId === '' ? active[0]?.id : Number(locationId)

  const create = useMutation({
    mutationFn: () =>
      api.post<Stocktake>(stocktakesUrl(tenantId), {
        locationId: chosen,
        // Only the whole location for now: a selection needs a product picker, and the
        // opening stock of a new tenant — the case it exists for — is entered before there
        // is anything to pick.
        scope: 'ALL',
        blindCount,
        countingDate,
        note: note.trim() === '' ? undefined : note.trim(),
      }),
    onSuccess: (stocktake) => {
      void queryClient.invalidateQueries({ queryKey: ['stocktakes', tenantId] })
      onCreated(stocktake)
    },
  })

  return (
    <Dialog
      open={open}
      title="Neue Inventur"
      description="Zählt einen Lagerort. Gebucht wird erst, wenn die Differenzen geprüft sind."
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            onClick={() => create.mutate()}
            busy={create.isPending}
            disabled={chosen === undefined}
          >
            Anlegen
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {showsLocations && (
          <SelectField
            label="Lagerort"
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
            hint="Wer zwei Lager zählt, legt zwei Zähllisten an."
          >
            {active.map((location) => (
              <option key={location.id} value={`${location.id}`}>
                {stockLocationLabel(location)}
              </option>
            ))}
          </SelectField>
        )}

        <TextField
          label="Zähldatum"
          type="date"
          value={countingDate}
          onChange={(event) => setCountingDate(event.target.value)}
          hint="Bestimmt das Geschäftsjahr der Buchung. Nicht in der Zukunft."
        />

        <CheckboxField
          label="Sollmenge verbergen"
          checked={blindCount}
          onChange={(event) => setBlindCount(event.target.checked)}
          hint="Bei einer Blindzählung sieht niemand beim Zählen, was erwartet wird."
        />

        <TextField
          label="Bemerkung"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          hint="Steht später im Protokoll."
        />

        {create.error !== null && <ErrorNotice error={create.error} />}
      </div>
    </Dialog>
  )
}

/** Today as `yyyy-MM-dd`, the shape a date field takes. */
function today(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}
