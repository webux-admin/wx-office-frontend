# ADR-0020 — Der Postausgang bekommt drei Masken, und Senden sitzt im Druckknopf

- **Status:** Angenommen
- **Datum:** 2026-08-28

## Kontext

Das Backend kann seit ADR-0082 bis ADR-0086 alles, was zum Mailversand gehört: ein Mailkonto je
Mandant, eine Warteschlange mit Versandläufer, den Belegversand mit Textvorlagen und einen
Modulschalter. **Nichts davon ist bedienbar** — es gibt keine Maske dafür.

Randbedingungen:

- **Die Belegmaske trägt bereits fünf Knöpfe** in der Kopfzeile: Entwurf löschen, Drucken,
  Zurückstellen, Stornieren und, bei der Offerte, das Zurücknehmen der Markierung.
- **`components/SplitButton.tsx` ist da** und wird bereits dort benutzt, wo ein Bildschirm
  mehrere Wege zum selben Ziel hat.
- **Eine Mail an einen Kunden ist nicht zurückholbar.** Anders als ein Druck, den man wegwirft.
- **Das Backend gibt das Passwort des Mailkontos nirgends heraus**, auch nicht verschlüsselt.
  Die Antwort trägt nur `passwordSet`.
- **`GET …/outbox/account` antwortet 404**, solange ein Mandant kein Konto hat. Das ist der
  Zustand, in dem jeder Mandant anfängt.
- **Der Postausgang ist schaltbar** (Backend-ADR-0086). `NavModule` kennt `OUTBOX` seit dem
  Modulschalter-Issue.
- Es gibt fünf Kategorien × vier Sprachen = **20 Vorlagen**, von denen die meisten Mandanten
  keine einzige anfassen.
- ADR-0011 sortiert Masken danach, **wie viele Module einen Wert lesen**:
  Systemeinstellungen für das Übergreifende, Moduleinstellungen für das, was ein Modul liest.

## Entscheidung

**Drei Masken, nicht eine.**

| Maske | Ort | Warum dort |
|---|---|---|
| `OutboxAccountPage` — das Mailkonto | Systemeinstellungen, neben «Mandanten» | Eine Betriebseinstellung des Mandanten, wie seine Adresse |
| `OutboxListPage` — was hinausging | Moduleinstellungen → Belege | Wird benutzt, nicht eingerichtet; steht bei Belegarten, Druckvorlagen und Nummernkreisen |
| `OutboxTemplatePage` — die Begleittexte | Moduleinstellungen → Belege, direkt darunter | Gehört zu dem, was die Liste zeigt |

**Alle drei tragen `module: 'OUTBOX'`.** Ein Mandant ohne das Modul sieht keine davon.

**Senden sitzt im `SplitButton` des Druckknopfs**, nicht als sechster Knopf. Hauptaktion bleibt
«Drucken» beziehungsweise «Vorschau»; hinter dem Pfeil steht «Als E-Mail senden».

**Beim Entwurf ist der Menüeintrag ausgegraut mit dem Grund. Ohne das Modul ist der Pfeil ganz
weg** — dann steht wieder der einfache Knopf da.

**Der Dialog zeigt die Mail, er fragt nicht nach.** Empfänger, Kopie, Betreff, Text, der Anhang
mit Name und Grösse, und ein Kästchen «Kopie an mich». Alles aus `GET …/preview`, alles
änderbar.

**Ohne Adresse öffnet er trotzdem**, mit leerem Feld und einem Hinweis. **Ohne Mailkonto** sagt
er das und verlinkt in die Kontomaske — den Link nur mit `OUTBOX_CONFIGURE`, sonst «Bitte an die
Administration wenden».

**Nach dem Senden: «Die E-Mail wurde in den Postausgang gelegt.»** Nie «gesendet».

**Das Passwortfeld ist nur beschreibbar**: Platzhalter «••••••••, gespeichert», leeres Feld
daneben, und **leer heisst unverändert**. Die Maske schickt das Feld gar nicht mit, wenn nichts
getippt wurde.

**Der Statusfilter der Liste startet auf «Fehlgeschlagen».**

