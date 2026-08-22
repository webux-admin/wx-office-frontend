# ADR-0009 — Gedruckt wird über den Dialog des Browsers, eine Ausfertigung nach der anderen

- **Status:** Angenommen
- **Datum:** 2026-08-22
- **Verhältnis:** ergänzt [ADR-0005](ADR-0005-belegart-als-vollmaske.md) und
  [ADR-0006](ADR-0006-kopfdaten-am-entwurf.md) um das Drucken; hebt nichts auf.
- **Backend:** Gelesen werden `GET /{orders|offers|invoices}/{id}/printouts`,
  `PUT …/printouts`, `GET …/{id}/pdf`, `GET …/{id}/pdf?printoutId=…` und
  `/api/tenants/{t}/printers`. Die fachlichen Entscheidungen dahinter stehen im Backend:
  `webux-office/docs/adr/ADR-0024` (Druck und PDF-Archivierung),
  `ADR-0042` (Drucker und Schächte) und `ADR-0043` (Ausfertigungen am Beleg).

## Kontext

Ein Beleg wird in Ausfertigungen gedruckt: „Original" zum Kunden, „Buchhaltung" in die
Ablage, beim Lieferschein oft eine dritte für die Spedition. Jede Ausfertigung trägt eine
Beschriftung, eine Exemplarzahl und — als **Notiz** — einen Drucker und einen Schacht.

Was eine Webseite davon steuern kann, ist schnell gesagt: **nichts**. Es gibt keine Web-API,
mit der eine Seite ein Zielgerät, einen Schacht oder eine Exemplarzahl setzt. `window.print()`
öffnet den Systemdialog, und dort wählt der Mensch. Alles, was das Frontend beitragen kann,
ist: dem Menschen **vor** dem Dialog zeigen, was für diese Ausfertigung hinterlegt ist.

Dazu kommt eine zweite Einschränkung, die das Vorgehen bestimmt: Ein Klick erlaubt genau ein
neues Fenster, und zwar sofort. Bis das PDF vom Backend geholt ist, ist die Klickerlaubnis
verbraucht — deshalb muss `showFile` schon heute auf einen Download ausweichen. Ein Weg über
Tabs ist damit für eine Reihe von Ausfertigungen nicht gangbar.

## Entscheidung

**1. Gedruckt wird aus einem versteckten `<iframe>`** (`src/lib/print.ts`). Das PDF wird über
`api.file` geholt, als Blob-URL in den Rahmen geladen, und `frame.contentWindow.print()`
öffnet den Systemdialog. Der Rahmen ist beschriftet (`title`) und `aria-hidden`, er braucht
keine Erlaubnis, und die Maske bleibt sichtbar.

**Die Quelle wird gesetzt, bevor der Rahmen in die Seite kommt.** Ein Rahmen, der ohne `src`
eingehängt wird, lädt zuerst `about:blank` und feuert dafür ein `load`-Ereignis — in Chrome
synchron innerhalb von `appendChild`. Wer darauf druckt, bekommt ein leeres Blatt und meldet
Erfolg. Zusätzlich prüft der Handler auf `about:blank` und ignoriert es.

**2. Je Ausfertigung ein eigener Dialog, jeder von Hand gestartet** (`PrintQueueDialog`). Der
Kasten zeigt gross, was gleich kommt — Beschriftung, Exemplarzahl, Drucker, Schacht — und
erst der Klick auf „Drucken" öffnet den Systemdialog. Danach steht die nächste Ausfertigung
an. „Überspringen" lässt eine aus, ein Fehler bietet das PDF als Download an.

**3. Drucker und Schacht sind Anzeige, nie Steuerung.** Das gilt in der Belegartmaske, in der
Sektion „Dokumente" am Beleg und im Druckdialog. Die Druckerverwaltung
(`PrinterListPage`, `printer/PrinterDialog`) pflegt Name, Standort und Schächte — keine
Adresse, keinen Treiber, keine Warteschlange.

**4. Der Fortschritt wird angesagt und der Fokus mitgeführt.** Eine `aria-live`-Region nennt
bei jedem Schritt Ausfertigung, Beschriftung, Exemplarzahl und Ziel; nach jedem Schritt
landet der Fokus auf dem Knopf, der jetzt dran ist. Der Fuss des Dialogs ist deshalb in
beiden Zuständen **derselbe** — der schliessende Knopf wechselt nur seine Beschriftung.

**5. Gedruckt wird immer der gespeicherte Stand.** Solange die Sektion ungespeicherte
Änderungen hat, ist „Alle drucken" gesperrt, mit einem Hinweis darüber. Das Backend rendert
aus dem Archiv, nicht aus der Maske.

## Begründung

**Ein Rahmen statt eines Tabs, weil die Klickerlaubnis nicht bis zum PDF reicht.** Der Tab
müsste im selben Zug wie der Klick geöffnet werden, also leer und lange bevor die Bytes da
sind. Bei drei Ausfertigungen wären es drei Tabs, die der Benutzer einzeln wiederfinden und
einzeln schliessen müsste.

