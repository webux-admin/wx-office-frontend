# ADR-0011 — Systemeinstellungen und Moduleinstellungen statt Basisdaten und Einstellungen

- **Status:** Angenommen
- **Datum:** 2026-08-23
- **Verhältnis:** Löst aus [ADR-0004](ADR-0004-navigation-mit-submenues.md) die Festlegung 2
  (Gruppentitel *Basisdaten* und *Einstellungen*) ab. Die übrigen Festlegungen — eine Quelle
  für die Listen, aufklappbare Ordner, die aufgelöste Rail — gelten unverändert.
  Umsetzung von Issue [wx-office#2](https://github.com/webux-admin/wx-office/issues/2).

## Kontext

Die Seitenleiste teilte alles, was eingerichtet statt bearbeitet wird, in *Basisdaten* und
*Einstellungen*. Die Grenze zwischen beiden war keinem Benutzer erklärbar: Warum stehen
Mahnarten unter *Basisdaten*, Belegarten aber unter *Einstellungen*? Beides richtet man einmal
ein, beides gehört fachlich zum Belegwesen.

Dazu kommt die Anforderung aus Issue wx-office#2: künftig entscheidet eine **Lizenz**, welche
Module ein Mandant nutzen darf. Einstellungen, die nur einem Modul gehören, müssen dann mit dem
Modul verschwinden können — was nicht geht, solange sie mit modulübergreifenden Werten in einer
Gruppe gemischt stehen.

## Entscheidung

Die beiden Gruppen werden durch zwei neue ersetzt; **keine Route ändert sich**, nur die
Zuordnung im Menü:

1. **Systemeinstellungen** — Werte, die mehrere Module lesen, dazu die Verwaltung:
   Zahlungsarten, Einheiten, Währungen, MWST-Sätze, Feste Werte, *Weitere Werte* (Sprachen,
   Länder, Rechtsformen, Anreden), Mandanten, Benutzer, Rollen.
2. **Moduleinstellungen** — pro Modul ein Ordner mit dem, was nur dieses Modul liest:
   - **Belege**: Belegarten, Druckvorlagen, Drucker, Nummernkreise, Verrechnungsarten,
     Mahnarten
   - **Produkte**: Produkt-Freifelder, Ertragskonten
3. **Sichtbarkeit der Modulordner über die Rechte**, wie bisher für jeden Eintrag: ein Ordner
   verschwindet, wenn der Benutzer keines der Rechte seiner Bildschirme hat. Das ist der
   Platzhalter für die Lizenzprüfung — kommt die Lizenz, ersetzt oder ergänzt sie diesen
   Filter an derselben Stelle (`allowed` in `AppShell`), ohne dass die Menüstruktur sich
   ändert.

*Übersicht*, *Verkauf* und *Stammdaten* bleiben unverändert; die Verkaufskonditionen
(Zahlungskonditionen, Preisgruppen) bleiben Stammdaten, weil sie mit Kunden vereinbart und
laufend gepflegt werden — sie sind Arbeitsdaten, keine Einrichtung.

## Begründung

Die neue Grenze ist eine Frage mit eindeutiger Antwort: **Wie viele Module lesen den Wert?**
Einer → Moduleinstellungen, mehrere → Systemeinstellungen. Damit ist jede künftige Liste ohne
Diskussion einsortierbar, und die Lizenz kann später ganze Ordner ein- und ausblenden, ohne
dass modulfremde Werte mit verschwinden.

Zuordnung der Grenzfälle:

- **Drucker** stehen bei den Belegen: heute druckt nur das Belegwesen, und eine Belegart
  benennt den Drucker pro Kopie. Druckt später ein zweites Modul, wandern sie in die
  Systemeinstellungen.
- **Ertragskonten** stehen bei den Produkten: zugewiesen wird das Konto am Produkt, die
  Buchhaltung, die es liest, gibt es noch nicht.
- **MWST-Sätze** sind systemweit: Produkte tragen die Kategorie, Belege rechnen mit dem Satz.

## Alternativen

**Zwei Bildschirme statt zwei Gruppen** — eine Maske «Systemeinstellungen» und eine Maske
«Moduleinstellungen» mit Karten oder Reitern. Verworfen: das wäre die Rückkehr der Sammelmaske,
die ADR-0004 gerade abgeschafft hat — unauffindbare Reiter, keine Deep-Links.

**Die bisherigen Gruppen behalten und nur umbenennen.** Verworfen: die Grenze zwischen
*Basisdaten* und *Einstellungen* bliebe willkürlich, und die Lizenz könnte weiterhin keine
Modulordner ausblenden.

**Pro Modul eine eigene Gruppe auf oberster Ebene** («Belege-Einstellungen»,
«Produkte-Einstellungen»). Verworfen: mit jedem Modul wächst die Leiste um eine Überschrift;
als Ordner unter einer Gruppe skaliert dasselbe ohne neuen Platzbedarf.

**Auf die Lizenzprüfung warten und erst dann umbauen.** Verworfen: die Menüstruktur ist die
Voraussetzung der Lizenzanzeige, nicht ihre Folge. Der Rechte-Filter tut bis dahin denselben
Dienst.

## Konsequenzen

- Alle Adressen bleiben gültig; Lesezeichen und Links funktionieren weiter. Es ändert sich
  nur, unter welcher Überschrift ein Eintrag steht.
- Der Ordner *Belegwesen* heisst jetzt *Belege* und liegt unter *Moduleinstellungen*; er nimmt
  Verrechnungsarten und Mahnarten auf, die bisher unter *Basisdaten* standen.
- «Produkte» steht zweimal im Menü: als Stammdaten-Eintrag (die Artikel) und als Modulordner
  (dessen Einrichtung). Das ist gewollt — beide meinen dasselbe Modul.
- Die Lizenzprüfung ist **nicht** gebaut, nur vorbereitet: heute filtern die Rechte. Kommt die
  Lizenz, braucht es einen Backend-Endpunkt, der die freigeschalteten Module nennt, und den
  Anschluss an `allowed` in `AppShell` — beides ein eigenes Vorhaben.
- `navigation.test.ts` prüft die neue Aufteilung: beide Gruppen vorhanden, die alten Titel
  weg, unter *Moduleinstellungen* nur Ordner.
