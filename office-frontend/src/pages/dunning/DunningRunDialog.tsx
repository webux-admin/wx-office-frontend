import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { TextField } from '../../components/TextField'
import { isCompleteIsoDate, toIsoDate } from '../../lib/format'
import { DUNNING_AS_OF_PARAM, DUNNING_WORKLIST_PATH } from '../../lib/dunning'

/**
 * Asks for a reference day and opens the work list on it.
 *
 * <p><b>It starts nothing.</b> No letter is issued here and no request is sent: the dialog
 * takes a day and navigates. Behind it stands the same person in front of the same list and
 * the same confirmation — the release stays where it was, with `DUNNING_RUN` (backend
 * ADR-0096).
 *
 * <p>What changes is the wording. A clerk calls this work «Mahnlauf», the house says the word
 * in three places already, and a screen may say it too as long as no scheduler stands behind
 * it. The `@Scheduled` run remains rejected (ADR-0033).
 */
export function DunningRunDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const [asOf, setAsOf] = useState(() => toIsoDate())

  const start = () => {
    void navigate(`${DUNNING_WORKLIST_PATH}?${DUNNING_AS_OF_PARAM}=${asOf}`)
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Mahnlauf"
      description="Der Stichtag entscheidet, welche Rechnungen fällig sind und welche Stufe sie erreichen. Es wird nichts ausgestellt — der Vorschlag wird gerechnet."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={start} disabled={!isCompleteIsoDate(asOf)}>
            Vorschlag rechnen
          </Button>
        </>
      }
    >
      <TextField
        label="Stichtag"
        type="date"
        value={asOf}
        onChange={(event) => setAsOf(event.target.value)}
        hint="Vorgabe ist heute. Ein späterer Tag zeigt, was dann zu mahnen wäre."
      />
    </Dialog>
  )
}
