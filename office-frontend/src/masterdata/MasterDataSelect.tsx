import type { ComponentProps } from 'react'
import type { MasterDataList } from '../lib/types'
import { CodeSelect } from './CodeSelect'
import { useMasterDataEntries } from './useMasterData'

type MasterDataSelectProps = Omit<ComponentProps<typeof CodeSelect>, 'entries'> & {
  /** The tenant whose list is meant; null while none exists yet, which offers nothing. */
  tenantId: number | null
  /** The list, by the path segment it is served under. */
  list: MasterDataList
}

/**
 * A dropdown over one of the lists the tenant maintains.
 *
 * <p>Fetches the list itself so a mask only names which one it wants. Several dropdowns over
 * the same list share one request, because they share the query key.
 */
export function MasterDataSelect({ tenantId, list, ...rest }: MasterDataSelectProps) {
  return <CodeSelect entries={useMasterDataEntries(tenantId, list)} {...rest} />
}
