import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Info } from 'lucide-react'
import { Button } from '../../components/Button'
import { CheckboxField } from '../../components/CheckboxField'
import { Dialog } from '../../components/Dialog'
import { ErrorNotice } from '../../components/Notice'
import { SelectField } from '../../components/SelectField'
import { TextAreaField } from '../../components/TextAreaField'
import { TextField } from '../../components/TextField'
import { useDebouncedValue } from '../../components/useDebouncedValue'
import { useAuth } from '../../auth/useAuth'
import {
  ACCOUNTING_RIGHTS,
  ACCOUNT_TYPE_ORDER,
  accountTypeLabel,
  createAccount,
  deleteAccount,
  fetchPositionSuggestion,
  fetchSystemKeys,
  positionSuggestionKey,
  systemKeysKey,
  updateAccount,
} from '../../lib/accounting'
import {
  positionAllowedFor,
  positionOptionsFor,
  positionQuestionFor,
} from '../../lib/accountPosition'
import type { Account, AccountType, OrPositionCode } from '../../lib/types'
import { useCatalogue } from '../../masterdata/useMasterData'

/** What a system account allows and what it does not — the same sentence in both places. */
const SYSTEM_ACCOUNT_SENTENCE =
  'Es lässt sich umbenennen und umnummerieren, aber weder abschalten noch löschen.'

/**
 * Adds an account or changes one.
 *
 * <p>Three things this form deliberately does **not** show. The system key: a tenant could read
 * none of its values, and it moves through an endpoint of its own anyway. Whether an entry may be
 * booked here by hand: as a field it could only ever do harm, so it stands as a mark in the list.
 * And the enum name of the position: the field asks in plain words where the account is to
 * appear, and offers the wording of the law (backend ADR-0112).
 *
 * @param account the account to change, null to add one
 */
