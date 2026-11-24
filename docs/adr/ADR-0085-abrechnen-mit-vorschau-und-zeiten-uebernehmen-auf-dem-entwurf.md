# ADR-0085 — Abrechnen mit Vorschau und Zeiten übernehmen auf dem Entwurf

- **Status:** Angenommen
- **Datum:** 2026-11-24
- **Verhältnis:** Neu. Setzt Backend ADR-0163 (Issue webux-admin/wx-office#127, «Zeiterfassung
  (5/6) — Zeiten abrechnen») und die Entscheide 5 und 8 bis 11 aus #122 um. Baut auf ADR-0082 bis
  ADR-0084 auf und folgt dem Abo-Lauf mit Vorschau (ADR-0075), dem Dialog der Gutschrift aus der
  Rechnung (ADR-0079), den Registerleisten der Ordner (ADR-0031), den Rückfragen (ADR-0069) und
  den Hinweisen als Tooltip (ADR-0050). Ändert ADR-0082 in einem Punkt: ein gesperrter Eintrag
  sagt seinen Grund nicht mehr in einer Zeile unter sich, sondern im Tooltip eines Schlosses
  (Entscheidung 9).

## Kontext

Seit #127 schreibt das Backend aus offenen Zeiten einen Rechnungsentwurf, neu oder in einen
bestehenden Entwurf des Kunden, und sperrt die abgerechneten Einträge:

| Weg | Recht | Antwort |
|---|---|---|
| `GET /time-tracking/billing/worklist?until=&partnerId=` | `TIME_BILL` | je Kunde ohne Projekt und je Projekt: offene Einträge, gemessene und verrechnete Minuten, Schätzung, ältester Eintrag |
| `POST /time-tracking/billing/preview` | `TIME_BILL` | Kandidaten mit `selected`, Positionen mit Herkunft des Satzes, Übersprungene mit Grund, Totale; schreibt nichts |
| `POST /time-tracking/billing` | `TIME_BILL` **und** `INVOICE_WRITE` | `201` mit `documentId`; `409` mit `entryIds` (inzwischen abgerechnet, leer: Entwurf ausgestellt oder gespeichert); `400` am Feld |
| `POST /time-tracking/billing/release` | `TIME_BILL` | die Einträge, wieder offen; `409`, solange die Position auf dem Entwurf steht |
| `GET`/`PUT /time-tracking/settings` | `TIME_READ` oder `TIME_WRITE` / `TIME_WRITE` | der Abrechnungstakt, 1 für keinen |
| `GET /invoices?status=DRAFT&partnerId=` | `INVOICE_READ` | die Entwürfe eines Kunden, für die Wahl des Ziels |

`TimeEntryDto` trägt neu `documentId` und `documentNumber`, `state` kennt `IN_DRAFT` und `BILLED`,
und ein abgerechneter Eintrag ist `editable: false` mit dem Satz unter `readOnlyReason`.

## Entscheidung

1. **«Zeiten» wird ein Ordner** im Menü «Verkauf», gleich nach «Projekte»: «Meine Zeiten»
   (`/zeiten`, `TIME_TRACK`) und «Abrechnen» (`/zeiten-abrechnen`, `TIME_BILL`), beide unter dem
   Schalter `TIMETRACKING`. Der Kopf des Ordners öffnet «Meine Zeiten». Beide Bildschirme stehen in
   `RegisterGroupLayout`, der Ordner ist ihre Registerleiste. Die Adresse steht **neben**
   `/zeiten`, nicht darunter: die Seitenleiste markiert einen Eintrag für jede Adresse unter
   seiner eigenen, und `/zeiten/abrechnen` markierte «Meine Zeiten» mit.
