# ADR-0078 — Druckvorlagen-Designer: ein Blatt mit freier Platzierung

- **Status:** Angenommen
- **Datum:** 2026-11-21
- **Verhältnis:** Neu. Setzt die Druckvorlage Version 2 des Backends um — ADR-0152 (Backend):
  Papierformat, freie Platzierung, anordenbarer Inhalt, Lage des QR-Zahlteils. Löst Punkt 2 von
  [ADR-0060](ADR-0060-stammdaten-masken-auf-den-gemeinsamen-bausteinen.md) ab («Die Druckvorlage
  ist eine `FormMask`») und folgt den Tastenkürzeln (ADR-0012), dem Änderungsschutz (ADR-0048,
  ADR-0069), den Grössen (ADR-0049), den Hinweisen als Tooltip (ADR-0050) und dem Menü auf kleinen
  Geräten (ADR-0071).

## Kontext

Der bisherige Editor kannte drei Bänder — Kopf, Körper, Fuss — auf festem A4 hoch. Im Körper
standen graue Kästchen mit dem Namen der Tabelle; platzieren liess sich nur im Kopf und im Fuss,
relativ zum Rand; der Zahlteil kam immer auf eine Zusatzseite. Wer das zweimal im Jahr öffnet,
musste erst lernen, was ein «Band» ist.

Das Backend speichert neu eine Vorlage mit drei Teilen: der **Seite** (Format, Ausrichtung,
Ränder), **Elementen**, die an einer festen Stelle des Papiers stehen, und einem **Inhalt**, der
auf Seite 1 bei `flow.top` beginnt, nach unten läuft und auf Folgeseiten am oberen Rand
weitergeht. Im Inhalt stehen Abschnitte in einer Reihenfolge; ein Abschnitt «Freier Bereich» ist
ein Kasten fester Höhe, der platzierte Elemente trägt und mit dem Inhalt mitwandert. Alle Längen
sind Millimeter, Schriftgrössen Punkt. Das Sicherheitsprinzip bleibt: eine Vorlage ist Daten,
nie Code.

Die Benutzer sind Inhaberinnen und Buchhalter kleiner Schweizer Betriebe, keine Gestalter.

## Entscheidung

1. **Drei Ideen, und nur diese drei**, sind auf dem Bildschirm sichtbar: **das Blatt** (echtes
   Papier mit Linealen und Rändern), **feste Elemente** (bleiben, wo man sie hinlegt, auch im
   Rand, auf Seite 1 oder auf jeder Seite) und **der Inhalt** (beginnt an der beschrifteten Linie
   «Inhalt beginnt hier», hat eine Reihenfolge, wächst mit dem Beleg). Das Wort «Band» gibt es
   nicht mehr.
2. **Drei Spalten:** links, was sich einfügen lässt (Elemente, Felder, Aufbau), in der Mitte das
   Blatt, rechts die Einstellungen dessen, was gewählt ist — und des Blatts, solange nichts
   gewählt ist. Unter 1100 px Breite des Designers werden die Seitenspalten zu Schubladen.
3. **Das Blatt ist DOM, in Millimetern und Punkt gesetzt, und wird als Ganzes skaliert.** Ein
   Element steht bei `left: 20mm`, eine Spalte ist `22mm` breit, eine Schrift `9pt` gross; der
   Zoom ist ein einziges `transform: scale()`. Die Schrift auf dem Blatt ist nicht die der
   Anwendung, sondern `'Liberation Sans', Arial, Helvetica` (Token `--font-print`) — das PDF nutzt
   Liberation Sans, und die drei sind metrisch gleich. Was zum Werkzeug gehört (Umrisse, Griffe,
   Marken), teilt seine Grösse durch den Zoom (`--sheet-zoom`) und bleibt am Bildschirm gleich
   gross.
4. **Ziehen von Hand mit Pointer-Events**, ohne Bibliothek: ein Satz Handler auf dem Blatt, die
   Objekte tragen `data-key` und keine eigenen Handler. Ein Ziehen berührt die gespeicherte
   Vorlage nie; jede Bewegung rechnet aus dem Stand beim Drücken eine Vorschau, das Loslassen
   übernimmt sie als **einen** Schritt.
5. **Beispieldaten auf dem Blatt statt Platzhalter.** Der Katalog (`GET /fields`) liefert zu jedem
   Feld und jeder Spalte einen Beispielwert und einen ganzen Beispielbeleg; das Blatt zeichnet
   damit Adresse, Positionstabelle, Totale so, wie das PDF sie druckt. Den QR-Zahlteil holt der
   Designer als SVG (`GET /sample-payment-part`).
