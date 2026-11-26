# ADR-0091 — Der Texteditor zeigt, was er druckt: formatiert statt Zeichen, Leiste oben, mehrzeilig

- **Status:** Angenommen
- **Datum:** 2026-11-26
- **Verhältnis:** Löst [ADR-0090](ADR-0090-kleiner-texteditor-ohne-bibliothek.md) in den Punkten 1
  (Feld und Leiste) und den verworfenen Alternativen «WYSIWYG» und «Leiste immer zeigen» ab; die
  Punkte 2 bis 5 von ADR-0090 gelten weiter. Backend ADR-0170 hält Escape, Lesen und Druck fest.
  Auftrag im Gespräch vom 26.11.2026.

## Kontext

ADR-0090 hat den Text einer Zeit zu einem Feld gemacht, in dem die Markdown-Zeichen stehen bleiben:
wer ein Wort fett setzt, sieht `**Wort**`. Der Auftraggeber will es anders, und zwar an zwei Orten:

- beim Text einer Zeit, und neu beim **Kommentar einer Position** im Beleg und — ebenfalls
  «Kommentar» genannt — bei der **Kommentarzeile**;
- an beiden Orten ein **mehrzeiliges Feld** wie eine Textarea;
- die Auswahl Fett/Kursiv/Listen als **Leiste oben** am Feld, nicht unten;
- **formatiert, wie es gedruckt wird**: ein fettes Wort steht fett da, wie es technisch gespeichert
  ist, sieht niemand.

Eine `textarea` kann kein fettes Wort zeigen. Ein Editor dafür braucht ein editierbares Element
(`contentEditable`). Die Regel «kein Stack-Wechsel ohne Rückfrage» gilt weiter, und für vier
Formate rechtfertigt sich eine Editor-Bibliothek nicht.

## Entscheidung

1. **`components/RichTextField` wird ein Editor ohne Zeichen**, gebaut auf `contentEditable` ohne
   Bibliothek. Er hält den Text als Zeilen aus formatierten Stücken (`lib/richTextModel`), zeichnet
   sie als `div` je Zeile mit `strong` und `em` (`components/richTextDom`) und schreibt sie als
   Markdown-Teilmenge zurück (`lib/markdownLite.writeLines`). Gespeichert wird unverändert Text, nie
   HTML.
2. **Was der Browser tippt, wird gelesen und neu gezeichnet.** Tippen, Löschen und Ausschneiden macht
   der Browser; danach liest der Editor das Feld, egal welches HTML der Browser dabei erzeugt hat
   (`b`, `span` mit Stil, `li`, harte Leerzeichen), und zeichnet es sauber neu. Selbst macht der
   Editor: fett und kursiv, die Listen, die neue Zeile, Backspace am Anfang eines Listenpunkts,
   Einfügen als reiner Text, Rückgängig und Wiederholen.
3. **Die Leiste steht immer oben**: Fett, Kursiv, Aufzählung, nummerierte Liste. Ein Knopf ist
   gedrückt, wo die Auswahl die Formatierung trägt. Der Zähler erscheint ab 80 % der Grenze. Die
   Knöpfe nehmen **keinen Tab-Stopp** — Tab geht vom Feld davor direkt in den Text, wie in der
   Schnellzeile gewohnt. Die Tastatur kann alles: Strg+B, Strg+I, Strg+Umschalt+8 und +7 für die
   Listen, und «- », «* » oder «1. » am Zeilenanfang beginnt eine Liste.
4. **Mehrzeilig in Ruhe**: Das Feld ist mindestens `rows` Zeilen hoch — zwei in der Schnellzeile,
   drei in Stoppuhr und Belegdialogen — und wächst bis zehn.
5. **Enter**: Neu gibt es `enterKey`. In der Zeiterfassung (`"form"`) speichert Enter weiter, und
   Umschalt+Enter beginnt eine neue Zeile (ADR-0090, 2). Im Beleg (Vorgabe `"newLine"`) macht Enter
   eine neue Zeile, wie es die Textarea dort tat. Eine Liste geht mit der neuen Zeile weiter, auf
   einem leeren Listenpunkt endet sie.
