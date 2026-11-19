# ADR-0048 — Esc bricht ab und fragt vorher, wenn etwas geändert wurde

- **Status:** Angenommen
- **Datum:** 2026-11-19
- **Verhältnis:** Ergänzt [ADR-0012](ADR-0012-tastenkuerzel-zum-abschliessen-einer-maske.md)
  um das Gegenstück zum Speichern, das dort als «nicht geregelt» stand. Lässt
  [ADR-0003](ADR-0003-speichern-schliesst-die-maske.md) unverändert: Speichern schliesst die
  Maske weiterhin, auch nach dem Anlegen.
- **Backend:** keins.

## Kontext

Zum Speichern gibt es Strg+S und Strg+Enter (ADR-0012). Zum Abbrechen gab es nur Escape in
Dialogen — und das schloss sofort, auch wenn darin schon eine halbe Adresse getippt war. In
Vollmasken gab es gar keinen Abbruch über die Tastatur. Verlangt ist: Esc bricht ab, und wenn
schon etwas geändert wurde, fragt die Anwendung vorher, ob die Änderungen verworfen werden
sollen. Das soll an einer Stelle gelten, nicht in jeder Maske einzeln.

## Entscheidung

### 1. Ein Abbruch, vier Wege, eine Rückfrage

Im **Dialog** führen Escape, das Schliessen-Kreuz, der Klick auf den Hintergrund und der
Knopf `DialogCancelButton` alle über denselben Weg (`requestClose`). Ohne Änderung schliesst
der Dialog sofort, mit Änderung erscheint «Änderungen verwerfen?» mit «Weiter bearbeiten»
(Fokus) und «Verwerfen».

In der **Vollmaske** übernimmt das neue Gerüst `FormMask` dasselbe: Escape und der
Zurück-Link führen zur Ursprungsmaske, mit derselben Rückfrage, wenn `dirty` gesetzt ist.

### 2. Der Dialog merkt Änderungen selbst

Jede Eingabe im Dialog — tippen, ankreuzen, auswählen — macht ihn «geändert». Gemessen wird
an den Eingabe-Ereignissen des Browsers, nicht am Vergleich zweier Formularstände. Ein Wert,
den der Code selbst setzt (eine vorgeschlagene Sprache, das Land des Mandanten), löst kein
solches Ereignis aus und zählt deshalb nicht. Ein Dialog, der es besser weiss, sagt es mit
`dirty`; die Rückfrage selbst und die Bestätigungsdialoge setzen `dirty={false}`.

Für Vollmasken stellt `useChangeTracker` dasselbe bereit; die Maske legt es um ihr Formular.

### 3. Nur der oberste Dialog hört

Eine Rückfrage über einem Dialog sind zwei Dialoge. Beide hören auf dem Dokument, also führt
`dialogStack` Buch, welcher zuoberst steht; nur der antwortet. Und eine Taste, die ein
Baustein im Dialog schon genommen hat (Tooltip schliessen, Menü schliessen), lässt der Dialog
liegen: der Baustein ruft `preventDefault`.

### 4. Nur Escape und der Zurück-Link sind bewacht

Ein Klick in die Seitenleiste verlässt die Maske ohne Rückfrage. Abfangen liesse sich das nur
mit `useBlocker`, und der braucht einen Data Router (`createBrowserRouter`) statt des heutigen
`BrowserRouter`. Das ist ein eigener Umbau und bewusst nicht Teil dieses Schritts.

### 5. Ein Dialog öffnet auf dem ersten Feld

Ohne `initialFocus` nimmt jetzt das erste Eingabefeld im Inhalt den Fokus, erst ohne Feld das
Schliessen-Kreuz. Ein Formular-Dialog ist damit sofort tippbereit.

## Begründung

Das Verhalten steckt in `Dialog` und `FormMask`, also bekommt es jede Maske, die darauf baut,
ohne eigene Zeile. Die Rückfrage nur bei echter Eingabe zu stellen, hält sie selten genug, um
ernst genommen zu werden: wer einen Dialog nur angesehen hat, wird nicht gefragt.

## Verworfene Alternativen

**Änderung über den Vergleich mit dem Anfangsstand.** Erwogen, weil dann ein zurückgetippter
Wert wieder als «unverändert» gälte. Verworfen: mehrere Masken füllen nach dem Öffnen selbst
Werte ein (Standardsprache, Standardland). Der Vergleich hielte diese Masken für geändert,
bevor jemand etwas getan hat. Die Eingabe-Ereignisse kennen diesen Fehler nicht.

**`window.confirm` für die Rückfrage.** Verworfen: blockiert den Browser, ist nicht gestaltbar
und folgt dem dunklen Erscheinungsbild nicht.

**Esc in Vollmasken weglassen, nur in Dialogen.** Verworfen: dann gälte in der einen Bauform
etwas anderes als in der anderen. Verlangt war ein Verhalten für alle Fenster.

**Gleich auf `createBrowserRouter` umstellen.** Verworfen für jetzt, auf Wunsch: Esc und der
Zurück-Link reichen fürs Erste. Der Umbau betrifft `App.tsx` mit allen Routen und gehört in
einen eigenen Schritt.

**Escape leert ein ausgefülltes Suchfeld zuerst.** Erwogen für Listenregister mit Suche. Nicht
umgesetzt: die Suchfelder sind keine `type="search"`-Felder, und eine verlassene Maske ohne
Änderung verliert nichts. Kann nachgeholt werden, ohne diese Entscheidung zu ändern.

## Konsequenzen

- Alle Dialoge der Anwendung fragen ab sofort vor dem Verwerfen, auch die der noch nicht
  überarbeiteten Module. Ein Dialog, der nur sucht und nichts zu verlieren hat, setzt
  `dirty={false}`.
- Bestehende Fussknöpfe «Abbrechen», die `onClose` direkt aufrufen, umgehen die Rückfrage. Sie
  werden beim Überarbeiten des jeweiligen Moduls durch `DialogCancelButton` ersetzt.
- Bausteine mit eigenem Escape (Menüs, Vorschlagslisten) müssen `preventDefault` rufen, sonst
  bricht Escape die ganze Maske ab. `SplitButton` und `Tooltip` tun es.

## Abweichungen vom Issue

Keine. Der Bildschirmwechsel über die Seitenleiste ist ausdrücklich ausgenommen (Entscheid 4).

## Offen

- Umstellung auf einen Data Router, damit auch die Seitenleiste fragt.
