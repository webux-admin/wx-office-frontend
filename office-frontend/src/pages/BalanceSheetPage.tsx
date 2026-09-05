import { RequireTenant } from '../layout/RequireTenant'
import {
  ACCOUNTING_MODULE,
  ACCOUNTING_RIGHTS,
  balanceSheetKey,
  fetchBalanceSheet,
} from '../lib/accounting'
import { StatementView } from './accounting/StatementView'

/**
 * «Bilanz»: what the business owns and what it owes, OR Art. 959a.
 *
 * <p>Aggregated over the columns posting froze onto every booking line, so renaming an account or
 * moving it to another position changes no balance sheet that was printed before (GeBüV Art. 3).
 *
 * <p><b>The prior year column is always there and may be empty.</b> OR Art. 958d Abs. 2 asks for
 * the figures of the year before; where there is none, a note under the figures says so.
 *
 * <p>Reads while the module is off — what is posted stays readable for ten years (OR Art. 958f).
 */
export function BalanceSheetPage() {
  return (
    <RequireTenant permission={ACCOUNTING_RIGHTS.read} module={ACCOUNTING_MODULE}>
      {(tenantId) => (
        <StatementView
          tenantId={tenantId}
          report="balance-sheet"
          title="Bilanz"
          subtitle="Aktiven gegen Passiven, gegliedert nach OR Art. 959a, mit den Zahlen des Vorjahres."
          fetchStatement={(fiscalYearId, asOf) => fetchBalanceSheet(tenantId, fiscalYearId, asOf)}
          keyOf={(fiscalYearId, asOf) => balanceSheetKey(tenantId, fiscalYearId, asOf)}
        />
      )}
    </RequireTenant>
  )
}
