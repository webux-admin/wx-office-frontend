import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { ErrorNotice } from '../../components/Notice'
import { Panel } from '../../components/Panel'
import { useAuth } from '../../auth/useAuth'
import {
  ACCOUNTING_RIGHTS,
  accountingSettingsKey,
  chartTemplatesKey,
  copyChartFromTemplate,
  fetchChartTemplates,
  setupStateKey,
  updateAccountingSettings,
} from '../../lib/accounting'
import type { ChartTemplate, EquityLayout } from '../../lib/types'
import { MissingRightHint } from './MissingRightHint'
import { StepChoice } from './StepChoice'

/**
 * Step 1: how the equity is broken down, and where the chart of accounts comes from.
 *
 * <p><b>Two calls in a binding order:</b> first `PUT /settings` with the layout, then
 * `POST /accounts/from-template`. The copy takes only the equity accounts of the chosen layout,
 * so the answer has to be stored before the copy runs. «Leer beginnen» makes the first call only.
 *
 * <p><b>The equity question stands first and has to be answered.</b> It picks the block of class
 * 28, and a chart without an equity block only shows up at the year end.
 *
 * <p><b>Nothing here is typed prose.</b> Name, edition and the number of accounts come from
 * `GET /chart-templates`; a fixed sentence would stand wrong the moment a template grows.
 */
export function EquityAndChartStep({
  tenantId,
  suggestedLayout,
  storedLayout,
  legalForm,
  accountCount,
  onDone,
  onCancel,
}: {
  tenantId: number
  /** What the legal form of the tenant points at, absent where it points at nothing. */
  suggestedLayout?: EquityLayout
  /** What the settings already carry, for somebody who comes back to this step. */
  storedLayout?: EquityLayout
  /** What the master record calls that legal form, absent without `TENANT_READ`. */
  legalForm?: string
  /** How many accounts the chart holds; a chart that stands is never copied over. */
  accountCount: number
  onDone: () => void
  onCancel: () => void
}) {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const mayConfigure = can(ACCOUNTING_RIGHTS.configure)

  const templates = useQuery({
    queryKey: chartTemplatesKey(tenantId),
    queryFn: () => fetchChartTemplates(tenantId),
  })
  const ordered = [...(templates.data ?? [])].sort((one, other) => one.sortOrder - other.sortOrder)

  const chartStands = accountCount > 0
  const [layout, setLayout] = useState<EquityLayout | ''>(
    storedLayout ?? suggestedLayout ?? '',
  )
  // A chart that stands is never copied over: the endpoint refuses it, and going back one step
  // must not be a way to walk into a 409.
  const [choice, setChoice] = useState<string>(chartStands ? 'EMPTY' : '')

  const save = useMutation({
    mutationFn: async (picked: EquityLayout) => {
      // The order is binding: the copy takes the equity accounts of the layout stored here.
      await updateAccountingSettings(tenantId, { equityLayout: picked })
      if (choice !== 'EMPTY') {
        await copyChartFromTemplate(tenantId, { templateCode: choice, equityLayout: picked })
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['accounts', tenantId] })
      void queryClient.invalidateQueries({ queryKey: accountingSettingsKey(tenantId) })
      void queryClient.invalidateQueries({ queryKey: setupStateKey(tenantId) })
      onDone()
    },
  })

  const blocked = layout === '' || choice === '' || !mayConfigure || save.isPending

  return (
    <Panel>
      <div className="grid gap-5">
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-[13px] font-medium">
            Wie ist Ihr Eigenkapital gegliedert?
          </legend>
          {LAYOUTS.map((option) => (
            <StepChoice
              key={option.code}
              group="equity-layout"
              checked={layout === option.code}
              onChoose={() => setLayout(option.code)}
              title={option.title}
              hint={option.hint}
            />
          ))}
          <p className="mt-1 text-[12px] text-text-secondary">
            {suggestedLayout === undefined
              ? 'Bitte wählen: aus der Rechtsform im Mandantenstamm lässt sich das nicht '
                + 'ableiten. Die Wahl steuert nur den Eigenkapitalblock.'
              : 'Vorbelegt aus der Rechtsform im Mandantenstamm. Sie steuert nur den '
                + 'Eigenkapitalblock und lässt sich hier überschreiben.'}
            {legalForm !== undefined && ` Im Mandantenstamm steht «${legalForm}».`}
          </p>
        </fieldset>

        <fieldset className="grid gap-2">
          <legend className="mb-1 text-[13px] font-medium">Kontenplan</legend>
          {chartStands && (
            <p className="text-[13px] text-text-secondary">
              Ihr Kontenplan steht bereits mit {accountCount} Konten. Er wird hier nicht noch
              einmal angelegt; ändern und ergänzen lässt er sich unter Buchhaltung → Kontenplan.
            </p>
          )}
          {!chartStands
            && ordered.map((template) => (
              <StepChoice
                key={template.code}
                group="chart-template"
                checked={choice === template.code}
                onChoose={() => setChoice(template.code)}
                title={`${template.name}, ${template.edition}`}
                hint={countHint(template, layout)}
              />
            ))}
          {!chartStands && (
            <StepChoice
              group="chart-template"
              checked={choice === 'EMPTY'}
              onChoose={() => setChoice('EMPTY')}
              title="Leer beginnen"
              hint="Sie legen jedes Konto selbst an. Der Kontenplan lässt sich jederzeit ergänzen."
            />
          )}
        </fieldset>

        {!mayConfigure && <MissingRightHint right="ACCOUNTING_CONFIGURE" name="Buchhaltung einrichten" />}
        {save.error !== null && <ErrorNotice error={save.error} />}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Abbrechen
          </Button>
          <Button
            disabled={blocked}
            busy={save.isPending}
            onClick={() => {
              if (layout !== '') save.mutate(layout)
            }}
          >
            Weiter
          </Button>
        </div>
      </div>
    </Panel>
  )
}

/** The three equity layouts, worded the way the tenant recognises its own legal form. */
const LAYOUTS: readonly { code: EquityLayout; title: string; hint: string }[] = [
  {
    code: 'JURISTIC',
    title: 'AG, GmbH, Genossenschaft, Verein oder Stiftung',
    hint: 'Grundkapital, Reserven, Gewinnvortrag',
  },
  {
    code: 'SOLE_PROPRIETOR',
    title: 'Einzelunternehmen',
    hint: 'ein Kapitalkonto und ein Privatkonto',
  },
  {
    code: 'PARTNERSHIP',
    title: 'Kollektiv- oder Kommanditgesellschaft',
    hint: 'je Gesellschafter ein Kapital- und ein Privatkonto',
  },
]

/**
 * How many accounts this template produces, for the layout picked above.
 *
 * <p>Empty while no layout is picked: the same template answers three numbers, and naming one of
 * them before the question above is answered would be a guess.
 */
function countHint(template: ChartTemplate, layout: EquityLayout | ''): string | undefined {
  if (layout === '') return undefined
  const count = template.accountCount?.[layout]
  return count === undefined ? undefined : `${count} Konten, gegliedert nach OR Art. 959a und 959b`
}
