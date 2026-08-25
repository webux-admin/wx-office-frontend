import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { ErrorNotice, LoadingBlock } from '../../components/Notice'
import { TextField } from '../../components/TextField'
import { api } from '../../lib/api'
import { formatQuantity } from '../../lib/format'
import {
  lineReasonUrl,
  STOCK_MOVEMENT_PATH,
  stocktakeDifferencesKey,
  stocktakeUrl,
} from '../../lib/inventory'
import { listQuery } from '../../lib/paging'
import { mayPost, uncountedText } from './countForm'
import type { Stocktake, StocktakeDifference, UncountedHandling } from '../../lib/types'

/**
 * What booking a count list would change, and the two decisions before it.
 *
 * <p>Only the lines that differ: what matches needs no decision, and a list that showed every
 * line would hide the ones that matter.
 *
 * <p>Two things have to be settled before the button opens. Every difference above the
 * tenant's threshold needs a reason — that is what the threshold is for — and the uncounted
 * lines need an explicit choice. The second one is <b>not a confirmation but a choice</b>: two
 * equal buttons, no preselection, and the answer stays on the record. An incomplete count must
 * never look like a complete one (backend ADR-0070).
 *
 * @param tenantId the tenant
 * @param stocktake the count list about to be booked
 * @param open whether the dialog is on screen
 * @param onClose closes it without booking
 * @param onPosted called with the booked list
 */
export function DifferenceDialog({
  tenantId,
  stocktake,
  open,
  onClose,
  onPosted,
}: {
  tenantId: number
  stocktake: Stocktake
  open: boolean
  onClose: () => void
  onPosted: (posted: Stocktake) => void
}) {
  const queryClient = useQueryClient()
  const [handling, setHandling] = useState<UncountedHandling | undefined>(undefined)
  const [reasons, setReasons] = useState<Record<number, string>>({})

  const differences = useQuery({
    queryKey: stocktakeDifferencesKey(tenantId, stocktake.id),
    queryFn: () =>
      api.get<StocktakeDifference[]>(`${stocktakeUrl(tenantId, stocktake.id)}/differences`),
    enabled: open,
  })

  const rows = differences.data ?? []
  const reasonOf = (row: StocktakeDifference) =>
    reasons[row.lineId] ?? row.differenceReason ?? ''
  const unexplained = rows.filter(
    (row) => row.needsReason && reasonOf(row).trim() === '',
  ).length
  const sum = rows.reduce((total, row) => total + row.difference, 0)
  const uncounted = uncountedText(stocktake.lineCount, stocktake.countedCount)
  // Where every line was counted there is nothing to choose about: «what happens to the
  // uncounted ones» has no subject. The server still wants an answer — the field is required
  // so it can never be forgotten — and the only truthful one here is that nothing is left.
  const chosenHandling = uncounted === '' ? 'KEEP' : handling

  const saveReason = useMutation({
    mutationFn: (row: StocktakeDifference) =>
      api.put(lineReasonUrl(tenantId, stocktake.id, row.lineId), {
        reason: reasonOf(row).trim() === '' ? undefined : reasonOf(row).trim(),
      }),
  })

  const post = useMutation({
    mutationFn: () =>
      api.post<Stocktake>(`${stocktakeUrl(tenantId, stocktake.id)}/post`, {
        uncountedHandling: chosenHandling,
      }),
    onSuccess: (posted) => {
      void queryClient.invalidateQueries({ queryKey: ['stocktakes', tenantId] })
      void queryClient.invalidateQueries({ queryKey: ['stocktake', tenantId] })
      void queryClient.invalidateQueries({ queryKey: ['stock', tenantId] })
      void queryClient.invalidateQueries({ queryKey: ['stock-movements', tenantId] })
      onPosted(posted)
    },
  })

  return (
    <Dialog
      open={open}
      wide
      title="Differenzen prüfen"
      description="Nach dem Buchen ändert sich an dieser Inventur nichts mehr."
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            onClick={() => post.mutate()}
            busy={post.isPending}
            disabled={!mayPost(chosenHandling, unexplained)}
          >
            Buchen
          </Button>
        </>
      }
    >
      {differences.isLoading ? (
        <LoadingBlock />
      ) : differences.isError ? (
        <ErrorNotice error={differences.error} />
      ) : (
        <div className="grid gap-4">
          {rows.length === 0 ? (
            <p className="text-[13px] text-text-secondary">
              Keine Differenz. Das Buchen schreibt keine Bewegung.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-line text-left text-[12px] text-text-tertiary">
                    <th className="px-3 py-2">Bezeichnung</th>
                    <th className="px-3 py-2 w-[90px] text-right">Soll</th>
                    <th className="px-3 py-2 w-[100px] text-right">Bestand jetzt</th>
                    <th className="px-3 py-2 w-[90px] text-right">Gezählt</th>
                    <th className="px-3 py-2 w-[90px] text-right">Differenz</th>
                    <th className="px-3 py-2">Grund</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.lineId} className="border-b border-line">
                      <td className="px-3 py-2">
                        <span className="font-medium">{row.productName}</span>
                        {row.lotNumber !== undefined && (
                          <span className="ml-2 font-mono text-[11px] text-text-tertiary">
                            {row.lotNumber}
                          </span>
                        )}
                        {/* The one thing that makes a surprising figure explainable: stock
                            moved after the count started, so the count is not being undone. */}
                        {row.movedSinceCounting && (
                          <Link
                            to={`${STOCK_MOVEMENT_PATH}?${listQuery({ produkt: row.productId })}`}
                            className="ml-2 text-[11px] text-accent-text underline-offset-2 hover:underline"
                          >
                            seit Zählbeginn bewegt
                          </Link>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {formatQuantity(row.expectedQuantity)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {formatQuantity(row.stockNow)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {formatQuantity(row.countedQuantity ?? 0)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-warning">
                        {formatQuantity(row.difference)}
                      </td>
                      <td className="px-3 py-2">
                        <TextField
                          label={"Grund " + row.productName}
                          value={reasonOf(row)}
                          onChange={(event) =>
                            setReasons((current) => ({
                              ...current,
                              [row.lineId]: event.target.value,
                            }))
                          }
                          onBlur={() => saveReason.mutate(row)}
                          invalid={row.needsReason && reasonOf(row).trim() === ''}
                          hint={
                            row.needsReason && reasonOf(row).trim() === ''
                              ? 'Diese Abweichung braucht einen Grund.'
                              : undefined
                          }
                        />
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td className="px-3 py-2 text-[12px] text-text-tertiary" colSpan={4}>
                      Summe der Differenzen
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums font-medium">
                      {formatQuantity(sum)}
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Two equal buttons and no preselection: this is a choice, not a confirmation. */}
          {uncounted !== '' && (
            <div className="rounded-[var(--radius-md)] border border-line bg-sunken px-4 py-3">
              <p className="text-[13px]">{uncounted}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant={handling === 'KEEP' ? 'primary' : 'secondary'}
                  onClick={() => setHandling('KEEP')}
                >
                  Als unverändert übernehmen
                </Button>
                <Button
                  variant={handling === 'SKIP' ? 'primary' : 'secondary'}
                  onClick={() => setHandling('SKIP')}
                >
                  Nicht buchen
                </Button>
              </div>
              <p className="mt-2 text-[12px] text-text-tertiary">
                Die Wahl steht danach auf der Zählliste und im Protokoll.
              </p>
            </div>
          )}

          {post.error !== null && <ErrorNotice error={post.error} />}
        </div>
      )}
    </Dialog>
  )
}
