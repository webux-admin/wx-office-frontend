# ADR-0045 — Die Buchungserfassung ist ein Raster mit Live-Differenz und «So wird gebucht» samt Wirkungszeile, kein Formular

- **Status:** Angenommen
- **Datum:** 2026-09-04
- **Verhältnis:** setzt Backend-[ADR-0114](https://github.com/webux-admin/wx-office/blob/main/docs/adr/ADR-0114-die-buchung-kopf-und-zeilen.md)
  und Backend-[ADR-0115](https://github.com/webux-admin/wx-office/blob/main/docs/adr/ADR-0115-die-hash-kette-ueber-das-journal.md)
  um. Führt [ADR-0043](ADR-0043-klaerungskorb-ein-grid-statt-einer-tabelle.md) fort — dort ist
  das erste echte ARIA-Grid entstanden — und benutzt die Tastenregeln aus
  [ADR-0012](ADR-0012-tastenkuerzel-zum-abschliessen-einer-maske.md). Die Menügruppe, in der
  diese Masken hängen, steht in [ADR-0044](ADR-0044-buchhaltung-menuegruppe-ordner-und-archiveintrag.md)
  Abschnitt 5. Lässt `DataTable`, `MatchGrid` und
  [ADR-0030](ADR-0030-mehrfachauswahl-in-der-tabelle.md) **unverändert**. Neu.

## Kontext

Zum ersten Mal kann in dieser Anwendung gebucht werden. Die Maske «Buchen» ist damit die erste,
in der jemand **beliebig viele Zeilen** tippt, die zusammen aufgehen müssen, bevor irgendetwas
gespeichert werden kann — und die erste, deren Ergebnis nach dem Speichern **unveränderlich**
ist: ab dem Verbuchen gibt es kein Ändern und kein Löschen mehr, nur noch die Gegenbuchung.

Die Zielgruppe ist nicht die Buchhaltungsabteilung. Es ist der Malerbetrieb mit einem Erfasser,
der zwanzig Belege am Stück abtippt und für den «Soll» und «Haben» keine Alltagswörter sind.
Daraus folgen drei Fragen, die sich gegenseitig bedingen: **womit das Raster gezeichnet wird**,
**wie viel Übersetzungshilfe die Maske gibt, ohne eine zweite Fachsprache zu erfinden**, und
**was mit dem Tippstand passiert, wenn jemand die Seite wechselt.**

Dazu eine Eigenheit dieser Auslieferung: die Vorprüfung des Sammelschritts **nennt den
Nummernbereich nicht**, den ein Lauf vergeben wird. Der Zählerstand von `numbering` verlässt das
Backend-Modul nicht, und der Dialogentwurf des Issues verspricht ihn (Backend-ADR-0114,
Abweichung 10).

## Entscheidung

### 1. Ein eigenes `EntryGrid` neben `MatchGrid`; `DataTable` bleibt unangetastet

Die Tastaturmechanik von `MatchGrid` wird übernommen — `role="grid"`, **genau ein Tabstopp**
(roving tabindex), Pfeiltasten über Zeilen **und** Zellen —, die Komponente selbst nicht.

| Was `EntryGrid` braucht | `MatchGrid` | `DataTable` |
| --- | --- | --- |
| **Zellen, in die getippt wird** | nein — jede Zelle ist ein `render` auf einen fertigen Wert | nein |
| Zeilen, die beim Tippen **entstehen** | nein, die Zeilen kommen vom Server | nein |
| Eine Summenzeile, die **bei jedem Tastendruck** neu rechnet | nein | `footer`, aber über eine geladene Seite |
| Ein Feld mit Autocomplete **in** der Zelle | nein | nein |
| Roving Tabindex, Pfeiltasten über alle Zellen | **ja** | nein, ein Tabstopp je Zeile |

Der Unterschied ist nicht eine Spalte mehr, sondern die Richtung: `MatchGrid` ist eine
**Leseliste**, durch die man sich bewegt und in der man Zeilen ankreuzt; `EntryGrid` ist ein
**Eingabeformular in Rasterform**. Eine Komponente, die beides kann, hätte für jeden Fall einen
Zweig, und die Bedienung des Klärungskorbs hinge an einer Änderung, die für die
Buchungserfassung gemacht wurde. `EntryGrid` ist deshalb eine **benannte Komponente mit eigenem
Test**, wie `MatchGrid`, und kein handgeschriebenes `<table>` im Seitencode.

Die Tastenbelegung folgt ADR-0012 und dem Klärungskorb: Tab und Enter wechseln das Feld, Enter
auf der letzten Spalte legt die nächste Zeile an, `.` setzt das heutige Datum, `Esc` verwirft die
Zeile, `Ctrl+S` und `Ctrl+Enter` speichern.

### 2. Die Live-Differenz steht immer da, auch bei 0.00

Unter dem Raster: «Soll 3'200.00 = Haben 3'200.00 · Differenz 0.00». Sie wird bei jedem
Tastendruck neu gerechnet, sie steht **rot**, solange sie ungleich null ist, und sie verschwindet
nie — auch nicht, wenn alles stimmt.

Das ist die Übernahme aus ADR-0043 Abschnitt 5 («Erst gleich, dann buchbar»), und der Grund ist
derselbe: eine Anzeige, die nur im Fehlerfall erscheint, wird als Fehlermeldung gelesen und
weggeklickt. Dazu kommt hier ein zweiter Grund: die Datenbank lehnt eine unausgeglichene Buchung
**auch als Entwurf** ab, und die Meldung dazu kommt erst nach dem Absenden.

**Die Maske rechnet damit eine Zahl mit, und das ist die einzige.** Sie prüft sie nicht, sie
entscheidet nichts daran, und sie schickt sie nicht mit: der Server rechnet dieselbe Summe in
`EntryBalance` noch einmal und ist die einzige Instanz, die «ausgeglichen» sagt. Die
Live-Differenz ist eine **Anzeige**, keine Validierung.

### 3. Die Wirkungszeile ist die **schwache** Rücklesung, an genau einer Stelle

Der Kasten «So wird gebucht» zeigt den fertigen Buchungssatz **einschliesslich der gerechneten
Steuerzeile**, bevor gespeichert wird, und je Zeile **einen** zusätzlichen Satz, abgeleitet aus
Kontoart und Seite:

| Kontoart | Soll | Haben |
| --- | --- | --- |
| `ASSET` | Guthaben steigt um … | Guthaben sinkt um … |
| `LIABILITY` | Schuld sinkt um … | Schuld steigt um … |
| `EQUITY` | Eigenkapital sinkt um … | Eigenkapital steigt um … |
| `EXPENSE` | Aufwand steigt um … | Aufwand sinkt um … |
| `REVENUE` | Ertrag sinkt um … | Ertrag steigt um … |

**Die starke Form ist ausdrücklich verworfen.** Sie hiesse: «Soll» und «Haben» als Beschriftungen
ganz ersetzen — durch «erhöhen» und «vermindern», durch Farben, durch Pfeile — und den Nutzer nie
mit den Fachwörtern konfrontieren. Drei Gründe stehen dagegen, und keiner davon ist Purismus.
**Der Ausdruck spricht Soll und Haben**: Journal, Kontoblatt, Saldenliste, Archivexport und jedes
Papier, das an den Treuhänder geht, tragen zwei Spalten mit diesen zwei Wörtern. **«Erhöhen» ist
ohne Kontoart mehrdeutig** — genau das zeigt die Tabelle oben: derselbe Klick auf «Soll» erhöht
ein Aktivkonto und vermindert ein Passivkonto. Und es **gäbe zwei Wortschätze für dieselbe
Sache**, einen im Raster und einen überall sonst; der erste Fehlerdialog, der von «Soll» spricht,
während die Maske «erhöhen» sagt, kostet mehr, als der Wortschatz je eingebracht hat.

**Die schwache Form wird trotzdem gebaut**, denn ohne sie beantwortet die Maske die einzige
Frage nicht, die ein Nicht-Buchhalter hat: *welches Konto gehört auf welche Seite.* Sie steht
**an genau einer Stelle** — im Kasten «So wird gebucht», unter der jeweiligen Zeile — und nirgends
sonst: nicht als Spaltenüberschrift, nicht als Platzhalter im Feld, nicht im Journal, nicht in
einer Auswertung. **Soll und Haben bleiben der einzige Wortschatz im Raster, im Journal und in
jeder Auswertung.**

Sie ist eine reine Ableitung aus `account_type` und der bebuchten Seite — kein Endpunkt liefert
sie, und keiner soll es: sie ist eine Beschriftung, keine fachliche Aussage.

### 4. Der Tippstand überlebt den Seitenwechsel, nicht den Tag — mit der Mandanten-Id im Schlüssel

Wer mitten in einer Buchung die Seite wechselt, findet sie beim Zurückkommen wieder. Der Stand
läuft über `lib/preferences.ts` und **nicht** über rohes `sessionStorage`: der Zugriff auf einen
Browserspeicher gehört an die eine Stelle mit dem Präfix `webux.`, dem `try`/`catch` um jeden
Zugriff und dem Rückfallwert, wenn der Browser nichts hergibt. `preferences.ts` bekommt dafür
eine Sitzungsvariante neben den heutigen Flag- und Textfunktionen.

**Diese Sitzungsvariante liegt in `sessionStorage` — das ist ihr ganzer Unterschied zu
`readText`/`writeText`.** Verworfen ist der *rohe* Zugriff auf einen zweiten Speicher, nicht der
zweite Speicher: das sind zwei Fragen. Auf das **Wie** antwortet `preferences.ts` und sonst
niemand — `sessionStorage` steht in vier Funktionen dieser einen Datei und in keiner Komponente,
mit demselben Präfix, demselben `try`/`catch` und demselben Rückfallwert wie alles andere hier.
Auf das **Wo** antwortet die Lebensdauer: eine halbe Buchung trägt Kontonummern und Beträge eines
Betriebs, und in `localStorage` überlebte sie den Neustart des Browsers und die nächste Anmeldung
— sie verschwände erst, wenn jemand «Buchen» für einen anderen Mandanten öffnet oder erfolgreich
speichert. Auf einem geteilten Arbeitsplatz liegt damit die angefangene Buchung eines Mandanten
unbegrenzt im Browser, und das ist genau das Gut, das dieser Abschnitt schützen soll. Eine
Einstellung ist es wert, so lange erinnert zu werden; ein halb getippter Buchungssatz nicht. Er
gehört dem Tab, in dem er getippt wurde.

**Der Schlüssel heisst zwingend `webux.accounting.draft.<tenantId>`.** Ohne die Mandanten-Id
bekäme, wer den Mandanten wechselt, den halb getippten Buchungssatz eines **fremden Betriebs** in
seine Maske — Kontonummern und Beträge inklusive. Das ist keine Unbequemlichkeit, sondern eine
Vermischung von Daten zweier Mandanten in genau der Maske, in der sie am teuersten ist; die
Trennung nach `tenant_id` ist im Backend die Wurzel von allem (Backend-ADR-0003), und ein
Browserspeicher, der sie nicht kennt, hebelt sie an einer Stelle aus.

Gelöscht wird der Stand **dreimal**: beim Mandantenwechsel, nach erfolgreichem Speichern und beim
Schliessen des Tabs. Der zweite Fall ist der leicht zu vergessende — ohne ihn liegt nach dem
Verbuchen ein Stand herum, der aussieht wie eine ungespeicherte Buchung, und der nächste Erfasser
tippt sie ein zweites Mal. Was **nicht** dort landet: nichts über die Sitzung, kein Token, keine
Personendaten.

### 5. Die Kontoauswahl ist ein Feld, nicht zwei Listen

Ein Feld je Zeile, Autocomplete auf **Nummer oder Bezeichnung** über `useDebouncedValue`. Wer
«miete» tippt, bekommt «6000 Raumaufwand»; wer «6000» tippt, dasselbe. Nicht `QuickSearchField` —
das ist der Baustein für die Kopfzeile einer Liste, nicht für eine Rasterzelle.

**Der getippte Text ist `row.accountText` und liegt nirgendwo sonst.** Die Zelle hält keine
eigene Kopie davon: die Maske beginnt die nächste Buchung mit denselben Zeilenschlüsseln, React
behält damit dieselben Zellen, und eine eigene Kopie zeigte nach dem Speichern weiter ein Konto
an, das die Zeile nicht mehr trägt. Der nächste Beleg würde dann auf ein Konto getippt, das
gesetzt aussieht und keines ist.

Konten mit `direct_posting_allowed = FALSE` oder `active = FALSE` erscheinen in der Auswahl gar
nicht. **Das ist eine Bequemlichkeit, keine Sperre.** Die Sperre steht im Backend, in
`PostingRules` und in einem Datenbankwächter — eine Sperre, die im Browser liegt, ist in einer
Buchführung keine.

**Text ohne Konto ist ein Zustand und wird als solcher gezeichnet.** Wer «6000 Raumaufwand»
ausschreibt, statt aus der Liste zu wählen, hat Text im Feld und kein Konto auf der Zeile; die
Zeile fällt beim Senden weg, und der Server beanstandet danach die **fehlende** Zeile statt der
falschen. Solange die Vorschlagsliste offen steht, ist nichts zu sagen — das ist jemand beim
Auswählen. Steht keine Liste und trotzdem Text da, trägt das Feld `aria-invalid` und darunter
steht die Folge, nicht die Regel: «Kein Konto gewählt. Diese Zeile wird nicht gespeichert.»

**Das Feld ist eine `combobox` nach ARIA, und der Fokus bleibt darin.** Die Pfeiltasten bewegen
die Markierung in der Liste, gemeldet wird sie über `aria-activedescendant` auf jeweils eine
`id` der Optionen. `SplitButton` löst dieselbe Frage, indem er den Fokus auf den markierten
Eintrag setzt — das darf ein Menü, eine Combobox nicht: der Fokus gehört in das Feld, in das
getippt wird. `aria-expanded`, `aria-controls` und `aria-activedescendant` folgen der Liste, die
tatsächlich gezeichnet ist; ohne Treffer gibt es keine `ul`, und dann darf auch nichts auf eine
zeigen.

### 6. Der Leerzustand nennt die fehlende Voraussetzung, in der Reihenfolge der Riegel

Bis zum Einrichtungsassistenten (#95) ist die Kette Kontenplan → Geschäftsjahr → Buchen für einen
Nicht-Buchhalter nicht erschliessbar. «Buchen» zeigt deshalb einen `EmptyState` mit dem **ersten**
fehlenden Punkt und dem Knopf, der ihn behebt: «Es gibt noch keinen Kontenplan. [Kontenplan
anlegen]», beziehungsweise «Für den 09.09.2026 gibt es kein Geschäftsjahr. [Geschäftsjahr
anlegen]». Laden, leer, Fehler, «kein Recht» und «Modul aus» kommen wie überall aus `Notice.tsx`.

### 7. Der Verbuchungsdialog sagt, was danach nicht mehr geht — und nennt keine Nummern

Der Sammelschritt aus «Entwürfe» öffnet zuerst die **Vorprüfung**, bevor irgendetwas geschrieben
wird: wie viele durchgehen, und für jeden übrigen der Grund im Klartext. Darunter steht der Satz,
der die eigentliche Entscheidung trägt:

> Verbuchte Buchungen lassen sich nicht mehr ändern oder löschen. Ein Fehler wird ab dann mit
> einer Gegenbuchung aufgehoben — die alte Buchung bleibt sichtbar stehen. Das ist so gewollt:
> das Journal ist der Nachweis, dass nachträglich nichts verändert wurde.

Beim Einzelverbuchen aus «Buchen» erscheint derselbe Dialog, verkürzt auf diesen Satz. Damit ist
WCAG 3.3.4 auf demselben Weg erfüllt wie im Klärungskorb: die Sammelaktion mit vorgeschalteter
Übersicht ist «Confirmed», die Gegenbuchung als einziger Korrekturweg ist «Reversible».

**Der Dialog nennt den Nummernbereich nicht**, obwohl der Entwurf ihn zeigt («bekommen die
Journalnummern 2026-000045 bis 2026-000049»). Das Backend liefert die beiden Felder leer und wird
sie in dieser Stufe immer leer liefern: der Zählerstand von `numbering` verlässt dieses Modul
nicht. Die Maske zeigt deshalb Zahl und Gründe und **erfindet keinen Bereich** — eine Nummer, die
im Dialog steht und nachher eine andere ist, ist schlimmer als keine.

## Begründung

Das Raster gewinnt, weil die Sammelbuchung im Backend kein Modus ist, sondern schlicht «mehr
Zeilen»: ein Schema für alles, die einfache Buchung ist der Fall n = 2 (Backend-ADR-0114). Eine
Maske, die den einfachen Fall anders zeichnet als den zusammengesetzten, erzeugt an genau der
Stelle einen Bruch, an der das Datenmodell keinen hat.

Die Live-Differenz und der Kasten «So wird gebucht» beantworten die zwei Fragen, die vor dem
Speichern offen sind — *geht es auf* und *stimmt die Richtung* —, und sie beantworten sie
**vorher**. Danach ist nichts mehr zu ändern.

## Verworfene Alternativen

**Das Formular mit einem Soll- und einem Habenfeld.** Die vertraute Form aus jedem
Buchungsprogramm für Einsteiger, und hier zweimal falsch. *Erstens* kann es die **Steuerzeile
nicht zeigen**, ohne selbst eine dritte Zeile zu erfinden: der Server rechnet die Steuer aus der
Bruttozeile heraus, und aus zwei Feldern werden dabei drei Zeilen. Ein Formular mit zwei Feldern
müsste die Steuerzeile entweder verschweigen — dann sieht der Nutzer im Journal etwas anderes,
als er getippt hat — oder sie in einen Kasten schreiben, der nicht zu den Feldern passt.
*Zweitens* ist der Übergang zur Sammelbuchung dann **immer ein Bruch**: ein zweiter Bildschirm
oder ein «Modus», der beim Wechsel Eingaben verliert. Im Raster wächst dieselbe Buchung um eine
Zeile.

**`MatchGrid` um einen Eingabemodus erweitern.** Der Klärungskorb ist die Maske, in der
zweihundert Bankbewegungen an einem Vormittag erledigt werden; ihre Tastaturbedienung ist
getestet und eingespielt. Sie für eine zweite Maske umzubauen wäre eine Regression an der Stelle,
an der sie am teuersten ist. **`DataTable` um einen Grid-Modus erweitern** hat schon ADR-0043
verworfen: jede Tabellenmaske der Anwendung hängt daran.

**Die starke Übersetzungshilfe «erhöhen / vermindern» statt Soll und Haben.** Begründet in
Abschnitt 3: der Ausdruck spricht Soll und Haben, «erhöhen» bedeutet je nach Kontoart das
Gegenteil, und zwei Wortschätze für dieselbe Sache kosten mehr, als sie einbringen. Die schwache
Form an einer Stelle bleibt.

**Die Wirkungszeile vom Server holen.** Sie folgt aus `account_type` und der bebuchten Seite,
beide sind ohnehin in der Antwort. Ein Endpunkt dafür wäre eine zweite Wahrheit über eine
Beschriftung — und die erste, die nach einer Übersetzung ins Französische auseinanderläuft.

**Die Live-Differenz nur zeigen, wenn sie ungleich null ist.** Dann wird sie als Fehlermeldung
gelesen und weggeklickt, und im Normalfall fehlt die Bestätigung, dass es aufgeht. Dieselbe
Erwägung wie bei der Restdifferenz im Klärungskorb (ADR-0043). Umgekehrt genügt es auch nicht,
**nur den Knopf zu sperren**: ein gesperrter Knopf ohne Zahl daneben ist die häufigste Sackgasse
in Erfassungsmasken.

**Den Tippstand in rohem `sessionStorage` halten.** Umginge das Präfix `webux.`, das `try`/`catch`
und den Rückfallwert — deshalb steht der Speicher hinter `preferences.ts` und in keiner
Komponente (Abschnitt 4). **Ihn in `localStorage` halten** wäre eine Funktion weniger und liesse
die angefangene Buchung eines Mandanten über Browserneustart und Abmeldung hinaus im Browser
liegen; die Sitzungsvariante hiesse dann so, ohne eine zu sein. **Ihn ohne die Mandanten-Id
ablegen** wäre kürzer und legte beim ersten Mandantenwechsel den Buchungssatz eines fremden
Betriebs in die Maske (Abschnitt 4). **Ihn auf dem Server halten** hiesse einen zweiten
Entwurfsbegriff neben dem Entwurf zu führen — und der Server müsste Zeilen speichern, die nicht
aufgehen, was der Ausgleichstrigger verbietet.

**Die Markierung in «Entwürfe» bei Suche, Sortierung und Seitenwechsel stillschweigend stehen
lassen.** Sieben markierte Entwürfe, dann ein Suchbegriff: «Verbuchen (7)» stünde über einer
Liste, in der keiner davon vorkommt — und verbuchte sie. Sie **stillschweigend zu löschen** ist
die andere Hälfte desselben Fehlers, nur leiser. Gefragt wird vorher, wie im Ausbuchungslauf
(`WriteOffRunPage`): die Änderung wartet als Thunk, bis die Frage beantwortet ist.

**Ein Währungs- und ein Kursfeld im Raster.** Die fünf Fremdwährungsspalten stehen in der
Tabelle, weil sie sich später nicht nachrüsten liessen; die **Erfassung** in Fremdwährung ist
ausdrücklich nicht Teil dieser Reihe, und es gibt weder eine Kurstabelle noch einen
Kursausgleich. Dasselbe gilt für den Knopf **«Vorlage anwenden»** aus dem Maskenentwurf:
Buchungsvorlagen sind #93, und hier stünde kein Endpunkt dahinter. Felder und Knöpfe, hinter
denen nichts steht, sind eine Ankündigung ohne Einlösung.

**«Nur speichern» als Hauptknopf.** Weil der Ausgleichstrigger auch für Entwürfe gilt, ist jeder
speicherbare Entwurf bereits ausgeglichen und damit fertig; es gibt fachlich keinen Grund, ihn
liegen zu lassen. Der Entwurfszustand bleibt — für den Treuhänder, für die Sammelerfassung, für
«Beleg noch klären» —, aber er ist nicht der Vorgabeweg.

## Konsequenzen

- `components/EntryGrid.tsx` ist neu, mit eigenem Test: Tastaturweg über alle Zellen, Enter legt
  die nächste Zeile an, die Live-Differenz rechnet, die Wirkungszeile je Kontoart, das leere
  Kontofeld nach dem Speichern, die Markierung einer Zeile ohne Konto, die Tastatur- und
  ARIA-Prüfung der Kontoauswahl, der Rettungsstand — und dass ein Mandantenwechsel ihn
  nachweislich löscht.
- `lib/preferences.ts` bekommt eine Sitzungsvariante neben `readFlag`/`writeFlag` und
  `readText`/`writeText`, in `sessionStorage`. Das Präfix `webux.` und der `try`/`catch` um jeden
  Zugriff bleiben, und `sessionStorage` steht in keiner anderen Datei.
- `pages/EntryPage.tsx`, `pages/EntryDraftPage.tsx` und `pages/JournalPage.tsx` sind neu;
  «Entwürfe» ist eine `DataTable` mit Mehrfachauswahl (ADR-0030), «Journal» eine `DataTable` mit
  serverseitiger Sortierung, Blätterung und Aufklappzeile.
- Die Mehrfachauswahl in «Entwürfe» wird bei Suche, Sortierung und Seitenwechsel verworfen —
  aber erst, nachdem gefragt wurde (`WriteOffRunPage` ist das Muster).
- Der Stornodialog des Journals leert Grund und Buchungsdatum beim Öffnen, angepasst beim
  Rendern wie in `WriteOffDialog` und `AdvanceDialog`. Beides wird beim Bestätigen sofort
  geschrieben und ist danach nicht mehr korrigierbar.
- Der Kasten «So wird gebucht» nummeriert die Steuerzeile nach den **gesendeten** Zeilen
  (`entryRequestOf`), nicht nach den Zeilen des Rasters — der Server nummeriert, was ankommt,
  von eins.
- `lib/accounting.ts` wächst um Pfade, Cache-Schlüssel und Verben der Buchung.
- Die Filter `entryKind` und `source` im Journal **beschriften sich aus `GET /catalogues`**, nicht
  aus einer Konstante im Frontend — dieselbe Regel wie für jeden strukturellen Enum im Haus
  (ADR-0001, Backend-ADR-0017). Eine hart geschriebene deutsche Beschriftung wäre die einzige
  Stelle, an der ein Mandant die Wortwahl nicht ändern kann. Sie laufen dabei durch
  `selectOptions`: der Endpunkt antwortet den ganzen Katalog, und ein Wert, den der Mandant
  ausgeblendet hat (`visible === false`), wird auch hier nicht angeboten. Der aktuell gewählte
  Wert wird mitgegeben und bleibt sichtbar, auch wenn er inzwischen ausgeblendet wurde.
- Der Rückweg zwischen Gegenbuchung und stornierter Buchung läuft über `lib/origin.ts` und
  `DataTable.rowState` (ADR-0003).
- `DataTable`, `MatchGrid`, `NavGroup` und `NavCounterKey` bleiben **unverändert**.

## Abweichungen vom Issue

**1. Der Vorprüfungsdialog nennt keinen Nummernbereich.** Das Issue zeichnet ihn mit «5 werden
verbucht und bekommen die Journalnummern 2026-000045 bis 2026-000049». Das Backend liefert
`firstNumber` und `lastNumber` in dieser Stufe immer leer, weil der Zählerstand von `numbering`
dieses Modul nicht verlässt (Backend-ADR-0114, Abweichung 10). Der Dialog zeigt Zahl und Gründe.

**2. Die Wirkungszeile ist als reine Frontend-Ableitung festgelegt.** Das Issue gibt die Tabelle
vor, sagt aber nicht, wo sie gerechnet wird. Entschieden ist: im Browser, aus `account_type` und
der bebuchten Seite, ohne Endpunkt.

**3. Beträge werden nach `de-CH` formatiert.** Der Maskenentwurf des Issues schreibt `3'200.00`
mit einem geraden Apostroph; diese Oberfläche trennt Tausender durchgehend mit `’` (CLAUDE.md
Abschnitt 1). Der Entwurf ist eine Skizze, keine Zeichenvorschrift.

## Offen

Zugewiesen, keine offene Frage:

- **Buchungsvorlagen und der Knopf «Vorlage anwenden»** — #93.
- **Kontoblatt, Saldenliste, Drill-Down, Archivexport und der Zähler `ACCOUNTING_DRAFTS` am
  Menüeintrag «Entwürfe»** — #94, zusammen mit der Verallgemeinerung von `AppShell.NavItem`.
- **Der Einrichtungsassistent**, der die Kette Kontenplan → Geschäftsjahr → Buchen führt statt
  sie nur zu benennen — #95.
- **Die Maske «Integrität»** mit dem Wortlaut für Normal- und Fehlerfall — #98. Der Endpunkt
  steht seit #92.
- **Der Nummernbereich in der Vorprüfung.** Braucht einen Leseweg in `numbering`; die beiden
  Felder sind in der Antwort vorhanden und bleiben bis dahin leer.
