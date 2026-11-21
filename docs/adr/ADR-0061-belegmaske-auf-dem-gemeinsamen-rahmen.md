# ADR-0061 — Belegmaske auf dem gemeinsamen Rahmen, Teile in eigener Datei

- **Status:** Angenommen
- **Datum:** 2026-11-21
- **Verhältnis:** Setzt ADR-0048 (Esc bricht ab) und ADR-0050 (Hinweise als Tooltip) für die
  Belege um. Ergänzt ADR-0057 (Belegart-Maske nach Partnermuster).

## Kontext

Die Belegmaske (Offerte, Auftrag, Lieferschein, Rechnung) war mit 1’466 Zeilen die grösste
Seite der Anwendung und nutzte noch `PageHeader`. Esc und der Zurück-Link fragten darin nie
nach. Die Kopfdaten und die Texte haben eigene Formulare mit eigenem «Übernehmen», also gibt
es ungespeicherte Eingaben, ohne dass die Maske davon weiss.

## Entscheidung

1. **Die Belegmaske ist eine `FormMask`.** Die Register bleiben, wie sie sind.
2. **Ungespeicherte Eingaben melden sich nach oben.** Die Kopfdaten und die Texte melden über
   `onDirtyChange`, ob etwas getippt, aber nicht übernommen ist. Die Maske schickt das als
   `dirty` an die `FormMask`. Ein gespeicherter Stand schaltet den Zustand wieder aus: die
   Kopfdaten über den Neuaufbau nach dem Speichern, die Texte über den Vergleich mit dem Beleg.
3. **Die Teile, die die Maske nicht steuern, liegen in `document/DocumentPageParts.tsx`.**
   Das sind die Texte, das Partei-Panel und der Statusverlauf. Die Maske selbst behält Laden,
   Zustand, Register und Vorgänge. Der Rest der Maske bleibt in einer Datei, weil er dieselben
   Zustände und Mutationen braucht. Eine weitere Zerlegung folgt, wenn die Register einzeln
   Zustand brauchen.
4. **Hinweise sind Tooltips**, die Grössen kommen aus rem und Schrift-Tokens. Erklärungen zu
   Vorgängen (Ausstellen, Stornieren) bleiben als Dialog mit Bestätigung. Der Dialog hält die
   Entscheidung, nicht der Hinweis.

## Begründung

Eine Maske, die mit ungespeicherten Änderungen einfach schliesst, verliert Arbeit. Die
Rückfrage gehört in die gemeinsame Maske, damit jede Belegart sie gleich bekommt. Die
Trennung in eine Datei macht die Teile, die mit der Steuerung nichts zu tun haben, einzeln
lesbar.

## Verworfene Alternativen

**Die Kopfdaten in die Hauptmaske ziehen.** Verworfen: Die Panels speichern unabhängig und
haben eigene Endpunkte, die auf den Stand des Servers prüfen (`validity`, `stock-location`).
Eine Zusammenführung würde diese Reihenfolge verändern.

**Den Änderungsschutz über `useChangeTracker` auf dem ganzen Formular.** Verworfen: Die
Tracker-Logik zählt jede Eingabe und setzt nach dem Speichern nicht zurück, Esc würde dann
nach einem gespeicherten Stand fragen.

**Die ganze Maske in mehrere Dateien zerlegen.** Verworfen für diese Runde: Register,
Vorgänge und Mutationen teilen sich Zustand. Eine Zerlegung ohne Neuschnitt der Zustände
würde viele Props durchreichen.

## Konsequenzen

- Esc in der Belegmaske schliesst direkt, wenn nichts getippt ist, und fragt sonst.
- Die Belegmaske bleibt mit 1’277 Zeilen grösser als gewünscht. Die restliche Zerlegung ist
  eine eigene Aufgabe.

## Abweichungen vom Issue

Die Zerlegung ist nur für die drei Teile gemacht, die die Steuerung nicht betreffen. Die
Hauptmaske ist nicht vollständig aufgeteilt.

## Offen

- Die Hauptmaske in Teile zerlegen: Kopf, Positionen, Summen, Register je in eine Datei.
- Die Gutschrift fehlt. Sie braucht eine Entscheidung zu Teilgutschrift, Mehrfachgutschrift
  und Buchung, bevor sie gebaut wird (offene Fragen stehen in der Rückmeldung zu Modul 3).
