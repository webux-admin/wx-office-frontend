import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Printer } from 'lucide-react'
import { Button } from '../../components/Button'
import { ErrorNotice } from '../../components/Notice'
import { Panel } from '../../components/Panel'
import { api } from '../../lib/api'
import { showFile } from '../../lib/files'
import { formatByteCount, formatDateTime } from '../../lib/format'
import { stocktakeKey, stocktakeProtocolUrl, stocktakeUrl } from '../../lib/inventory'
import { printFile } from '../../lib/print'
import type { Stocktake } from '../../lib/types'

const TITLE = 'Dokumente'

const DESCRIPTION =
  'Das Protokoll ist beim Buchen dieser Inventur entstanden und liegt seither unverändert im Archiv. Jeder Aufruf gibt dieselbe Datei zurück; neu gezeichnet wird sie nie.'

/**
 * The archived inventory protocol of a booked count list.
 *
 * <p>Shown only on a booked list. Before that the panel is not there at all rather than
 * greyed out: there is no protocol to grey out, and a button for something that does not
 * exist is a question this screen should not ask (backend ADR-0071).
 *
 * <p>Every call hands out the bytes that were written while the list was booked. It is not
 * rendered again — a count list has to look the same in ten years (backend ADR-0024).
 *
 * @param tenantId the tenant
 * @param stocktakeId the booked count list
 * @param stocktakeNumber its number, for the line in the panel
 */
export function StocktakeProtocol({
  tenantId,
  stocktakeId,
  stocktakeNumber,
}: {
  tenantId: number
  stocktakeId: number
  stocktakeNumber?: string
}) {
  const [busy, setBusy] = useState<'show' | 'print' | null>(null)
  const [failure, setFailure] = useState<unknown>(null)

  // Size and date of the archived file travel on the count list itself, and this is the key
  // the mask around this panel already read it under — the same cache entry, not a second
  // request. Asked here rather than handed down, like the copies of a document are.
  const stocktake = useQuery({
    queryKey: stocktakeKey(tenantId, stocktakeId),
    queryFn: () => api.get<Stocktake>(stocktakeUrl(tenantId, stocktakeId)),
  })

  const open = async (how: 'show' | 'print') => {
    setBusy(how)
    setFailure(null)
    try {
      const file = await api.file(stocktakeProtocolUrl(tenantId, stocktakeId))
      if (how === 'print') await printFile(file)
      else showFile(file)
    } catch (problem) {
      setFailure(problem)
    } finally {
      setBusy(null)
    }
  }

  const byteCount = stocktake.data?.protocolByteCount
  const createdAt = stocktake.data?.protocolCreatedAt
  const facts = [
    stocktakeNumber,
    'PDF',
    byteCount === undefined ? undefined : formatByteCount(byteCount),
    createdAt === undefined ? undefined : `erstellt am ${formatDateTime(createdAt)}`,
  ].filter((fact): fact is string => fact !== undefined)

  return (
    <Panel title={TITLE} description={DESCRIPTION}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-0.5">
          <span className="text-[13px] font-medium">Inventarprotokoll</span>
          <span className="text-[12px] text-text-tertiary">{facts.join(' · ')}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => void open('show')}
            busy={busy === 'show'}
            disabled={busy !== null}
          >
            Anzeigen
          </Button>
          <Button
            variant="secondary"
            onClick={() => void open('print')}
            busy={busy === 'print'}
            disabled={busy !== null}
          >
            <Printer size={15} aria-hidden />
            Drucken
          </Button>
        </div>
      </div>
      {failure !== null && (
        <div className="mt-4">
          <ErrorNotice error={failure} />
        </div>
      )}
    </Panel>
  )
}