2. **Der Arbeitsvorrat «Zeiten abrechnen»** zeigt oben den Stichtag (heute vorbelegt) und darunter
   je Zeile Kunde, Projekt (nur mit Projektmodul, mit `PROJECT_READ` als Link), Einträge, offene
   Stunden der Uhr — mit «→ 9:45», wo der Takt aufrundet —, den geschätzten Betrag, wie das Backend
   ihn liefert, den ältesten Eintrag und den Link «Abrechnen». Eine Projektzeile öffnet die Maske
   des Projekts, die Zeile «ohne Projekt» die des Kunden; der Stichtag geht im Router-State mit.
3. **Die Maske «Zeiten abrechnen» ist eine Route** je Ziel, `/zeiten-abrechnen/projekt/:projectId`
   und `/zeiten-abrechnen/kunde/:partnerId`, ohne Registerleiste wie jede Detailmaske. Oben stehen
   Stichtag, Gruppierung (`SegmentedControl` «je Leistung · je Eintrag», Tooltip-Satz darunter) und
   Ziel («Neue Rechnung» oder ein Entwurf des Kunden). Darunter die Einträge mit Häkchen, die
   Vorschau und die übersprungenen Einträge.
   - **Jede Änderung fragt die Vorschau neu** (`POST /billing/preview`), ohne Knopf. Während die
     nächste Antwort unterwegs ist, bleibt die letzte blass stehen (`keepPreviousData`), damit die
     Häkchen nicht springen; geschrieben werden kann nur die Antwort auf die Frage am Bildschirm.
   - **Die Häkchen gehen als Liste nur, wenn eines fehlt.** Sind alle gesetzt, geht `entryIds`
     nicht mit, und ein inzwischen erfasster Eintrag kommt dazu; eine Liste geht sortiert, damit
     dieselbe Wahl dieselbe Frage ist. Ein anderer Stichtag setzt alle Häkchen neu.
   - **Die Zeile «ohne Projekt»** des Arbeitsvorrats öffnet den Kunden mit nur den Einträgen ohne
     Projekt angehakt; die Einträge auf Projekten stehen in der Liste, abgewählt.
   - **Das Ziel** listet die Entwürfe des Kunden über die Rechnungsliste, also mit
     `INVOICE_READ`; ohne dieses Recht ist «Neue Rechnung» das einzige Ziel.
4. **Die Vorschau zeigt, was das Backend schreibt, und rechnet nichts nach**: je Position
   Bezeichnung, 2. Bezeichnung, Bemerkung, Leistungsdatum, Menge in Dezimalstunden der Rechnung
   («3.75 Std.»), Satz mit der **Herkunft als Badge** («Projektsatz», «Kundenpreis», «Preisgruppe
   Wiederverkäufer», «Grundpreis»), MWST-Satz und Betrag; darunter «Total netto», bei einem
   Entwurf als Ziel «Neue Positionen netto» — die Vorschau zählt dann nur, was diese Abrechnung
   hinzufügt, vor einem Rabatt auf den ganzen Entwurf. Die «Summe der Positionen» steht nur
   daneben, wo sie vom Netto abweicht, also wo ein Satz MWST enthält. **Die Spalte «MWST» steht
   nur, wenn die Vorschau `vatLiable` meldet**; ohne Steuerpflicht verrechnet der Entwurf keine
   MWST, und das Total heisst «Total» oder «Neue Positionen», ohne «netto». Der
   Satz zum Takt nimmt sein Beispiel aus den Einträgen («1:10 wird 1:15»), der Kopftext eines
   neuen Entwurfs steht über den Positionen. Übersprungene Einträge stehen mit dem Grund als kurzem
   Wort und dem Satz des Backends. Die Namen der Personen stehen nur in der Liste mit den Häkchen,
   nie in der Vorschau der Rechnung.
