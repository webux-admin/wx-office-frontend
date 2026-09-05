import { TriangleAlert } from 'lucide-react'
import { SplitButton, type SplitButtonAction } from '../../components/SplitButton'
import type { EntryTemplate } from '../../lib/types'

/** What the menu says for itself while the tenant has no template at all. */
export const NO_TEMPLATE_NOTE =
  'Noch keine Vorlage. Tippen Sie eine Buchung und speichern Sie sie als Vorlage.'

/**
 * «Vorlage anwenden» over the entry grid: the templates of the tenant, and behind a rule the
 * two dialogs that maintain them.
 *
 * <p><b>The left half fires the first template of the list</b> — the one the tenant put on top
 * in the managing dialog. That is what gives `sortOrder` a visible purpose, and a tenant with a
 * single template gets away with one click.
 *
 * <p><b>With no template only that left half goes off, never the whole button.</b> «Als Vorlage
 * speichern …» sits behind the arrow and is the only way to a first template: a wholly disabled
 * button would lock the tenant out of it, and the mask would bolt itself shut.
 *
 * <p>A template the server reported a finding on carries a ⚠ and the sentence. It stays in the
 * menu and stays applicable: a template is the property of the tenant, and a program that
 * quietly repairs or removes one takes their own aid away from them.
 */
export function EntryTemplateMenu({
  templates,
  onApply,
  onSave,
  onManage,
  disabled = false,
}: {
  /** The templates in menu order, as the list delivered them. */
  templates: readonly EntryTemplate[]
  onApply: (template: EntryTemplate) => void
  onSave: () => void
  onManage: () => void
  /** Off while a save is running, so nothing changes underneath a request. */
  disabled?: boolean
}) {
  const empty = templates.length === 0

  const actions: SplitButtonAction[] = [
    ...templates.map((template) => ({
      id: `template-${template.id}`,
      label: template.name,
      hint: hintOf(template),
      icon:
        template.problems.length === 0 ? undefined : (
          <TriangleAlert size={14} className="text-warning" aria-hidden />
        ),
      onSelect: () => onApply(template),
    })),
    {
      id: 'save-template',
      label: 'Als Vorlage speichern …',
      separatorBefore: true,
      onSelect: onSave,
    },
    {
      id: 'manage-templates',
      label: 'Vorlagen verwalten …',
      onSelect: onManage,
    },
  ]

  return (
    <SplitButton
      onClick={() => templates.length > 0 && onApply(templates[0])}
      menuLabel="Vorlagen"
      actions={actions}
      disabled={disabled}
      primaryDisabled={empty}
      note={empty ? NO_TEMPLATE_NOTE : undefined}
    >
      Vorlage anwenden
    </SplitButton>
  )
}

/**
 * The line under the name: what the template is for, or what stands in the way of it.
 *
 * <p>The finding wins where there is one. It is the more urgent of the two sentences, and it
 * arrives from the server as a finished sentence — the screen shows it and words nothing itself.
 */
function hintOf(template: EntryTemplate): string | undefined {
  if (template.problems.length > 0) return template.problems.join(' ')
  return template.description ?? undefined
}