6. **Ein getippter Stern bleibt ein Stern**: der Editor schreibt `\*`; eine gewöhnliche Zeile, die
   mit «- » oder «1. » beginnt, bekommt ihren Backslash (Backend ADR-0170). `lib/markdownLite` liest
   dieselbe Teilmenge wie `shared.FormattedText` im Backend, mit denselben Testfällen.
7. **Rückgängig** gehört dem Feld: Tippen ohne Pause an derselben Stelle ist ein Schritt, jede andere
   Änderung — Löschen, ein Format, eine Liste — ein eigener.
8. **Im Beleg** sind der Kommentar einer freien Position (`FreeLineDialog`, 1000 Zeichen) und der
   Text einer Kommentarzeile (`StructureLineDialog`, 500 Zeichen) dieser Editor. Wechselt eine Zeile
   die Art, nimmt die Beschriftung eines Zwischentotals die Wörter ohne Formatierung, und ein Text,
   der zur Kommentarzeile wird, behält jedes Zeichen (`lineForm.structureTextFor`). Die
   Positionstabelle zeigt beide formatiert (`components/FormattedText`), so wie sie gedruckt werden.

## Begründung

**Zu 1:** Was der Auftraggeber sehen will, ist ein formatiertes Wort. Ein eigenes, kleines Modell
hält den Editor bei vier Formaten und ohne neue Abhängigkeit, und weil die Speicherform gleich
bleibt, ändert sich für Backend, Rechnung und CSV nichts außer dem Escape.

**Zu 2:** Jede Taste selbst nachzubauen hiesse, das Tippen, die Wortlöschung, die Rechtschreibung
und die Eingabe über eine IME neu zu erfinden. Der Browser tippt besser als jeder Nachbau. Was er
an HTML hinterlässt, ist dafür beliebig — darum wird nach jeder Eingabe neu gelesen und gezeichnet.

**Zu 3:** «Menüband oben» heisst: immer da, nicht erst mit dem Fokus — eine Leiste, die beim Klick
erscheint, schiebt den Text herunter, während man hineinklickt. Ohne Tab-Stopp bleibt der Weg Dauer
→ Text in der Schnellzeile ein Tab.

**Zu 5:** Die Schnellzeile lebt von «Enter speichert» (ADR-0082); im Beleg gibt es dieses Versprechen
nicht, dort ist der Kommentar Fliesstext.

## Verworfene Alternativen

**Eine Editor-Bibliothek (Tiptap, Lexical, Quill).** Verworfen wie in ADR-0090: neue Abhängigkeit
und Bundle für vier Formate — und die Bibliothek hielte ihr eigenes Dokumentmodell, das erst in die
Markdown-Teilmenge übersetzt werden müsste.

**`document.execCommand` für fett und Listen.** Verworfen: veraltet, je Browser anders (`b` oder
`strong`, `span` mit Stil, verschachtelte Listen), und in jsdom gar nicht vorhanden — die Schritte
wären nicht testbar.

**Die Leiste nur mit dem Fokus zeigen (wie ADR-0090).** Verworfen, siehe zu 3.

**Die Knöpfe mit eigenem Tab-Stopp.** Verworfen: vier Tab-Stopps zwischen «Dauer» und Text brechen
die Schnellzeile. Wer nur die Tastatur benutzt, hat die Kürzel und «- » am Zeilenanfang.

**HTML speichern.** Verworfen, Backend ADR-0170.

## Konsequenzen

- Neu `lib/richTextModel`, `components/richTextDom`, `components/FormattedText` und für Tests
  `components/richTextTesting` (`fillRichText`); `lib/markdownLite` liest Escapes und fett-kursiv
  zusammen und schreibt (`writeLines`, `writeParts`). Die Schritte `toggleEmphasis`, `toggleList` und
  `newLine` auf dem rohen Text entfallen.
- `Field` kann seine Beschriftung benennen (`labelId`) und mit einem Klick darauf ein Feld fokussieren,
  auf das `for` nicht zeigen kann.
- `enterSubmits` nimmt neben `input` und `textarea` das editierbare Feld.
- Tests tippen über `fillRichText` und lesen `textContent` statt `value`. Der Editor ist dazu in
  echtem Chrome über das DevTools-Protokoll geprüft (Tippen, Löschen über Zeilen, Kürzel, Rückgängig,
  Enter in der Schnellzeile).
