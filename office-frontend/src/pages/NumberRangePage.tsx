import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { Button } from '../components/Button'
import { DataTable, type Column } from '../components/DataTable'
import { Dialog } from '../components/Dialog'
import { EmptyState, ErrorNotice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { SelectField } from '../components/SelectField'
import { TextField } from '../components/TextField'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import { api } from '../lib/api'
import { formatCount } from '../lib/format'
import type { DocumentType, NumberRange } from '../lib/types'

/**
 * The number ranges of the tenant, one per kind of document and financial year.
 *
 * <p>Only prefix and padding can be set. The counter itself is not editable, and that is the
 * point: document numbers have to be gapless and unique, so nobody may move the counter back
 * over numbers that were already issued.
 */
export function NumberRangePage() {
  return (
    <RequireTenant permission="NUMBER_RANGE_READ">
      {(tenantId) => <NumberRanges tenantId={tenantId} />}
    </RequireTenant>
  )
}

type RangeForm = {
  documentTypeCode: string
  fiscalYear: string
  prefix: string
  padding: string
}

function NumberRanges({ tenantId }: { tenantId: number }) {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const mayWrite = can('NUMBER_RANGE_WRITE')

  const [form, setForm] = useState<RangeForm | null>(null)
  const [locked, setLocked] = useState(false)

  const ranges = useQuery({
    queryKey: ['number-ranges', tenantId],
    queryFn: () => api.get<NumberRange[]>(`/api/tenants/${tenantId}/number-ranges`),
  })

  const types = useQuery({
    queryKey: ['document-types', tenantId],
    queryFn: () => api.get<DocumentType[]>(`/api/tenants/${tenantId}/document-types`),
    enabled: mayWrite && can('DOCUMENT_TYPE_READ'),
  })

  const configure = useMutation({
    mutationFn: (entry: RangeForm) =>
      api.put<NumberRange>(
        `/api/tenants/${tenantId}/number-ranges/${encodeURIComponent(entry.documentTypeCode)}/${entry.fiscalYear}`,
        {
          prefix: entry.prefix.trim() || undefined,
          padding: entry.padding.trim() === '' ? undefined : Number(entry.padding),
        },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['number-ranges', tenantId] })
      setForm(null)
    },
  })

  const openNew = () => {
    setForm({
      documentTypeCode: '',
      fiscalYear: `${new Date().getFullYear()}`,
      prefix: '',
      padding: '4',
    })
    setLocked(false)
    configure.reset()
  }

  const openEdit = (range: NumberRange) => {
    setForm({
      documentTypeCode: range.documentTypeCode,
      fiscalYear: `${range.fiscalYear}`,
      prefix: range.prefix ?? '',
      padding: `${range.padding ?? 4}`,
    })
    // Kind and year identify the range; changing them here would configure a different one.
    setLocked(true)
    configure.reset()
  }

  const columns: Column<NumberRange>[] = [
    {
      key: 'type',
      header: 'Belegart',
      width: 'w-[130px]',
      render: (range) =>
        mayWrite ? (
          <button
            type="button"
            onClick={() => openEdit(range)}
            className="font-mono text-[12px] font-medium transition-colors hover:text-accent-text"
          >
            {range.documentTypeCode}
          </button>
        ) : (
          <span className="font-mono text-[12px]">{range.documentTypeCode}</span>
        ),
    },
    {
      key: 'year',
      header: 'Geschäftsjahr',
      align: 'right',
      width: 'w-[130px]',
      render: (range) => range.fiscalYear,
    },
    {
      key: 'prefix',
      header: 'Präfix',
      width: 'w-[110px]',
      render: (range) => (
        <span className="font-mono text-[12px] text-text-secondary">{range.prefix ?? '-'}</span>
      ),
    },
    {
      key: 'padding',
      header: 'Stellen',
      align: 'right',
      width: 'w-[100px]',
      render: (range) => formatCount(range.padding),
    },
    {
      key: 'next',
      header: 'Nächste Nummer',
      align: 'right',
      width: 'w-[130px]',
      render: (range) => formatCount(range.nextNumber),
    },
    {
      key: 'preview',
      header: 'Nächster Beleg',
      align: 'right',
      render: (range) => (
        <span className="font-medium">{range.nextDocumentNumber ?? '-'}</span>
      ),
    },
  ]

  const orderTypeCodes = (types.data ?? []).filter((type) => type.active).map((type) => type.code)

  return (
    <>
      <PageHeader
        title="Nummernkreise"
        subtitle="Je Belegart und Geschäftsjahr ein Zähler. Der Stand selbst lässt sich nicht ändern."
      >
        {mayWrite && (
          <Button onClick={openNew}>
            <Plus size={15} aria-hidden />
            Nummernkreis
          </Button>
        )}
      </PageHeader>

      <div className="px-8 pb-12">
        <Panel padded={false}>
          <DataTable
            columns={columns}
            rows={ranges.data ?? []}
            keyOf={(range) => `${range.documentTypeCode}-${range.fiscalYear}`}
            onRowOpen={mayWrite ? openEdit : undefined}
            loading={ranges.isPending}
            error={ranges.error}
            empty={
              <EmptyState
                title="Keine Nummernkreise"
                description="Ohne Nummernkreis lässt sich kein Beleg ausstellen. Die Nummer wird beim Ausstellen daraus gezogen."
              >
                {mayWrite && (
                  <Button onClick={openNew}>
                    <Plus size={15} aria-hidden />
                    Ersten Nummernkreis
                  </Button>
                )}
              </EmptyState>
            }
          />
        </Panel>
      </div>

      <Dialog
        open={form !== null}
        onClose={() => setForm(null)}
        title={locked ? 'Nummernkreis ändern' : 'Neuer Nummernkreis'}
        description="Präfix und Stellenzahl gelten für die Nummern, die ab jetzt gezogen werden."
        footer={
          <>
            <Button variant="secondary" onClick={() => setForm(null)}>
              Abbrechen
            </Button>
            <Button
              onClick={() => form && configure.mutate(form)}
              busy={configure.isPending}
              disabled={
                form === null || form.documentTypeCode.trim() === '' || form.fiscalYear === ''
              }
            >
              Speichern
            </Button>
          </>
        }
      >
        {form && (
          <div className="grid gap-4">
            {locked || orderTypeCodes.length === 0 ? (
              <TextField
                label="Belegart"
                value={form.documentTypeCode}
                onChange={(event) =>
                  setForm({ ...form, documentTypeCode: event.target.value.toUpperCase() })
                }
                disabled={locked}
                maxLength={20}
                hint="Der Code der Belegart, zum Beispiel AU."
              />
            ) : (
              <SelectField
                label="Belegart"
                value={form.documentTypeCode}
                onChange={(event) => setForm({ ...form, documentTypeCode: event.target.value })}
              >
                <option value="">Bitte wählen</option>
                {orderTypeCodes.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </SelectField>
            )}

            <TextField
              label="Geschäftsjahr"
              value={form.fiscalYear}
              onChange={(event) => setForm({ ...form, fiscalYear: event.target.value })}
              disabled={locked}
              inputMode="numeric"
              numeric
            />

            <TextField
              label="Präfix"
              value={form.prefix}
              onChange={(event) => setForm({ ...form, prefix: event.target.value })}
              maxLength={10}
              hint="Steht vor der Nummer, zum Beispiel AU-2026-."
            />

            <TextField
              label="Stellen"
              value={form.padding}
              onChange={(event) => setForm({ ...form, padding: event.target.value })}
              inputMode="numeric"
              numeric
              hint="Mit führenden Nullen aufgefüllt, 1 bis 10."
            />

            {configure.error !== null && <ErrorNotice error={configure.error} />}
          </div>
        )}
      </Dialog>
    </>
  )
}
