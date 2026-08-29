import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { ErrorNotice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { Tabs } from '../components/Tabs'
import { TextField } from '../components/TextField'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import {
  DUNNING_RIGHTS,
  dunningLevelsKey,
  dunningPlaceholdersKey,
  dunningTextsKey,
  fetchDunningLevels,
  fetchDunningPlaceholders,
  fetchDunningTextPreview,
  fetchDunningTexts,
  insertPlaceholder,
  resetDunningText,
  saveDunningText,
  singleInvoiceTokensIn,
} from '../lib/dunning'
import { useMasterDataList } from '../masterdata/useMasterData'
import type { DunningLevel, DunningPlaceholder, DunningText } from '../lib/types'

/** What the mask edits, per language. */
type TextForm = {
  title: string
  introText: string
  closingText: string
  mailSubject: string
  mailBody: string
}

function formOf(text: DunningText | undefined): TextForm {
  return {
    title: text?.title ?? '',
    introText: text?.introText ?? '',
    closingText: text?.closingText ?? '',
    mailSubject: text?.mailSubject ?? '',
    mailBody: text?.mailBody ?? '',
  }
}

/**
 * The texts a dunning level goes out with: title, covering letter, closing line, mail.
 *
 * <p>One register per level, one panel per language. The placeholders come from a **closed**
 * catalogue and are checked when the text is saved, not when it is rendered — a typo that only
 * surfaces at render time surfaces in a letter already with a customer (backend ADR-0097).
 *
 * <p>The preview renders **both** operating modes side by side. Seven placeholders are empty
 * in a collective reminder by design, and the line that carried one of them disappears whole:
 * a preview of only the single reminder would hide exactly that.
 */
export function DunningTextPage() {
  return (
    <RequireTenant permission={DUNNING_RIGHTS.read}>
      {(tenantId) => <Texts tenantId={tenantId} />}
    </RequireTenant>
  )
}

function Texts({ tenantId }: { tenantId: number }) {
  const { can } = useAuth()
  const mayWrite = can(DUNNING_RIGHTS.write)

  const levels = useQuery({
    queryKey: dunningLevelsKey(tenantId),
    queryFn: () => fetchDunningLevels(tenantId),
  })

  const placeholders = useQuery({
    queryKey: dunningPlaceholdersKey(tenantId),
    queryFn: () => fetchDunningPlaceholders(tenantId),
  })

  const [levelId, setLevelId] = useState<number | null>(null)

  const rows = levels.data ?? []
  const active = levelId ?? rows[0]?.id ?? null
  const level = rows.find((entry) => entry.id === active)

  if (levels.error !== null) {
    return (
      <>
        <PageHeader title="Mahntexte" />
        <div className="px-8 pb-12">
          <ErrorNotice error={levels.error} />
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Mahntexte"
        subtitle="Titel, Anschreiben, Schlusstext und Mail — je Stufe und je Sprache"
      />

      <div className="grid gap-6 px-8 pb-12">
        {rows.length > 0 && active !== null && (
          // The register carries the level id as text: Tabs keys on a string, and the id
          // is the only thing about a level that cannot collide.
          <Tabs<string>
            tabs={rows.map((entry) => ({
              id: String(entry.id),
              label: `${entry.levelNo}. ${entry.dunningTypeName ?? 'Stufe'}`,
            }))}
            active={String(active)}
            onChange={(id) => setLevelId(Number(id))}
            label="Mahnstufe"
          />
        )}

        {level !== undefined && (
          <LevelTexts
            key={level.id}
            tenantId={tenantId}
            level={level}
            placeholders={placeholders.data ?? []}
            mayWrite={mayWrite}
          />
        )}

        {levels.isSuccess && rows.length === 0 && (
          <p className="text-[13px] text-text-secondary">
            Noch keine Mahnstufen. Sie entstehen beim ersten Öffnen der Mahneinstellungen.
          </p>
        )}
      </div>
    </>
  )
}

function LevelTexts({
  tenantId,
  level,
  placeholders,
  mayWrite,
}: {
  tenantId: number
  level: DunningLevel
  placeholders: DunningPlaceholder[]
  mayWrite: boolean
}) {
  const languages = useMasterDataList(tenantId, 'languages')

  const texts = useQuery({
    queryKey: dunningTextsKey(tenantId, level.id),
    queryFn: () => fetchDunningTexts(tenantId, level.id),
  })

  const stored = texts.data ?? []
  const codes = languages.data?.map((entry) => entry.code)
    ?? stored.map((text) => text.languageCode)

  return (
    <div className="grid gap-6">
      {texts.error !== null && <ErrorNotice error={texts.error} />}

      {codes.map((code) => (
        <LanguagePanel
          key={`${level.id}-${code}`}
          tenantId={tenantId}
          level={level}
          language={code}
          stored={stored.find((text) => text.languageCode === code)}
          placeholders={placeholders}
          mayWrite={mayWrite}
        />
      ))}
    </div>
  )
}

function LanguagePanel({
  tenantId,
  level,
  language,
  stored,
  placeholders,
  mayWrite,
}: {
  tenantId: number
  level: DunningLevel
  language: string
  stored: DunningText | undefined
  placeholders: DunningPlaceholder[]
  mayWrite: boolean
}) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<TextForm>(() => formOf(stored))
  const [field, setField] = useState<keyof TextForm>('introText')
  const [previewing, setPreviewing] = useState(false)
  const fields = useRef<Partial<Record<keyof TextForm, HTMLTextAreaElement | null>>>({})

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: dunningTextsKey(tenantId, level.id) })
  }

  const save = useMutation({
    mutationFn: () =>
      saveDunningText(tenantId, level.id, language, {
        title: form.title.trim(),
        introText: blankToUndefined(form.introText),
        closingText: blankToUndefined(form.closingText),
        mailSubject: blankToUndefined(form.mailSubject),
        mailBody: blankToUndefined(form.mailBody),
      }),
    onSuccess: (saved) => {
      setForm(formOf(saved))
      refresh()
    },
  })

  const reset = useMutation({
    mutationFn: () => resetDunningText(tenantId, level.id, language),
    onSuccess: (restored) => {
      setForm(formOf(restored))
      refresh()
    },
  })

  const preview = useQuery({
    queryKey: [...dunningTextsKey(tenantId, level.id), language, 'preview'],
    queryFn: () => fetchDunningTextPreview(tenantId, level.id, language),
    enabled: previewing,
  })

  // Worked out while somebody types, not only after saving: the whole point is that the
  // sentence does not vanish unnoticed the day the tenant switches to collective letters.
  const risky = singleInvoiceTokensIn(
    [form.title, form.introText, form.closingText, form.mailSubject, form.mailBody],
    placeholders,
  )

  const insert = (token: string) => {
    const element = fields.current[field]
    const value = form[field]
    const start = element?.selectionStart ?? value.length
    const end = element?.selectionEnd ?? value.length
    const next = insertPlaceholder(value, token, start, end)
    setForm({ ...form, [field]: next.text })
    // Put the caret back where the placeholder ended, so typing carries on in place.
    window.requestAnimationFrame(() => {
      element?.focus()
      element?.setSelectionRange(next.cursor, next.cursor)
    })
  }

  return (
    <Panel
      title={`Sprache ${language.toUpperCase()}`}
      description={stored?.borrowed === true
        ? `In ${language} ist kein Text hinterlegt; gemahnt würde mit dem Text in ${stored.languageCode}.`
        : undefined}
      action={
        <div className="flex items-center gap-3">
          {stored?.shipped === true ? (
            <Badge tone="neutral">mitgeliefert</Badge>
          ) : (
            <Badge tone="accent">eigener Text</Badge>
          )}
          <Button variant="secondary" onClick={() => setPreviewing(!previewing)}>
            {previewing ? 'Vorschau schliessen' : 'Vorschau'}
          </Button>
          {mayWrite && (
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  reset.reset()
                  reset.mutate()
                }}
                busy={reset.isPending}
              >
                Zurücksetzen
              </Button>
              <Button
                onClick={() => {
                  save.reset()
                  save.mutate()
                }}
                busy={save.isPending}
                disabled={form.title.trim() === ''}
              >
                Speichern
              </Button>
            </>
          )}
        </div>
      }
    >
      <div className="grid gap-4">
        {save.error !== null && <ErrorNotice error={save.error} />}
        {reset.error !== null && <ErrorNotice error={reset.error} />}

        <TextField
          label="Titel auf dem Papier"
          value={form.title}
          onChange={(event) => setForm({ ...form, title: event.target.value })}
          disabled={!mayWrite}
          hint="Was oben auf der Mahnung steht. Die Bezeichnung in der Verwaltung kommt aus der Liste «Mahnarten»."
        />

        <TextArea
          label="Anschreiben"
          value={form.introText}
          onChange={(value) => setForm({ ...form, introText: value })}
          onFocus={() => setField('introText')}
          register={(element) => (fields.current.introText = element)}
          disabled={!mayWrite}
          hint="Steht über der Aufstellung der Rechnungen. Die Aufstellung selbst zeichnet die Druckvorlage."
        />

        <TextArea
          label="Schlusstext"
          value={form.closingText}
          onChange={(value) => setForm({ ...form, closingText: value })}
          onFocus={() => setField('closingText')}
          register={(element) => (fields.current.closingText = element)}
          disabled={!mayWrite}
        />

        <TextField
          label="Mailbetreff"
          value={form.mailSubject}
          onChange={(event) => setForm({ ...form, mailSubject: event.target.value })}
          disabled={!mayWrite}
          hint="Steht in der Inbox des Kunden und muss allein verständlich sein."
        />

        <TextArea
          label="Mailtext"
          value={form.mailBody}
          onChange={(value) => setForm({ ...form, mailBody: value })}
          onFocus={() => setField('mailBody')}
          register={(element) => (fields.current.mailBody = element)}
          disabled={!mayWrite}
        />

        {mayWrite && placeholders.length > 0 && (
          <div>
            <p className="text-[12px] text-text-tertiary">
              Platzhalter einfügen — landet an der Cursorposition im zuletzt angeklickten Feld.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {placeholders.map((placeholder) => (
                <button
                  key={placeholder.token}
                  type="button"
                  onClick={() => insert(placeholder.token)}
                  className={
                    placeholder.availableWhenCollective
                      ? 'rounded-[var(--radius-full)] border border-line px-2 py-0.5 font-mono text-[11px] transition-colors hover:border-accent hover:text-accent-text'
                      : 'rounded-[var(--radius-full)] border border-dashed border-line px-2 py-0.5 font-mono text-[11px] text-text-tertiary transition-colors hover:border-accent hover:text-accent-text'
                  }
                  title={
                    placeholder.availableWhenCollective
                      ? undefined
                      : 'Bleibt bei einer Sammelmahnung leer — die Zeile fällt dann ganz weg.'
                  }
                >
                  {placeholder.token}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[12px] text-text-tertiary">
              Gestrichelt umrandete Platzhalter bleiben bei einer Sammelmahnung leer. Eine
              Zeile, die einen davon verliert, fällt ganz weg — deshalb: <b>eine Aussage pro
              Zeile</b>.
            </p>
          </div>
        )}

        {risky.length > 0 && (
          <p className="text-[12px] text-text-secondary">
            Dieser Text benutzt {risky.join(', ')}. Bei einer Sammelmahnung bleiben diese leer,
            und die Zeilen darum fallen weg. Für eine Einzelmahnung ist das in Ordnung.
          </p>
        )}

        {previewing && (
          <div className="grid gap-4 border-t border-line-subtle pt-4">
            {preview.error !== null && <ErrorNotice error={preview.error} />}
            {preview.data !== undefined && (
              <div className="grid gap-4 lg:grid-cols-2">
                <RenderedText label="Einzelmahnung" rendered={preview.data.singleInvoice} />
                <RenderedText label="Sammelmahnung" rendered={preview.data.collective} />
              </div>
            )}
          </div>
        )}
      </div>
    </Panel>
  )
}

/** One rendered mode of the preview. */
function RenderedText({
  label,
  rendered,
}: {
  label: string
  rendered: { title: string; introText: string; closingText: string; mailSubject: string }
}) {
  return (
    <div className="grid gap-2">
      <p className="text-overline text-text-tertiary">{label}</p>
      <div className="rounded-[var(--radius-md)] border border-line-subtle p-3">
        <p className="text-[13px] font-medium">{rendered.title}</p>
        <p className="mt-2 whitespace-pre-wrap text-[13px]">{rendered.introText}</p>
        <p className="mt-2 whitespace-pre-wrap text-[13px]">{rendered.closingText}</p>
        <p className="mt-3 text-[12px] text-text-tertiary">Betreff: {rendered.mailSubject}</p>
      </div>
    </div>
  )
}

/** A multi-line field, because a covering letter is not a one-liner. */
function TextArea({
  label,
  value,
  onChange,
  onFocus,
  register,
  disabled,
  hint,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  onFocus: () => void
  register: (element: HTMLTextAreaElement | null) => void
  disabled?: boolean
  hint?: string
}) {
  return (
    <div className="grid gap-1">
      <label className="text-[12px] font-medium text-text-secondary">{label}</label>
      <textarea
        ref={register}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
        onClick={onFocus}
        disabled={disabled}
        rows={5}
        className="w-full rounded-[var(--radius-md)] border border-line bg-surface px-3 py-2 text-[13px] outline-none transition-colors focus:border-accent disabled:text-text-tertiary"
      />
      {hint !== undefined && <p className="text-[12px] text-text-tertiary">{hint}</p>}
    </div>
  )
}

function blankToUndefined(value: string): string | undefined {
  return value.trim() === '' ? undefined : value
}