5. **«Rechnungsentwurf erstellen»** — bei einem Entwurf als Ziel «In den Entwurf übernehmen» —
   steht mit `TIME_BILL` und `INVOICE_WRITE` im Kopf, mit Strg+S, und schickt dieselbe Anfrage wie
   die letzte Vorschau. Danach führt die Maske auf den Entwurf, dessen Weg zurück dorthin führt, wo
   die Abrechnung begann. Ohne `INVOICE_WRITE` bleibt die Vorschau lesbar, und ein Satz nennt das
   fehlende Recht.
6. **Abweisungen**:
   - `409` mit `entryIds`: die Maske liest Vorschau, Arbeitsvorrat und Entwürfe neu, nimmt die
     Einträge aus den Häkchen und nennt sie **mit den Worten der Liste** («Inzwischen abgerechnet:
     05.11.2026 · Anna Muster · Konzeption · 1:10.»), nicht mit den Nummern aus dem Satz des
     Backends.
   - `409` ohne Einträge: der Satz des Backends steht über der Maske, die Entwürfe werden neu
     gelesen.
   - `400` am Feld: `documentId` an «Ziel», `grouping` unter der Gruppierung, `entryIds` über der
     Liste; alles andere als Meldung über der Maske — auch eine `400` ohne Feld, etwa wenn dem
     Mandanten die Einheit «Stunde» fehlt, mit dem Satz des Backends aus `detail`.
7. **«Zeiten übernehmen (12:30 Std.)» auf dem Rechnungsentwurf** steht im Panel «Positionen»
   neben «Aus Katalog», «Freie Zeile» und «Zeile einfügen» (`DocumentLines`, neue Eigenschaft
   `moreWays`), nur auf einer Rechnung, die sich ändern lässt, nur mit eingeschalteter
   Zeiterfassung, `TIME_BILL` und `INVOICE_WRITE`, und nur, wenn der Arbeitsvorrat mit `partnerId`
   bis heute offene Zeit nennt. Die Stunden sind die Summe der gemessenen Minuten der Zeilen
   dieses Kunden — die Antwort ist nicht geblättert, und es sind ganze Minuten, kein Betrag. Der
   Knopf öffnet **dieselbe Maske in einem grossen Dialog**, mit dem Kunden und diesem Entwurf fest
   als Ziel und ohne Wahl des Ziels; nach dem Schreiben schliesst er, und der Entwurf liest sich
   neu.
8. **Die Zustände als Badge** in «Meine Zeiten» und auf den Registern: «offen», «im Entwurf»,
   «verrechnet RE-2026-0042», «nicht verrechenbar», klein geschrieben wie die zwei, die es seit
   #124 gibt. Ein Eintrag auf einer Rechnung führt mit `INVOICE_READ` dorthin — der Entwurf
   wie die ausgestellte Rechnung unter `/rechnungen/{id}` —, ohne dieses Recht ist das Badge nur
   Text. In einer Zeile, die selbst ein Knopf ist, steht kein Link; ein abgerechneter Eintrag ist
   nie eine solche Zeile.
9. **Gesperrte Einträge** haben keine Knöpfe zum Bearbeiten und Löschen; an ihrer Stelle steht ein
   Schloss, dessen Tooltip `readOnlyReason` sagt — in «Meine Zeiten» bei den Knöpfen, auf den
   Registern neben dem Badge. Das gilt für abgerechnete Einträge und für die auf einem
   archivierten Projekt gleich.
10. **«Vom Entwurf lösen»** steht mit `TIME_BILL` an jedem Eintrag im Entwurf, in «Meine Zeiten»
    und auf den Registern, je Eintrag. Eine Rückfrage sagt, dass es nur geht, wenn die Position im
    Entwurf schon entfernt ist; eine Abweisung des Backends steht im Dialog. Danach werden Zeiten,
    Kacheln und Arbeitsvorrat neu gelesen.
11. **Die Register «Zeiten»** an Projekt und Kunde bekommen mit `TIME_BILL` den Link «Abrechnen» im
    Kopf der Liste. Am Projekt steht er in jedem Status, denn ein abgeschlossenes Projekt nimmt
    keine neue Zeit, wird aber noch abgerechnet. Der Weg zurück führt aufs Projekt oder den Kunden.
