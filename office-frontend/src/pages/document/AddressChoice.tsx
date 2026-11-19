import { Badge } from '../../components/Badge'
import type { PartnerAddress } from '../../lib/types'
import { useCatalogueLabel } from '../../masterdata/useMasterData'
import { addressLines } from '../partner/addressForm'

/**
 * Picks one of a customer's stored addresses, as a list of cards to choose from.
 *
 * <p>Each card reads as the address is printed, with what it is marked for: «Standard»,
 * «Rechnung», «Lieferschein». The card that is selected is the address the document carries.
 */
export function AddressChoice({
  tenantId,
  addresses,
  value,
  onChange,
  name,
}: {
  tenantId: number
  addresses: PartnerAddress[]
  /** The id of the address the document goes to. */
  value: number | undefined
  onChange: (addressId: number) => void
  /** Groups the radio buttons; one name per choice on the page. */
  name: string
}) {
  const usageLabel = useCatalogueLabel(tenantId, 'address-usage')

  return (
    <fieldset className="grid gap-2">
      <legend className="sr-only">Adresse</legend>
      {addresses.map((address) => {
        const lines = addressLines(address)
        const checked = address.id === value
        return (
          <label
            key={address.id}
            className={`flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border px-3 py-2 ${
              checked ? 'border-accent bg-accent/8' : 'border-line-subtle hover:bg-sunken'
            }`}
          >
            <input
              type="radio"
              name={name}
              className="mt-1"
              checked={checked}
              onChange={() => address.id !== undefined && onChange(address.id)}
            />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{lines[0]}</span>
              <span className="block text-text-secondary">{lines.slice(1).join(', ')}</span>
            </span>
            <span className="flex flex-wrap justify-end gap-1">
              {address.useAsDefault && <Badge tone="accent">Standard</Badge>}
              {(address.usages ?? []).map((usage) => (
                <Badge key={usage} tone="neutral">
                  {usageLabel(usage)}
                </Badge>
              ))}
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}
