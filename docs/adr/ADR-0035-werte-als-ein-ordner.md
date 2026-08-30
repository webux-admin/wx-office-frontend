# ADR-0035 — «Werte»: neun Register in einem Ordner, und warum ADR-0004 bleibt

- **Status:** Angenommen
- **Datum:** 2026-08-30
- **Verhältnis:** wendet [ADR-0031](ADR-0031-ordner-ist-registerleiste.md) an.
  [ADR-0004](ADR-0004-navigation-mit-submenues.md) wird **nicht** abgelöst — dieses ADR
  beantwortet seinen Kernsatz, statt ihn zu umgehen.
  [ADR-0011](ADR-0011-systemeinstellungen-und-moduleinstellungen.md) bleibt unberührt: es
  entscheidet die **Gruppe**, hier ändert sich die Ordnung **innerhalb** der Gruppe. Keine der
  beiden Dateien wird editiert.

## Kontext

Die Gruppe «Systemeinstellungen» hielt zwölf Knoten. Eine Sitzung mit allen Mandantenrechten
sah elf Zeilen, ein Superuser zwölf, und vier Listen lagen zusätzlich hinter einem Ordner
«Weitere Werte» mit der Begründung: «Set up once and then left alone, so they sit one fold
deeper than the rest.»

Randbedingungen:

- **Diese Begründung trägt nicht.** Warum eine Sprache seltener gepflegt wird als eine
  Währung, sagt sie nicht — beide werden einmal eingerichtet und dann in Ruhe gelassen.
- **Sieben der elf gepflegten Listen gehören hierher.** Die vier anderen sind modulgebunden und
  stehen bei ihrem Modul, weil sie mit ihm verschwinden können müssen.
- **«MWST-Sätze» läuft auf `PRODUCT_READ`**, nicht auf `MASTERDATA_READ`: die Sätze sind
  eidgenössisch, und wer sie ändert, ändert sie für alle Mandanten.
- ADR-0004 hat die Sammelmaske «Auswahllisten» abgeschafft: «Wer eine Einheit suchte, musste
  wissen, dass ‹Einheiten› ein Reiter auf einer Maske namens ‹Auswahllisten› ist.»

## Entscheidung

**Ein Ordner «Werte»** an erster Stelle der Gruppe, mit **neun Kindern**: die sieben gepflegten
Listen in der Reihenfolge aus `BASIC_DATA_LISTS`, danach «Feste Werte» und «MWST-Sätze».

**«Weitere Werte» entfällt.**

**Der Ordner trägt `permission: MASTER_DATA`**, obwohl das Feld an einem Ordner nicht gelesen
wird.

**Die innere Katalogleiste von «Feste Werte» bleibt.**

## Begründung

**ADR-0004s Einwand trifft nicht mehr zu, und zwar aus drei Gründen — alle aus ADR-0031.** Die
Namen bleiben im Menü sichtbar, eine Faltung tiefer. Jede Liste behält ihre Adresse und ist
verlinkbar; der Ordner klappt auf, sobald ein Kind den aktuellen Pfad trägt. Und die
eingeklappte Leiste zeigt sie weiter einzeln, weil `flattenNav` Ordner auflöst — Festlegung 4
bleibt erfüllt. Was verschwindet, ist ein Name, den es nur im Menü gab.

**«Weitere Werte» entfällt, weil seine Begründung nicht trägt.** Ein Ordner, der nicht sagen
kann, warum gerade diese vier tiefer liegen, ist eine Faltung ohne Regel.

**Zwei Leisten übereinander auf «Feste Werte» sind richtig, weil sie Verschiedenes tun.** Die
äussere wechselt den **Bildschirm** und damit die Adresse; die innere den **Katalog innerhalb**
eines Bildschirms, und der bleibt lokaler Zustand. Achtzehn Register nebeneinander wären die
Sammelmaske, die ADR-0004 abgeschafft hat.

**Die MWST-Sätze gehören hierher, obwohl sie ein anderes Recht tragen.** Sie und «Feste Werte»
zeigen aufeinander: der Satzbildschirm verlinkt die festen Werte, und der Katalog
«MwSt-Behandlung» schreibt zurück «Die Sätze selbst sind eidgenössisch und stehen unter
Mehrwertsteuer.» Ein Satz ist ein Wert wie ein anderer.

**Das abweichende Recht übersteht die Faltung**, weil `allowed()` das Ordnerrecht nicht liest
und die Kinder einzeln filtert: eine Sitzung mit `PRODUCT_READ` allein sieht «Werte» mit diesem
einen Register.

**Das `permission` am Ordner bleibt trotzdem stehen** — wie bei «Weitere Werte» vorher: es sagt,
wem der Ordner gehört. Ohne es wäre «Werte» der einzige Ordner der Gruppe ohne Zuordnung. Damit
die Zusicherung nicht an einer ungeprüften Stelle hängt, nagelt ein Test genau diesen Fall
fest: wer `allowed()` eines Tages «richtigstellt» und das Ordnerrecht auswertet, bekommt ihn
rot — und nimmt dann das Recht vom Ordner, statt das Register aus dem Ordner zu nehmen.

## Alternativen

**Die neun Kataloge als Register der äusseren Leiste.** Verworfen: achtzehn Register
nebeneinander.

**«Weitere Werte» als zweiten Ordner daneben behalten.** Verworfen: die Frage, warum Sprachen
tiefer liegt als Währungen, bliebe unbeantwortbar.

**Ein Sammelpfad `/werte/<slug>` mit Umleitung von `/basisdaten/<slug>`.** Verworfen: ADR-0011
sichert zu, dass keine Route sich ändert.

**Den Ordner ohne `permission` bauen.** Verworfen, siehe oben.

**Die MWST-Sätze zum Mandanten schieben.** Verworfen: die Sätze sind eidgenössisch.

**Alle fünf stehen hier, damit sie in einem Jahr nicht erneut vorgeschlagen werden.**

## Konsequenzen

- Die Gruppe zeigt sechs Zeilen statt elf, einem Superuser sieben statt zwölf, ohne Postausgang
  fünf statt zehn — bei gleich bleibenden fünfzehn Bildschirmen.
- **Alle elf gepflegten Listen stehen jetzt in einem Ordner**, verteilt auf drei: «Werte»,
  «Belege» und «Produkte». Die Registerleiste beweist damit ihren Zweck: eine Route,
  `/basisdaten/:liste`, und drei verschiedene Geschwisterreihen — entschieden an der Adresse.
- `flattenNavHoldsTheValuesFolderTest` ist der einzige Test, der eine falsche Reihenfolge, ein
  vergessenes Kind oder einen Ordner an zweiter Stelle rot macht.
  `navGroupsCoverEveryBasicDataListTest` kann keines der drei sehen: er flacht ab.
- Auf `/feste-werte` stehen zwei Leisten übereinander — oben neun Register, unten neun
  Kataloge.
- Kein Bildschirm gebaut, umbenannt oder verschoben; nur der Knoten, unter dem ein Menüeintrag
  hängt.