12. **Der Abrechnungstakt** steht unter Moduleinstellungen → Zeiterfassung → Einstellungen über der
    Standardleistung, als Auswahl «kein Takt · 5 · 6 · 10 · 15 · 30 Minuten» mit eigenem
    «Speichern» und dem Satz «Gerundet wird nur die Menge auf der Rechnung, die erfasste Zeit
    bleibt.» als Beschreibung des Panels. Ein gespeicherter Takt lässt Arbeitsvorrat und
    Vorschauen neu lesen.
13. **`INVOICE_KIND` steht mit Namen** in `lib/salesDocument.ts`, wie `ORDER_KIND`: Pfad, Ressource
    und Rechte der Rechnung kommen von dort und sind nicht ein zweites Mal ausgeschrieben.

## Begründung

**Zu 1:** Der Ordner ist das Muster der Mahnungen: ein Kopf, der den Bildschirm des Alltags
öffnet, und ein zweiter Bildschirm für den, der das Recht hat. «Meine Zeiten» kostet keinen Klick
mehr, und wer nur abrechnet, sieht den Ordner mit «Abrechnen» allein.

**Zu 3:** Vom Arbeitsvorrat und von den Registern aus ist die Abrechnung ein eigener Schritt mit
eigener Adresse: sie lässt sich in einem neuen Tab öffnen, hat einen Weg zurück und führt am Ende
auf einen anderen Bildschirm, den Entwurf. Die Häkchen als «alle» statt als Liste lassen keinen
Eintrag still draussen, der nach dem Öffnen erfasst wurde.

**Zu 4:** Das Backend rundet je Eintrag auf den Takt, rundet die Menge je Position einmal, teilt
am Satzwechsel und wählt den Satz nach Projekt und Preiskette am Arbeitstag. Eine zweite Rechnung
im Browser wiche davon ab, und die Maske zeigte eine Zahl, die nicht auf die Rechnung kommt
(CLAUDE.md, Abschnitt «Projektkontext»).

**Zu 6:** Die Nummern der Einträge sieht der Benutzer nirgends; Datum, Person, Leistung und Dauer
sind, was er in der Liste eben noch sah.

**Zu 7:** Auf dem Entwurf arbeitet der Benutzer am Beleg; ein Dialog hält ihn dort, wie die
Gutschrift aus der Rechnung (ADR-0079), und der Entwurf liest sich danach neu. Die Stunden in
Stunden der Uhr statt «12.50 Std.» wie im Issue: «Meine Zeiten» und die Kacheln zeigen Stunden
der Uhr (ADR-0084), und eine Anwendung mit zwei Schreibweisen für dieselbe Zeit lässt den Leser
rechnen. Dezimalstunden stehen nur dort, wo sie eine Menge auf der Rechnung sind.

**Zu 8 und 9:** Das Issue verlangt einen Tooltip statt Knöpfen. Eine Zeile unter jedem
abgerechneten Eintrag wiederholte in einer Woche nach dem Abrechnen dutzendfach denselben Satz;
das Schloss sagt ihn, wo man fragt. Der Link braucht `INVOICE_READ`, weil die Maske der Rechnung
es verlangt; ein Link ins Leere wäre schlechter als keiner.

**Zu 12:** Sechs Werte passen nicht in einen `SegmentedControl`, der für zwei bis vier gedacht ist.
Ein eigenes «Speichern» statt Speichern beim Wählen, weil die Pfeiltasten in einer Auswahl jeden
Zwischenwert speicherten.

## Verworfene Alternativen

**Die Maske überall als Dialog**, auch vom Arbeitsvorrat und von den Registern aus. Verworfen:
ohne Adresse kein neuer Tab und kein Weg zurück, und am Ende führt die Abrechnung ohnehin auf
einen anderen Bildschirm.

