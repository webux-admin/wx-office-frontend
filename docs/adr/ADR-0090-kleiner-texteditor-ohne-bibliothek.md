# ADR-0090 — Ein kleiner Texteditor ohne Bibliothek: Markdown-Teilmenge mit Leiste, Enter speichert

- **Status:** Angenommen
- **Datum:** 2026-11-26
- **Verhältnis:** Ergänzt ADR-0082 (Schnellzeile) und ADR-0083 (Stoppuhr). Backend ADR-0168 hält
  die Speicherform fest. Issue webux-admin/wx-office#139, «Zeiterfassung verbessern (10/12)».

## Kontext

«Was wurde gemacht?» soll ein Freitextfeld mit einfacher Formatierung werden: fett, kursiv,
Aufzählung, nummerierte Liste — in der Schnellzeile, beim Bearbeiten in der Zeile und in der
Stoppuhr. Das Frontend hat sechs Laufzeit-Abhängigkeiten und keinen Editor. Im Issue stand die
Wahl zwischen einer Markdown-Leiste ohne Bibliothek (A) und einem WYSIWYG-Editor mit Bibliothek
(B); sie ist nach Best Practice und der Regel «keine Stack-Wechsel» für A entschieden.

Enter speichert aus jedem Feld der Schnellzeile (ADR-0082, `enterSubmits`) — das ist die
Gewohnheit aller, die schon erfassen.

## Entscheidung

1. **`components/RichTextField`**: ein Textfeld, eine Zeile hoch in Ruhe, das mit jeder Zeile bis
   sechs wächst. Mit dem Fokus erscheint unter dem Text eine Leiste mit **B**, *I*, Aufzählung und
   nummerierter Liste und ein Zeichenzähler «123 / 1000». Strg+B und Strg+I (Cmd auf dem Mac)
   setzen fett und kursiv, ein zweites Mal nehmen sie es weg.
2. **Enter speichert, Umschalt+Enter beginnt eine neue Zeile.** In einer Liste setzt Umschalt+Enter
   sie fort («- » oder die nächste Nummer); auf einem leeren Listenpunkt endet die Liste.
   `enterSubmits` nimmt dafür ausser `input` auch `textarea`.
3. **Angezeigt wird der Text auf einer Zeile** (`components/MarkdownLine`): fett und kursiv wie
   gesetzt, die Zeilen einer Liste mit « · » hintereinander — dieselbe Form wie auf der Rechnung.
   Der ganze Text ohne Zeichen steht im Tooltip. So bleibt jede Zeile der Tagesliste eine Zeile,
   und das Raster aus #130 verschiebt sich nicht.
4. **Gebaut wird aus React-Elementen, nie aus HTML**: `lib/markdownLite` zerlegt den Text in
   Teile, `MarkdownLine` setzt `strong` und `em`. Ein `<script>` im Text bleibt Text.
5. **Die Stoppuhr bleibt `wide`** (ADR-0088): der Editor braucht darin keine grössere Breite.

## Begründung

**Zu 2:** «Enter speichert aus jedem Feld» ist der Kern der Schnellzeile. Ein Feld, in dem Enter
plötzlich eine neue Zeile macht, würde Einträge halb fertig stehen lassen. Umschalt+Enter ist die
Taste, die Chats und Formulare für die neue Zeile kennen.

**Zu 3:** Der Text gehört in die Tagesliste als Hinweis, nicht als Absatz; eine Zeile mit
« · » sagt, was gemacht wurde, und hält die Liste ruhig.

## Verworfene Alternativen

**WYSIWYG mit Tiptap oder Lexical.** Verworfen: neue Abhängigkeit, Bundle, XSS-Fläche — für vier
Formate.

**Enter macht eine neue Zeile, Strg+Enter speichert.** Verworfen: bricht ADR-0082 und die
Gewohnheit der Schnellzeile.

**Die Leiste immer zeigen.** Verworfen: die Schnellzeile wäre in Ruhe zwei Zeilen hoch, und die
Felder daneben stünden verloren.

**Den Text mehrzeilig in der Tagesliste zeigen.** Verworfen: jede Zeile hätte eine andere Höhe.

## Konsequenzen

- Neue Bausteine `components/RichTextField`, `components/MarkdownLine` und `lib/markdownLite`
  (Lesen, eine Zeile, Formatieren, neue Zeile).
- Die Tagesliste, die Auswertung, die Register am Projekt und am Kunden und die Liste des
  Abrechnens zeigen den Text über `MarkdownLine`.
- Tests setzen den Wert des Textes über den Prototyp von `textarea`.
