import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { CheckboxField } from '../components/CheckboxField'
import { DataTable, type Column } from '../components/DataTable'
import { Dialog } from '../components/Dialog'
import { EmptyState, ErrorNotice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { SelectField } from '../components/SelectField'
import { TextField } from '../components/TextField'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import { BANKING_MODULE } from '../lib/banking'
import {
  AMOUNT_NAMES,
  AMOUNT_ORDER,
  CONFIDENCE_HINTS,
  CONFIDENCE_NAMES,
  CONFIDENCE_ORDER,
  CONFIDENCE_TONES,
  MATCHING_RIGHTS,
  PARTY_NAMES,
  PARTY_ORDER,
  REFERENCE_NAMES,
  REFERENCE_ORDER,
  deactivateMatchRule,
  fetchMatchRules,
  fetchMatchSettings,
  matchRulesKey,
  matchSettingsKey,
  saveMatchRule,
  saveMatchSettings,
} from '../lib/matching'
import type {
  AmountMatch,
  Confidence,
  MatchRule,
  MatchSettings,
  PartyMatch,
  ReferenceMatch,
} from '../lib/types'

/** What the rule dialog edits. Strings, because a half-typed number is not a number. */
type RuleForm = {
  priority: string
  partyMatch: PartyMatch
  referenceMatch: ReferenceMatch
  amountMatch: AmountMatch
  confidence: Confidence
  reviewRequired: boolean
  active: boolean
}

const EMPTY_RULE: RuleForm = {
  priority: '',
  partyMatch: 'EGAL',
  referenceMatch: 'EGAL',
  amountMatch: 'EGAL',
  confidence: 'TIEF',
  reviewRequired: true,
  active: true,
}

/**
 * The rules by which a bank payment is proposed for an invoice.
 *
 * <p><b>Rules as data, not as code.</b> A business with clean QR reference discipline tolerates
 * rules that one with many cash payers does not, and every adjustment would otherwise need a
 * release (backend ADR-0108).
 *
 * <p><b>Confidence is a word, never a percentage.</b> A score suggests a calibration a
 * rule-based system does not have — and it cannot be explained to an audit, while «the QR
 * reference points at this invoice» can (ADR-0042).
 */
export function MatchRulePage() {
  return (
    <RequireTenant permission={MATCHING_RIGHTS.read} module={BANKING_MODULE}>
      {(tenantId) => <Rules tenantId={tenantId} />}
    </RequireTenant>
  )
}

function Rules({ tenantId }: { tenantId: number }) {
  const { can } = useAuth()
  const mayManage = can(MATCHING_RIGHTS.manageRules)
  const [editing, setEditing] = useState<MatchRule | 'new' | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const rules = useQuery({
    queryKey: matchRulesKey(tenantId),
    queryFn: () => fetchMatchRules(tenantId),
  })

  const settings = useQuery({
    queryKey: matchSettingsKey(tenantId),
    queryFn: () => fetchMatchSettings(tenantId),
  })

  const columns: Column<MatchRule>[] = [
    {
      key: 'priority',
      header: 'Prio',
      align: 'right',
      width: 'w-16',
      render: (rule) => rule.priority,
    },
    {
      key: 'party',
      header: 'Partei',
      render: (rule) => PARTY_NAMES[rule.partyMatch],
    },
    {
      key: 'reference',
      header: 'Referenz',
      render: (rule) => REFERENCE_NAMES[rule.referenceMatch],
    },
    {
      key: 'amount',
      header: 'Betrag',
      hideBelow: 'sm',
      render: (rule) => AMOUNT_NAMES[rule.amountMatch],
    },
    {
      key: 'confidence',
      header: 'Konfidenz',
      render: (rule) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={CONFIDENCE_TONES[rule.confidence]}>
            {CONFIDENCE_NAMES[rule.confidence]}
          </Badge>
          {rule.reviewRequired ? (
            <Badge tone="neutral">Prüfung nötig</Badge>
          ) : (
            <Badge tone="accent">ohne Prüfung</Badge>
          )}
          {!rule.active && <Badge tone="muted">abgeschaltet</Badge>}
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Zuordnungsregeln"
        subtitle="Welcher Befund welche Konfidenz ergibt. Kleiner gewinnt — greifen mehrere Regeln, entscheidet die oberste."
      >
        {mayManage && (
          <>
            <Button variant="secondary" onClick={() => setSettingsOpen(true)}>
              Toleranz
            </Button>
            <Button onClick={() => setEditing('new')}>Regel erfassen</Button>
          </>
        )}
      </PageHeader>

      <div className="grid gap-4 px-8 pb-12">
        <Panel title="Was ohne Nachfrage durchgeht">
          <p className="text-[13px] text-text-secondary">
            Übernommen werden darf nur, was <strong>hoch</strong> und <strong>ohne
            Prüfung</strong> ist und keinen Restbetrag lässt. Ausgeliefert sind das genau zwei
            Regeln: Priorität 10 (die Referenz zeigt auf den Beleg und der Betrag stimmt) und
            30 (die Belegnummer steht im Text <em>und</em> der Zahler passt). Beide paaren
            einen Beleg mit einer zweiten, unabhängigen Tatsache.
          </p>
          <p className="mt-2 text-[13px] text-text-secondary">
            Findet sich für einen Befund gar keine Regel, gilt <strong>tief</strong> mit
            Prüfung. Schweigen ist keine Erlaubnis.
          </p>
        </Panel>

        <Panel padded={false} title="Regeln">
          <DataTable
            columns={columns}
            rows={rules.data ?? []}
            keyOf={(rule) => rule.id}
            loading={rules.isLoading}
            error={rules.error}
            onRowOpen={mayManage ? (rule) => setEditing(rule) : undefined}
            empty={<EmptyState title="Keine Regeln" />}
          />
        </Panel>

        {settings.data && (
          <Panel title="Zuordnungstoleranz">
            <p className="text-[13px] text-text-secondary">
              Bis {settings.data.toleranceAmount.toFixed(2)} entsteht ein Vorschlag ohne
              Prüfflag, bis {settings.data.toleranceMaximum.toFixed(2)} einer mit Prüfflag,
              darüber gar keiner. Zahlungskonten werden{' '}
              {settings.data.learnPayerAccounts ? 'gelernt' : 'nicht gelernt'}.
            </p>
            <p className="mt-2 text-[13px] text-text-tertiary">
              Diese Toleranz <strong>schreibt nichts</strong>. Sie entscheidet nur, ob ein
              Vorschlag entsteht — anders als die Ausbuchungstoleranz, die eine eigene Forderung
              aufgibt, und anders als die Überzahlungsschwelle, die über fremdes Geld verfügt.
            </p>
          </Panel>
        )}
      </div>

      <RuleDialog tenantId={tenantId} rule={editing} onClose={() => setEditing(null)} />
      <SettingsDialog
        tenantId={tenantId}
        settings={settings.data}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </>
  )
}

function RuleDialog({
  tenantId,
  rule,
  onClose,
}: {
  tenantId: number
  rule: MatchRule | 'new' | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const existing = rule !== null && rule !== 'new' ? rule : undefined
  const [form, setForm] = useState<RuleForm>(EMPTY_RULE)
  const [openedOn, setOpenedOn] = useState<number | 'new' | null>(null)

  // Adjusted during render rather than in an effect: an effect would draw the fields once with
  // the previous row's values.
  const key = existing?.id ?? (rule === 'new' ? ('new' as const) : null)
  if (key !== openedOn) {
    setOpenedOn(key)
    setForm(existing === undefined ? EMPTY_RULE : {
      priority: String(existing.priority),
      partyMatch: existing.partyMatch,
      referenceMatch: existing.referenceMatch,
      amountMatch: existing.amountMatch,
      confidence: existing.confidence,
      reviewRequired: existing.reviewRequired,
      active: existing.active,
    })
  }

  const save = useMutation({
    mutationFn: () => saveMatchRule(tenantId, {
      id: existing?.id,
      priority: Number(form.priority),
      partyMatch: existing === undefined ? form.partyMatch : undefined,
      referenceMatch: existing === undefined ? form.referenceMatch : undefined,
      amountMatch: existing === undefined ? form.amountMatch : undefined,
      confidence: form.confidence,
      reviewRequired: form.reviewRequired,
      active: form.active,
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: matchRulesKey(tenantId) })
      onClose()
    },
  })

  const deactivate = useMutation({
    mutationFn: () => deactivateMatchRule(tenantId, existing?.id ?? 0),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: matchRulesKey(tenantId) })
      onClose()
    },
  })

  const priorityOk = form.priority !== '' && Number(form.priority) >= 1

  return (
    <Dialog
      open={rule !== null}
      wide
      title={existing === undefined ? 'Zuordnungsregel erfassen' : `Regel ${existing.priority}`}
      onClose={onClose}
      onSubmit={() => priorityOk && save.mutate()}
      footer={
        <>
          {existing !== undefined && existing.active && (
            <Button
              variant="secondary"
              onClick={() => deactivate.mutate()}
              busy={deactivate.isPending}
            >
              Abschalten
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={() => save.mutate()} disabled={!priorityOk} busy={save.isPending}>
            Speichern
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <TextField
          label="Priorität"
          numeric
          value={form.priority}
          onChange={(event) => setForm({ ...form, priority: event.target.value })}
          hint="Kleiner gewinnt. Jede Priorität gibt es nur einmal."
        />

        <SelectField
          label="Partei"
          value={form.partyMatch}
          disabled={existing !== undefined}
          onChange={(event) =>
            setForm({ ...form, partyMatch: event.target.value as PartyMatch })
          }
          hint={
            existing === undefined
              ? undefined
              : 'Steht fest — eine Regel, die eine andere Frage beantwortet, ist eine andere Regel.'
          }
        >
          {PARTY_ORDER.map((code) => (
            <option key={code} value={code}>
              {PARTY_NAMES[code]}
            </option>
          ))}
        </SelectField>

        <SelectField
          label="Referenz oder Belegnummer"
          value={form.referenceMatch}
          disabled={existing !== undefined}
          onChange={(event) =>
            setForm({ ...form, referenceMatch: event.target.value as ReferenceMatch })
          }
        >
          {REFERENCE_ORDER.map((code) => (
            <option key={code} value={code}>
              {REFERENCE_NAMES[code]}
            </option>
          ))}
        </SelectField>

        <SelectField
          label="Betrag"
          value={form.amountMatch}
          disabled={existing !== undefined}
          onChange={(event) =>
            setForm({ ...form, amountMatch: event.target.value as AmountMatch })
          }
        >
          {AMOUNT_ORDER.map((code) => (
            <option key={code} value={code}>
              {AMOUNT_NAMES[code]}
            </option>
          ))}
        </SelectField>

        <SelectField
          label="Konfidenz"
          value={form.confidence}
          onChange={(event) =>
            setForm({ ...form, confidence: event.target.value as Confidence })
          }
          hint={CONFIDENCE_HINTS[form.confidence]}
        >
          {CONFIDENCE_ORDER.map((code) => (
            <option key={code} value={code}>
              {CONFIDENCE_NAMES[code]}
            </option>
          ))}
        </SelectField>

        <CheckboxField
          label="Prüfung nötig"
          checked={form.reviewRequired}
          onChange={(event) => setForm({ ...form, reviewRequired: event.target.checked })}
          hint="Ohne Häkchen darf ein Vorschlag dieser Regel ohne Nachfrage übernommen werden. Die Vorgabe ist Vorsicht."
        />

        <CheckboxField
          label="Aktiv"
          checked={form.active}
          onChange={(event) => setForm({ ...form, active: event.target.checked })}
          hint="Eine abgeschaltete Regel bleibt stehen: bestehende Vorschläge zeigen darauf."
        />

        {save.error !== null && <ErrorNotice error={save.error} />}
        {deactivate.error !== null && <ErrorNotice error={deactivate.error} />}
      </div>
    </Dialog>
  )
}

function SettingsDialog({
  tenantId,
  settings,
  open,
  onClose,
}: {
  tenantId: number
  settings: MatchSettings | undefined
  open: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [amount, setAmount] = useState('')
  const [maximum, setMaximum] = useState('')
  const [learn, setLearn] = useState(true)
  const [loaded, setLoaded] = useState(false)

  if (open && settings !== undefined && !loaded) {
    setLoaded(true)
    setAmount(settings.toleranceAmount.toFixed(2))
    setMaximum(settings.toleranceMaximum.toFixed(2))
    setLearn(settings.learnPayerAccounts)
  }
  if (!open && loaded) {
    setLoaded(false)
  }

  const save = useMutation({
    mutationFn: () => saveMatchSettings(tenantId, {
      toleranceAmount: Number(amount.replace(',', '.')),
      toleranceMaximum: Number(maximum.replace(',', '.')),
      learnPayerAccounts: learn,
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: matchSettingsKey(tenantId) })
      onClose()
    },
  })

  return (
    <Dialog
      open={open}
      title="Zuordnungstoleranz"
      onClose={onClose}
      onSubmit={() => save.mutate()}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={() => save.mutate()} busy={save.isPending}>
            Speichern
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <TextField
          label="Ohne Prüfflag bis"
          numeric
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          hint="Rappenrundung. Ausgeliefert 0.05."
        />
        <TextField
          label="Mit Prüfflag bis"
          numeric
          value={maximum}
          onChange={(event) => setMaximum(event.target.value)}
          hint="Darüber entsteht gar kein Betragsvorschlag. Ausgeliefert 5.00."
        />
        <CheckboxField
          label="Zahlungskonten lernen"
          checked={learn}
          onChange={(event) => setLearn(event.target.checked)}
          hint="Nur aus bestätigten Zuordnungen. Eine gelernte IBAN ist ein Personendatum am Stammsatz und am Partner einzeln löschbar (revDSG Art. 25)."
        />
        <p className="text-[13px] text-text-tertiary">
          Diese Toleranz schreibt nichts — sie entscheidet nur, ob ein Vorschlag entsteht und
          mit welcher Restdifferenz.
        </p>
        {save.error !== null && <ErrorNotice error={save.error} />}
      </div>
    </Dialog>
  )
}