6. **Ziehen ist nie der einzige Weg** (WCAG 2.2 SC 2.5.7): jeder Paletteneintrag fügt auch auf
   Klick und Enter ein; X, Y, Breite, Höhe sind Zahlenfelder in Millimetern; Abschnitte und
   Spalten ordnen sich mit Pfeilknöpfen; «Fest auf dem Blatt» oder «Im Inhalt» ist ein Schalter in
   den Einstellungen; die Linie «Inhalt beginnt hier» ist ein Schieber mit Pfeiltasten und ein
   Zahlenfeld.
7. **Die Regel des Inhalts wird gesagt, nicht erraten.** Wer ein Element über den Inhalt zieht,
   sieht einen Balken an der Stelle, an der es landet, mit dem Satz «Bewegt sich mit dem Inhalt
   mit»; beim Loslassen entsteht dort ein freier Bereich (oder der unter dem Zeiger nimmt es
   auf). Die Umschalttaste lässt es stattdessen fest auf dem Blatt. Ein Element, das aus seinem
   freien Bereich herausgezogen wird, steht wieder fest.
8. **Der QR-Zahlteil ist gesperrt.** «Unten auf der letzten Seite» gibt es nur auf Papier, das
   210 mm breit und mindestens 297 mm hoch ist; sonst bleibt die Wahl sichtbar, ist gesperrt, und
   der Grund steht daneben. Das Blatt zeigt den Zahlteil ohne Griffe, mit Schloss und dem Satz,
   dass SIX Lage und Grösse vorgibt; was er verdeckt, trägt eine Marke.
9. **Die Vorlage ist ein Wert mit Verlauf.** Der Designer hält sie als unveränderlichen Wert in
   einem Reducer; Rückgängig und Wiederholen gehen über ganze Stände (Vorlage **und** Auswahl),
   schnelle gleichartige Änderungen — gehaltene Pfeiltaste, getipptes Wort — zählen als ein
   Schritt. «Ungespeichert» vergleicht mit dem zuletzt gespeicherten Stand.
10. **Die Modellschicht kennt React nicht** und liegt in `src/printlayout/`: Einheiten, Papier,
    Geometrie, Einrasten, Operationen auf der Vorlage, Spalten, Prüfung, Verlauf, Befehle. Die
    Prüfung spiegelt die Regeln des Backends und antwortet in deutschen Sätzen am Feld; was das
    Backend ablehnen würde, sperrt «Speichern» mit Begründung, statt nach dem Klick zu scheitern.
11. **Unbekanntes bleibt sichtbar — und sperrt das Speichern.** Ein Feld oder eine Spalte, die
    der Katalog nicht mehr kennt, steht als «Unbekanntes Feld» / «Unbekannte Spalte» mit Marke da
    und lässt sich neu verbinden oder entfernen. Weil das Backend eine solche Vorlage ablehnt,
    ist «Speichern» bis dahin gesperrt, mit dem Satz, was zu tun ist, und einem Knopf «Anzeigen».
12. **Der Designer rechnet wie der Renderer**, an vier Stellen ausdrücklich: Eine Spaltenbreite
    ist die Breite des Zelleninhalts, dazu kommen 2 mm Zellenabstand — die Summenleiste zählt
    sie mit. Ein Abschnitt ohne eigenen Einzug steht am linken Rand, Totale und MwSt-Aufstellung
    am rechten; «Rechts» löscht darum den Einzug, statt eine Zahl zu setzen, und bleibt richtig,
    wenn sich Papier oder Ränder ändern. Eine Linie liegt, wenn sie keine Höhe hat oder ihre
    Breite mindestens die Höhe ist; mit Höhe und ohne Breite steht sie (`liesFlat()` im Backend).
    Der Stil eines freien Bereichs gilt für die Elemente darin und wird unverändert
    zurückgeschickt. Der Inhalt liegt über den festen Elementen. Und mit dem
    Zahlteil unten hält der Inhalt 107 mm frei (105 mm und 2 mm für die Schnittlinie).
13. **Was das Backend beim Speichern ablehnt, sperrt der Designer vorher**, je mit einem Satz am
    Feld und oben mit «Anzeigen»: Spalten, die mit ihren Zellenabständen nicht in die Tabelle
    passen (die füllende Spalte zählt mindestens 20 mm); Totale und MwSt-Aufstellung unter 60 mm
    Breite; ein zweiter Abschnitt «Totale»; ein freier Bereich, der höher ist als eine Seite; die
    Obergrenzen (200 feste Elemente, 50 Abschnitte, 50 Elemente je freiem Bereich, 10 Bilder,
    2000 Zeichen Text, 60 Zeichen Spaltenüberschrift). Und mit dem Zahlteil unten: steht die UID
    des Absenders nur in Elementen «Jede Seite», die in die untersten 105 mm reichen, fehlte sie
    auf einer einseitigen Rechnung (MWSTG Art. 26 Abs. 2 Bst. a) — der Fehler steht an der Wahl
    des Zahlteils und am Element. Der Paletteneintrag eines Abschnitts, den es schon gibt, fügt
    keinen zweiten ein, sondern wählt den vorhandenen aus (ziehen verschiebt ihn) und sagt das;
    «Duplizieren» und «Einfügen» lassen «Totale» aus. Von der MwSt-Aufstellung und vom freien
    Bereich darf es mehrere geben.
