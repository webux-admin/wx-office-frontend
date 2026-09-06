# ADR-0046 — Der Abschlussbildschirm ist ein Jahrwähler mit zwei Gesichtern; die neue Aufklappzeile trägt die Abschlussbuchungen

- **Status:** Angenommen
- **Datum:** 2026-09-06
- **Verhältnis:** setzt Backend-[ADR-0117](https://github.com/webux-admin/wx-office/blob/main/docs/adr/ADR-0117-eroeffnung-abschluss-und-saldovortrag.md)
  um und hängt in der Menügruppe aus [ADR-0044](ADR-0044-buchhaltung-menuegruppe-ordner-und-archiveintrag.md).
  Baut die aufklappbare Zeile in `DataTable` nach dem Muster und mit der Begründung der
  Mehrfachauswahl aus [ADR-0030](ADR-0030-mehrfachauswahl-in-der-tabelle.md). Recht und
  Modulschalter stehen zusammen nach [ADR-0032](ADR-0032-recht-und-modulschalter-gehoeren-zusammen.md).
  Lässt `MatchGrid`, `EntryGrid` und [ADR-0045](ADR-0045-die-buchungserfassung-ist-ein-raster.md)
  **unverändert**. Neu.

## Kontext

«Abschluss» ist die letzte Maske der Handbuchhaltung und die einzige, hinter der ein Vorgang
steht, der in **einer** Transaktion drei Buchungen schreibt, ein Geschäftsjahr anlegt und ein
zweites schliesst. Sie beantwortet zwei ganz verschiedene Fragen, je nachdem, in welchem Zustand
das Jahr steht: *«wie schliesse ich 2026 ab»* und *«was hat der Abschluss von 2026 getan, und wie
komme ich da wieder heraus»*.

Der Bildschirmentwurf des Issues zeichnet dafür **eine `DataTable` über die Geschäftsjahre**:
eine Zeile je Jahr mit Zeitraum, Zustand und Ergebnis, und die Zeile des gewählten Jahres klappt
auf und zeigt darunter die Kopfzahlen, den Knopf «Jahr abschliessen …» und den Verlauf. Für genau
diese Aufklappzeile verlangt dasselbe Issue die Erweiterung von `DataTable` um
`expandableRow` / `renderExpanded` / `expanded` / `onExpandedChange` — sie wird hier gebaut.

Beim Bauen zeigte sich, dass diese eine Tabelle drei Dinge zugleich sein müsste: eine **Liste**
der Jahre, ein **Auswahlelement** und der **Rahmen eines dreischrittigen Assistenten**, der
eigenen Zustand hält (Schritt, zwei Haken, das gewählte Vortragskonto). Die Erweiterung von
`DataTable` ist trotzdem nötig und gebaut — sie steht nur an einer anderen Stelle desselben
Bildschirms.

## Entscheidung

### 1. Das Geschäftsjahr wird in einem `SelectField` gewählt, nicht in einer Tabellenzeile

Über dem Inhalt steht ein Auswahlfeld «Geschäftsjahr» mit Bezeichnung und Zustand je Eintrag
(«2026 — Offen»). Vorbelegt ist das **älteste nicht abgeschlossene** Jahr; gibt es keines, das
jüngste, damit ein Besucher die Zusammenfassung des letzten Abschlusses sieht
(`defaultClosingYear`).

Ein Mandant führt drei, fünf, nach zehn Jahren zehn Geschäftsjahre — keine Liste, durch die man
blättert, sucht oder sortiert. Die **Liste** der Geschäftsjahre gibt es bereits, unter
*Buchhaltung → Geschäftsjahre*; der Kopf dieser Maske verweist mit «Zurück» genau dorthin. Eine
zweite Liste derselben Sache, in der die Zeilen zusätzlich aufklappen, wäre der zweite Ort für
dieselbe Auskunft — und der erste, an dem beide auseinanderlaufen.

**Nach einem erfolgreichen Lauf wird die Wahl festgehalten.** Der Lauf legt das Folgejahr an; das
«älteste nicht abgeschlossene Jahr» ist danach dieses neue, und der Wähler spränge auf 2027,
während jemand noch liest, was mit 2026 geschehen ist. Deshalb setzt die Maske das eben
abgeschlossene Jahr fest, **bevor** die Jahresliste neu geladen wird.

### 2. Ein Bildschirm mit zwei Gesichtern, entschieden vom Zustand des Jahres

Ein offenes oder gesperrtes Jahr zeigt den Assistenten, ein abgeschlossenes die Zusammenfassung
mit dem Weg zurück (`showsWizard`). `LOCKED` gehört auf die Assistentenseite, und das ist der
ganze Sinn dieses Zustands: ein Jahr wird gesperrt an den Treuhänder gegeben, **um** es
abzuschliessen, ohne dass darunter noch etwas wandert.

Zwei Bildschirme wären zwei Menüeinträge für dieselbe Sache, und wer «wo schliesse ich ab» sucht,
müsste vorher wissen, ob es schon getan ist.

### 3. Der Assistent steht in Panels auf der Seite, nicht in einem Dialog über einer Tabelle

Die drei Schritte — Prüfung, Abgrenzungen, Vortrag — stehen als `Panel` im Seiteninhalt. Das
Wiedereröffnen dagegen **ist** ein Dialog (`ReopenDialog`): es ist ein einzelner Griff mit einem
Pflichtgrund, der etwas zurücknimmt, und ein Dialog ist die Form, in der diese Anwendung nach
einer Bestätigung fragt.

Der Unterschied ist nicht Geschmack. Der Assistent zeigt **neun Befunde**, davon einer mit Datum,
Text und Betrag je Entwurf, dazu die Abgrenzungskonten mit ihren Beträgen und die
Eigenkapitalkonten des Kontenplans zur Wahl — Inhalt, der die Breite der Seite braucht und in
einem Dialog über einer Tabelle scrollen müsste. Und er ist der Ort, an dem jemand die Maske
**verlässt**, um einen Entwurf zu verbuchen oder ein Systemkonto zuzuweisen; ein Dialog, aus dem
heraus man weglinkt, ist ein Dialog, den man verliert.

### 4. Die neue Aufklappzeile trägt die **Abschlussbuchungen**, nicht die Geschäftsjahre

Die Zusammenfassung eines abgeschlossenen Jahres zeigt im Panel «Buchungen des Abschlusses» eine
`DataTable` mit den Buchungen des Laufs — Journalnummer, Datum, Text, Beleg, Zustand. **Jede
dieser Zeilen klappt auf** und zeigt darunter die Zeilen der Buchung, geholt über denselben
Endpunkt, den das Journal benutzt.

Das ist die Frage, die genau hier jemand hat: *welche Konten hat der Abschluss angefasst.* Sie in
der Zeile zu beantworten spart den Weg ins Journal und zurück. Die Zeilen werden **beim
Aufklappen geholt** und nicht in der Zusammenfassung mitgeschickt: drei Buchungen mal ein Dutzend
Zeilen verdreifachten die Antwort eines Bildschirms, den die meisten nie aufklappen.

Welche Zeilen offen stehen, hält die **Seite** und nicht die Tabelle. Nach jedem Neuladen der
Antwort — und davon gibt es hier viele — klappte eine Tabelle, die den Zustand selbst besässe,
alles wieder zu.

### 5. Der Verlauf ist eine eigene Tabelle im Panel «Protokoll»

Wann, was, wer, Grund — vier Spalten, neueste zuerst, so wie der Endpunkt sie sendet. Er steht
neben den Buchungen und nicht in derselben Schublade: das eine sind Buchungen, das andere ist der
Nachweis, wer wann welchen Zustand gesetzt und wer die Abgrenzung bestätigt hat. Zwei Fakten in
einer Aufklappzeile sind zwei Tabellen ohne Überschrift.

Gelesen wird er über **`GET /fiscal-years/{id}/log`** und **für jedes Jahr**, nicht nur für ein
abgeschlossenes. «Wer hat 2026 wann gesperrt, und warum» ist am offenen Jahr dieselbe Frage; der
Bildschirmentwurf des Issues zeigt den Verlauf ausdrücklich unter dem offenen Jahr 2026
(«Gesperrt … Angelegt»). Die Zusammenfassung `GET …/closing` trägt den Verlauf zwar mit, aber nur
dort, wo ein Abschluss etwas zusammenzufassen hat — ein nie abgeschlossenes Jahr zeigte darüber
eine leere Liste, und das heisst etwas anderes als «nichts geschehen».

### 6. Der Modulschalter nimmt die zwei Knöpfe weg, nicht den Bildschirm

`ClosingPage` wird in `<RequireTenant permission={ACCOUNTING_RIGHTS.read}>` **ohne `module`**
gewickelt und fragt den Schalter stattdessen mit `useRunsModule()` selbst ab. Ist die Buchhaltung
abgeschaltet, verschwinden der Assistent und «Wieder öffnen», an ihre Stelle tritt die
`ModuleOffNotice` — Jahrwähler mit Zustand, Zusammenfassung und Verlauf bleiben stehen.

Der Grund ist rechtlich und nicht ästhetisch: alles Gebuchte bleibt zehn Jahre lesbar
(OR Art. 958f), und das Backend hält genau diese Linie — `GET …/closing/preview`, `GET …/closing`
und `GET …/log` antworten bei abgeschaltetem Modul weiter mit 200, nur `POST …/closing` und
`POST …/reopen` mit 409 (Backend-ADR-0119, `ClosingManagement.java:295,406`). Ein Bildschirm, der
sich ganz verschliesst, nähme dem Mandanten die einzige Stelle, die belegt, **dass** die
Buchhaltung abgeschaltet wurde (GeBüV Art. 6 Abs. 1). Das ist dieselbe Ausnahme, die ADR-0032 für
die Liste der ausgestellten Mahnungen schon gezogen hat, und dasselbe Muster, mit dem
`PartnerPage` und `SalesDocumentPage` ein Panel statt einer Maske schalten.

## Begründung

Der Entwurf des Issues ist eine Skizze aus der Zeit, in der der Bildschirm noch vor allem
**Zustand** zeigen sollte. Was daraus geworden ist, ist zu vier Fünfteln ein **Vorgang**: neun
Prüfungen, zwei Pflichtangaben, eine Kontowahl, die gemerkt wird, und eine Bestätigung, nach der
sich nichts mehr ändern lässt. Ein Vorgang braucht die Seite, nicht eine Schublade in einer
Zeile.

Der Zustand, den die Skizze zeigen wollte, geht dabei nicht verloren — er steht im Auswahlfeld
(jedes Jahr mit seinem Zustand), in der Panelüberschrift («Geschäftsjahr 2026 ist abgeschlossen»)
und vollständig in der Jahresliste unter *Geschäftsjahre*, auf die der Kopf verweist.

Die Erweiterung von `DataTable` wird trotzdem gebraucht und gebaut, und sie steht dort, wo sie
das tut, wofür sie gedacht war: **Zeilen einer Liste um ihre Einzelheiten ergänzen**, ohne die
Maske zu verlassen. Drei Jahreszeilen, von denen eine ein ganzes Formular enthält, sind kein
solcher Fall.

## Verworfene Alternativen

**Die Jahrestabelle mit Aufklappzeile aus dem Bildschirmentwurf.** Die Zeile müsste je nach
Zustand des Jahres entweder einen dreischrittigen Assistenten oder eine Zusammenfassung
enthalten; die Menge der offenen Zeilen wäre zugleich der Zustand des Assistenten, und ein
Neuladen der Jahresliste — nach jedem Lauf zwingend — klappte ihn zu. Dazu kommt, dass die
Tabelle nach dem Lauf um eine Zeile wächst (das Folgejahr), also genau in dem Moment, in dem
jemand liest.

**Zwei Routen: «Abschliessen» und «Abschlüsse».** Zwei Menüeinträge für ein Thema, und die Frage
«wo schliesse ich ab» wäre nur beantwortbar, wenn man vorher weiss, ob es schon getan ist.

**Den Assistenten in einen Dialog legen, wie das Wiedereröffnen.** Er zeigt neun Befunde mit
Listen, Beträgen und Links nach draussen; ein Dialog, aus dem man weglinkt, um einen Entwurf zu
verbuchen, ist verloren, sobald man es tut. Das Wiedereröffnen bleibt ein Dialog, weil es genau
eine Frage stellt.

**Die Aufklappzeile für die Geschäftsjahre benutzen und die Abschlussbuchungen flach zeigen.**
Dann stünden im Panel drei Buchungen ohne ihre Zeilen, und die Frage «welche Konten» führte für
jede einzelne ins Journal und zurück. Die Fähigkeit wäre gebaut und an der einen Stelle nicht
benutzt, an der sie etwas einbringt.

**Die Buchungszeilen in der Zusammenfassung mitschicken.** Ein Feld mehr im Endpunkt, der bei
jedem Öffnen des Bildschirms geholt wird, für eine Auskunft, die die meisten nie aufklappen.

**Ein dritter Satz zur Gewinnverwendung, für die Personengesellschaft.** Er stand hier einmal
(«Bei einer Personengesellschaft gibt es keinen Gewinnverwendungsbeschluss — der Saldo wird über
die Kapital- und Privatkonten verrechnet.») und ist zurückgebaut. #96 schreibt zwei Sätze und
weist den zweiten ausdrücklich beiden Rechtsformen zu — «für Einzelunternehmen und
Personengesellschaften sagt er den anderen Satz», dazu im Kopfblock «Der Abschlussdialog sagt
beides, je nach `equity_layout`». Wer den dritten Satz wieder vorschlägt, ändert eine Zuweisung
des Auftrags und nicht bloss eine Formulierung — die Rechtsform des Lesers genauer zu benennen,
ist ein Anliegen für das Issue und nicht für die Maske.

## Konsequenzen

- `pages/ClosingPage.tsx` ist neu und trägt beide Gesichter: `ClosingWizard` für ein offenes oder
  gesperrtes Jahr, `ClosedYear` für ein abgeschlossenes. Beide sind auf die Jahres-Id **gekeyt**,
  damit ein Wechsel im Auswahlfeld einen frischen Assistenten beginnt statt einen Haken von einem
  Jahr ins nächste zu tragen.
- `pages/accounting/closingWizard.ts` hält die Ableitungen mit eigenen Tests — `canContinue`,
  `accrualRefusal`, `nextStep`, `previousStep`, `sortedChecks`, `checkTone`, `defaultClosingYear`,
  `showsWizard`, `carriesNoResult`, `closingSummarySentence`, `accrualLineOf`, dazu
  `asksCarryForward`, `carryForwardHint`, `appropriationSentence`, `blockingLaterYear` und
  `laterYearSentence`.
- **Der Abgrenzungshaken hält den Lauf an, nicht den Weg.** Alle drei Schritte lassen sich mit
  ungesetztem Haken durchgehen; «Abschluss durchführen» bleibt aus, solange er fehlt, und daneben
  steht der Satz, mit dem der Lauf abweisen würde — wörtlich der des Backends (Abweichung 7).
- **Schritt 3 fragt nur, wo es etwas zu fragen gibt.** `equity_layout = JURISTIC` bekommt sein
  Vortragskonto angezeigt statt zur Wahl gestellt — die Vorschau trägt dafür seit diesem Issue
  das Feld `equityLayout` —, und der Satz zur Gewinnverwendung ist der der Generalversammlung
  (OR Art. 698 Abs. 2 Ziff. 4) oder der zweite Satz des Issues, den Einzelunternehmen und
  Personengesellschaften gemeinsam lesen: sie kennen keinen solchen Beschluss.
- **Ein Jahr ohne Vortrag zeigt «Keines», keinen Gedankenstrich.** Das Backend lässt
  `carryForwardAccount` bewusst leer, sobald nichts vorzutragen ist: es löst der Reihe nach die
  gestellte Wahl, die gemerkte Wahl und `GEWINNVORTRAG` auf und überspringt die letzte Stufe bei
  einem Vortragsbetrag von 0.00, weil ein Abschluss sonst an einer Entscheidung scheiterte, die
  nichts ändert (`ClosingManagement.carryAccountOf`). Prüfung 5 lässt diesen Fall folgerichtig
  durch (`ClosingChecks.checkSystemAccounts`). Eine ruhende AG mit Ergebnis 0.00 las in Schritt 3
  deshalb «Vortragskonto —» und suchte, was sie vergessen hatte. `carriesNoResult` liest genau diesen
  Zustand — fehlendes Konto **und** kein blockierender Befund, denn der zweite Weg zu einem
  fehlenden Konto ist ein nicht zugewiesener Systemschlüssel, und den meldet Prüfung 5 —, das
  Feld nennt «Keines — es ist nichts vorzutragen», der Hinweis darunter sagt warum, und der
  Abschlusssatz lautet «Es wird kein Ergebnis vorgetragen, und *n* Konten werden … übernommen».
  Der Gedankenstrich bleibt allein für den blockierten Fall stehen, den Schritt 1 benennt.
- **Der Wiedereröffnungsdialog nennt die Gegenbuchungen und weist vorab ab.** Er listet
  Journalnummer und Buchungstext je stehender Buchung des Laufs, und ein späteres Geschäftsjahr,
  das nicht auf `OPEN` steht — abgeschlossen **oder gesperrt**, so wie das Backend prüft —,
  ersetzt den ganzen Dialog durch eine `Notice` mit dem Weg zu jenem Jahr.
- `components/DataTable.tsx` bekommt `expandableRow`, `renderExpanded`, `expanded` und
  `onExpandedChange` samt Testfällen. Die Detailzeile trägt `colSpan` über die **sichtbaren**
  Spalten (also nach `hideBelow`), der Chevron ist ein `<button aria-expanded>` und keine
  anklickbare Zelle, `rowTo` und `onRowOpen` bleiben unberührt, und eine Tabelle ohne
  `renderExpanded` verhält sich zeichengleich wie vorher.
- Die Fähigkeit ist heute an **einer** Stelle benutzt: den Abschlussbuchungen. Das Journal darf
  sie jederzeit ebenfalls benutzen; es muss nicht.
- `pages/accounting/EntryLinesView.tsx` zeichnet die Zeilen einer Buchung und wird von der
  Aufklappzeile benutzt; `pages/accounting/ReopenDialog.tsx` stellt die eine Frage des
  Wiedereröffnens mit ihrer Grenze von 170 Zeichen.
- Der Menüeintrag «Abschluss» hängt an `ACCOUNTING_READ` und am Modulschalter `ACCOUNTING`
  (ADR-0032, ADR-0044). Wer das Abschlussrecht nicht hat, sieht die Zusammenfassung und einen
  Satz, der das fehlende Recht benennt — keine verschlossene Seite. Die Vorprüfung wird für ihn
  gar nicht erst geholt, weil sie `ACCOUNTING_CLOSE` verlangt und mit 403 antworten würde.
- `NavCounterKey` bleibt unverändert: an diesem Eintrag steht kein Zähler.

## Abweichungen vom Issue

**1. Der Bildschirm weicht vom Bildschirmentwurf des Issues ab, und zwar bewusst.** Der Entwurf
zeigt eine `DataTable` über die Geschäftsjahre, deren Zeile aufklappt und Kopfzahlen, Knopf und
Verlauf trägt. Gebaut ist ein **`SelectField`-Jahrwähler mit Panels**: die Jahreswahl steht im
Auswahlfeld, der Inhalt darunter in Panels, und welches der beiden Gesichter erscheint,
entscheidet der Zustand des Jahres. Begründet in den Abschnitten 1 bis 3.

**2. Die neue Aufklappzeile von `DataTable` trägt die Abschlussbuchungen statt der
Geschäftsjahre.** Die vom Issue verlangte Erweiterung ist gebaut, samt ihrem Testfall — sie steht
an einer anderen Stelle desselben Bildschirms. Aufgeklappt zeigt eine Abschlussbuchung ihre
Zeilen, nachgeladen beim Aufklappen. Begründet in Abschnitt 4.

**3. Der Assistent steht auf der Seite, nicht in einem Dialog.** Das Issue führt ihn als «drei
Schritte in einem Dialog». Die drei Schritte und ihre Reihenfolge sind unverändert übernommen —
wo der Abgrenzungshaken durchgesetzt wird, sagt Abweichung 7, und dass Schritt 2 eine Box mehr
trägt, sagt Abweichung 8; nur der Rahmen ist ein anderer. Der Rahmen ist der des Vorbilds, das
dasselbe Issue nennt: der Einrichtungsassistent aus #95 ist eine Seite und kein Dialog
(Abweichung 6). Das Wiedereröffnen bleibt ein Dialog.

**4. Beträge werden nach `de-CH` formatiert.** Wie in ADR-0045: die Skizze schreibt `38'214.90`
mit geradem Apostroph, diese Oberfläche trennt Tausender durchgehend mit `’`. Der Entwurf ist
eine Skizze, keine Zeichenvorschrift.

**5. Der Modulschalter steht nicht an `RequireTenant`.** Das Issue sagt an einer Stelle
«gewickelt wie jede Buchhaltungsmaske in `<RequireTenant permission module>`» und an einer
anderen, beim fünften Maskenzustand, «beim letzten bleibt die Jahresliste mit ihrem Zustand und
ihrem Verlauf sichtbar, nur die zwei Knöpfe verschwinden». Beides zugleich ist nicht baubar:
`RequireTenant` mit `module` ersetzt die **ganze** Maske durch die `ModuleOffNotice`
(`layout/RequireTenant.tsx:45`), damit wäre auch die Jahresliste weg. Gebaut ist der zweite Satz
— er ist der, den die Abnahmeliste des Issues prüft («die Leseendpunkte weiter mit 200, und die
Jahresliste bleibt im Bildschirm sichtbar») und den `ClosingPage.test.tsx` festhalten soll. Der
Menüeintrag trägt `module: ACCOUNTING` unverändert (`layout/navigation.ts:502`), die Adresse ist
also nur für den erreichbar, der sie tippt — und der bekommt die `ModuleOffNotice` statt der
Knöpfe. Begründet in Abschnitt 6.

**6. Dieses ADR entsteht, obwohl das Issue «Kein Frontend-ADR» sagt.** Der Bullet nennt **drei**
Gründe, und nicht zwei: die Menügruppe (in ADR-0044 aus #88 entschieden), die aufklappbare Zeile
als Erweiterung von `DataTable` nach Muster und Begründung von ADR-0030 — «sie wird im Bauteil
selbst dokumentiert … und braucht kein eigenes ADR» — und, als dritten, wörtlich: «Der
dreischrittige Dialog folgt dem Einrichtungsassistenten aus #95.» Die ersten beiden brauchen
wirklich keines und sind so gebaut.

Der dritte trägt genau die Stelle, von der Abweichung 3 abweicht: den Rahmen des Assistenten.
Und er trägt sie in die Richtung, in die gebaut wurde — der Einrichtungsassistent aus #95 ist
selbst kein Dialog, sondern eine Seite mit Schrittleiste und Panels unter eigener Adresse
(`pages/AccountingSetupPage.tsx:54,123`, Route `ACCOUNTING_SETUP_PATH`). «Folgt dem
Einrichtungsassistenten» und «in einem Dialog» stehen im Issue nebeneinander und meinen zwei
verschiedene Rahmen; gebaut ist der Assistent nach dem Vorbild, das der Satz benennt, und nicht
nach dem Wort daneben.

Dass diese Wahl getroffen wurde, gehört damit erst recht festgehalten. Eine Maske, die anders
gebaut ist, als der Auftrag sie zeichnet, ist genau der Fall, für den es ADRs gibt (CLAUDE.md
Abschnitt 6), und Bildschirmentscheidungen dieses Hauses stehen im Frontend-Repository —
ADR-0041 «drei Bildschirme und ein Upload», ADR-0043 «ein Grid statt einer Tabelle», ADR-0045
«ist ein Raster, kein Formular». Die Abweichungen des **Backends** zu #96 stehen unverändert in
Backend-ADR-0117.

**7. Der Abgrenzungshaken sperrt «Abschluss durchführen», und das ist keine zweite Sperre im
Assistenten.** Das Issue nennt ihn «Pflichtklick, keine Sperre» und zeichnet Schritt 2 mit
bedienbarem «Weiter». Beides steht: alle drei Schritte lassen sich mit ungesetztem Haken
durchgehen, `canContinue` bekommt den Haken gar nicht erst als Argument, und «Weiter» wird nie
unbedienbar. Angehalten wird der **Lauf** — der Knopf des dritten Schritts bleibt aus, solange
der Haken fehlt, und daneben steht der Satz, mit dem das Backend abweisen würde
(`accrualRefusal`, wörtlich Meldung und Vermerk von Prüfung 2a aus
`ClosingChecks.checkAccrualsConfirmed`).

Der Grund steht auf demselben Bildschirm. Die zweite Pflichtangabe der Buchhaltung, der Grund der
Wiedereröffnung, wird genau so behandelt: «The button stays off while the field is empty rather
than answering 400 to a click somebody could have been spared» (`ReopenDialog.tsx`). Zwei
Pflichtangaben in einer Maske, auf zwei verschiedene Arten durchgesetzt, lehren, dass eine der
beiden freiwillig ist — und dieselbe Maske rechnet schon an einer dritten Stelle eine Abweisung
des Backends vorweg, statt sie nach dem Klick zu zeigen (`blockingLaterYear`).

Verworfen wurde, es beim gestubbten 400 zu belassen. Der Klick ist die einzige Aussage des Laufs,
die einem Menschen gehört (OR Art. 958b Abs. 1); ihn allein vom Server durchsetzen zu lassen,
heisst, ihn in der Maske als freiwillig zu zeichnen — und die Zusicherung im Test hinge dann an
einer Stub-Antwort statt an der Maske. Ebenfalls verworfen: «Weiter» im zweiten Schritt zu
sperren. Das wäre die Sperre, die das Issue ausschliesst, und sie liesse jemanden vor einem toten
Knopf stehen, einen Schritt vor dem Satz, der ihn erklärt.

**8. Schritt 2 trägt eine zweite, freiwillige Ankreuzbox.** Das Issue zeichnet dort genau eine —
den Pflichtklick zur Abgrenzung nach OR Art. 958b Abs. 1 — und führt `reconciliationConfirmed` in
der DTO-Tabelle als Feld «(ab #100 belegt)». Gebaut ist daneben «Debitoren und Kreditoren sind
gegen die offenen Posten abgestimmt.» mit dem Vermerk «Freiwillig: die maschinelle Abstimmung
gegen die Nebenbücher kommt mit dem Beleganschluss» (`ClosingPage.tsx`); die Antwort reist mit und
steht im Protokoll (`ClosingManagement`, Logzeile `ACCRUALS`).

Der Grund: das Feld ist im Issue bereits Teil der Antwortform, und der Abschluss schreibt seine
Logzeile **jetzt**. Wer 2026 abschliesst und die Nebenbücher von Hand abgestimmt hat, kann das
festhalten, statt dass die Zeile bis #100 schweigt — und wer es nicht getan hat, lässt die Box
leer und wird nirgends aufgehalten. Sie ist ausdrücklich keine Prüfung: Befund 5 der neun trägt
weiterhin `○` und nie `✔`.

Ehrlich benannt bleibt trotzdem, dass es eine **nicht beauftragte Zutat** ist. Verworfen wurde,
sie wegzulassen, bis #100 die maschinelle Abstimmung bringt — dann trüge die DTO ein Feld, das
kein Weg setzen kann. Sie wieder zu entfernen ist ein kleiner Schnitt, solange #100 nicht gebaut
ist; die Stelle steht hier, damit die Entscheidung sichtbar ist und nicht im Code verschwindet.

### Nachtrag aus #97: zehn Prüfungen, nicht neun

Seit #97 liefert der Abschlusslauf **zehn** Befunde, nicht neun — Entscheidung A des
Auftraggebers, festgehalten in Frontend-ADR-0047 und Backend-ADR-0125. Die neue Prüfung **4a**
steht zwischen 4 und 5 und hält auf, wenn Erfolgskonten Saldo tragen **und** das
Bilanzergebniskonto (`JAHRESERGEBNIS_BILANZ`) bereits einen Saldo hat. Der Grund: Vorjahressaldi
werden **vor** der Ergebnisverwendung erfasst, und trüge beides zugleich Saldo, schöbe
Abschlussbuchung 2 das Ergebnis ein zweites Mal ins Eigenkapital — Aktiven und Passiven gingen
trotzdem auf, keine Kontrolle merkte es. Die Reihenfolge lautet jetzt
`1, 2, 2a, 3, 3a, 4, 4a, 5, 7, 7a`.

Dieses ADR sagt an fünf Stellen «neun» — in Abschnitt 3, in der Begründung, bei den verworfenen
Alternativen, in Abweichung 8 und unter «Offen». Sie beschreiben den Stand von #96 und werden
nicht umgeschrieben. Am Bildschirm ändert sich nichts als die Zahl: `sortedChecks` ordnet, was der
Lauf liefert, und zählt nicht, und die Maske zeigt jede Zeile, die kommt. Auf zehn gezogen sind
die Panelbeschreibung und vier Kommentarzeilen in `ClosingPage.tsx`, fünf Zeilen in
`closingWizard.ts`, sieben in `lib/accounting.ts`, fünf Stellen in `lib/types.ts` — vier Zeilen
und die Bezeichnerliste von `ClosingCheck.step`, die `4a` führt — und eine Zeile in
`accounting.test.ts`, dazu vier Testfälle, zwei in `ClosingPage.test.tsx` und zwei in
`closingWizard.test.ts`, drei davon umbenannt (Frontend-ADR-0047, Entscheidung 8, mit jeder
Stelle).

Damit ist auch der erste Eintrag unter «Offen» eingelöst: die Zusammenfassung eines
abgeschlossenen Jahres trägt seit #97 das Panel «Papiere des Abschlusses» — die fünf PDF je
Durchgang, unter der Abschlussnummer des Durchgangs, und ein Jahr, das nach einer Wiedereröffnung
zweimal abgeschlossen wurde, zeigt beide Sätze. Der dritte Schritt des Assistenten sagt vor dem
Klick, dass der Lauf fünf Papiere ablegt und als Ganzes scheitert, wenn eines davon nicht
gezeichnet werden kann.

## Offen

Zugewiesen, keine offene Frage:

- **Der Archivsatz zum Abschluss** — Bilanz, Erfolgsrechnung, Journal, Saldenliste und
  Kontoblätter als PDF, mit dem Abschluss festgehalten: **#97**. Bis dahin führt der Weg über
  Archivexport und druckfertige Seite.
- **Die maschinelle Abstimmung gegen die Nebenbücher**, Befund 5 der neun: **#100**. Er trägt
  heute ein `○` und nie ein `✔`, damit niemand ihn für eine bestandene Prüfung hält. Die
  freiwillige Ankreuzbox in Schritt 2 nimmt ihm nichts vorweg — sie hält eine von Hand gemachte
  Abstimmung im Protokoll fest und prüft nichts (Abweichung 8).
- **Die Maske «Integrität»** — #98.
