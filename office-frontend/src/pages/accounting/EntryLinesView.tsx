import { formatAmount } from '../../lib/format'
import type { EntryLine } from '../../lib/types'

/**
 * The lines of one posted entry: account, text, debit and credit.
 *
 * <p>A plain table and not a `DataTable`: it is drawn <b>inside</b> a row of one, and a table
 * with its own pager, its own empty state and its own sort inside a folded-open row would be a
 * second list where a reader expects a detail.
 *
 * <p>Read off the frozen columns of the booking line and never off the chart, so renaming an
 * account leaves an entry that was printed years ago reading the way it was printed (GeBüV
 * Art. 3, backend ADR-0112).
 */
export function EntryLinesView({
  lines,
  currency,
}: {
  lines: readonly EntryLine[]
  /** The bookkeeping currency of the entry, named once above the columns rather than per line. */
  currency: string
}) {
  if (lines.length === 0) {
    return <p className="text-[12px] text-text-secondary">Diese Buchung trägt keine Zeilen.</p>
  }
  return (
    <table className="w-full border-collapse text-[12px]">
      <thead>
        <tr className="text-text-tertiary">
          <th scope="col" className="w-[110px] py-1 text-left font-medium">
            Konto
          </th>
          <th scope="col" className="py-1 text-left font-medium">
            Text
          </th>
          <th scope="col" className="w-[120px] py-1 text-right font-medium">
            Soll {currency}
          </th>
          <th scope="col" className="w-[120px] py-1 text-right font-medium">
            Haben {currency}
          </th>
        </tr>
      </thead>
      <tbody>
        {lines.map((line) => (
          <tr key={line.id ?? line.lineNumber}>
            <td className="py-1 font-mono tabular-nums">{line.accountNumber ?? ''}</td>
            <td className="py-1">{line.accountName ?? line.text ?? ''}</td>
            <td className="py-1 text-right font-mono tabular-nums">
              {line.debit ? formatAmount(line.debit) : ''}
            </td>
            <td className="py-1 text-right font-mono tabular-nums">
              {line.credit ? formatAmount(line.credit) : ''}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
