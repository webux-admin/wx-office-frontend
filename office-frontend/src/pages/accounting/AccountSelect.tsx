import { useQuery } from '@tanstack/react-query'
import type { ComponentProps } from 'react'
import { accountsKey, fetchAccounts } from '../../lib/accounting'
import type { SelectableEntry } from '../../lib/masterData'
import { PICKER_SIZE, listQuery } from '../../lib/paging'
import type { Account, AccountType } from '../../lib/types'
import { CodeSelect } from '../../masterdata/CodeSelect'

type AccountSelectProps = Omit<ComponentProps<typeof CodeSelect>, 'entries'> & {
  /** The tenant whose chart is meant. */
  tenantId: number
  /**
   * Which kind of account is offered. Revenue accounts by default, because that is what a
   * product and a dunning fee are booked to; `ALL` offers every postable account,
   * which is what a bank movement needs — rent is an expense, a refund a revenue.
   */
  accountType?: AccountType | 'ALL'
}

/**
 * What the picker asks the chart for.
 *
 * <p>Read whole rather than page by page: a dropdown wants every account, and beyond
 * {@link PICKER_SIZE} of one type a dropdown is the wrong control anyway.
 *
 * <p>`postable` on top of `activeOnly` on purpose. The two ask different questions: an account
 * can be active and still barred from being posted to by hand, and offering such an account
 * here would be a trap — whoever picks it gets a refusal at the far end (backend ADR-0112).
 *
 * @param accountType the kind of account to offer
 * @returns the query string, without the leading `?`
 */
function chartQuery(accountType: AccountType | 'ALL'): string {
  return listQuery({
    accountType: accountType === 'ALL' ? undefined : accountType,
    activeOnly: true,
    postable: true,
    size: PICKER_SIZE,
    sort: 'accountNumber,asc',
  })
}

/**
 * Turns accounts into what a dropdown offers.
 *
 * <p>Number and name in one string, because the option label is one string: the number is what
 * gets stored and what a bookkeeper reads, the name is what everybody else does.
 *
 * @param accounts the accounts as the chart returned them
 * @returns one entry per account, in the order they came
 */
function toEntries(accounts: readonly Account[]): SelectableEntry[] {
  return accounts.map((account) => ({
    code: account.accountNumber,
    name: `${account.accountNumber} · ${account.name}`,
  }))
}

/**
 * A dropdown over the chart of accounts of the tenant.
 *
 * <p>Stores the **account number**, not the id: that is what a product and a document line
 * carry, and a number survives a chart being rebuilt.
 *
 * <p><b>Whoever renders it has already checked that the session may read the chart.</b> The
 * endpoint behind it runs on `ACCOUNTING_READ`, so a mask that shows it to somebody without
 * that right shows an empty dropdown and nothing else — the field belongs hidden there.
 *
 * <p>Nothing is shown while the accounts are on their way and nothing is said when they do not
 * arrive: the mask around it reports that. A stored number the list does not offer stays
 * selected either way, see `selectOptions`.
 */
export function AccountSelect({
  tenantId,
  accountType = 'REVENUE',
  ...rest
}: AccountSelectProps) {
  const query = chartQuery(accountType)
  const accounts = useQuery({
    queryKey: accountsKey(tenantId, query),
    queryFn: () => fetchAccounts(tenantId, query),
  })

  return <CodeSelect entries={toEntries(accounts.data?.content ?? [])} {...rest} />
}
