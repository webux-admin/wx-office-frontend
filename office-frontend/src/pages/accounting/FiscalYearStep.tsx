import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { ErrorNotice } from '../../components/Notice'
import { Panel } from '../../components/Panel'
import { useAuth } from '../../auth/useAuth'
import {
  ACCOUNTING_RIGHTS,
  createFiscalYear,
  fiscalYearsKey,
  setupStateKey,
} from '../../lib/accounting'
import type { FiscalYear, FiscalYearList, FiscalYearRequest } from '../../lib/types'
import { FiscalYearFields } from './FiscalYearFields'
import { useFiscalYearForm } from './fiscalYearForm'
import { MissingRightHint } from './MissingRightHint'

/**
 * Step 2: the first fiscal year, and the one after it.
 *
 * <p><b>No second form and no second pre-fill calculation.</b> The four fields are the ones of
 * the fiscal year screen, in the same component — where that screen holds them in a dialog, they
 * are rendered here without an overlay. A pre-fill worked out a second time would run alike for
 * two years and fall apart on the first short fiscal year.
 *
 * <p><b>The following year is offered with the tick already set.</b> The year-end run lays it out
 * anyway, and without it the sales desk stands still on the 2nd of January: `postableAt` finds no
 * open fiscal year for the day.
 */
export function FiscalYearStep({
  tenantId,
  years,
  fiscalYearStartMonth,
  onDone,
  onBack,
}: {
  tenantId: number
  years: readonly FiscalYear[]
  fiscalYearStartMonth: number
  onDone: () => void
  onBack: () => void
}) {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const mayClose = can(ACCOUNTING_RIGHTS.close)
  const form = useFiscalYearForm(tenantId, years, fiscalYearStartMonth)

  const save = useMutation({
    mutationFn: (request: FiscalYearRequest) =>
      createFiscalYear(tenantId, request).then((list: FiscalYearList) => {
        queryClient.setQueryData(fiscalYearsKey(tenantId), list)
      }),
    // Awaited, not fired and forgotten: step 3 reads the fiscal year out of the setup state, and
    // advancing before the refetch lands would show «Für die Eröffnung braucht es ein
    // Geschäftsjahr» right after the year was created.
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: fiscalYearsKey(tenantId) })
      await queryClient.invalidateQueries({ queryKey: setupStateKey(tenantId) })
      onDone()
    },
  })

  const blocked = form.request === undefined || !mayClose || save.isPending

  return (
    <Panel>
      <div className="grid gap-5">
        <div>
          <h2 className="text-[14px] font-semibold">Ihr erstes Geschäftsjahr</h2>
          <p className="mt-1 text-[13px] text-text-secondary">
            Beginn und Ende bestimmen, in welche Periode ein Beleg fällt. Vorbelegt aus dem
            Geschäftsjahresbeginn im Mandantenstamm; jedes Feld lässt sich überschreiben.
          </p>
        </div>

        <FiscalYearFields state={form} creating />

        {!mayClose && (
          <MissingRightHint right="ACCOUNTING_CLOSE" name="Geschäftsjahr führen" />
        )}
        {save.error !== null && <ErrorNotice error={save.error} />}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onBack}>
            Zurück
          </Button>
          <Button
            disabled={blocked}
            busy={save.isPending}
            onClick={() => {
              if (form.request !== undefined) save.mutate(form.request)
            }}
          >
            Weiter
          </Button>
        </div>
      </div>
    </Panel>
  )
}
