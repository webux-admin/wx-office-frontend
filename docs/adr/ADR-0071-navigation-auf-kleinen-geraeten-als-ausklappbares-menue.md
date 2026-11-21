# ADR-0071 — Navigation auf kleinen Geräten als ausklappbares Menü

- **Status:** Angenommen
- **Datum:** 2026-11-21
- **Verhältnis:** Ändert das Verhalten der Seitenleiste unter 768 px. Auf breiten Bildschirmen
  bleibt alles wie bisher: Seitenleiste neben dem Inhalt, einklappbar zum Streifen.

## Kontext

Unter 768 px Breite wurde die Seitenleiste zum Streifen von 64 px eingeklappt und liess sich
nicht mehr ausklappen. Auf einem Telefon mit 390 px blieben dem Inhalt rund 326 px. Die
Startseite zeigte ihre Kacheln einspaltig, und jede Kachel brauchte eine ganze Bildschirmhöhe
für vier Kacheln.

## Entscheidung

1. **Unter 768 px verschwindet die Seitenleiste ganz.** Es gibt keinen Streifen. Der Inhalt
   hat die ganze Breite.
2. **Eine Leiste oben öffnet die Navigation.** Der Knopf «Navigation» legt die Seitenleiste in
   voller Breite (256 px) über die Seite, mit abgedunkeltem Hintergrund.
3. **Das Menü schliesst sich** mit einem Klick auf einen Eintrag, auf den Hintergrund, auf den
   Knopf «Navigation einklappen» im Menü oder mit Esc.
4. **Die Startseite zeigt zwei Kacheln nebeneinander**, ab 1024 px vier.
5. **Der Zustand «gesperrt» (`locked`) entfällt.** Er beschrieb den Streifen, der sich auf
   kleinen Geräten nicht öffnen liess. Den Streifen gibt es dort nicht mehr.

## Begründung

Auf einem Telefon ist Platz das knappste Gut. Ein Streifen mit Symbolen ohne Beschriftung nimmt
ein Sechstel der Breite und ist ohne Beschriftung schwer zu bedienen. Ein Menü, das bei Bedarf
erscheint, gibt dem Inhalt die volle Breite und zeigt beim Öffnen die Beschriftungen.

Die gemerkte Wahl «eingeklappt» des breiten Bildschirms bleibt unangetastet. Wer das Fenster
wieder verbreitert, bekommt seine Seitenleiste so zurück, wie er sie verlassen hat.

## Verworfene Alternativen

**Den Streifen ausklappbar machen.** Verworfen: auch eingeklappt kostet er 64 px, und der
Wunsch war, dass die Navigation eingeklappt ganz verschwindet.

**Eine Leiste unten mit den wichtigsten Einträgen.** Verworfen: die Anwendung hat über vierzig
Einträge in Gruppen. Eine Auswahl wäre eine eigene Entscheidung, welche Einträge zählen.

## Konsequenzen

- Auf kleinen Geräten steht oben eine Leiste mit dem Knopf «Navigation».
- Der Mandantenschalter liegt im Menü und ist erst nach dem Öffnen erreichbar.
- Die Shell hat eigene Tests für Öffnen, Schliessen und den breiten Bildschirm.

## Abweichungen vom Issue

Keine.

## Offen

- Die Leiste oben zeigt nur den Knopf. Ob dort auch der Seitentitel oder der Mandant stehen
  soll, ist offen.
