import type { ComponentProps } from 'react'
import { CodeSelect } from './CodeSelect'
import { usePaymentTerms } from './useMasterData'

type PaymentTermSelectProps = Omit<ComponentProps<typeof CodeSelect>, 'entries'> & {
  /** The tenant whose terms are meant; null while none exists yet, which offers nothing. */
  tenantId: number | null
}

/**
 * A dropdown over the payment terms of the tenant.
 *
 * <p>The terms live in tables of their own rather than in the generic selection lists,
 * because a term is more than a name: it carries a period, a basis and up to three discount
 * stages. For a dropdown none of that matters, so this shares {@link CodeSelect} with the
 * other lists.
 */
export function PaymentTermSelect({ tenantId, ...rest }: PaymentTermSelectProps) {
  return <CodeSelect entries={usePaymentTerms(tenantId).data ?? []} {...rest} />
}
