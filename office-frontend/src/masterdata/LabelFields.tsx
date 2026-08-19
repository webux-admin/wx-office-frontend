import { TextField } from '../components/TextField'
import { defaultCodeOf } from '../lib/masterData'
import { useMasterDataEntries } from './useMasterData'

/**
 * The translations of one label, one field per language documents may be written in.
 *
 * <p>Which languages those are is a decision of the tenant, not of this frontend: the
 * language list says which of its entries carry documents. The default language has no field
 * of its own — its text is the name of the record, and a second input for the same value
 * would invite the two to disagree.
 *
 * <p>Nothing is rendered when the tenant issues documents in one language only, which is the
 * normal case and would otherwise be an empty section on every dialog, nor while the language
 * list has not arrived yet.
 */
export function LabelFields({
  tenantId,
  translations,
  onChange,
  disabled = false,
}: {
  tenantId: number | null
  /** The translations as the mask holds them, by language code. */
  translations: Record<string, string>
  onChange: (translations: Record<string, string>) => void
  disabled?: boolean
}) {
  const languages = useMasterDataEntries(tenantId, 'languages')
  const defaultLanguage = defaultCodeOf(languages)
  const others = languages.filter(
    (language) => language.documentLanguage === true && language.code !== defaultLanguage,
  )

  // Nothing while the language list is still on its way: without a known default language a
  // field for it would appear next to the name, and what was typed into it would be dropped on
  // save, where the name wins.
  if (defaultLanguage === '' || others.length === 0) return null

  return (
    <fieldset className="border-t border-line-subtle pt-4">
      <legend className="text-[12px] font-medium text-text-secondary">Übersetzungen</legend>
      <p className="mt-1 text-[12px] text-text-tertiary">
        Fehlt eine, steht die Bezeichnung auch auf einem Beleg in dieser Sprache.
      </p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {others.map((language) => (
          <TextField
            key={language.code}
            label={language.name}
            value={translations[language.code] ?? ''}
            onChange={(event) => onChange({ ...translations, [language.code]: event.target.value })}
            disabled={disabled}
            maxLength={60}
          />
        ))}
      </div>
    </fieldset>
  )
}