14. **Ein getippter Wert gehört dem, wofür er getippt wurde.** Ein Zahlenfeld übernimmt erst
    beim Verlassen. Ein Klick auf ein anderes Element erreicht das Blatt aber, bevor das Feld
    den Fokus verliert — die Zahl landete sonst auf dem nächsten Element. Darum liefert jedes
    Feld seinen Entwurf ab, **bevor** irgendetwas anderes geschieht: bei jedem Druck ausserhalb
    des Feldes (in der Capture-Phase am Dokument, sofort gerendert), vor «Speichern» und vor
    «Vorschau». Ist der Entwurf ungültig, wird weder gespeichert noch eine Vorschau geholt, und
    das Feld sagt warum. Zusätzlich hat jedes Objekt seinen eigenen Inspektor (`key`), damit ein
    Entwurf nie unter einem anderen Objekt weiterlebt. Nach «Löschen» geht der Fokus aufs Blatt,
    nach «Duplizieren» auf die Kopie. Rückgängig mit Strg+Z gilt überall ausser in Feldern, in
    die man tippt.
15. **Was der Server schickt, wird beim Lesen vervollständigt** (`normalizeDefinition`,
    `normalizeCatalogue`): fehlende Eigenschaften werden zu `null` oder ihrem Vorgabewert, Listen,
    die ein Abschnitt nicht braucht, fallen weg. Danach hat eine Vorlage genau eine Gestalt —
    darauf beruht der Vergleich «ungespeichert».

## Begründung

**Zu 3 — DOM in Millimetern:** Das PDF entsteht im Backend aus HTML und CSS. Dasselbe HTML und
CSS im Browser ist die genaueste Skizze, die ohne Server möglich ist: ein Zeilenumbruch auf dem
Blatt ist derselbe wie im PDF, weil Schrift, Breite und Polsterung dieselben Zahlen sind. Text
bleibt Text — markierbar für Screenreader, mit Tab erreichbar, ohne eigene Trefferprüfung.

**Zu 4 — eine Vorschau statt direkter Änderung:** Das macht aus einem Ziehen einen
Rückgängig-Schritt, hält die Seitenspalten während des Ziehens still und erlaubt Esc als
Abbruch, ohne etwas zurückrechnen zu müssen. Sechzig Elemente bleiben ruhig, weil nur das
gezogene neue Props bekommt.

**Zu 6 und 7:** Nicht-Gestalter konfigurieren lieber, als dass sie zeichnen. Die Einstellungen
rechts sind deshalb das Hauptwerkzeug, das Ziehen die Abkürzung. Und die bekannte Klage über
Berichtsgeneratoren ist, dass niemand versteht, warum etwas nach unten rutscht — darum wird die
Regel an der Stelle ausgesprochen, an der sie wirkt.

**Zu 9:** Eine Vorlage ist klein. Ganze Stände aufzubewahren kostet nichts und erspart
Umkehroperationen, die bei «verschieben zwischen Blatt und Inhalt» fehleranfällig wären.

## Verworfene Alternativen

**Canvas-Bibliothek (Konva, Fabric).** Verworfen: eine Zeichenfläche misst und bricht Text
anders als der HTML-Renderer des PDF — genau der Unterschied, den «auf den Millimeter» ausschliessen
soll. Dazu kämen eine eigene Tastatur- und Screenreader-Schicht für alles, was das DOM von selbst
kann, und eine neue Abhängigkeit für ein einzelnes Bild.

**react-moveable, react-rnd, dnd-kit.** Verworfen: react-moveable wird nicht mehr gepflegt;
react-rnd und dnd-kit rechnen in Pixeln und halten den Zustand des Ziehens selbst, die Vorlage
rechnet in Millimetern mit eigenem Raster, Hilfslinien und zwei Arten von Behältern. Die
Übersetzung dazwischen wäre mehr Code als die Pointer-Events von Hand — und der Stack ist
bewusst schmal.

**Implizite Geometrie, die nach unten schiebt (ReportBro, pdfme, Jasper «float»).** Verworfen:
dort entscheidet die Lage eines Elements still, ob es mitwandert. Das ist die Stelle, an der
Benutzer solcher Werkzeuge scheitern. Hier ist es ein benannter Zustand — fest oder im Inhalt —,
sichtbar an der Linie, im Aufbau und im Hinweis beim Loslassen.

