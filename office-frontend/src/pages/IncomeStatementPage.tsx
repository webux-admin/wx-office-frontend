import { RequireTenant } from '../layout/RequireTenant'
import {
  ACCOUNTING_MODULE,
  ACCOUNTING_RIGHTS,
  fetchIncomeStatement,
  incomeStatementKey,
} from '../lib/accounting'
import { StatementView } from './accounting/StatementView'

/**
 * «Erfolgsrechnung»: what the business earned and what it spent, OR Art. 959b Abs. 2.
 *
 * <p>By nature of expense, in the order the law prescribes — and <b>without invented
 * subtotals</b>: no operating result, no EBIT, no result before tax. The law names positions and
 * no subtotals, and an extra line would be a statement it does not make.
 *
 * <p>The four positions that name expense and income in one breath stand in three rows each —
 * «davon Aufwand», «davon Ertrag» and the balance under them. OR Art. 958c Abs. 1 Ziff. 7 knows
 * no exception from the ban on offsetting.
 *
 * <p>Reads while the module is off (OR Art. 958f).
 */
export function IncomeStatementPage() {
  return (
    <RequireTenant permission={ACCOUNTING_RIGHTS.read} module={ACCOUNTING_MODULE}>
      {(tenantId) => (
        <StatementView
          tenantId={tenantId}
          report="income-statement"
          title="Erfolgsrechnung"
          subtitle="Nach dem Gesamtkostenverfahren (OR Art. 959b Abs. 2), mit den Zahlen des Vorjahres."
          fetchStatement={(fiscalYearId, asOf) =>
            fetchIncomeStatement(tenantId, fiscalYearId, asOf)
          }
          keyOf={(fiscalYearId, asOf) => incomeStatementKey(tenantId, fiscalYearId, asOf)}
        />
      )}
    </RequireTenant>
  )
}
