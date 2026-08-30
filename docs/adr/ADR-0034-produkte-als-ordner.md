# ADR-0034 — «Produkte» wird ein Ordner, die Ebene «Verkaufskonditionen» entfällt

- **Status:** Angenommen
- **Datum:** 2026-08-30
- **Verhältnis:** wendet [ADR-0031](ADR-0031-ordner-ist-registerleiste.md) an und **löst
  [ADR-0004](ADR-0004-navigation-mit-submenues.md) in genau einem Satz ab**: dessen Festlegung 3
  nennt als Beispiel «*Verkaufskonditionen* (Zahlungskonditionen, Preisgruppen)» — diesen Ordner
  gibt es nicht mehr, an seine Stelle tritt «Produkte». **Die Festlegung selbst gilt unverändert
  weiter**, ebenso Festlegung 4. [ADR-0011](ADR-0011-systemeinstellungen-und-moduleinstellungen.md)
  bleibt in Kraft. Keine der beiden Dateien wird editiert.

## Kontext

Die Gruppe «Stammdaten» hat vier Knoten: Kunden, Lieferanten, Produkte und den Ordner
«Verkaufskonditionen» mit Zahlungskonditionen, Preisgruppen und Schnellerfassung.

Randbedingungen:

- Das Wort «Verkaufskonditionen» steht **an genau einer Stelle** im ganzen Frontend: als
  Ordnerbeschriftung. Auf keinem Bildschirm, in keinem Text, in keinem Gespräch.
- **Ein Ordner im Ordner ist technisch ausgeschlossen:** `NavFolder.children` ist
  `NavEntry[]`, `isFolder` prüft nur die oberste Ebene, `flattenNav` löst genau eine auf.
- ADR-0011 hält die Verkaufskonditionen bewusst bei den Stammdaten, «weil sie mit Kunden
  vereinbart und laufend gepflegt werden — sie sind Arbeitsdaten, keine Einrichtung».
- Seit ADR-0031 ist ein Ordner zugleich die Registerleiste seiner Bildschirme.

## Entscheidung

**Der Ordner «Verkaufskonditionen» entfällt als Ebene.** An seine Stelle tritt ein Ordner
**«Produkte»** mit vier Kindern in dieser Reihenfolge: Produkte · Preisgruppen ·
Schnellerfassung · Zahlungskonditionen.

**Der Ordner trägt weder `permission` noch `module`.** Die Kinder tragen ihres.

**Ordner und erstes Kind heissen beide «Produkte» und teilen ihr Symbol.**

## Begründung

**Die Reihenfolge ist die Reihenfolge, in der die Dinge entstehen:** erst der Artikel, dann sein
Preis, dann die Abrede, wann er bezahlt wird. Die Preisgruppe steht vor der Schnellerfassung,
weil die Erfassung sie füllt — «Es geht um eine Spalte über viele Produkte» (Backend-ADR-0059).
Heute stand die Zahlungsabrede am Anfang der Kette statt an ihrem Ende.

**Die Ebene entfällt, weil eine dritte niemand mehr fände.** Zwei Klicks tief hinter einem Wort,
das nur im Menü steht, liegt ein Bildschirm faktisch nicht mehr im Menü — davon handelt
ADR-0004. Und technisch wäre sie erst zu bauen: `children` ist `NavEntry[]`.

**Der Ordner heisst nach dem Bildschirm, der ihn eröffnet.** Das ist dieselbe Form, die
«Offene Posten» und «Mahnungen» in derselben Reihe tragen: der Ordnerkopf führt auf das erste
sichtbare Kind, also verspricht der Name genau das, was der Klick hält. Dass die aufgeklappte
Leiste das Wort zweimal untereinander zeigt, ist der Preis — und der kleinere gegenüber einem
erfundenen Oberbegriff.

**Kein `permission` am Ordner**, sonst verschwände «Zahlungskonditionen» für eine Sitzung, die
nur `MASTERDATA_READ` hält. So sieht sie den Ordner mit diesem einen Kind, und der Kopf führt
sie dorthin.

**Arbeitsdaten bleiben Arbeitsdaten:** dieselbe Gruppe, dieselben Rechte, dieselben Adressen,
eine Faltung tiefer. ADR-0011 ist unberührt.

## Alternativen

**«Verkaufskonditionen» als Ordner im Ordner unter «Produkte».** Verworfen — technisch
ausgeschlossen, und fachlich die Ebene, die niemand mehr findet.

**Die Zahlungskonditionen als eigenen flachen Eintrag stehen lassen.** Verworfen: die Gruppe
gewönne keine Zeile, und die Zahlungsabrede stünde neben dem Kunden statt neben dem Preis.

**Die Zahlungskonditionen unter «Werte» in die Systemeinstellungen schieben.** Verworfen: das
kehrte ADR-0011 in genau dem Satz um, den niemand zur Prüfung gestellt hat.

**Den Ordner anders nennen** — «Artikel», «Produkte und Preise». Verworfen: ein Wort ins Menü
zu setzen, das auf keinem Bildschirm steht, ist der Einwand, mit dem ADR-0004 die Sammelmaske
abgeschafft hat.

**Den Eintrag «Produkte» umbenennen.** Verworfen: in dieser Reihe wird kein Bildschirm
umbenannt, und der Rückverweis der Detailmaske hiesse danach anders als der Menüeintrag.

**`permission: 'PRODUCT_READ'` an den Ordner hängen.** Verworfen, siehe oben.

**Alle sechs stehen hier, damit sie in einem Jahr nicht erneut vorgeschlagen werden.**

## Konsequenzen

- «Stammdaten» zeigt drei Zeilen statt vier; die eingeklappte Leiste zeigt weiterhin dieselben
  sechs Bildschirme, «Zahlungskonditionen» als letztes statt als viertes Symbol.
- Wer `/preise-erfassen` öffnet, sieht vier Register statt drei — das erste heisst «Produkte»
  und führt auf die Liste.
- **`/produkte/:id` bleibt draussen**: eine Vollmaske trägt keine Registerleiste über sich, sie
  behält ihre eigenen Reiter.
- Keine Route, keine Beschriftung eines Bildschirms und kein Recht ändert sich; `App.tsx` ist
  nicht angefasst.
- Die Kachel «Preisgruppen» der Übersicht bleibt, wie sie ist: sie führt eine Adresse, und die
  ändert sich nicht. Einen Gruppentitel, der mitwandern müsste, kennt sie nicht.
