import { ExternalLink } from 'lucide-react'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import type { ApiFile } from '../../lib/api'
import { showFile } from '../../lib/files'

/**
 * The PDF the server drew from the form as it stands, shown over the designer.
 *
 * <p>The sheet is a faithful sketch; this is the proof. It is rendered by the same code that
 * prints the real documents, on the same made up document the sheet shows, so what differs
 * between the two is worth knowing before the form is saved.
 *
 * @param shown the PDF and the address the frame reads it from; `null` while closed
 * @param onClose called when the dialog is dismissed
 */
export function PreviewDialog({
  shown,
  onClose,
}: {
  shown: { file: ApiFile; url: string } | null
  onClose: () => void
}) {
  return (
    <Dialog
      open={shown !== null}
      onClose={onClose}
      title="Vorschau"
      description="So druckt die Vorlage den Beispielbeleg — auch was noch nicht gespeichert ist."
      large
      dirty={false}
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => {
              if (shown !== null) showFile(shown.file)
            }}
          >
            <ExternalLink size={15} aria-hidden />
            In neuem Tab öffnen
          </Button>
          <Button onClick={onClose}>Schliessen</Button>
        </>
      }
    >
      {shown !== null && (
        <iframe
          title="Vorschau der Druckvorlage als PDF"
          src={shown.url}
          className="block h-[66vh] w-full rounded-[var(--radius-md)] border border-line bg-sunken"
        />
      )}
    </Dialog>
  )
}