**Platzhalter werden angeklickt, nicht getippt.** Die Vorlagenmaske bietet den geschlossenen
Katalog als Knöpfe, die an der Schreibmarke einfügen.

## Begründung

**Drei Masken, weil die drei Fragen verschieden sind und verschieden oft gestellt werden.** «Wie
melde ich mich am Mailserver an» ist einmal im Leben; «warum ist die Rechnung nicht angekommen»
ist der Dienstagmorgen. Eine Maske mit drei Registern hätte den Alltagsfall hinter einer
Einrichtungsmaske versteckt.

**Der Postausgang ist eine eigene Maske und keine Zeile am Beleg, weil man das Gescheiterte
finden muss, ohne den Beleg zu kennen.** Sonst merkt niemand, dass seit Dienstag nichts mehr
hinausgeht. Dieselbe Begründung, mit der der Modulschalter einen eigenen Bildschirm bekam
(Backend-ADR-0079).

**Der Filter startet auf «Fehlgeschlagen», weil niemand diese Maske öffnet, um zu bewundern, was
hinausging.** Die eine Frage, mit der sie geöffnet wird, ist die nach dem, was nicht hinausging.
Ist nichts fehlgeschlagen, sagt die Leerseite das als gute Nachricht und nicht als «keine
Treffer».

**Der Knopf gehört in den Druckknopf, weil Senden dasselbe Ziel hat wie Drucken**: den Beleg aus
dem Haus geben. Ein sechster gleichrangiger Knopf hätte den fünf anderen Aufmerksamkeit
weggenommen, und der `SplitButton` ist genau für diesen Fall gebaut.

**Ausgegraut beim Entwurf, weg ohne Modul** — der Unterschied ist, wer die Frage «warum nicht?»
beantworten kann. Beim Entwurf kann die Belegmaske sie beantworten: er hat keine Nummer. Beim
abgeschalteten Modul kann sie es nicht — das ist eine Mandanteneinstellung, und ein ausgegrauter
Knopf lüde zu einer Rückfrage ein, auf die diese Maske keine Antwort hat.

**Der Dialog zeigt statt zu fragen, weil eine Mail nicht zurückholbar ist.** «Wirklich senden?»
beantwortet niemand mit Nein — es ist derselbe Klick noch einmal. Was hilft, ist zu sehen, an
welche Adresse es geht und was drinsteht.

**Ohne Adresse öffnet er trotzdem**, weil ein gesperrter Knopf jemanden vor einer Rechnung
stehen lässt, die sich nicht senden lässt, ohne zu sagen warum. Mit Hinweis und leerem Feld ist
die Lage in einem Satz erklärt und in einer Zeile behoben.

**«In den Postausgang gelegt» und nie «gesendet»**, weil der Läufer nachher sendet
(Backend-ADR-0084). Eine Meldung, die mehr behauptet, als geschehen ist, ist eine falsche
Meldung — und die nächste Frage wäre «warum ist sie nicht angekommen, es stand doch gesendet».

**Das leere Passwortfeld heisst unverändert**, weil sonst der erste Anwender, der nur den Port
ändert, sein Passwort löscht. Das Backend liest ein fehlendes Feld genau so; die Maske schickt
es deshalb gar nicht mit.

**Platzhalter zum Anklicken**, weil ein abgeschriebener Platzhalter ein Tippfehler ist und das
Backend ihn beim Speichern zurückweist. Der Katalog ist geschlossen — dann kann er auch angeboten
werden.

**Nur `overridden` unterscheidet mitgeliefert von eigen.** Ohne die Kennzeichnung könnte niemand
einen unangetasteten mitgelieferten Text von einem unterscheiden, der genau so getippt wurde —
und «Auf Standard zurücksetzen» hätte keinen sichtbaren Sinn.

## Alternativen

**Eine Maske «Postausgang» mit drei Registern.** Ein Menüeintrag statt drei. Verworfen: das
Register, das täglich gebraucht wird, läge dann neben zwei, die einmal gebraucht werden, und
ADR-0011 sortiert nach Zuständigkeit, nicht nach Thema.

