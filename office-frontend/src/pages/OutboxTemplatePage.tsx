import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { ErrorNotice, LoadingBlock, WarningNotice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { Tabs } from '../components/Tabs'
import { TextAreaField } from '../components/TextAreaField'
import { TextField } from '../components/TextField'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import { api } from '../lib/api'
import {
  MAIL_LANGUAGES,
  MAIL_PLACEHOLDERS,
  mailTemplatesKey,
  mailTemplatesUrl,
  OUTBOX_RIGHTS,
} from '../lib/outbox'
import type { MailTemplate } from '../lib/types'

/**
 * The covering texts a document goes out with, per category and language.
 *
 * <p>The application ships all twenty. What a tenant does not touch stays the shipped text and
 * has no row of its own — only a deviation is stored, and «Auf Standard zurücksetzen» deletes
 * that deviation rather than the text (backend ADR-0085).
 */
export function OutboxTemplatePage() {
  return (
    <RequireTenant permission={OUTBOX_RIGHTS.read}>
      {(tenantId) => <Templates tenantId={tenantId} />}
    </RequireTenant>
  )
}

/** What one text looks like while somebody is typing in it. */
type Draft = { subject: string; body: string }

/** Identifies one text, as it stands in the map of open edits. */
function keyOf(categoryCode: string, languageCode: string): string {
  return `${categoryCode}/${languageCode}`
}

function Templates({ tenantId }: { tenantId: number }) {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const mayConfigure = can(OUTBOX_RIGHTS.configure)

  const [category, setCategory] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  // Where a clicked placeholder goes. Whichever field was last written in wins; without it
  // the buttons would have to guess, and guessing wrong drops text into the subject.
  const focused = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)

  const templates = useQuery({
    queryKey: mailTemplatesKey(tenantId),
    queryFn: () => api.get<MailTemplate[]>(mailTemplatesUrl(tenantId)),
  })

  const rows = templates.data ?? []
  const categories = uniqueCategories(rows)
  const openCategory = category ?? categories[0]?.id ?? ''

  const save = useMutation({
    mutationFn: (template: MailTemplate) => {
      const draft = drafts[keyOf(template.categoryCode, template.languageCode)]
      return api.put<MailTemplate>(
        `${mailTemplatesUrl(tenantId)}/${template.categoryCode}/${template.languageCode}`,
        { subject: draft?.subject ?? template.subject, body: draft?.body ?? template.body },
      )
    },
    onSuccess: (_answer, template) => {
      forget(template)
      void queryClient.invalidateQueries({ queryKey: mailTemplatesKey(tenantId) })
    },
  })

  // Deletes the deviation, not the text: afterwards the shipped one applies again. That is no
  // breach of «never delete, only deactivate» — what goes is a setting, not a document.
  const reset = useMutation({
    mutationFn: (template: MailTemplate) =>
      api.delete<MailTemplate>(
        `${mailTemplatesUrl(tenantId)}/${template.categoryCode}/${template.languageCode}`,
      ),
    onSuccess: (_answer, template) => {
      forget(template)
      void queryClient.invalidateQueries({ queryKey: mailTemplatesKey(tenantId) })
    },
  })

  const forget = (template: MailTemplate) =>
    setDrafts((current) => {
      const next = { ...current }
      delete next[keyOf(template.categoryCode, template.languageCode)]
      return next
    })

  const edit = (template: MailTemplate, change: Partial<Draft>) =>
    setDrafts((current) => {
      const key = keyOf(template.categoryCode, template.languageCode)
      const base = current[key] ?? { subject: template.subject, body: template.body }
      return { ...current, [key]: { ...base, ...change } }
    })

  /**
   * Puts a placeholder where the writing mark stands.
   *
   * <p>Clickable rather than typed: an unknown placeholder is refused when the template is
   * saved, and `{{beleknummer}}` is exactly the kind of thing that gets typed.
   */
  const insert = (template: MailTemplate, placeholder: string) => {
    const field = focused.current
    if (field === null) return
    const text = `{{${placeholder}}}`
    const start = field.selectionStart ?? field.value.length
    const end = field.selectionEnd ?? start
    const next = `${field.value.slice(0, start)}${text}${field.value.slice(end)}`
    edit(template, field instanceof HTMLTextAreaElement ? { body: next } : { subject: next })
    // The mark lands behind what was inserted, so a second click does not overwrite the first.
    window.requestAnimationFrame(() => {
      field.focus()
      field.setSelectionRange(start + text.length, start + text.length)
    })
  }

  const shown = rows.filter((template) => template.categoryCode === openCategory)
  const busy = save.isPending || reset.isPending

  return (
    <>
      <PageHeader
        title="Mailvorlagen"
        subtitle="Betreff und Begleittext, mit denen Belege hinausgehen"
      />

      <div className="px-8 pb-12">
        {templates.isPending && <LoadingBlock />}
        {templates.error !== null && <ErrorNotice error={templates.error} />}
        {save.error !== null && <ErrorNotice error={save.error} />}
        {reset.error !== null && <ErrorNotice error={reset.error} />}

        {!templates.isPending && templates.error === null && (
          <>
            {!mayConfigure && (
              <WarningNotice>
                Zum Ändern der Vorlagen fehlt das Recht «Postausgang einrichten».
              </WarningNotice>
            )}

            <Tabs
              tabs={categories}
              active={openCategory}
              onChange={setCategory}
              label="Belegart der Vorlage"
            />

            {shown.map((template) => {
              const key = keyOf(template.categoryCode, template.languageCode)
              const draft = drafts[key]
              const typed = draft ?? { subject: template.subject, body: template.body }
              const changed = draft !== undefined
              return (
                <Panel
                  key={key}
                  title={languageLabel(template.languageCode)}
                  className="mt-4"
                  action={
                    <span className="flex items-center gap-3">
                      {/* Says where the text comes from. Without it nobody can tell an
                          untouched shipped text from one that was typed to look the same. */}
                      <Badge tone={template.overridden ? 'accent' : 'muted'}>
                        {template.overridden ? 'Eigener Text' : 'mitgeliefert'}
                      </Badge>
                      {mayConfigure && template.overridden && (
                        <Button
                          variant="secondary"
                          onClick={() => reset.mutate(template)}
                          disabled={busy}
                        >
                          Auf Standard zurücksetzen
                        </Button>
                      )}
                      {mayConfigure && (
                        <Button
                          onClick={() => save.mutate(template)}
                          busy={save.isPending}
                          disabled={!changed || busy}
                        >
                          Speichern
                        </Button>
                      )}
                    </span>
                  }
                >
                  <TextField
                    label="Betreff"
                    value={typed.subject}
                    maxLength={255}
                    disabled={!mayConfigure || busy}
                    onFocus={(event) => {
                      focused.current = event.currentTarget
                    }}
                    onChange={(event) => edit(template, { subject: event.target.value })}
                  />
                  <TextAreaField
                    label="Text"
                    value={typed.body}
                    rows={8}
                    className="mt-4"
                    disabled={!mayConfigure || busy}
                    onFocus={(event) => {
                      focused.current = event.currentTarget
                    }}
                    onChange={(event) => edit(template, { body: event.target.value })}
                  />
                  {mayConfigure && (
                    <div className="mt-3">
                      <p className="text-[12px] text-text-secondary">
                        Platzhalter einfügen — sie werden beim Versand ersetzt:
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {MAIL_PLACEHOLDERS.map((placeholder) => (
                          <button
                            key={placeholder.name}
                            type="button"
                            title={placeholder.hint}
                            disabled={busy}
                            onClick={() => insert(template, placeholder.name)}
                            className="rounded-[var(--radius-sm)] bg-sunken px-2 py-1 font-mono text-[11px] text-text-secondary transition-colors hover:text-accent-text disabled:opacity-50"
                          >
                            {`{{${placeholder.name}}}`}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </Panel>
              )
            })}
          </>
        )}
      </div>
    </>
  )
}

/**
 * The categories the backend sent, each once, in the order it sent them.
 *
 * <p>Read off the answer instead of written out here: the backend owns the catalogue, and a
 * sixth category would otherwise reach the tabs of one of the two places only.
 *
 * @param templates every text of the tenant
 * @returns one tab per category
 */
function uniqueCategories(templates: MailTemplate[]): { id: string; label: string }[] {
  const seen = new Map<string, string>()
  for (const template of templates) {
    if (!seen.has(template.categoryCode)) seen.set(template.categoryCode, template.categoryLabel)
  }
  return [...seen].map(([id, label]) => ({ id, label }))
}

/**
 * @param code the language as the backend spells it
 * @returns the German name, or the code for a language this version does not know
 */
function languageLabel(code: string): string {
  return MAIL_LANGUAGES.find((language) => language.code === code)?.label ?? code
}
