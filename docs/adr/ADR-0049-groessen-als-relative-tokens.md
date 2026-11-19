# ADR-0049 — Grössen stehen als relative Tokens in `index.css`, nicht als px in der Maske

- **Status:** Angenommen
- **Datum:** 2026-11-19
- **Verhältnis:** Ergänzt Abschnitt 4 der `CLAUDE.md` (Farben, Radien, Schriften aus Tokens) um
  Schriftgrössen, Control-Grössen und Breiten.
- **Backend:** keins.

## Kontext

Farben, Radien und Schriften kamen schon aus `src/index.css`. Schriftgrössen, Breiten und
Höhen nicht: über 1’300 Stellen in 183 Dateien schrieben px direkt in die Klasse
(`text-[12px]`, `w-[110px]`). Verlangt ist eine zentrale Quelle für alle diese Werte, in
relativen Einheiten, mit 1px für Rahmen und Trennlinien als einziger Ausnahme. Dazu stand
`--radius-full` in 16 Klassen, ohne irgendwo definiert zu sein.

## Entscheidung

`@theme` in `index.css` führt zusätzlich, alle in rem:

| Gruppe | Tokens | Tailwind-Klasse |
|---|---|---|
| Schrift nach Rolle | `--text-micro` … `--text-display` (10–24 px bei 16 px Basis) | `text-body`, `text-small` … |
| Controls | `--spacing-control`, `--spacing-button`, `--spacing-icon-button`, `--spacing-checkbox` | `h-control`, `size-icon-button` … |
| Spalten | `--spacing-column-xs` … `--spacing-column-xl` | `w-column-sm` … |
| Container | `--container-dialog`, `--container-dialog-wide`, `--container-tooltip` | `max-w-dialog` … |
| Radien | `--radius-xs` … `--radius-lg` jetzt in rem, `--radius-full` neu | `rounded-[var(--radius-md)]` |

Auch `body` (`font-size`, `line-height`), der Fokusrahmen und der Kartenschatten stehen jetzt
in rem. Die Schriftgrössen heissen nach Rolle (`body`, `caption`, `title`), nicht nach Grösse.

Umgestellt sind in diesem Schritt alle gemeinsamen Bausteine in `components/` und das ganze
Partner-Modul. Die übrigen Module folgen, wenn sie überarbeitet werden.

## Begründung

rem folgt der Schriftgrösse, die jemand im Browser eingestellt hat: wer grössere Schrift
braucht, bekommt eine grössere Maske und nicht nur grössere Buchstaben in gleich engen Feldern.
Namen nach Rolle lassen die Skala wandern, ohne dass jemand jede Maske durchsuchen muss.

Die Werte entsprechen bei 16 px Basis genau den bisherigen px. Am Bild ändert sich also
nichts, bis jemand die Browser-Schrift ändert.

## Verworfene Alternativen

**Tailwinds eigene Skala (`text-xs`, `text-sm`) umdefinieren.** Verworfen: diese Klassen
bringen eine eigene Zeilenhöhe mit und hätten die Höhe jeder Zeile verändert, während die
neuen Tokens nur die Schriftgrösse setzen wie vorher `text-[12px]`.

**em statt rem.** Verworfen: em multipliziert sich in verschachtelten Elementen. Eine
Beschriftung in einer Karte in einem Dialog wäre je nach Tiefe anders gross.

**Alle 183 Dateien auf einmal umstellen.** Verworfen: das wäre eine Grossbaustelle ohne
fachliche Prüfung. Verlangt war Modul für Modul, und jedes Modul wird ohnehin angefasst.

**Breiten als frei gewählte rem-Werte je Spalte** (`w-[6.875rem]`). Verworfen: dann gäbe es
statt 30 px-Werten 30 rem-Werte. Fünf Spaltenbreiten reichen, die Tabellen werden dadurch
ruhiger.

## Konsequenzen

- In einer neuen oder überarbeiteten Maske steht kein `[…px]` mehr, ausser 1px-Rahmen. Fehlt
  ein Wert, wird er hier als Token ergänzt.
- Die Icon-Grössen von `lucide-react` werden weiter als Zahl übergeben (`size={15}`). Das ist
  die Schnittstelle der Bibliothek und bleibt vorerst so.
- Bis alle Module überarbeitet sind, gibt es beide Schreibweisen nebeneinander.

## Abweichungen vom Issue

Keine.

## Offen

- Icon-Grössen auf Tokens umstellen (`className="size-…"` statt `size={…}`).
- Die übrigen Module, Modul für Modul.
