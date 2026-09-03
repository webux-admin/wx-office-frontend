import { useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../auth/useAuth'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { ErrorNotice } from '../../components/Notice'
import { accountingSettingsKey, copyChartFromTemplate } from '../../lib/accounting'
import { api } from '../../lib/api'
import type { ChartTemplate, EquityLayout, Tenant } from '../../lib/types'

/** The three ways the equity is broken down, in everyday language. */
const LAYOUTS: { code: EquityLayout; title: string; hint?: string }[] = [
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
 * Lays the chart of accounts out as a copy of a shipped template.
 *
 * <p>**Nothing in here is typed prose.** Name, edition and the number of accounts come from
 * `GET /chart-templates`, and the number is the one of the equity layout picked above — it
 * changes when that changes. A fixed sentence would stand wrong the moment a template grows or
 * is not shipped at all (backend ADR-0112).
 *
 * <p>The equity question stands **first** and has to be answered: it picks the block of class 28,
 * and a chart without an equity block only comes out at the year end.
 *
 * <p>**Pre-selected only where there is something to pre-select.** The suggestion comes from
 * `suggestedEquityLayout` and never from the stored `equityLayout`: that one always carries a
 * value, and a pre-selected `JURISTIC` somebody clicks past gives an association the account
 * «Aktien-, Stamm-, Anteilschein- oder Stiftungskapital» (backend ADR-0112).
 *
 * @param templates what the endpoint answered; the dialog is only opened where that is not empty
 * @param suggestedLayout what the legal form in the tenant master record points at, undefined
 *   where it points at nothing — then no button is pre-selected and «Anlegen» stays shut
 */
export function ChartTemplateDialog({
  tenantId,
  templates,
  suggestedLayout,
  onClose,
}: {
  tenantId: number
  templates: ChartTemplate[]
  suggestedLayout?: EquityLayout
  onClose: () => void
}) {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const ordered = [...templates].sort((one, other) => one.sortOrder - other.sortOrder)

  const [layout, setLayout] = useState<EquityLayout | ''>(suggestedLayout ?? '')
  const [templateCode, setTemplateCode] = useState(ordered[0]?.code ?? '')

  // What the master record says, shown beside the question and **not** read into it. Reading a
  // tenant is `TENANT_READ`, which a bookkeeper need not hold; without it the line stays away.
  // The same key `ModulePage` uses, so the two share one answer.
  const tenant = useQuery({
    queryKey: ['tenant', tenantId],
    queryFn: () => api.get<Tenant>(`/api/tenants/${tenantId}`),
    enabled: can('TENANT_READ'),
  })
  const legalForm = tenant.data?.legalFormLabel

  // The layout travels as an argument and is never read out of the state here: a fallback
  // `JURISTIC` for the unanswered case is exactly the value that must not be sent unasked
  // (backend ADR-0112), and this way there is no place left to write one.
  const copy = useMutation({
    mutationFn: (picked: EquityLayout) =>
      copyChartFromTemplate(tenantId, { templateCode, equityLayout: picked }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['accounts', tenantId] })
      void queryClient.invalidateQueries({ queryKey: accountingSettingsKey(tenantId) })
      onClose()
    },
  })

  const submit = () => {
    if (layout !== '' && templateCode !== '') copy.mutate(layout)
  }

  return (
    <Dialog
      open
      wide
      onClose={onClose}
      onSubmit={submit}
      title="Kontenplan aus einer Vorlage anlegen"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            onClick={submit}
            disabled={layout === '' || templateCode === ''}
            busy={copy.isPending}
          >
            Kontenplan anlegen
          </Button>
        </>
      }
    >
      <div className="grid gap-5">
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-[13px] font-medium">
            Wie ist Ihr Eigenkapital gegliedert?
          </legend>
          {LAYOUTS.map((option) => (
            <Choice
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
          <legend className="mb-1 text-[13px] font-medium">Vorlage</legend>
          {ordered.map((template) => (
            <Choice
              key={template.code}
              group="chart-template"
              checked={templateCode === template.code}
              onChoose={() => setTemplateCode(template.code)}
              title={`${template.name}, ${template.edition}`}
              hint={countHint(template, layout)}
            />
          ))}
        </fieldset>

        <p className="text-[13px] text-text-secondary">
          Der Kontenplan lässt sich danach jederzeit ändern und ergänzen.
        </p>

        {copy.error !== null && <ErrorNotice error={copy.error} />}
      </div>
    </Dialog>
  )
}

/**
 * How many accounts this template produces, for the layout picked above.
 *
 * <p>Empty while no layout is picked: the same template answers three numbers, and naming one of
 * them before the question above is answered would be a guess.
 */
function countHint(template: ChartTemplate, layout: EquityLayout | ''): string | undefined {
  if (layout === '') return undefined
  const count = template.accountCount?.[layout]
  return count === undefined ? undefined : `${count} Konten`
}

/** One answer of a question that has exactly one, with the whole row as its click target. */
function Choice({
  group,
  checked,
  onChoose,
  title,
  hint,
}: {
  group: string
  checked: boolean
  onChoose: () => void
  title: string
  hint?: ReactNode
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-2.5 rounded-[var(--radius-md)] border px-3 py-2.5 transition-colors ${
        checked ? 'border-accent bg-sunken' : 'border-line hover:border-text-tertiary'
      }`}
    >
      <input
        type="radio"
        name={group}
        checked={checked}
        onChange={onChoose}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent-text)]"
      />
      <span className="min-w-0">
        <span className="block text-[13px]">{title}</span>
        {hint !== undefined && (
          <span className="block text-[12px] text-text-secondary">{hint}</span>
        )}
      </span>
    </label>
  )
}