**Ein Dialog je Ausfertigung, weil der Systemdialog die Seite verdeckt.** Sobald er offen
ist, sieht niemand mehr, für welche Ausfertigung er gerade gilt. Genau deshalb steht die
Angabe **vor** dem Öffnen gross im Kasten. Würde die Maske die Dialoge automatisch
aneinanderreihen, verstecke sie genau die Information, für die dieser Bildschirm existiert —
und der Benutzer würde beim zweiten Blatt raten, ob er noch beim Original ist.

**Anzeige statt Steuerung ist keine Bequemlichkeit, sondern die Wahrheit.** „Standarddrucker"
wäre eine Antwort, die diese Anwendung nicht geben kann: sie weiss nicht, was der Browser
anbietet. Deshalb steht bei fehlender Angabe „nicht hinterlegt" und nicht ein erfundener
Vorschlag.

**Der Fortschritt braucht eine Ansage, weil sich nur Text ändert.** Der Kasten bleibt stehen,
Titel und Zähler wechseln. Ohne Live-Region merkt ein Screenreader davon nichts, und ohne
gesetzten Fokus steht der Tastaturbenutzer nach dem Systemdialog auf `<body>`, also
ausserhalb des Modals — die Tab-Falle des Dialogs greift dort nicht mehr.

## Alternativen

**Das PDF in einem neuen Tab öffnen und dort drucken.** Verworfen: die Klickerlaubnis ist
verbraucht, bis die Bytes da sind (das ist der Grund, weshalb `showFile` auf den Download
ausweicht). Dazu verlässt der Benutzer die Maske und muss pro Ausfertigung einen Tab
aufräumen.

**Die Dialoge automatisch verketten: drucken, schliessen, nächster Dialog.** Verworfen aus
dem oben genannten Grund — die Zuordnung Blatt ↔ Ausfertigung geht verloren. Dazu kommt, dass
`print()` in manchen Browsern erst nach dem Schliessen zurückkehrt und in anderen sofort; eine
Kette, deren Takt vom Browser abhängt, ist nicht vorhersagbar. Ein Klick je Blatt ist
langsamer und dafür richtig.

**Alle Ausfertigungen in einem PDF drucken und den Systemdialog einmal öffnen.** Das ist
weiterhin möglich (`GET /{id}/pdf` liefert genau das) und wird als „Alle drucken" auch so
angeboten — aber es ist kein Ersatz: die Ausfertigungen sollen auf **verschiedene** Geräte
und Schächte, und das geht nur, wenn der Systemdialog je Ausfertigung einmal aufgeht.

**Ein serverseitiger Druckdienst (IPP/CUPS), der direkt auf das Gerät druckt.** Der einzige
Weg, Schacht und Exemplarzahl wirklich zu steuern. Verworfen für diese Phase: er verlangt
einen Agenten im Netz des Mandanten, Netzwerkzugriff auf die Geräte und eine eigene
Fehlerbehandlung für alles, was zwischen Server und Papier schiefgeht. Das Datenmodell steht
ihm nicht im Weg — Drucker und Schacht sind bereits als Stammdaten mit stabilem Code
hinterlegt (Backend-ADR-0042), sodass ein späterer Agent sie wiedererkennt.

**Eine Druck-Bibliothek (print-js und Verwandte).** Verworfen: sie macht genau das, was hier
in 90 Zeilen steht — verstecktes iframe, Blob-URL, `print()` —, bringt aber eigene Annahmen
über Fehlerfälle mit und ein weiteres Paket in den Stack. Die Reihenfolge `src` vor
`appendChild`, an der der ganze Ablauf hängt, ist so ausserdem prüfbar.

## Konsequenzen

- Neu: `src/lib/print.ts` (`printFile`, `PrintNotPossibleError`),
  `src/pages/order/PrintQueueDialog.tsx`, `src/pages/order/OrderPrintouts.tsx`,
  `src/pages/order/printoutForm.ts`, `src/pages/PrinterListPage.tsx`,
  `src/pages/printer/PrinterDialog.tsx`, `src/pages/printer/printerForm.ts`.
- `printFile` löst auf, sobald der Dialog **angefragt** wurde. Was tatsächlich aus dem Gerät
  kommt, weiss keine Webseite — die Maske sagt deshalb „an den Druckdialog übergeben" und
  nicht „gedruckt".
- Rahmen und Blob-URL werden erst nach 60 Sekunden abgeräumt: der Systemdialog liest die
  Bytes, solange er offen ist.
- Der Fuss des Druckdialogs bleibt über beide Zustände derselbe Baum. Wird er ausgetauscht,
  verliert React die Referenz auf den Knopf, auf den der Fokus gehört — der Grund steht als
  Kommentar an der Stelle.
- Ein deaktivierter Drucker bleibt im Auswahlfeld, solange die Ausfertigung ihn trägt.
  Sonst wäre nicht mehr sichtbar, worauf der Beleg zeigt.
