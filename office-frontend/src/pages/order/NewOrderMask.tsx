import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '../../components/Button'
import { ErrorNotice } from '../../components/Notice'
import { PageHeader } from '../../components/PageHeader'
import { Panel } from '../../components/Panel'
import { SelectField } from '../../components/SelectField'
import { TextField } from '../../components/TextField'
import { api } from '../../lib/api'
import { originOf, type Origin } from '../../lib/origin'
import { listQuery, PICKER_SIZE } from '../../lib/paging'
import { toIsoDate } from '../../lib/format'
import type { DocumentType, Page, Partner, SalesDocument } from '../../lib/types'
import { MasterDataSelect } from '../../masterdata/MasterDataSelect'

/** Where this mask goes when it was opened without naming a screen to return to. */
const LIST: Origin = { from: '/auftraege', label: 'Aufträge' }

/**
 * Starts an order.
 *
 * <p>Only what has to be fixed before the first line is asked for here: the kind of document,
 * the customer and the date. Everything else is added to the draft afterwards, because the
 * backend needs a document before it accepts a line for it.
 *
 * <p>The currency may stay empty. The backend then writes the order in the currency of the
 * tenant, which is what almost every order uses.
 */
export function NewOrderMask({ tenantId }: { tenantId: number }) {
  const navigate = useNavigate()
  const origin = originOf(useLocation().state, LIST)
  const [documentTypeId, setDocumentTypeId] = useState('')
  const [partnerId, setPartnerId] = useState('')
  const [documentDate, setDocumentDate] = useState(toIsoDate())
  const [currency, setCurrency] = useState('')
  const [exchangeRate, setExchangeRate] = useState('')

  const documentTypes = useQuery({
    queryKey: ['document-types', tenantId],
    queryFn: () => api.get<DocumentType[]>(`/api/tenants/${tenantId}/document-types`),
  })

  // A picker wants every entry, not a page, so it asks for the largest page the server
  // allows. Beyond that a dropdown is the wrong control anyway and this needs a type-ahead.
  const partnerQuery = listQuery({ role: 'customer', activeOnly: true, size: PICKER_SIZE })
  const partners = useQuery({
    queryKey: ['partners', tenantId, partnerQuery],
    queryFn: () => api.get<Page<Partner>>(`/api/tenants/${tenantId}/partners?${partnerQuery}`),
  })

  const create = useMutation({
    mutationFn: () =>
      api.post<SalesDocument>(`/api/tenants/${tenantId}/orders`, {
        documentTypeId: Number(documentTypeId),
        partnerId: Number(partnerId),
        documentDate,
        currency: currency || undefined,
        exchangeRate: exchangeRate.trim() === '' ? undefined : Number(exchangeRate),
      }),
    // A draft without a single line is no document, so this one step continues into the new
    // record rather than closing. The origin travels with it, so the way back out of the
    // order leads to where it was started from.
    onSuccess: (order) =>
      void navigate(`/auftraege/${order.id}`, { replace: true, state: { origin } }),
  })

  const orderTypes = (documentTypes.data ?? []).filter(
    (type) => type.category === 'ORDER' && type.active,
  )
  // The server already left the deactivated ones out; nothing is filtered again here.
  const customers = partners.data?.content ?? []
  const incomplete = documentTypeId === '' || partnerId === '' || documentDate === ''

  return (
    <>
      <PageHeader
        title="Neuer Auftrag"
        back={{ to: origin.from, label: origin.label }}
        subtitle="Der Beleg entsteht als Entwurf. Die Nummer wird erst beim Ausstellen gezogen."
      >
        <Button onClick={() => create.mutate()} busy={create.isPending} disabled={incomplete}>
          Entwurf anlegen
        </Button>
      </PageHeader>

      <div className="px-8 pb-12">
        {create.error !== null && (
          <div className="mb-6">
            <ErrorNotice error={create.error} />
          </div>
        )}

        <Panel title="Kopfdaten" className="max-w-[720px]">
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Belegart"
              value={documentTypeId}
              onChange={(event) => setDocumentTypeId(event.target.value)}
              disabled={documentTypes.isPending}
              hint={
                orderTypes.length === 0 && !documentTypes.isPending
                  ? 'Es gibt keine aktive Belegart der Kategorie Auftrag.'
                  : undefined
              }
              invalid={orderTypes.length === 0 && !documentTypes.isPending}
            >
              <option value="">Bitte wählen</option>
              {orderTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.code} · {type.name}
                </option>
              ))}
            </SelectField>

            <TextField
              label="Belegdatum"
              type="date"
              value={documentDate}
              onChange={(event) => setDocumentDate(event.target.value)}
            />

            <SelectField
              label="Kunde"
              value={partnerId}
              onChange={(event) => setPartnerId(event.target.value)}
              disabled={partners.isPending}
              className="sm:col-span-2"
            >
              <option value="">Bitte wählen</option>
              {customers.map((partner) => (
                <option key={partner.id} value={partner.id}>
                  {partner.partnerNumber ? `${partner.partnerNumber} · ` : ''}
                  {partner.name}
                </option>
              ))}
            </SelectField>

            <MasterDataSelect
              label="Währung"
              tenantId={tenantId}
              list="currencies"
              value={currency}
              onChange={setCurrency}
              emptyLabel="Währung des Mandanten"
              hint="Leer lassen für die Währung des Mandanten."
            />

            <TextField
              label="Umrechnungskurs"
              value={exchangeRate}
              onChange={(event) => setExchangeRate(event.target.value)}
              inputMode="decimal"
              numeric
              hint="Nur bei Fremdwährung nötig."
            />
          </div>
        </Panel>
      </div>
    </>
  )
}
