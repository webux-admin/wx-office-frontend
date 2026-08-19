import type { ComponentProps } from 'react'
import type { CatalogueName } from '../lib/types'
import { CodeSelect } from './CodeSelect'
import { useCatalogue } from './useMasterData'

type CatalogueSelectProps = Omit<ComponentProps<typeof CodeSelect>, 'entries'> & {
  tenantId: number | null
  /** The catalogue, by the path segment it is served under. */
  catalogue: CatalogueName
}

/**
 * A dropdown over one of the structural enums.
 *
 * <p>Same field as {@link MasterDataSelect} for the person using it; the difference is that
 * these values cannot be added to, only renamed, reordered and hidden.
 */
export function CatalogueSelect({ tenantId, catalogue, ...rest }: CatalogueSelectProps) {
  return <CodeSelect entries={useCatalogue(tenantId, catalogue)} {...rest} />
}
