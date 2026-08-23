# ADR-0013 — Preistabelle: Tastaturspalte und ein einziges Speichern

- **Status:** Angenommen
- **Datum:** 2026-08-23

## Kontext

Die Schnellerfassung (`/preise-erfassen`) ist die erste Maske dieser Anwendung, in der in
einer Tabelle geschrieben statt gelesen wird: eine Spalte Eingabefelder, eines je Produkt,
über einen ganzen Katalog. Zwei Fragen sind damit offen, und beide gelten für jede spätere
Tabelle dieser Art (Inventur, Mengenerfassung, Lagerbestände).

Erstens: Wann wird gespeichert — beim Verlassen des Feldes oder auf Knopfdruck?
Zweitens: Was passiert mit dem Erfassten, wenn während der Arbeit gefiltert oder geblättert
wird? Die Maske arbeitet seitenweise, ein Katalog hat mehr Produkte als eine Seite, und ein
Preislauf geht typischerweise über mehrere Filter («zuerst die Kabel, dann die Rohre»).

Das Backend nimmt eine Erfassung als Ganzes entgegen: ein Ziel, ein Zeitraum, viele Preise
(ADR-0059 des Backends).

## Entscheidung

1. **Gespeichert wird auf Knopfdruck**, mit `Strg+S` und `Strg+Enter` aus
   [ADR-0012](ADR-0012-tastenkuerzel-zum-abschliessen-einer-maske.md). Daneben steht
   dauernd, wie viele Preise erfasst sind.
2. **Erfasstes überlebt Filtern und Blättern.** Jede Änderung merkt sich, was im Feld stand,
   und wird beim Speichern gemeinsam mit allen anderen geschickt.
3. **Die Tastatur führt durch die Spalte**: Pfeil runter und Enter eine Zeile tiefer, Pfeil
   hoch eine höher, Enter in der letzten Zeile speichert, Escape nimmt ein Feld zurück. Der
   Fokus wählt den Feldinhalt aus, so dass Tippen ihn ersetzt.
4. **Ziel und Zeitraum ändern fragt nach**, solange etwas erfasst und nicht gespeichert ist.
   Filter und Seitenwechsel fragen nicht — dort geht nichts verloren.

## Begründung

**Zu 1:** Ein Preislauf ist ein Vorgang, kein Feld. Wer bei Zeile 40 merkt, dass die falsche
Preisgruppe gewählt ist, muss abbrechen können, ohne 39 Schreibvorgänge rückgängig zu machen.
Dazu kommt die Bedienart, für die die Maske gebaut ist: Speichern beim Feldwechsel hiesse eine
Anfrage pro Tabulatorsprung — bei Tastaturbedienung also im Sekundentakt.

**Zu 2:** Die Alternative wäre, beim Filtern zu warnen oder Erfasstes zu verwerfen. Beides
verhindert genau die Arbeitsweise, für die die Maske da ist. Dass eine Änderung ihren alten
Wert mitträgt, ist der Preis dafür — ohne ihn könnte beim Speichern niemand mehr sagen, ob
ein Feld überhaupt geändert wurde, dessen Zeile längst nicht mehr auf dem Bildschirm ist.

**Zu 3:** Enter ist in einer Spalte von Zahlen die natürliche Taste für «nächster Wert»; die
Pfeiltasten sind es aus jeder Tabellenkalkulation. Die Auswahl beim Fokus spart je Zeile das
Löschen des alten Werts — bei fünfzig Zeilen ist das der Unterschied zwischen flüssig und
mühsam.

**Zu 4:** Ziel und Zeitraum gelten für die ganze Erfassung. Sie zu ändern gäbe jedem
erfassten Preis eine andere Bedeutung, deshalb wird gefragt statt stillschweigend übernommen.

## Alternativen

- **Laufendes Speichern pro Feld** (wie in der Belegmaske bei Positionen). Verworfen, siehe
  oben. Der Unterschied zur Belegposition: dort ist jede Zeile für sich fertig, hier gehören
  Ziel und Zeitraum zu allen Zeilen gemeinsam.
- **Erfasstes beim Filtern verwerfen oder warnen.** Verworfen: das ist genau der Arbeitsablauf
  der Maske, und eine Warnung, die bei jedem Suchbegriff kommt, wird nach dem zweiten Mal
  weggeklickt statt gelesen.
- **Eine fertige Grid-Bibliothek** (AG Grid, TanStack Table). Verworfen: die Maske braucht
  fünf Spalten, eine Eingabespalte und vier Tasten. Das ist weniger Code als die Anbindung
  einer Bibliothek, und `DataTable` bringt Sortierung, Blättern und die leeren Zustände
  bereits mit — samt ihrem Aussehen.
- **`Strg+S` weglassen und nur den Knopf anbieten.** Verworfen: die Maske ist für die Hände
  auf der Tastatur gebaut; der Griff zur Maus am Ende jeder Seite wäre der einzige.

## Konsequenzen

- Wer die Maske mit ungespeicherten Preisen verlässt (Navigation, Zurück-Taste), verliert sie.
  Ein Schutz dagegen wäre ein Block im Router und trifft alle Masken — das ist eine eigene
  Entscheidung und steht hier noch aus.
- Die Menge des Erfassten ist nur durch das Limit des Endpunkts begrenzt (500 Zeilen je
  Anfrage). Wer mehr erfasst, bekommt die Absage des Servers zu sehen; ein Aufteilen in
  mehrere Anfragen ist bewusst nicht eingebaut, weil ein halb gespeicherter Preislauf
  schlimmer ist als eine abgelehnte Anfrage.
- Die vier Tasten und die Regel «Erfasstes überlebt den Filter» sind die Vorlage für jede
  weitere Erfassungstabelle. Wird eine gebaut, wird die Logik aus `pages/priceentry/`
  gehoben, nicht abgeschrieben.