**Auch vom Entwurf aus auf die Route und zurück.** Verworfen: der Benutzer verliesse den Beleg, an
dem er arbeitet, und müsste den Weg zurück suchen; der Dialog ist das Muster der Gutschrift.

**Die Vorschau auf Knopfdruck.** Verworfen wie beim Abo-Lauf (ADR-0075): sie schreibt nichts, und
ein Klick vor jeder Antwort bringt nichts.

**Beim Abwählen sofort im Browser nachrechnen**, damit das Total ohne Wartezeit stimmt.
Verworfen, siehe Begründung zu 4.

**Die Häkchen immer als vollständige Liste schicken.** Verworfen, siehe Begründung zu 3.

**«12.50 Std.» auf dem Knopf**, wie im Issue. Verworfen, siehe Begründung zu 7.

**Den Knopf auf einem Entwurf in fremder Währung verstecken.** Verworfen: das Frontend entschiede
eine Regel des Backends; das Backend sagt am Feld «Ziel», warum der Entwurf nicht passt.

**Die Badges gross geschrieben, «Im Entwurf» und «Verrechnet …»**, wie im Issue. Verworfen: daneben
stehen seit #124 «offen» und «nicht verrechenbar», und eine Spalte mit zwei Schreibweisen sieht
nach zwei Arten von Zustand aus.

**`/zeiten/abrechnen` als Adresse.** Verworfen, siehe Entscheidung 1.

**Den Takt als `SegmentedControl` oder mit Speichern beim Wählen.** Verworfen, siehe Begründung zu
12.

**«Vom Entwurf lösen» für alle Einträge eines Entwurfs auf einmal.** Verworfen für jetzt: das
Backend nimmt eine Liste, aber die Maske kennt die Einträge eines Entwurfs nur seitenweise, und
eine Auswahl über Seiten hinweg wäre ein eigener Baustein. Je Eintrag deckt den Fall ab, für den
das Lösen gedacht ist — eine entfernte Position.

## Konsequenzen

- Neuer Baustein `lib/timeBilling.ts` mit Adressen, Schlüsseln, Häkchen, Wörtern und dem Lesen
  der `409`; die Typen der neun Records stehen in `lib/types.ts`, `TimeEntryState` hat vier Werte.
- Neue Seiten `pages/TimeBillingWorklistPage.tsx` und `pages/TimeBillingPage.tsx`, neue Bausteine
  `src/timetracking/useTimeBilling.ts`, `TimeBillingForm.tsx`, `TimeTakeover.tsx`,
  `TimeEntryStateBadge.tsx` und `useReleaseFromDraft.tsx`.
- «Meine Zeiten» steht im Ordner «Zeiten» und trägt dessen Registerleiste.
- `DocumentLines` nimmt mit `moreWays` weitere Wege, Positionen hinzuzufügen; `document` kennt die
  Zeiterfassung im Frontend nur über diesen einen Platz in `SalesDocumentPage`.
- Die Kataloge stehen doppelt: `SKIP_REASON_LABELS` und die Wörter der Herkunft des Satzes neben
  `BillingSkipReason` und `RateOrigin` des Backends; ein neuer Wert braucht beide Seiten.
- Die Gründe des Überspringens sind `NOT_OPEN`, `PROJECT_NOT_BILLED`, `RATE_CURRENCY`,
  `UNIT_NOT_HOURS` («Leistung nicht in Stunden»), `NO_VAT_RATE` und `TAX_LIABILITY_STARTS` («vor
  der Steuerpflicht»); der Satz dazu kommt immer vom Backend.
- **Offen:** Der Arbeitsvorrat liefert keine Summe je Kunde; der Knopf auf dem Entwurf zählt die
  ganzen Minuten der Zeilen zusammen (Entscheidung 7). Eine Summe im Backend machte das
  überflüssig.
