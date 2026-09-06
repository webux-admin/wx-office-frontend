# ADR-0047 — Vier Masken zum Papier: die Berichtsleiste auf fünf Bildschirmen, der Archivkorb als gruppierte Liste, die Vorjahresmaske nach dem Muster der Eröffnungsbuchung und die Papiere des Abschlusses

- **Status:** Angenommen
- **Datum:** 2026-09-06
- **Verhältnis:** setzt Backend-[ADR-0125](https://github.com/webux-admin/wx-office/blob/main/docs/adr/ADR-0125-die-auswertung-wird-gedruckt-und-archiviert.md)
  um und trägt die Entscheidungen A, B und C des Auftraggebers auf die Masken. Ergänzt
  [ADR-0046](ADR-0046-der-abschlussbildschirm-ist-ein-jahrwaehler.md) um das Panel «Papiere des
  Abschlusses» und um die zehnte Prüfung — dort als Nachtrag festgehalten. Hängt in der
  Menügruppe aus [ADR-0044](ADR-0044-buchhaltung-menuegruppe-ordner-und-archiveintrag.md), am
  Archiveintrag ohne Modulschalter aus demselben ADR, und an der Regel «Recht und Modulschalter
  gehören zusammen» aus [ADR-0032](ADR-0032-recht-und-modulschalter-gehoeren-zusammen.md). Der
  `SplitButton` ist der aus [ADR-0020](ADR-0020-postausgang-drei-masken-und-ein-splitbutton.md),
  «Drucken» geht den Weg aus [ADR-0009](ADR-0009-drucken-im-browser.md). Lässt `EntryGrid` und
  [ADR-0045](ADR-0045-die-buchungserfassung-ist-ein-raster.md) **unverändert**, ebenso
  `SplitButton`, `DataTable`, `Dialog` und `Notice`. Neu.

## Kontext

Der Frontend-Teil von #97 verlangt vier Dinge: einen Druckknopf auf den fünf Auswertungsmasken,
der ein PDF liefert und hinter dem Pfeil «Archivieren …» trägt; ein zweites Panel auf dem
Archivbildschirm mit den abgelegten Papieren; die Maske «Vorjahressaldi» unter
`/buchhaltung/vorjahr`; und drei Wege dorthin — vom Geschäftsjahr, vom Vermerk unter Bilanz und
Erfolgsrechnung und aus Schritt 3 des Einrichtungsassistenten. Dazu sagt das Issue **«Kein
Frontend-ADR»**, mit der Begründung: «Die Maske ist das `EntryGrid` aus #92 mit anderen Spalten
und ohne Steuercodespalte, der Archivbildschirm eine `DataTable`, der Druckknopf ein
`SplitButton` — drei bestehende Bausteine, keiner davon geändert.»

Das Backend hat die Endpunkte in ADR-0125 gebaut und dabei entschieden, was die Masken zu
zeigen haben: abgelegt wird die gesetzliche Darstellung ohne Anzeigeoption und ohne
Sprachwahl (Entscheid 5), ein Renderfehler nimmt den ganzen Abschluss mit (Entscheid 3), die
Ablage ist Schritt 13 von vierzehn (`ClosingManagement.java:390-397`,
`jahresabschluss.md:146-148`), die Abschlussnummer wird gezählt (Entscheid 4), und die
Vorjahressaldi sind die Eröffnungsbuchung des erfassten Jahres, erfasst **vor** der
Ergebnisverwendung (Entscheide 8 und 9). Dazu die drei Entscheidungen des Auftraggebers: **A** —
die neue Prüfung 4a und damit zehn Prüfungen statt neun; **B** — keine Unterschriftszeile auf den
Papieren; **C** — kein Löschweg aus dem Archiv.

Beim Bauen hielt die Begründung «drei Bausteine, keiner geändert» an drei von drei Stellen
nicht. Die Berichtsleiste kennt `AccountingReport`, `ACCOUNTING_RIGHTS` und die Adresse des
Archivs — sie kann nicht in `components/` liegen, wo kein Baustein einen Fachbegriff kennt
(CLAUDE.md, Abschnitt 2). Der Archivkorb ist keine `DataTable` geworden, sondern eine gruppierte
Liste. Und die Vorjahresmaske ist nicht das `EntryGrid`, sondern folgt dem Raster der
Eröffnungsbuchung aus `OpeningEntryStep`. Dazu bekam der Abschlussbildschirm ein Panel, das das
Issue nicht zeichnet. ADR-0125 sagt unter «Offen» «Nichts.» und verweist für die Maskenseite
hierher — im Verhältnis («die Maskenseite steht in Frontend-ADR-0047»), unter «Konsequenzen»
und in Abweichung 2: das Issue sah kein Frontend-ADR vor, die Maskenseite hat mit #97 vier
Masken und Abweichungen vom Maskenentwurf bekommen, und die stehen in Frontend-ADR-0047. Das ist
dieses.

## Entscheidung

### 1. Eine Berichtsleiste auf fünf Masken: ein `SplitButton`, «Drucken» links, drei Wege dahinter

`pages/accounting/ReportToolbar.tsx` ist **ein** Baustein, den fünf Masken ohne eigenen Zustand
einsetzen. Die linke Hälfte heisst «Drucken» und holt das PDF über `api.file`, dann
`printFile` — der Druckdialog, nie ein Tab (ADR-0009). Hinter dem Pfeil stehen in fester
Reihenfolge «Als PDF speichern» (PDF → `showFile`), «Im Browser anzeigen» (die in sich
geschlossene HTML-Seite aus #94 → `showFile`) und «Archivieren …»
(`ReportToolbar.tsx:100-130`). Es gibt **einen** Rumpf `openReport(way)` mit einem
`printing`-Flag und einem `printFailure` (`:81-98`), genau nach dem Muster des Inventars
(`StockAsOfPage.tsx:203-215`); der Fehler steht als `ErrorNotice` unter dem Knopf (`:144`) und
nicht anstelle der Zahlen. Ohne gewähltes Jahr sind beide Hälften aus (`:137`).

**«Archivieren …» steht nur mit `ACCOUNTING_CLOSE`** (`:72`, `:115-129`) — der Backend-Handler
verlangt dasselbe Recht (`ReportArchiveController.java:197-198`) — und trägt als einziger
Eintrag einen Trennstrich darüber, `separatorBefore: true` (`:122`). Das Feld gibt es im
Baustein seit dem Vorlagenmenü (`SplitButton.tsx:24`, Commit `0de028e`); der Baustein wird nicht
angefasst.

Die fünf Masken: Bilanz und Erfolgsrechnung über `StatementView.tsx:120` mit `asOf`, `hideEmpty`
und `withAccounts` (`:125`); das Kontoblatt über `AccountSheetPage.tsx:143` mit `accountId`
**und** dem Stichtag des Bildschirms (`:147`); die Saldenliste über
`AccountBalanceListPage.tsx:137` nur mit `asOf` (`:142`) — Suche und «Nur Konten mit Bewegung»
reisen nicht mit; das Journal über `JournalPage.tsx:255` ganz ohne Filter (`:252-254`). **Zwei
der fünf hatten vorher gar keinen Druckknopf** — Saldenliste und Journal —, die drei anderen
einen einfachen «Drucken», der die HTML-Seite holte; `printStatement` (StatementView) und
`printSheet` (AccountSheetPage) sind entfernt, weil die Leiste denselben Weg als «Im Browser
anzeigen» führt. «Als CSV» bleibt ausserhalb der Leiste stehen, wo es steht
(`StatementView.tsx:106-116`).

### 2. `lib/accountingReports.ts` neben `accounting.ts`; die Union in `types.ts`; ein Bauer für Seite und PDF

Was ein **Papier** betrifft und nicht eine Zahl, steht in einer eigenen Datei: `REPORT_NAMES`
(`accountingReports.ts:22`, geschlossen über die fünf Schlüssel wie `MODULE_NAMES` über
`LicensedModuleCode`), `PdfOptions` mit der Sprache als einzigem Zusatz, den nur das PDF nimmt
(`:36`), `accountingPdfUrl` (`:54`), `reportArchiveUrl` (`:75`), `reportArchiveFileUrl` (`:90`),
`reportArchiveKey` (`:99`), `fetchReportArchive` (`:114`), `archiveReport` (`:133`) und
`archivedReportIdOf` (`:150`), das aus dem 409 die Eigenschaft `archivedReportId` liest, die
`AccountingExceptionHandler.java:302-305` neben den Satz stellt.

Die Union `AccountingReport` ist nach `types.ts:3929` gezogen und aus `accounting.ts:1133`
re-exportiert, damit kein bestehender Import sich ändert. `accountingUrl` ist exportiert
(`accounting.ts:149`), und der Query-Bauer `reportQuery` (`:1159`) ist aus `accountingPrintUrl`
herausgezogen: Seite (`:1217`) und PDF (`accountingReports.ts:64`) bauen dieselben fünf
Parameter in derselben Reihenfolge.

### 3. Der Archivdialog sagt, welche Fassung in den Schrank geht, und fragt keine Sprache

`ArchiveDialog` (`ReportToolbar.tsx:172`) nennt Papier und Tag — «Bilanz per 30.06.2026 wird
als PDF abgelegt.», ohne Tag das Jahr, für die Kontoblätter im Plural (`:272-282`) —, den Satz
«nicht mehr ändern und nicht mehr löschen», und **je Papier, was abgelegt wird** (`:289-308`):
für Bilanz und Erfolgsrechnung die gesetzliche Darstellung ohne Kontozeilen und leere
Positionen, für das Kontoblatt die Blätter **aller** Konten mit Bewegung und nicht das Konto auf
dem Bildschirm, für Saldenliste und Journal das ganze Papier ohne Suche und Filter — jedes Mal
«in der Sprache des Mandanten». Gesendet werden genau die drei Felder von `ArchiveReportBody`
(`:192-196`, `ArchiveReportBody.java:25-31`): `report`, `fiscalYearId`, `asOf`.

Nach dem Ablegen wird der Dialog zur Antwort mit dem Link «Im Archiv ansehen» (`:232-236`); beim
409 steht derselbe Link unter dem Satz des Backends (`:245-249`). Jede Ablage beginnt sauber, weil
der Dialog über `key={archiveRun}` neu aufgebaut wird (`:79`, `:148`), und nach jeder Ablage wird
`reportArchiveKey` ungültig (`:197-198`), damit der Korb und der Abschlussbildschirm das Papier
sehen.

### 4. Der Archivkorb ist eine gruppierte Liste unter der Druckzeile, keine Tabelle

`pages/accounting/ReportArchivePanel.tsx` steht unter jedem Geschäftsjahr des Archivbildschirms,
direkt unter dem Panel mit ZIP und Druckzeile (`AccountingArchivePage.tsx:104-111`). Die
Druckzeile behält ihre **drei** Berichte — Journal, Kontoblätter, Saldenliste (`:29-33`) —, der
Korb darunter hält **fünf**, und der Kommentar sagt, warum (`:25-27`): die Zeile druckt die
Bücher, die das ZIP als CSV hält; Bilanz und Erfolgsrechnung werden von ihren eigenen Masken
gedruckt und abgelegt.

Die Papiere stehen in **Blöcken**: «Abschluss Nr. 1», «Abschluss Nr. 2» — neuester Durchgang
zuerst —, und zuletzt «Von Hand abgelegt» (`groupsOf`, `:201-225`). Innerhalb eines Abschlusses
stehen die zwei Rechnungen vor den drei Büchern (`PAPER_ORDER`, `:29-35`). Jede Zeile nennt
«Bilanz per 31.12.2026», dazu «PDF · 180 KB · erstellt am 12.03.2027, 09:00 von jan»
(`:139-144`), und einen Knopf «Anzeigen» (`:151-159`), der die abgelegten Bytes über `api.file`
holt und mit `showFile` zeigt (`:68-71`). Ein Papier, das nicht kommt, ist **ein** Fehler über
der Liste und nicht statt ihrer (`:89-95`). Ungeblättert, weil der Bestand gedeckelt ist
(Backend-ADR-0026): fünf je Abschluss, von Hand höchstens eines je Papier und Stichtag.

Der Leerzustand hat **zwei** Sätze (`NothingFiled`, `:172-195`): ein abgeschlossenes Jahr ohne
Papiere wurde abgeschlossen, bevor der Abschluss welche ablegte, und nachträglich gezeichnet wird
nichts; ein offenes Jahr hat schlicht noch keines.

### 5. Die Vorjahresmaske folgt `OpeningEntryStep`, nicht `EntryGrid`

`pages/accounting/PriorYearPage.tsx` mit `priorYearForm.ts` daneben. Das Raster ist eine
`<table>` mit einem `<select aria-label="Konto Zeile n">` und zwei `AmountInput` je Zeile
(`PriorYearPage.tsx:415-478`), Spalten Konto, Soll, Haben (`:418-420`) — genau das Raster des
dritten Assistentenschritts (`OpeningEntryStep.tsx:246-303`, `:249-251`).

**Warum nicht `EntryGrid`:** `EntryGrid` hat vier Spalten, und die vierte ist «Steuercode»
(`EntryGrid.tsx:15-20`). Der Server weist jede Zeile einer `OPENING`-Buchung mit Steuercode ab
(`PostingRules.java:254-257`), und die Vorjahresbuchung **ist** eine `OPENING`-Buchung
(Backend-ADR-0125, Entscheid 8). Eine Spalte, deren jeder Eintrag zu einem 400 führt, ist keine
Spalte mit «anderen Werten», sondern eine, die es nicht geben darf — und `EntryGrid` um eine
abschaltbare Spalte zu erweitern, hätte den Baustein aus #92 geändert, den das Issue ausdrücklich
unverändert lassen will. Dazu trägt `EntryGrid` den Kasten «So wird gebucht» mit Wirkungszeile,
den das Issue hier selbst nicht will.

`priorYearForm.ts` steht **neben** `openingForm.ts` und nicht darüber (`:12-17`): die Zeilen
sind aus dem Erfassten vorbelegt statt aus einem Vorschlag, die Nutzlast trägt kein Geschäftsjahr
— es steht im Pfad von `PUT /prior-year-balances` — und das Raster rechnet aus den Erfolgskonten
das Jahresergebnis. `priorYearRequestOf` sendet **kein Buchungsdatum** und in jeder Zeile
`taxCodeId: null` (`:200-215`); der Server leitet den Tag ab, immer der letzte des Jahres.
Vier Sperrsätze und nicht mehr (`priorYearBlockerOf`, `:137-155`); alles Weitere entscheidet
der Server. Die Differenz steht immer, auch bei 0.00, und ist rot, solange sie nicht 0.00 ist
(`PriorYearPage.tsx:482-485`); darunter das Jahresergebnis als reine Kontrollzahl
(`:489-495`, `priorYearResultOf`, `priorYearForm.ts:169-184`) — Gewinn, Verlust oder der Satz,
dass noch keine Erfolgskonten erfasst sind und die Vorjahresspalte der Erfolgsrechnung dann
ihren Vermerk behält.

**`blockedBy` ersetzt das Raster, `notice` steht darüber und sperrt nichts** (`:317-328`,
`:303-315`) — zwei Felder, zwei Wirkungen, wie `types.ts:4191-4198` es begründet; beide Sätze
sind die des Backends, beide tragen einen Link ins Journal. **Ersetzt wird über einen Dialog mit
Pflichtgrund** (`ReplaceDialog`, `:535-606`): der Knopf bleibt aus, solange das Feld leer ist
(`:580`), der Grund ist auf 200 Zeichen begrenzt (`:597`), und der Satz sagt, dass die bestehende
storniert und die neue gebucht wird, beide im Journal bleiben (`:406-413`). Ob die bestehende
hier erfasst oder vom Assistenten als «EB-…» geschrieben wurde, macht für die Maske keinen
Unterschied — es ist die Eröffnungsbuchung dieses Jahres (`:402-405`).

**Das Jahr davor wird aus der Maske heraus angelegt** (`:245-258`): «Fehlt das Jahr davor noch?
[2025 anlegen]» neben dem Jahrwähler, benannt vom Rechner des Backends über
`GET /fiscal-years/preview` (`:136-141`), damit ein Rumpfjahr heisst, wie jedes andere Jahr
dieses Mandanten heisst — und nur angeboten, wenn der Rechner nichts einwendet (`:201-206`).
Gibt es noch gar kein Jahr, verweist die Maske auf den Einrichtungsassistenten (`:180-196`).

Der Kopf sagt Entscheidung A in zwei Sätzen (`:211-218`): «Erfasst werden die Salden per
31.12.2025 **vor** den Abschlussbuchungen — Bestandes- und Erfolgskonten. Das Ergebnis steht
noch auf den Erfolgskonten, nicht im Eigenkapital.»

### 6. Lesen auf `ACCOUNTING_READ`, schreiben auf `ACCOUNTING_CLOSE`, Modulschalter an der Route, drei Wege hin

`PriorYearPage` ist in `<RequireTenant permission={ACCOUNTING_RIGHTS.read}
module={ACCOUNTING_MODULE}>` gewickelt (`PriorYearPage.tsx:92`) — Reihenfolge Mandant → Modul →
Recht (`RequireTenant.tsx:44-46`). Wer nur lesen darf, sieht das Raster mit dem Erfassten und
darunter den `MissingRightHint` für `ACCOUNTING_CLOSE` (`:497`); der Knopf bleibt aus (`:392`).
So macht es der Einrichtungsassistent (`AccountingSetupPage.tsx:47`, `OpeningEntryStep.tsx:335`).
Der Modulschalter dagegen steht an der Route, anders als bei Abschluss und Archiv: die eine Sache,
für die diese Maske da ist, ist ein Schreibweg.

Die Route steht in `App.tsx:249`; einen Menüeintrag gibt es nicht, und `navHasNoPriorYearEntryTest`
(`navigation.test.ts:972`) hält das fest, mit dem Kommentar in `navigation.ts:507-509`.

**Drei Wege führen hin — die drei des Issues, jeder nur mit `ACCOUNTING_CLOSE`.** Die Maske
dahinter schreibt mit diesem Recht, und ein Weg, der vor einem `MissingRightHint` endet, wäre
keiner:

1. **Geschäftsjahre.** Der Weg steht als `LinkButton` in den Zeilenaktionen
   (`FiscalYearPage.tsx:164-168`), die nur mit dem Recht gezeichnet werden (`:73`, `:230`), und
   nennt das Jahr in der Adresse — `?fiscalYearId=` —, damit die Maske darauf öffnet. Ob er
   steht, entscheidet die reine Funktion `offersPriorYearCapture` (`priorYearForm.ts:298-301`):
   das Jahr ist nicht abgeschlossen, trägt ausser seiner eigenen Eröffnungsbuchung keine
   verbuchte Buchung (`postedEntriesBesidesOpening`, `types.ts:3707`), und ein späteres Jahr
   trägt welche — das Umstiegsjahr, dessen erste Buchung seine Eröffnung ist. Wie er heisst,
   entscheidet `priorYearCaptureLabelOf` (`:318-322`): «Vorjahressaldi erfassen», solange das
   Jahr keine Eröffnungsbuchung trägt, «Vorjahressaldi ersetzen», sobald die erfassten Saldi
   stehen — das Wort, das die Maske selbst auf ihrem Knopf führt (`PriorYearPage.tsx:510`).
   Zwei leere Jahre hintereinander bieten nichts an: noch niemand ist umgestiegen, und der
   Assistent ist dann der Weg (Abweichung 16).
2. **Bilanz und Erfolgsrechnung.** Neben dem Vermerk `PRIOR_YEAR_MISSING` steht «Vorjahr
   erfassen» als `Link` im selben `<p>` (`StatementView.tsx:211-221`, `mayClose` `:74-75`) —
   ohne Jahr in der Adresse, weil der Vermerk nur entsteht, wo kein Vorjahr steht
   (`StatementNotes.java:81-82`); die Maske öffnet dann auf dem ältesten Jahr und bietet an, das
   Jahr davor anzulegen (Entscheidung 5). Der Vermerk steht für jeden Leser, der Link nur für
   das Recht.
3. **Schritt 3 des Einrichtungsassistenten.** Über den Fragen steht der Satz des Issues im
   Wortlaut — «Brauchen Sie Vergleichszahlen nach OR Art. 958d Abs. 2, erfassen Sie zuerst das
   Vorjahr — [Vorjahressaldi erfassen]. Sonst bleibt die Vorjahresspalte leer und trägt ihren
   Vermerk.» (`OpeningEntryStep.tsx:184-193`). Er sperrt nichts; «Eröffnung buchen» bleibt.

Je Weg ein Test mit Recht und einer ohne, dazu die Randfälle:
`fiscalYearOffersThePriorYearCaptureTest` und sechs weitere — je Zustand der Zeile einer mit und
einer ohne `ACCOUNTING_CLOSE` (`FiscalYearPage.test.tsx:880-964`),
`balanceSheetOffersThePriorYearCaptureTest` und zwei weitere (`BalanceSheetPage.test.tsx:280-307`),
`incomeStatementOffersThePriorYearCaptureTest` und einer (`IncomeStatementPage.test.tsx:267-289`),
`setupStepThreeLinksToThePriorYearTest` und einer (`AccountingSetupPage.test.tsx:233-256`), dazu
elf Fälle zur Regel und fünf zum Wort (`priorYearForm.test.ts:414-575`). Die fünf Kommentare,
die die drei Wege nennen — `PriorYearPage.tsx:85-88`, `accounting.ts:920-927`, `App.tsx:247-248`,
`navigation.ts:507-509`, `navigation.test.ts:966-971` — beschreiben damit den Stand.

### 7. Die Papiere des Abschlusses stehen auf dem Abschlussbildschirm, gelesen aus dem Archiv

Die Zusammenfassung eines abgeschlossenen Jahres trägt das Panel «Papiere des Abschlusses»
(`ClosingPage.tsx:783`, `FiledPapers`, `:827-915`): je Durchgang ein Block «Abschluss Nr. n»,
darin die fünf Papiere als Knöpfe mit `REPORT_NAMES`, daneben Stand, Grösse und «abgelegt am …
von …». Ein Jahr, das nach einer Wiedereröffnung zweimal abgeschlossen wurde, zeigt beide
Sätze — das ist der sichtbare Beleg, dass ein zweiter Abschluss nichts überschreibt.

Gelesen wird **aus dem Archiv** (`GET /report-archive?fiscalYearId=`, `:829`) und nicht aus
`ClosingResult.archivedReportIds`: die Liste des Archivs kennt die Abschlussnummer, ist dieselbe,
die ein Besucher morgen sieht, und der Lauf macht sie nach dem Erfolg ungültig (`:272`). Die
Gruppierung macht `closingRunsOf` (`closingWizard.ts:382`), neuester Durchgang zuerst, innerhalb
eines Durchgangs in der Reihenfolge, in der der Lauf gezeichnet hat — aufsteigend nach `id`;
von Hand abgelegte Papiere bleiben draussen, sie stehen unter *Buchhaltung → Archiv*.

**Vor dem Klick wird angesagt, dass gedruckt wird.** Der dritte Schritt des Assistenten trägt
`filedPapersSentence()` (`ClosingPage.tsx:653`, `closingWizard.ts:409`): der Abschluss legt fünf
Papiere als PDF ab, sie lassen sich weder ändern noch löschen, und kann eines nicht gezeichnet
werden, scheitert der ganze Abschluss. Scheitert er ohne Befunde — Druckfehler, Netz, ein
Hauptbuch, das nicht aufgeht —, steht unter dem Fehler der Satz, den die Meldung des Backends
auslässt: «Es wurde nichts gebucht und kein Geschäftsjahr angelegt» (`ClosingPage.tsx:341`).
Neben einer Liste von Befunden steht er nicht; die Befunde sagen es selbst.

### 8. Zehn Prüfungen, nicht neun — der Bildschirm zählt nicht, er zeigt

Entscheidung A des Auftraggebers: der Abschlusslauf hat eine neue Prüfung **4a**, die aufhält,
wenn Erfolgskonten Saldo tragen **und** das Bilanzergebniskonto (`JAHRESERGEBNIS_BILANZ`)
bereits einen trägt (`ClosingChecks.java:174-222`, der sperrende Zweig `:210-222`;
`jahresabschluss.md:44-57`). Die Reihenfolge lautet `1, 2, 2a, 3, 3a, 4, 4a, 5, 7, 7a`. Am
Bildschirm ändert sich nichts als das Wort: `sortedChecks` ordnet, was der Lauf liefert, und
zählt nicht; Panelbeschreibung (`ClosingPage.tsx:432`), Kommentare und JSDoc
(`ClosingPage.tsx:291-292`, `:412`, `:415`; `closingWizard.ts:23`, `:97`, `:101-102`, `:117`;
`accounting.test.ts:1806`) und **vier** Testfälle sind auf zehn gezogen — drei umbenannt,
`closingPageShowsTheTenChecksTest` (`ClosingPage.test.tsx:598`),
`closingPageKeepsTheTenChecksAfterARefusalTest` (`:722`) und
`sortedChecksOfTheTenTest` (`closingWizard.test.ts:172`), und `sortedChecksWithoutAFailureTest`
(`:208-215`), dessen Liste `4a` bekam, ohne den Namen zu wechseln. Die Helfer und der Typ, mit
denen die Maske die Liste zeichnet, sagen ebenfalls zehn (`accounting.ts:2175`, `:2187`, `:2253`,
`:2259`, `:2277`, `:2279`, `:2282`; `types.ts:4237`, `:4239`, `:4250`, `:4336`, und die
Bezeichnerliste `:4244` führt `4a`), die DTOs desselben Laufs im Backend ebenso
(`ClosingCheckDto.java:4-12`, `ClosingPreviewDto.java:9-37`, `ClosingController.java:55`, `:80`,
`ClosingConverter.java:47`, `AccountingExceptionHandler.java:255-268`). ADR-0046 sagt an fünf
Stellen «neun»; sie beschreiben den Stand von #96, werden nicht umgeschrieben, und der Nachtrag
dort verweist hierher.

### 9. Kein Löschweg und kein Unterschriftsfeld — Entscheidungen B und C

**C:** Auf keiner der vier Masken gibt es einen Weg, ein abgelegtes Papier zu löschen, und es
gibt keine Adresse dafür (`accountingReports.ts` kennt kein `DELETE`). Der Archivkorb sagt es in
seiner Beschreibung (`ReportArchivePanel.tsx:16-19`), der Archivdialog vor dem Klick
(`ReportToolbar.tsx:241-242`), der Abschlussbildschirm unter der Liste. Der revDSG-Punkt dazu
steht ausgeschrieben in Backend-ADR-0125 unter «Konsequenzen»: nach zehn Jahren liegen in diesen
PDF weiter Personendaten ohne Aufbewahrungsgrundlage, das Löschbegehren läuft gegen eine Sperre
ohne Frist, und die Anonymisierung der Stammdaten erreicht ein abgelegtes PDF nicht. Das ist eine
Produktentscheidung, keine Rechtsauffassung; ein Ausgang käme als eigener, protokollierter
Vorgang für alle fünf Archive — nie als Knopf auf einer dieser Masken.

**B:** Das Frontend zeichnet nichts auf das Papier; es gibt hier nichts zu bauen und nichts zu
unterlassen. Festgehalten wird es, damit niemand die Zeile «Ort, Datum, Unterschrift» als
Frontend-Anliegen wieder vorschlägt.

## Begründung

**Die Leiste liegt im Modul, weil sie das Modul kennt.** Sie importiert `AccountingReport`,
`ACCOUNTING_RIGHTS`, `ACCOUNTING_ARCHIVE_PATH` und die Adressen der Papiere
(`ReportToolbar.tsx:10-27`). CLAUDE.md, Abschnitt 2: «`components/` kennt die Fachdomäne nicht.
Sobald ein Baustein einen Fachbegriff braucht, gehört er zum Modul.» Der `SplitButton` darunter
bleibt der fachfremde Baustein, der er ist.

**Ein Query-Bauer, weil zwei Adressen dieselbe Reihenfolge brauchen.** Die Seite aus #94 und das
PDF nehmen dieselben fünf Parameter; zwei Bauer in zwei Dateien wären zwei Reihenfolgen, und die
Tests hätten zwei Adressen festgepinnt. Die Union zog nach `types.ts`, weil `ArchivedReport.report`
und `ArchiveReportRequest.report` dieselben fünf Schlüssel tragen und `types.ts` nichts
importiert — ein Typ-Kreis `types → accounting → types` sollte nicht entstehen.

**Der Korb ist eine Liste in Blöcken, weil die Herkunft eine Gruppe ist und keine Zelle.** Ein
Abschluss legt fünf Papiere, und «Abschluss (2.)» stünde fünfmal untereinander in einer Spalte,
die sonst nichts sagt. Als Überschrift steht es einmal, und ein zweiter Durchgang ist ein zweiter
Block statt ein Suffix in Klammern. Der Knopf «Anzeigen» mit `aria-label` ist mit der Tastatur
erreichbar und kann je Papier beschäftigt sein, während die anderen warten
(`ReportArchivePanel.tsx:107-108`); ein Zeilenklick auf einer `DataTable` kann weder das eine
noch das andere.

**Die Vorjahresmaske folgt der Eröffnungsbuchung, weil sie dieselbe Buchung schreibt.** Beide
Endpunkte schreiben denselben Datensatz und teilen dieselbe Prüfung (Backend-ADR-0125,
Entscheid 8); die Maske, die diese Buchung im Haus schon schreibt, ist der dritte Schritt des
Assistenten. Ein zweites Raster für dieselbe Buchung sähe anders aus und sagte damit, es sei eine
andere.

**Die Papiere stehen auf dem Abschlussbildschirm, weil der Abschluss sie gemacht hat.** Die
Frage «was hat der Abschluss von 2026 getan» ist die Frage dieses Bildschirms (ADR-0046,
Abschnitt 2), und die fünf Papiere sind seit #97 ein Teil der Antwort. Sie stehen zugleich im
Archivkorb, weil dort **alles** liegt, auch das von Hand Abgelegte; die zwei Orte beantworten zwei
Fragen.

## Verworfene Alternativen

**Die Leiste in `src/components/ReportToolbar.tsx`, wie das Issue sie führt.** Verworfen, weil
sie vier Fachbegriffe kennt. Sie ohne diese zu bauen — Adressen, Recht und Archivweg als Props von
jeder Maske hereinreichen — hätte auf fünf Masken fünfmal denselben Block erzeugt.

**Kein Trennstrich, der Eintrag trägt nur seinen `hint`.** Das Issue schliesst die Linie aus,
weil `SplitButtonAction` sie damals nicht kannte. Seit dem Vorlagenmenü kennt sie es
(`separatorBefore`, `SplitButton.tsx:24`, Commit `0de028e` vom 5. September); die Begründung des
Issues ist überholt, und der eine Eintrag, der schreibt, ist von den dreien abgesetzt, die nur
lesen. Der `hint` steht daneben trotzdem.

**Eine Sprachauswahl im Archivdialog, wie das Issue sie zeichnet.** `ArchiveReportBody` nimmt
keine Sprache; abgelegt wird in der des Mandanten (Backend-ADR-0125, Entscheid 5). Ein Feld, das
nichts sendet, wäre gelogen. Der Dialog sagt stattdessen bei jedem Papier «in der Sprache des
Mandanten».

**Den Fehler der Leiste im Panel der Maske zeigen.** Dann hätte jede der fünf Masken einen
Zustand heben und durchreichen müssen. Der Hinweis steht unter dem Knopf, und die Leiste ist in
sich geschlossen.

**`reset()` beim Schliessen des Archivdialogs.** Ein Reset im Schliessen kippt den Dialog
während des Ausblendens von der Antwort zurück auf die Frage. Der `key` baut ihn beim nächsten
Öffnen neu (`reportToolbarStartsTheSecondFilingCleanTest`).

**Der Archivkorb als `DataTable` mit den Spalten Papier, Stand, Herkunft, Grösse, Abgelegt.**
Siehe Begründung. Dazu käme: eine Tabelle mit Zeilenklick hat keinen Platz für den Zustand
«dieses eine Papier ist unterwegs», und der Leerzustand des Issues — ein Satz für alle Fälle —
sagte einem offenen Jahr, beim Abschluss sei nichts archiviert worden.

**Die Vorjahresmaske auf `EntryGrid`.** Siehe Entscheidung 5: die Steuercodespalte, die der
Server bei `OPENING` garantiert abweist, und der Baustein aus #92, der dafür geändert werden
müsste. Ebenso verworfen: `openingForm.ts` um Schalter zu erweitern — das hätte die Datei
geändert, auf der der Einrichtungsassistent steht.

**Die Wache mit `permission={ACCOUNTING_RIGHTS.close}`, wie das Issue sie schreibt.** Dann sähe,
wer lesen darf, eine `ForbiddenNotice` — und nicht, was für 2025 schon erfasst ist und welches
Recht fehlt. Der Assistent macht es seit #95 anders, und diese Maske schreibt dieselbe Buchung.

**Die Papiere des Abschlusses aus `archivedReportIds` der Antwort lesen.** Die Antwort kennt die
Ids, aber weder Abschlussnummer noch Grösse noch Stichtag, und sie ist nach dem Neuladen weg. Die
Liste des Archivs weiss alles davon und ist morgen dieselbe.

**Die Filter des Journals und der Saldenliste ins PDF mitgeben.** Der Endpunkt nimmt sie nicht
(`ReportArchiveController.java:116-127`), und das Journal, das GeBüV Art. 1 Abs. 2 Bst. b
meint, ist das vollständige — nicht die Seite, die jemand sich eingegrenzt hat.

**Das Kontoblatt eines einzelnen Kontos archivieren.** Der Endpunkt kennt kein `accountId`
(`ReportArchiveManagement.java:127-134`); der Schrank hält die Blätter aller Konten mit Bewegung.
Der Dialog sagt das, statt es zu verschweigen.

## Konsequenzen

- **Neu:** `lib/accountingReports.ts`, `pages/accounting/ReportToolbar.tsx`,
  `pages/accounting/ReportArchivePanel.tsx`, `pages/accounting/PriorYearPage.tsx`,
  `pages/accounting/priorYearForm.ts`, je mit Testdatei. **Erweitert:** `lib/accounting.ts`
  (`accountingUrl` exportiert, `ReportOptions`, `reportQuery`, `PRIOR_YEAR_PATH`,
  `priorYearBalancesUrl`, `priorYearBalancesKey`, `fetchPriorYearBalances`,
  `capturePriorYearBalances`), `lib/types.ts` (`AccountingReport`, `PriorYearLine`,
  `PriorYearBalances`, `PriorYearRequest`, `ClosingResult.archivedReportIds`, `ArchiveOrigin`,
  `ArchivedReport`, `ArchiveReportRequest`, `FiscalYear.postedEntriesBesidesOpening` —
  feldgleich zu `PriorYearDto`, `PriorYearBody`, `ClosingResultDto`, `ArchivedReportDto`,
  `ArchiveReportBody`, `FiscalYearDto`), `App.tsx`, `navigation.ts`
  (nur ein Kommentar), `ClosingPage.tsx`, `closingWizard.ts` (`ClosingRun`, `closingRunsOf`,
  `filedPapersSentence`), `StatementView.tsx` (Leiste und der Link «Vorjahr erfassen»),
  `AccountSheetPage.tsx`, `AccountBalanceListPage.tsx`, `JournalPage.tsx`,
  `AccountingArchivePage.tsx`, `FiscalYearPage.tsx` (der Weg «Vorjahressaldi erfassen» oder
  «Vorjahressaldi ersetzen» je Zeile) und `OpeningEntryStep.tsx` (der Satz mit Link in
  Schritt 3). Jede Testfixture, die ein `FiscalYear` baut, trägt das neue Feld mit.
- **Das Kontoblatt druckt jetzt den Stichtag des Bildschirms.** Der alte «Drucken»-Knopf gab
  nur `accountId` weiter und druckte das ganze Jahr, während der Bildschirm per `asOf` beschnitten
  war. Eine kleine Verhaltensänderung; `printCarriesTheCutOffDayTest` hält sie fest.
- **`printStatement` und `printSheet` sind weg**, nicht der HTML-Weg — der lebt als «Im Browser
  anzeigen» in der Leiste, `accountingPrintUrl` bleibt in Gebrauch, und GeBüV Art. 6 Abs. 3 ist
  erfüllt wie seit #94.
- **Die Leiste ändert nichts an den Endpunkten.** Was das PDF zeigt, entscheidet
  `reportQuery`; was der Schrank hält, entscheidet der Server. Die Maske sagt beides vorher.
- **Dieselben fünf Papiere stehen an zwei Orten in zwei Reihenfolgen, und beide bleiben.** Der
  Archivkorb stellt die zwei Rechnungen vor die drei Bücher (`PAPER_ORDER`,
  `ReportArchivePanel.tsx:21-35`): er beantwortet, was im Schrank liegt, die Rechnungen sind das,
  wofür jemand ihn öffnet, und die Liste ist bewusst von der Schleife der Ablage gelöst, damit
  sie nicht anders liest, wenn die Schleife je umgestellt wird. Das Panel auf dem
  Abschlussbildschirm hält die Reihenfolge, in der der Lauf gezeichnet hat — Journal,
  Kontoblätter, Saldenliste, Bilanz, Erfolgsrechnung (`AccountingReport.java:21-33`,
  `ReportArchiveManagement.java:112`; `closingRunsOf`, `closingWizard.ts:375-377`): es
  beantwortet, was der Lauf getan hat, und in welcher Folge. Zwei Fragen, zwei Reihenfolgen
  (Begründung, letzter Absatz) — entschieden, nicht offen. Wer sie je angleicht, gleicht den
  Archivkorb an den Abschlussbildschirm an, nicht umgekehrt: die Reihenfolge des Laufs ist die,
  die `archivedReportIds` nennt.
- **`ClosingResult.archivedReportIds` ist typisiert und wird von keiner Maske gelesen**
  (`types.ts:4370`). Der Typ ist feldgleich zur DTO, wie CLAUDE.md es verlangt; der
  Abschlussbildschirm liest das Archiv (Entscheidung 7).
- **Ein Lauf, der scheitert, sagt jetzt, dass nichts steht** — der Satz kommt nur ohne Befunde
  (`ClosingPage.tsx:333-346`).
- **Tests.** In den fünf neuen Testdateien 113 Fälle: `accountingReports.test.ts` 19,
  `ReportToolbar.test.tsx` 15, `ReportArchivePanel.test.tsx` 11, `PriorYearPage.test.tsx` 17,
  `priorYearForm.test.ts` 51. In zwölf bestehenden 49 neue: `accounting.test.ts` 9
  (`accountingUrlTest`, `reportQuery…`, `priorYearBalances…`, `capturePriorYearBalances…`),
  `ClosingPage.test.tsx` 12, `closingWizard.test.ts` 5, `BalanceSheetPage.test.tsx` 4,
  `FiscalYearPage.test.tsx` 7, `IncomeStatementPage.test.tsx` 3, `AccountingArchivePage.test.tsx` 2,
  `AccountSheetPage.test.tsx` 2, `AccountingSetupPage.test.tsx` 2, je einer in
  `AccountBalanceListPage.test.tsx`, `JournalPage.test.tsx`, `navigation.test.ts`. Vier
  bestehende Fälle sind von neun auf zehn gezogen, drei davon umbenannt (Entscheidung 8). Die
  Ablehnungsfälle stehen: `reportToolbarNamesTheExistingPaperTest` (409 mit Link),
  `reportToolbarKeepsTheButtonOnAnotherRefusalTest`, `priorYearDifferenceBlocksTheButtonTest`,
  `priorYearNoticeDoesNotBlockTheButtonTest`, `priorYearBlockedShowsTheSentenceInsteadOfTheGridTest`,
  `priorYearShowsARefusalTest`, `closingPageShowsAFailedRunTest`,
  `closingPageShowsAFailedPaperOpeningTest`, `reportArchivePanelKeepsTheListWhenOpeningFailsTest`.
- `NavCounterKey` bleibt unverändert; `lib/modules.ts` bleibt unverändert; `SplitButton`,
  `DataTable`, `Dialog`, `EntryGrid` bleiben unverändert.
- **Zugewiesen, nicht offen:** die Maske «Integrität» — #98; der Platz auf dem Archivbildschirm
  bleibt frei. Die maschinelle Abstimmung gegen die Nebenbücher, Befund 3a der zehn — #100; bis
  dahin ist er der eine der zehn, der nie sperrt und keinen Befund trägt (`types.ts:4250-4252`;
  ADR-0046, «Offen»).

## Abweichungen vom Issue

Drei davon hat der Auftraggeber entschieden; die übrigen sind beim Bauen entstanden und stehen
hier mit Grund und verworfener Alternative.

**A. Zehn Prüfungen, nicht neun.** Die Vorjahressaldi werden **vor** der Ergebnisverwendung
erfasst; der Kopf der Maske sagt es (Entscheidung 5), und Prüfung 4a hält den Abschluss auf,
wenn Ergebnis und Bilanzergebniskonto beide Saldo tragen (Entscheidung 8). Das Issue kannte weder
die Prüfung noch die Zahl; ADR-0046 hat den Nachtrag.

**B. Keine Unterschriftszeile.** Entscheidung 9. Das Frontend baut nichts dafür und schlägt
nichts vor.

**C. Kein Löschweg aus dem Archiv.** Entscheidung 9, mit dem revDSG-Punkt in
Backend-ADR-0125. Das Issue sagt es unter «Was dieses Issue NICHT umfasst» ebenso.

**1. Dieses ADR entsteht, obwohl das Issue «Kein Frontend-ADR» sagt.** Die Begründung des
Issues — drei Bausteine, keiner geändert, alles Wiederverwendung — trifft auf keinen der drei zu:
die Leiste liegt nicht in `components/`, der Korb ist keine `DataTable`, die Maske ist nicht das
`EntryGrid`. Eine Maske, die anders gebaut ist, als der Auftrag sie zeichnet, ist der Fall, für
den es ADRs gibt; ADR-0046 hat dieselbe Abweichung als seine sechste begründet.
Backend-ADR-0125 verweist in Abweichung 2 ausdrücklich hierher: das Issue sah kein Frontend-ADR
vor, und die Abweichungen vom Maskenentwurf stehen in Frontend-ADR-0047.

**2. `ReportToolbar` liegt in `pages/accounting/`, nicht in `src/components/`.** Entscheidung 1,
Begründung, erste verworfene Alternative. Ebenso liegen `PriorYearPage` und `ReportArchivePanel`
in `pages/accounting/` und nicht in `pages/` — dort liegt seit #92 der grösste Teil der
Buchhaltung, Masken wie Bausteine (`AccountingArchivePage`, `AccountSheetPage`,
`OpeningEntryStep`, `StatementView`).

**3. Ein Trennstrich über «Archivieren …».** Das Issue schliesst ihn mit einer Begründung aus,
die seit `0de028e` nicht mehr gilt. Entscheidung 1; `reportToolbarSetsArchivingOffWithARuleTest`.

**4. Der Archivdialog fragt keine Sprache.** Das Issue zeichnet «Sprache: [ Deutsch ▾ ]»;
`ArchiveReportBody` nimmt keine (Backend-ADR-0125, Entscheid 5 und Abweichung 12).
Entscheidung 3.

**5. «Als CSV» ist nicht Teil der Leiste.** Das Issue führt die Leiste als «‹Als CSV›, dann der
`SplitButton`». Gebaut ist die Leiste als der `SplitButton` allein; «Als CSV» steht auf Bilanz und
Erfolgsrechnung weiter davor (`StatementView.tsx:106-116`), und Journal, Saldenliste und Kontoblatt
haben keinen CSV-Knopf und bekommen keinen — der CSV-Export ist das ZIP des Archivbildschirms.

**6. Die Hinweiszeilen weichen ab.** «Drucken» ist die linke Hälfte und trägt keinen `hint`
(die Hälfte hat keinen); «Als PDF speichern» trägt einen, den das Issue nicht hat: «Öffnet das
PDF in einem neuen Tab; von dort lässt es sich speichern.» — ehrlich, weil `showFile` einen Tab
öffnet und der Browser das Speichern übernimmt. Die zwei anderen Hinweise sind die des Issues.

**7. Der Archivkorb ist eine gruppierte Liste, keine `DataTable`; die Herkunft ist eine
Überschrift, keine Spalte; der Leerzustand hat zwei Sätze.** Entscheidung 4, Begründung,
verworfene Alternative.

**8. Die Vorjahresmaske folgt `OpeningEntryStep`, nicht `EntryGrid`; keine `useQuickSearch`,
sondern ein `<select>` über den Kontenplan.** Entscheidung 5. Die Punkte des Issues, die dabei
stehen bleiben: keine Steuercodespalte, kein Kasten «So wird gebucht», das rechnerische
Jahresergebnis als Kontrollwert, Ersetzen mit Pflichtgrund, `blockedBy` statt Raster, `notice`
über dem Raster ohne Sperre.

**9. Die Wache liest mit `ACCOUNTING_READ`, das Recht `ACCOUNTING_CLOSE` steht am Schritt.**
Das Issue schreibt `permission={ACCOUNTING_RIGHTS.close}`. Entscheidung 6.

**10. Das Ersetzen kennt einen Weg, nicht zwei.** Das Issue unterscheidet «Vorjahressaldi
ersetzen» (schon erfasst) und «Vorjahressaldi erfassen und Eröffnungsbuchung ersetzen»
(`EB-`-Buchung vorhanden). Die Maske sieht in beiden Fällen die Eröffnungsbuchung dieses Jahres
mit ihrer Journalnummer und bietet «Vorjahressaldi ersetzen» an (`PriorYearPage.tsx:402-413`,
`:510`) — es ist derselbe Datensatz und dieselbe Ersetzung (Backend-ADR-0125, Entscheid 8).

**11. «Für 2025 besteht noch kein Geschäftsjahr. [2025 anlegen]» steht nicht am Anfang der
Maske, sondern neben dem Jahrwähler.** Die Maske öffnet immer auf einem Jahr — dem in der
Adresse genannten, sonst dem ältesten — und bietet daneben an, das Jahr davor anzulegen; ohne
irgendein Jahr verweist sie auf den Assistenten. Entscheidung 5, letzter Absatz.

**12. `lib/accountingReports.ts` statt eines Anbaus an `lib/accounting.ts`; `AccountingReport`
in `lib/types.ts`.** Entscheidung 2. Die sechs Adressen und `REPORT_NAMES` sind die des
Issues; nur zwei Dateien mehr und die Union eine Ebene tiefer.

**13. `navigation.test.ts` ist geändert, `App.test.tsx` gibt es nicht.** Das Issue lässt
`navigation.test.ts` unverändert und will die Route in `App.test.tsx` geprüft sehen. Es gibt
keine `App.test.tsx`; gebaut ist `navHasNoPriorYearEntryTest` als der Test, der die Entscheidung
«kein Menüeintrag» hält, wie `navHasNoSetupEntryTest` es für den Assistenten tut.
`PriorYearPage.test.tsx` malt die Maske unter `PRIOR_YEAR_PATH` (`:232`, `:584`); die
Verdrahtung der Route in `App.tsx` prüft kein Test.

**14. Das Kontoblatt gibt `asOf` mit.** Der alte Druck ignorierte den Stichtag des Bildschirms.
Konsequenzen.

**15. Der Abschlussbildschirm bekommt ein Panel, das das Issue nicht zeichnet.** Das Issue
zeichnet die fünf Papiere nur im Archivkorb. Entscheidung 7 sagt, warum sie auch dort stehen,
wo sie gemacht wurden; der dritte Schritt des Assistenten sagt vor dem Klick, dass gedruckt wird
— das verlangt Backend-ADR-0125 unter «Konsequenzen».

**16. Der Weg auf der Jahresliste erkennt das Umstiegsjahr an seinen Buchungen, nicht an
seiner Eröffnungsbuchung, und das Wort «ersetzen» an zwei Zählern, nicht an einer
Journalnummer.** Das Issue zeichnet den Knopf «auf einem Jahr ohne andere verbuchte Buchungen,
das vor dem Jahr mit der Eröffnungsbuchung liegt» — drei Zustände je Zeile: «Vorjahressaldi
erfassen», «Vorjahressaldi ersetzen», wo die Saldi schon stehen, und kein Weg bei fremden
Buchungen. Gebaut sind alle drei, seit `FiscalYearDto` neben `postedEntries` auch
`postedEntriesBesidesOpening` trägt (`FiscalYearDto.java:45`; gezählt in
`AccountingQueries.java:1389-1402` als jede verbuchte Buchung mit `entry_kind <> 'OPENING'`;
gespiegelt in `types.ts:3707`): «andere» heisst alles ausser der Eröffnungsbuchung des Jahres
und ihren Gegenbuchungen — genau die Zahl, an der das Backend die Erfassung abweist. Die Regel
`offersPriorYearCapture` (`priorYearForm.ts:298-301`) gibt den Weg frei, wenn das Jahr nicht
abgeschlossen ist, `postedEntriesBesidesOpening` null ist und ein späteres Jahr Buchungen trägt;
`priorYearCaptureLabelOf` (`:318-322`) nennt ihn «ersetzen», sobald `postedEntries` über
`postedEntriesBesidesOpening` liegt — dann trägt das Jahr verbuchte `OPENING`-Zeilen, also seine
Eröffnung. Das ist dasselbe Wort wie auf dem Knopf der Maske (`PriorYearPage.tsx:510`,
Abweichung 10) und dieselbe Handlung: Storno der bestehenden und Buchen der neuen in einem
Schritt. Sieben Fälle auf der Jahresliste, je Zustand einer mit und einer ohne `ACCOUNTING_CLOSE`
(`FiscalYearPage.test.tsx:880-964`), elf zur Regel und fünf zum Wort
(`priorYearForm.test.ts:414-575`).

Zwei Dinge weichen weiter ab. **Erstens** erkennt die Regel das Umstiegsjahr daran, dass ein
späteres Jahr Buchungen trägt, nicht an dessen Eröffnungsbuchung: `FiscalYearDto` nennt keine
`openingEntryNumber`, und «trägt Buchungen» reicht für den Nachbarn, weil ein umgestiegenes
Jahr mit seiner Eröffnung beginnt. **Zweitens** unterscheidet die Liste aus demselben Grund eine
stehende Eröffnungsbuchung nicht von einer, die die Wiedereröffnung des Vorjahres storniert und
nicht ersetzt hat (`reopenYear`, `ClosingManagement.java:492-502`: der Saldovortrag wird
zurückgenommen, eine neue Eröffnung entsteht nicht). Das Folgejahr trägt dann zwei
`OPENING`-Zeilen und keine Eröffnung; steht es leer vor einem Jahr mit Buchungen, sagt seine
Zeile «ersetzen», und die Maske, die die Buchung selbst liest, bietet «Speichern und verbuchen»
an. Ein seltener Zustand, und das falsche Wort führt auf die richtige Maske; wer ihn beseitigen
will, ergänzt `FiscalYearDto` um die `openingEntryNumber` aus `openingEntryOf` — dann liest die
Liste das Wort dort ab und das Umstiegsjahr dazu. Verworfen: `postedEntries - 1` als Ersatz für
den zweiten Zähler — nach einem Ersetzen trägt das Jahr die stornierte Eröffnung, ihre
Gegenbuchung und die neue, drei verbuchte Buchungen und keine davon «andere»
(`AccountingQueries.java:1373-1378`); die Regel aus dem Einrichtungszustand des Assistenten zu
rechnen statt aus der Jahresliste, die der Bildschirm ohnehin hält; und je Zeile
`GET /fiscal-years/{id}/prior-year-balances` abzufragen — beides eine zweite Abfrage für einen
Knopf, und `FiscalYearDto` sagt selbst, dass die Knöpfe einer Zeile dort entschieden und hier
gelesen werden (`FiscalYearDto.java:8-10`).

Schritt 3 des Assistenten bleibt für einen eingerichteten Mandanten erreichbar — über die
Adresse des Assistenten, der bei `nextStep === 'DONE'` auf seinem letzten Schritt öffnet
(`AccountingSetupPage.tsx:173-182`), und über den Leerzustand der Buchungserfassung für einen
Tag ausserhalb jedes Jahres (`EntryPage.tsx:362-375`); der Hinweis «Eröffnung erfassen» auf der
Jahresliste steht nur bei `nextStep === 'OPENING'` (`FiscalYearPage.tsx:258-274`). Als
Ersatzweg zum Ersetzen braucht es ihn nicht mehr: das Wort steht auf der Zeile selbst.

## Offen

Nichts.
