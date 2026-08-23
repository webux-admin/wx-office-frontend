# ADR-0010 — Die Offerten-Maske bekommt Register, und ein Link nennt das Startregister im Router-State

- **Status:** Angenommen
- **Datum:** 2026-08-23
- **Verhältnis:** [ADR-0005](ADR-0005-belegart-als-vollmaske.md) gilt weiter: das Register
  bleibt lokaler Zustand und bekommt keine eigene URL. Dieses ADR ergänzt den Weg, wie ein
  Link trotzdem auf einem bestimmten Register landet.
- **Backend:** setzt die Offerten-Nachverfolgung voraus: `GET/PUT /{offers}/{id}/tracking…`,
  `…/reminders`, `GET /{offers}/reminders/due`, den `outcome`-Parameter der Offertenliste
  und die Kataloge `offer-outcome` und `offer-decline-reason`.

## Kontext

Die Offerte bekommt eine Nachverfolgung: Ausgang (Angenommen/Abgelehnt),
Gewinnwahrscheinlichkeit und Erinnerungen zum Nachfassen. Die Belegmaske ist aber **eine**
Datei für vier Belegarten und war bis hier eine Scrollseite ohne Register — und nur die
Offerte braucht das Neue, die drei anderen Arten sollen exakt so bleiben, wie sie sind.

Dazu soll die Übersicht fällige Erinnerungen zeigen, und deren Zeile soll nicht irgendwo auf
der Offerte landen, sondern direkt beim Nachfassen. ADR-0005 hat entschieden, dass das
offene Register nicht in der URL steht — ein Deep-Link über die Adresse scheidet damit aus.

## Entscheidung

**Ein Feature-Kennzeichen `tracking` am `SalesDocumentKind`**, nur bei der Offerte `true`.
Maske und Liste fragen dieses Kennzeichen, nie `kind.category === 'OFFER'` — der Tag, an dem
eine zweite Art nachverfolgt wird, ändert eine Zeile in `lib/salesDocument.ts` und sonst
nichts.

**Zwei Register nur bei `tracking`**: «Beleg» (die bisherige Maske, unverändert) und
«Nachfassen» (Verfolgung und Erinnerungen), mit der bestehenden `Tabs`-Komponente. Ohne
`tracking` wird keine Registerleiste gezeichnet; die anderen drei Masken sehen aus wie
vorher.

**Das Startregister reist im Router-State**, nach dem Muster von `origin`: die
Erinnerungszeile der Übersicht verlinkt mit `state: { tab: 'nachfassen' }`, die Maske liest
das einmal beim Aufbau (`useState`-Initialwert) und hält das Register danach lokal. Die URL
bleibt, was sie war: der Datensatz.

**Die Ausgangs-Aktionen stehen im `PageHeader`**, wo Ausstellen und Stornieren schon stehen:
«Angenommen» ist ein Klick ohne Dialog (Muster «Ausstellen»), «Abgelehnt» öffnet einen
kleinen Dialog mit freiwilligem Grund (Katalog) und Notiz, «Markierung aufheben» ist ein
Klick, und bei angenommener Offerte öffnet «Auftrag erstellen…» den bestehenden
`TakeoverDialog` der Auftrags-Art mit der Offerte als vorgewähltem Vorgänger.

## Begründung

**Ein Kennzeichen statt Kategorie-Abfragen.** Die Maske hatte bis hier keinen einzigen
kategoriespezifischen Zweig, und das war ihr Wert. Ein benanntes Flag hält diesen Zustand:
die Stellen sagen *warum* sie verzweigen (wird nachverfolgt?), nicht *für wen*.

**Router-State statt URL.** ADR-0005 bleibt in Kraft: eine zweite Adresse für denselben
Datensatz kostet Routen, Weiterleitungen und die Frage, was beim Registerwechsel mit der
History passiert. Der Router-State kostet nichts davon und macht genau den einen Absprung —
Übersicht → Nachfassen — möglich.

**Register statt dritter Spalte oder Anhang unten.** Nachfassen ist ein anderer Arbeitsgang
als das Schreiben des Belegs: wer nachfasst, will Wahrscheinlichkeit und Erinnerungen sehen,
nicht Positionen. Unten angehängt wäre es auf einer ohnehin langen Maske unsichtbar.

## Alternativen

**Das Register in die URL** (`/offerten/:id/nachfassen`). Verworfen: widerspricht ADR-0005,
und jede Belegart-Route würde sich verdoppeln, obwohl drei von vier Arten das Register nie
haben.

**Eine eigene Nachfassen-Seite** neben der Maske. Verworfen: zweiter Kopf, zweite Lade- und
Rechtelogik für denselben Beleg, und der Ausgang gehört sichtbar an den Beleg selbst.

**Query-Parameter** (`?tab=nachfassen`). Verworfen: das ist die URL-Variante mit anderem
Kleid — sie überlebt Bookmarks und Reloads und macht damit genau das zum Adressbestandteil,
was ADR-0005 draussen halten wollte.

## Konsequenzen

**Ein in neuem Tab geöffneter Erinnerungs-Link startet auf «Beleg».** Router-State reist nur
bei Navigation im selben Tab mit. Das ist der Preis der ADR-0005-Linie und akzeptiert: der
Leser ist auf der richtigen Offerte und einen Klick vom Nachfassen entfernt.

**Getipptes geht beim Registerwechsel verloren**, wie auf der Partnermaske: das inaktive
Register wird nicht gezeichnet. Die Nachfassen-Formulare sind Dialoge und kurz.

**Die Ton-Zuordnung des Ausgangs steht zweimal** (Maske und Liste, `OUTCOME_TONES`), wie die
Status-Töne vorher auch — unter der Drei-Wiederholungs-Regel bewusst nicht extrahiert.

**Nicht umgesetzt:** Es gibt weiterhin keine Glocke und kein Polling. Fällige Erinnerungen
erscheinen, wenn die Übersicht geöffnet oder neu geladen wird — nicht von selbst.
