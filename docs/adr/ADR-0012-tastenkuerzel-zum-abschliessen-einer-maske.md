# ADR-0012 — Strg+S und Strg+Enter schliessen eine Maske ab

- **Status:** Angenommen
- **Datum:** 2026-08-23
- **Verhältnis:** ergänzt [ADR-0003](ADR-0003-speichern-schliesst-die-maske.md) — dort steht,
  *was* Speichern tut, hier steht, *womit* man es auslöst. Ergänzt ausserdem
  [ADR-0008](ADR-0008-schnellsuche-und-tastatur-im-positionsdialog.md), das die Tastatur
  bisher nur für den Positionsdialog geregelt hat. Hebt nichts auf.
- **Backend:** keins. Rein in der Oberfläche.

## Kontext

Wer Belege erfasst, hat die Hände auf der Tastatur. Bis jetzt musste er für jedes Speichern
zur Maus greifen: die Masken kannten überhaupt kein Tastenkürzel, und nur der Positionsdialog
war für die Tastatur gebaut (ADR-0008).

Das fällt umso mehr auf, als die nächste Anforderung — die Schnellerfassung von
Verkaufskonditionen — ausdrücklich verlangt, dass die Bedienung mit der Tastatur
«massgeblich» ist. Eine Maske, die man tippend füllt und dann anklicken muss, ist ein Bruch
mitten im Ablauf.

Dazu kommt, dass die Anwendung zwei Bauformen kennt, die dieselbe Frage unterschiedlich
beantworten müssen: **Vollmasken** mit dem Knopf im Seitenkopf (ADR-0005) und **Dialoge** mit
dem Knopf im Fuss. Steht ein Dialog über einer Maske, gibt es zwei Primäraktionen auf dem
Bildschirm — und nur eine darf auf die Taste hören.

## Entscheidung

**Zwei Kombinationen lösen die Primäraktion aus, überall:**

| Tasten | Warum diese |
|--------|-------------|
| **Strg+S** (⌘S) | Was jeder zum Speichern greift. Der Browser würde die Seite speichern wollen; das wird unterdrückt. |
| **Strg+Enter** (⌘Enter) | «Formular abschicken». Die einzige, die auch in einem mehrzeiligen Feld noch funktioniert, wo Enter zum Text gehört. |

**Enter allein nicht.** Eine Maske hat viele Felder, und ein verirrtes Enter beim Tippen einer
Adresse würde einen halb gefüllten Datensatz speichern.

**Umschalt und Alt disqualifizieren.** Ein Kürzel, das beim Fast-Treffer auslöst, ist
schlimmer als eines, das nicht auslöst.

**Ein Dialog über einer Maske besitzt die Tastatur.** Der Seiten-Hook stellt sich zurück,
solange irgendein `[role="dialog"]` im Dokument steht; der Dialog bindet dieselben Tasten
selbst, in seinem eigenen Kasten. Ohne das würde Strg+S im Adressdialog den Kunden dahinter
speichern.

**Escape bleibt das Gegenstück** und schliesst einen Dialog, wie bisher.

Umgesetzt in drei Teilen: `lib/shortcuts.ts` entscheidet ohne React, ob eine Taste gemeint
war; `components/useSubmitShortcut.ts` bindet sie für eine Vollmaske; `Dialog` nimmt eine
neue Eigenschaft `onSubmit` und bindet sie für seinen Kasten. Der Primärknopf bekommt
`shortcut` und nennt die Tasten in seinem Tooltip, plattformgerecht.

## Begründung

**Strg+S, obwohl der Browser es belegt.** `preventDefault` unterdrückt den Speichern-Dialog
zuverlässig in allen aktuellen Browsern, und genau das tun Notion, Figma und Google Docs
auch. Die Alternative — es dem Browser zu lassen — hiesse, das eine Kürzel wegzulassen, nach
dem die Leute greifen.

**Beide, nicht eines.** Strg+S ist das erwartete; Strg+Enter ist das, das im Textfeld noch
geht und das jeder aus GitHub, Jira und Slack kennt. Sie kosten zusammen eine Zeile mehr.