**Reiner Konfigurator ohne freie Platzierung (Lexware, Zoho).** Verworfen: Logo, Fenstercouvert
und Fusszeile verlangen Millimeter an beliebiger Stelle, und das Backend bietet sie. Übernommen
ist die Stärke dieses Ansatzes: jede Vorlage beginnt als fertige Standardvorlage, und alles ist
rechts einstellbar.

**Das servergerenderte PDF als einzige Vorschau.** Verworfen: jeder Handgriff bräuchte einen
Request und zeigte ein Bild, in dem sich nichts anfassen lässt. Das PDF bleibt als Beweis — der
Dialog «Vorschau (PDF)» rendert den ungespeicherten Stand über `POST /preview`.

**Die Vorlage weiter als `FormMask` (ADR-0060).** Verworfen: die Vollmaske scrollt als Seite; ein
Arbeitsplatz mit Blatt und zwei Spalten braucht die volle Höhe und drei eigene Scrollbereiche.
Das Verhalten der Maske bleibt, über dieselben Bausteine: `useLeaveGuard` und
`useSubmitShortcut`.

**Die Linie «Inhalt beginnt hier» rückt bei engeren Rändern von selbst nach.** Verworfen: eine
Linie, die sich ungefragt bewegt, ist genau das «wo ist es hin». Die Prüfung meldet den Fehler am
Feld; die Linie bleibt, wo sie hingestellt wurde.

## Konsequenzen

- `lib/types.ts` kennt nur noch Version 2; das Bändermodell und `printlayout/layout.ts` sind
  gelöscht. Das Backend hebt gespeicherte Vorlagen beim Lesen an.
- Neue Tokens in `index.css`: `workspace`, `paper`, `print-*` (die Farben des Renderers),
  `sheet-*` (Marken des Werkzeugs auf dem Papier), `shadow-sheet`, `font-print`,
  `container-dialog-large`, `spacing-pane`, `spacing-inspector`, `spacing-ruler`. Papier bleibt in
  beiden Erscheinungsbildern weiss; nur der Tisch darunter wird dunkel. Die Tokens sind im
  Figma-File nachzuführen.
- **Die Druckfarben sind Daten, nicht Thema.** Farbwerte des Benutzers stehen als Hex in der
  Vorlage und werden, gegen das Muster des Servers geprüft, inline auf das Blatt gesetzt. Das ist
  die eine Stelle, an der eine Komponente eine Farbe setzt, die kein Token ist.
- `Dialog` hat eine dritte Breite (`large`) für die PDF-Vorschau.
- `CheckboxField` nennt die Füllung nur noch einmal je Zustand; ein angekreuztes, gesteuertes
  Kästchen kam vorher weiss mit weissem Haken heraus.
- **Doppelt geführt:** die Standardspalten der Positionstabelle (`DEFAULT_POSITION_COLUMNS`), die
  Papiermasse, die Grenzen der Prüfung, die Regeln für Einzug und Breite eines Abschnitts
  (`sectionOffsetOf`, `sectionWidthOf`) und die Stilregeln der Tabellen (Linienstärken,
  Polsterung, 0.8889 em für die Kopfzeile, 0.8333 em für Zusatzzeilen) stehen hier und im Renderer
  des Backends. Ändert sich eine Seite, ändert sich die andere mit — sonst stimmt das Blatt nicht
  mehr mit dem PDF überein.
- Die Zusatzzeilen einer Position (`details`) kommen im Katalog als eine Liste. Das PDF setzt die
  zweite Bezeichnung in der Grösse der Zeile und nur die übrigen kleiner; das Blatt setzt alle
  klein, weil die Liste den Unterschied nicht trägt.
- **Das Blatt ist eine Skizze, das PDF der Massstab.** Höhen von Text misst der Browser; wo zwei
  Renderer einen Umbruch verschieden setzen, kann ein Abschnitt im PDF eine Zeile höher sein.
- Der Designer ist mit Maus, Tastatur und Stift bedienbar; mit dem Finger ziehen die Objekte auf
  dem Blatt und die Griffe der Palette, die Liste selbst bleibt scrollbar. Unter Tablet-Breite
  ist er nutzbar, aber nicht bequem.
- Tastatur auf dem Blatt: Tab durch die Objekte in Lesereihenfolge, Pfeile 0.5 mm, Umschalt 5 mm,
  Alt 0.1 mm, Entf, Strg+D, Strg+C/V, Strg+Z/Y, Esc hebt die Auswahl auf und verlässt erst beim
  zweiten Mal die Maske.