**Das Mailkonto in die Mandantenmaske.** Es ist eine Mandanteneinstellung. Verworfen: die
Mandantenmaske ist bereits die längste der Anwendung, und ein Passwortfeld zwischen
Rechnungsfusszeile und MwSt-Nummer ist an der falschen Stelle. Dieselbe Bewegung, die den
Modulschalter aus dem Formular geholt hat (ADR-0018).

**Ein zweiter gleichrangiger Knopf «Senden» neben «Drucken».** Am schnellsten zu finden.
Verworfen: sechs Knöpfe in einer Kopfzeile heisst, dass keiner mehr heraussticht.

**Den Senden-Knopf ohne Mailkonto sperren.** Ehrlich in dem Sinn, dass es nicht geht. Verworfen:
gesperrt und unerklärt ist die schlechtere Hälfte davon. Der Dialog öffnet und sagt, wo das Konto
eingerichtet wird.

**Den Versandstatus in der Belegkopfzeile zeigen** («Gesendet am … an …»). Im Issue vorgesehen.
**Nicht gebaut, weil es dafür keinen Endpunkt gibt**: `OutboxManagement.anySentFor` hat keinen
Controller, `OutboxFilter` kennt keinen Quellenfilter, und `OutboxSummaryDto` trägt die
`source_*`-Felder nicht. Im Browser über die Liste nachzurechnen ginge nicht einmal — die
Zeilenantwort enthält die Belegnummer nicht. Nach CLAUDE.md («Das Frontend gehört dazu») wird das
gemeldet statt geraten; es braucht ein Backend-Issue.

**Die Vorlagen mit einem einzigen «Speichern» für alle zwanzig.** Verworfen: gespeichert wird je
Kategorie und Sprache, und ein Sammelspeichern schriebe zwanzig Abweichungen, wo eine gemeint
war — genau die Vorratszeilen, die Backend-ADR-0085 vermeidet.

**Die Statusfarben als eigene Ampel.** Verworfen: vier Zustände, vier `Badge`s aus dem
Designsystem. Wartet und Wird gesendet bleiben neutral, weil sie Feststellungen sind; nur
Gesendet und Fehlgeschlagen sind eine Farbe wert.

## Konsequenzen

- **Der Senden-Weg hängt an zwei Bedingungen**, dem Modul und dem Recht, und beide werden nur
  zum Aufräumen der Maske geprüft. Das Backend antwortet ohnehin — 409 ohne Modul, 403 ohne
  Recht.
- **`lib/outbox.ts` ist die einzige Stelle mit Adressen und Rechten des Moduls.** Vier Masken und
  ein Dialog lesen dieselben Endpunkte; ein zweimal geschriebener Cache-Schlüssel wäre ein Cache,
  der an einer Stelle veraltet (dieselbe Begründung wie bei `modules.ts`).
- **Die Belegkopfzeile sagt weiterhin nicht, ob schon etwas hinausging.** Bis der Endpunkt da
  ist, ist die Antwort der Postausgang. Der Hinweis nach dem Senden verlinkt dorthin.
- **Der Senden-Dialog füllt sich ohne `useEffect`**: die Felder werden aus der Vorschau
  abgeleitet, solange niemand getippt hat. Die Lint-Regel `react-hooks/set-state-in-effect`
  verbietet den naheliegenden Weg, und das zu Recht — abgeleitet ist es auch kürzer.
- **`SalesDocumentPage.test.tsx` hat jetzt eine Sitzung, die je Test gesetzt wird.** Vorher war
  sie eine Konstante mit `tenants: []`; ein Test über einen Modulschalter braucht einen
  Mandanten, der das Modul führt.
- **Die Vorlagenmaske liest die Kategorien aus der Antwort**, nicht aus einer eigenen Liste. Eine
  sechste Kategorie erscheint damit von selbst.
- **Sprachen stehen als Liste in `lib/outbox.ts`.** Eine fünfte Sprache im Backend zeigt die
  Maske als Code statt als Namen an — sichtbar, aber nicht kaputt.