export function AccountDialog({
  tenantId,
  account,
  onClose,
}: {
  tenantId: number
  account: Account | null
  onClose: () => void
}) {
  const { can } = useAuth()
  const mayConfigure = can(ACCOUNTING_RIGHTS.configure)
  const queryClient = useQueryClient()
  const creating = account === null

  const types = useCatalogue(tenantId, 'account-type')
  const positions = useCatalogue(tenantId, 'or-position')

  const [accountNumber, setAccountNumber] = useState(account?.accountNumber ?? '')
  const [name, setName] = useState(account?.name ?? '')
  const [type, setType] = useState<AccountType | ''>(account?.accountType ?? '')
  const [position, setPosition] = useState<OrPositionCode | ''>(account?.orPosition ?? '')
  const [note, setNote] = useState(account?.note ?? '')
  const [active, setActive] = useState(account?.active ?? true)
  const [typeTouched, setTypeTouched] = useState(false)
  const [positionTouched, setPositionTouched] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // Asked while somebody is still typing, so it waits for a pause. Only while adding: a
  // proposal that overwrites an existing filing is no proposal.
  const typedNumber = useDebouncedValue(accountNumber.trim())
  const suggestion = useQuery({
    queryKey: positionSuggestionKey(tenantId, typedNumber),
    queryFn: () => fetchPositionSuggestion(tenantId, typedNumber),
    enabled: creating && typedNumber !== '',
  })

  // The sentence about a system account comes from the endpoint, so that no second copy of the
  // twenty-four wordings lives here. Only fetched where this account carries a key.
  const systemKeys = useQuery({
    queryKey: systemKeysKey(tenantId),
    queryFn: () => fetchSystemKeys(tenantId),
    enabled: account?.systemKey !== undefined,
  })
  const systemNote = account?.systemKey
    ? [systemKeys.data?.find((entry) => entry.key === account.systemKey)?.hint,
       SYSTEM_ACCOUNT_SENTENCE].filter(Boolean).join(' ')
    : undefined

  // The proposal, and what it makes of the two fields. Derived rather than written into the
  // state: a proposal that had already been stored could not be told from a choice.
  const hint = creating && !positionTouched ? (suggestion.data ?? null) : null
  const chosenType = typeTouched || hint === null ? type : hint.accountType
  const wanted = hint === null ? position : hint.orPosition
  // Cleared where the account type no longer allows it — which is what happens when somebody
  // changes the type after choosing a position.
  const chosenPosition =
    chosenType !== '' && wanted !== '' && positionAllowedFor(chosenType, wanted) ? wanted : ''
  const showsProposal = hint !== null && chosenPosition === hint.orPosition

  const options = chosenType === '' ? [] : positionOptionsFor(chosenType, positions, chosenPosition)

  const save = useMutation({
    mutationFn: (request: {
      accountNumber: string
      name: string
      accountType: AccountType
      orPosition: OrPositionCode
    }) =>
      creating
        ? createAccount(tenantId, {
            ...request,
            note: note.trim() === '' ? null : note.trim(),
            active,
          })
        : updateAccount(tenantId, account.id, {
            ...request,
            note: note.trim() === '' ? null : note.trim(),
            active,
          }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['accounts', tenantId] })
      void queryClient.invalidateQueries({ queryKey: systemKeysKey(tenantId) })
      onClose()
    },
  })

  const remove = useMutation({
    mutationFn: () => deleteAccount(tenantId, account?.id ?? 0),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['accounts', tenantId] })
      onClose()
    },
  })

  const complete =
    accountNumber.trim() !== '' && name.trim() !== '' && chosenType !== '' && chosenPosition !== ''

  const submit = () => {
    // `complete` already holds that both are chosen; TypeScript reads that off the alias.
    if (!complete || !mayConfigure) return
    save.mutate({
      accountNumber: accountNumber.trim(),
      name: name.trim(),
      accountType: chosenType,
      orPosition: chosenPosition,
    })
  }

  return (
    <Dialog
      open
      wide
      onClose={onClose}
      onSubmit={submit}
      title={creating ? 'Konto anlegen' : `${account.accountNumber} ${account.name}`}
      footer={
        <>
          {!creating && !account.systemKey && mayConfigure && (
            <span className="mr-auto">
              <Button
                variant={confirmingDelete ? 'danger' : 'ghost'}
                onClick={() => (confirmingDelete ? remove.mutate() : setConfirmingDelete(true))}
                busy={remove.isPending}
              >
                {confirmingDelete ? 'Wirklich löschen' : 'Löschen'}
              </Button>
            </span>
          )}
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          {mayConfigure && (
            <Button onClick={submit} disabled={!complete} busy={save.isPending} shortcut>
              Speichern
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
          <TextField
            label="Nummer"
            value={accountNumber}
            onChange={(event) => setAccountNumber(event.target.value)}
            disabled={!mayConfigure}
            maxLength={20}
            inputMode="numeric"
            autoFocus={creating}
          />
          <TextField
            label="Bezeichnung"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={!mayConfigure}
            maxLength={120}
          />
        </div>

        <SelectField
          label="Kontoart"
          value={chosenType}
          disabled={!mayConfigure}
          onChange={(event) => {
            setTypeTouched(true)
            // No cast: the options are the six codes of ACCOUNT_TYPE_ORDER, and looking the
            // value up there is what turns the string of the DOM event into one of them.
            setType(ACCOUNT_TYPE_ORDER.find((code) => code === event.target.value) ?? '')
          }}
        >
          <option value="">Bitte wählen</option>
          {ACCOUNT_TYPE_ORDER.map((code) => (
            <option key={code} value={code}>
              {accountTypeLabel(types, code)}
            </option>
          ))}
        </SelectField>

        <SelectField
          label={chosenType === '' ? 'Erscheint unter:' : positionQuestionFor(chosenType)}
          value={chosenPosition}
          disabled={!mayConfigure || chosenType === ''}
          onChange={(event) => {
            setPositionTouched(true)
            // The options of this dropdown are codes of the catalogue `or-position`, so what
            // comes back is one of them. TypeScript cannot see that through a DOM event.
            setPosition(event.target.value as OrPositionCode)
          }}
          hint={
            showsProposal ? (
              <span className="inline-flex items-center gap-1">
                <Info size={13} aria-hidden />
                Vorschlag aus der Kontonummer{hint === null ? '' : ` (${hint.basedOn})`} — bitte
                prüfen.
              </span>
            ) : (
              chosenType === '' ? 'Zuerst die Kontoart wählen.' : undefined
            )
          }
        >
          <option value="">Bitte wählen</option>
          {options.map((option) => (
            <option key={option.code} value={option.code}>
              {option.name}
            </option>
          ))}
        </SelectField>

        <TextAreaField
          label="Notiz"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          disabled={!mayConfigure}
          rows={2}
          maxLength={200}
        />

        <CheckboxField
          label="aktiv"
          checked={systemNote === undefined ? active : true}
          disabled={!mayConfigure || systemNote !== undefined}
          title={systemNote}
          onChange={(event) => setActive(event.target.checked)}
        />

        {systemNote !== undefined && (
          <p className="text-[12px] text-text-secondary">{systemNote}</p>
        )}

        {save.error !== null && <ErrorNotice error={save.error} />}
        {remove.error !== null && <ErrorNotice error={remove.error} />}
      </div>
    </Dialog>
  )
}
