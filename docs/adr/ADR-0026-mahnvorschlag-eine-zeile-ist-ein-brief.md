# ADR-0026 — Mahnvorschlag: eine Zeile ist ein Brief, und noch keine Auswahl

- **Status:** Angenommen
- **Datum:** 2026-08-29

## Kontext

Das Backend liefert den Arbeitsvorrat des Mahnwesens: welche Briefe hinausgingen, und warum die
übrigen nicht
([Backend-ADR-0096](https://github.com/webux-admin/wx-office/blob/main/docs/adr/ADR-0096-arbeitsvorrat-statt-mahnlauf.md)).

Randbedingungen:

- **Ein Kandidat trägt immer eine Liste von Rechnungen.** Die Einzelmahnung ist der Fall «Liste
  mit einem Eintrag»; welche Betriebsart sie erzeugt hat, sieht man ihr nicht an.
- **Jede übersprungene Rechnung trägt einen Grund.**
- **Es lässt sich noch nichts ausstellen.** Das Ausstellen ist das nächste Issue und hat ein
  eigenes Recht (`DUNNING_RUN`).
- Der Stichtag ist ein Parameter der Abfrage.

## Entscheidung

**Der Mahnvorschlag steht unter *Verkauf*, hinter den Rechnungen** — nicht unter
*Moduleinstellungen*. Er trägt `module: 'DUNNING'` und verschwindet mit dem Schalter.

**Eine Zeile ist ein Brief.** Bei mehr als einer Rechnung lässt sie sich zu ihnen aufklappen.

**Übersprungene Fälle stehen in einem eigenen Abschnitt**, jeder mit seinem Grund im Klartext
und, wo es einen gibt, mit dem Zusatz («frühestens am …»).

**Ein Banner über der Liste, wenn ein Grund durch eine Einstellung behebbar ist** — und **nur**
dann. Gründe, die von selbst vergehen, kommen nicht ins Banner.

**Es gibt keine Auswahlspalte.** `DataTable` bleibt unverändert.

**Der Stichtag steht im Kopf der Seite** und ist zugleich die Vorschau.

## Begründung

**Unter *Verkauf*, weil Geld eintreiben Tagesarbeit ist** und das Einrichten des Mahnwesens
nicht. Hinter den Rechnungen, weil der Vorschlag genau dort anschliesst: was verrechnet und
nicht bezahlt wurde.

**Eine Zeile ist ein Brief**, weil das ist, was hinausgeht. Eine Liste, in der man Rechnungen
ankreuzt und Briefe bekommt, nennt im Bestätigungsdialog zwangsläufig zwei verschiedene Zahlen,
und «zwei der drei Rechnungen desselben Briefs» hat keine Bedeutung. Die Aufklappzeile zeigt
trotzdem jede Rechnung, weil «warum schuldet der 3'750» eine Frage ist, die sofort kommt.

**Ein eigener Abschnitt für die Übersprungenen**, damit der obere Teil das ist, was zu tun
wäre. Sie ganz wegzulassen wäre falsch: eine Liste, die stillschweigend Zeilen auslässt, lässt
sich nicht prüfen.

**Das Banner nur für Behebbares.** «Noch nicht fällig» in einem Banner zu melden erzieht dazu,
Banner zu übersehen — und dann fehlt die Warnung an dem Tag, an dem sie zählt.

**Keine Auswahlspalte, und das ist die bewusste Abweichung vom Issue.** Das Issue verlangt, die
Mehrfachauswahl in `DataTable` vorzubereiten. **Eine Auswahl ohne Knopf ist Dekoration:** man
kreuzt an und nichts geschieht. Schlimmer noch, sie legt fest, wie die Auswahl aussieht, bevor
der Freigabedialog existiert, der als Einziger weiss, was er mit ihr anfängt. Die Änderung an
`DataTable` — dem einzigen fachfreien Baustein, den das Issue anfassen wollte — kommt mit dem
Ausstellen, zusammen mit dem, was sie auslöst.

**Der Stichtag ist die Vorschau**, weil es ihn ohnehin gibt. Ein zweiter, nicht auswählbarer
Abschnitt «demnächst fällig» machte die Liste nur länger.

## Alternativen

**Der Mahnvorschlag unter *Moduleinstellungen*, beim Rest des Mahnwesens.** Verworfen: dort
stehen die Einstellungen, und dieser Bildschirm wird täglich benutzt.

**Eine Zeile ist eine Rechnung, Briefe entstehen erst beim Ausstellen.** Verworfen: dann zeigt
der Vorschlag etwas anderes an, als hinausgeht.

**Übersprungene Zeilen ausblenden, mit einem Zähler «12 übersprungen».** Verworfen: der Zähler
beantwortet die Frage nicht, die er aufwirft.

**Ein Banner für jeden Überspringgrund.** Verworfen: siehe Begründung.

**Die Auswahlspalte jetzt bauen.** Verworfen für diesen Schritt — siehe Begründung. Sie ist
nicht vergessen, sie ist verschoben, und zwar an die Stelle, an der sie etwas auslöst.

## Konsequenzen

- **`DataTable` bleibt unangetastet.** Die Mehrfachauswahl kommt mit dem Ausstellen.
- **Die Liste ist heute nur zu lesen.** Sie beantwortet «wer schuldet mir was, seit wann, und
  was wäre der nächste Schritt» — für sich allein wertvoll.
- **Die Mahnstufe steht in keiner Belegliste.** Der Endpunkt dafür steht
  (`GET …/dunning/states`), aber die Rechnungsliste benutzt ihn noch nicht: solange nichts
  ausgestellt wird, wäre die Spalte in jeder Zeile leer. Sie kommt mit dem Ausstellen, und dann
  ohne serverseitiges Sortieren — das ist der Preis der Modulgrenze, und er steht im
  Backend-ADR.
- **Ein Test musste geschärft werden.** `navGroupsCoverEverySalesDocumentTest` verglich die
  ganze Gruppe *Verkauf* mit der Belegarten-Tabelle und verbot damit nebenbei jeden Eintrag, der
  kein Beleg ist. Er prüft jetzt, was er zu prüfen behauptet: dass keine Belegart im Menü fehlt.
- **Kein Dashboard-Abschnitt «Zu mahnen».** Das Issue nennt ihn; er ist weggelassen, solange der
  Vorschlag zu nichts führt. Eine Kachel, die auf eine Liste zeigt, auf der man nichts tun kann,
  ist eine Kachel zu viel — sie kommt mit dem Ausstellen.