**Die Prüfung als reine Funktion.** `lib/` kennt React nicht, also lässt sich die Regel ohne
Renderer testen — und sie ist die Stelle, die eine Fast-Treffer-Frage beantwortet, nicht der
Hook.

**Das Zurückstehen über `[role="dialog"]` im Dokument, nicht über einen Fokus-Vergleich.**
Der Fokus kann auf `body` liegen, etwa direkt nach dem Öffnen oder nachdem ein Knopf
deaktiviert wurde. Die Anwesenheit des Kastens ist das verlässlichere Signal, und `Dialog`
zeichnet `role="dialog"` nur, solange er offen ist.

**Der Hook wird abgehängt statt still zu tun.** `undefined` statt eines Kürzels, das nichts
macht: eine Maske ohne Schreibrecht, mit laufender Anfrage oder mit unvollständigem Formular
bindet gar nichts. Das ist derselbe Zustand, in dem auch der Knopf gesperrt ist, und beide
lesen ihn aus derselben Bedingung.

## Alternativen

**Nur Strg+Enter.** Kollidiert mit nichts und ist im Textfeld sicher. Verworfen: es ist nicht
das, wonach jemand greift, der «speichern» denkt. Wer Strg+S drückt, bekäme den
Speichern-Dialog des Browsers — also genau die Störung, die das Kürzel vermeiden sollte.

**Nur Strg+S.** Verworfen: In einem mehrzeiligen Feld ist es die einzige Möglichkeit, und
Strg+Enter kostet nichts. Ausserdem belegen manche Erweiterungen Strg+S.

**F2 wie in klassischen ERP-Masken.** Ehrlich erwogen, weil SAP-Erfahrene es kennen.
Verworfen: die Anwendung läuft im Browser, und dort ist F2 unbelegt und unbekannt. Wer aus
dem Web kommt — die Mehrheit — würde es nie finden. Als spätere Ergänzung möglich, ohne dass
sich an dieser Entscheidung etwas ändert.

**Enter allein, wo die Maske nur ein Feld hat.** Verworfen: dann gälte in der einen Maske
etwas anderes als in der nächsten, und man müsste sich merken, welche welche ist.

**Ein `<form onSubmit>` je Maske statt eines Dokument-Listeners.** Der saubere HTML-Weg, und
Enter würde von selbst funktionieren. Verworfen aus zwei Gründen: Enter allein wollen wir
gerade nicht, und Strg+S erreicht ein Formular nie — das fängt der Browser vorher ab. Ein
Dokument-Listener ist der einzige Ort, an dem sich das unterdrücken lässt.

**Das Kürzel sichtbar neben dem Knopf anschreiben.** Verworfen für den Anfang: es steht im
Tooltip, und eine Taste im Knopf zu drucken kostet Breite in jedem Seitenkopf. Wird
nachgeholt, wenn sich zeigt, dass es niemand findet.

## Konsequenzen

- Jede Maske mit einer Primäraktion bindet sie: die Vollmasken über `useSubmitShortcut`, die
  Dialoge über `Dialog onSubmit`. Wer eine neue Maske baut, macht dasselbe — sonst ist sie
  die eine, in der die Taste nicht geht.
- **Der Tooltip nennt die Tasten nur bei einfachen Knopfbeschriftungen.** Ein Knopf mit Symbol
  neben dem Wort bekäme sonst einen Tooltip, der die Hälfte von sich selbst nennt.
- Ein Knopf, der bei gesperrter Maske sowieso nichts tut, bindet auch nichts. Damit kann das
  Kürzel keine zweite Anfrage lostreten, während die erste läuft.
- **Nicht geregelt:** ein Kürzel zum Abbrechen ausserhalb von Dialogen, Kürzel zum Navigieren
  zwischen Registern, und ein Kürzel für «Speichern und neu». Kommen, wenn sie gebraucht
  werden — die Schnellerfassung wird die ersten Kandidaten liefern.
