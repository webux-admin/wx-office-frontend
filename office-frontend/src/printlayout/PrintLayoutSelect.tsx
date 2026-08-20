import { CodeSelect } from '../masterdata/CodeSelect'
import type { SelectableEntry } from '../lib/masterData'
import { usePrintLayouts } from './usePrintLayouts'

/**
 * A dropdown over the forms the tenant prints on.
 *
 * <p>Reads the same list the designer edits, so a form drawn a minute ago can be chosen right
 * away. A retired form stays selectable only where a record already carries it.
 *
 * @param tenantId the tenant, null while none exists yet
 * @param value the code the kind of document carries, empty when none is chosen
 * @param onChange called with the code that was picked
 */
export function PrintLayoutSelect({
  tenantId,
  value,
  onChange,
  disabled = false,
}: {
  tenantId: number | null
  value: string
  onChange: (code: string) => void
  disabled?: boolean
}) {
  const layouts = usePrintLayouts(tenantId)
  const entries: SelectableEntry[] = (layouts.data ?? []).map((form) => ({
    code: form.code,
    name: form.name,
    active: form.active,
  }))

  return (
    <CodeSelect
      label="Druckvorlage"
      entries={entries}
      value={value}
      onChange={onChange}
      disabled={disabled}
      emptyLabel="Standardvorlage"
      hint="Bestimmt, wie ein Beleg dieser Art aussieht."
    />
  )
}
