# ADR-0017 — Die Zählmaske wird unterhalb `sm` zur Kartenansicht, und bleibt die einzige

- **Status:** Angenommen
- **Datum:** 2026-08-27
- **Erweitert:** [ADR-0016](ADR-0016-zeilenweises-speichern-in-der-zaehlmaske.md). Dort steht
  als noch offen: «unterhalb `sm` ist die Tabelle heute waagrecht rollbar statt als
  Kartenansicht gebaut. Die Kartenansicht wäre die erste im ganzen Frontend; sie bleibt eine
  eigene Entscheidung.» Das ist diese Entscheidung.

## Kontext

Alle Masken dieses Frontends sind Schreibtischarbeit. Wo eine Tabelle zu breit wird, rollt sie
waagrecht — eine Regel, die für Belege, Partner, Produkte und Bewegungen ohne Nachteil gilt,
weil dort gelesen und mit der Maus geklickt wird.

Die Zählmaske ist die einzige Maske des Plans, die **im Regal** bedient wird: Telefon in der
einen Hand, Ware in der anderen. Dazu kommt ein Unterschied, den keine andere rollende Tabelle
hat: **eine Spalte wird getippt.** Ein Mengenfeld, das halb aus dem Sichtfenster ragt, während
die Tastatur des Geräts die untere Hälfte des Bildschirms belegt, ist nicht bedienbar — und
waagrecht rollen, während man tippt, geht nicht.

Randbedingungen:

- Issue #22 verlangt wörtlich: «Unterhalb `sm` ist die Zählmaske ohne Zoom und ohne Maus
  vollständig bedienbar, **auf derselben Route**.»
- Ein Eingabefeld mit weniger als **16px** Schriftgrösse lässt mobile Safari beim Fokussieren
  in die Seite hineinzoomen. Danach rollt der Anwender waagrecht — genau der Zustand, den die
  Kartenansicht abschaffen soll.
- Der geteilte `TextField` zeichnet mit `text-[14px]`, `h-10` und `outline-none`; den Fokus
  zeigt `Field` als animierte Unterstreichung statt als Ring.
- Die ganze Zähllogik liegt seit dieser Runde in **einem** Haken, `useCountEntry` — tippen,
  senden, scheitern, erneut senden, vor dem Überschreiben fragen, nächste offene Zeile.
- Der Kamera-Scan der Maske steht über den Zeilen, und ein Scan, der nichts trifft, leert die
  Liste darunter.

## Entscheidung

**Unterhalb 640px zeigt dieselbe Route dieselben Zeilen als Karten**: ein Produkt je Karte,
Bezeichnung gross, ein grosses Zahlenfeld mit `inputMode="decimal"`, darunter «Weiter zur
nächsten offenen Zeile».

**Genau eine Ansicht ist gemountet.** Welche, beantwortet `useWideEnoughForTheTable()` über
`window.matchMedia('(min-width: 640px)')` — nicht CSS.

**Die Logik steht einmal.** Beide Ansichten rufen `useCountEntry`; sie selbst sind Markup und
Verdrahtung.

**Das Mengenfeld der Karte ist handgeschrieben**, nicht der geteilte `TextField`: `h-14`,
20px, kein `outline-none`.

**Kamera, Sprungfeld und Blätterleiste hängen in der Maske über beiden Ansichten**, nicht in
einer von ihnen.

**Das bleibt die einzige Kartenansicht des Frontends.** Jede weitere ist ein neues ADR.

## Begründung

**Eine Route, eine Logik.** Zwei Routen wären zwei Orte für denselben Fehler — und die
Zähllogik ist der heikelste Code der Maske: sie sendet je Zeile, merkt sich, was der Server
schon hat, fragt vor dem Überschreiben und trägt den Fokus weiter. Dass es wirklich eine Logik
ist, prüfen die Tests von `useCountEntry`, die **jeden Fall zweimal** fahren, einmal je
Ansicht.

**Gemountet statt versteckt, weil ein Feld kein Text ist.** Ein `hidden sm:block`-Paar hätte
beide Ansichten im DOM: jede Zeile hätte **zwei** Mengenfelder mit derselben Beschriftung,
`Enter` trüge den Fokus in das unsichtbare, `data-count-index` wäre doppelt vergeben, der
Kamerasprung träfe die falsche Hälfte, und ein Screenreader läse die Liste zweimal vor. Bei
einer reinen Lesetabelle wäre das nur unschön; hier ist es falsch.

**640px ist keine neue Grenze**, sondern `sm` aus Tailwind — dieselbe Zahl, nach der sich das
ganze Frontend richtet. Gefragt wird sie in JavaScript, weil die Antwort darüber entscheidet,
was **gebaut** wird und nicht nur, was man sieht; dasselbe Verfahren nutzt schon die
Seitenleiste (`layout/useSidebarCollapsed.ts`). Wo `matchMedia` fehlt — Testrenderer, alter
Browser — gilt die Tabelle: das ist die Ansicht, die diese Maske vorher hatte, und eine
fehlende Medienabfrage ist kein Grund, einem Schreibtisch das Telefonlayout zu geben.

**Das Feld ist von Hand geschrieben, weil drei Dinge zusammenkommen.** 14px lassen mobile
Safari beim Fokus zoomen, und «ohne Zoom bedienbar» ist ein Akzeptanzkriterium, kein Wunsch.
40px Höhe sind für einen Daumen über einer Palette zu wenig; die Karte nimmt 56px. Und
`outline-none` nimmt genau den Ring weg, der auf einem Gerät in der Sonne das Sichtbarste ist —
die Karte lässt den 2px-Ring aus `index.css` stehen. Der Preis ist bekannt und steht als
Kommentar am Feld: dieses eine Feld wandert nicht mit, wenn sich das Designsystem ändert.

**Kamera und Blätterleiste gehören der Maske**, weil sie beide Ansichten überleben müssen. Ein
Scan, der nichts trifft, macht die Liste leer — und genau in diesem Moment muss die Meldung
lesbar bleiben und der Knopf für den nächsten Artikel stehen. Läge er in der Ansicht,
verschwände er mit ihr.

**Und sie bleibt die einzige.** Eine zweite Ansicht kostet dauerhaft: zeichnen, testen, gleich
halten. Diesen Preis rechtfertigt nur eine Maske, in die an einem Telefon **eingegeben** wird.
Für alle übrigen gilt weiter die Regel aus ADR-0016: die Tabelle rollt waagrecht.

## Alternativen

**Eine zweite Route** (`/inventuren/:id/zaehlen`). Verworfen: das Akzeptanzkriterium verlangt
dieselbe Route, und zu Recht — ein Link, den jemand im Team weitergibt, hinge sonst am Gerät
des Absenders. Dazu zwei Masken mit zwei Statusleisten, zwei Rückwegen und zwei Ladepfaden für
dieselben Daten.

**Ein reiner CSS-Umschalter** (`hidden sm:block` neben `sm:hidden`). Verworfen: beide Ansichten
stehen dann im DOM. Zwei Mengenfelder je Zeile, doppelte Vorlesung, kaputte Fokusreihenfolge.

**Die Tabelle waagrecht rollen lassen wie überall sonst.** Verworfen: die Spalte, die getippt
wird, ist die schmalste und steht rechts. Mit offener Tastatur bleibt ein Streifen, und der
Anwender rollt zwischen zwei Zeilen hin und her.

**Den geteilten `TextField` um eine Grössenvariante erweitern** und ihn hier gross verwenden.
Verworfen, vorerst: eine Variante am geteilten Feld ist eine Änderung für alle Masken, und sie
wegen einer einzigen einzuführen dreht die Reihenfolge um. Verlangt eine zweite Maske ein
grosses Feld, ist die Variante richtig — und dann verschwindet das handgeschriebene hier.

**Eine eigene Anwendung fürs Lager** (schlanke PWA nur zum Zählen). Verworfen: eine zweite
Anwendung, ein zweiter Anmeldeweg und ein zweiter Satz Rechte für eine Maske.

**Die Kartenansicht auch oberhalb `sm` anbieten**, wahlweise. Verworfen: eine Umschaltung, die
am Schreibtisch niemand braucht, und ein Zustand mehr, den die Maske sich merken müsste.

## Konsequenzen

- **Zwei Ansichten, eine Logik.** Jede Verhaltensänderung wird einmal geschrieben und zweimal
  gezeichnet. Wer eine Zeile in `useCountEntry` ändert, sieht beide Testläufe ausschlagen — das
  ist die Absicht.
- **Markup steht doppelt, Logik nicht.** Leerbild, Fusszeile «gezählt von» und die Hülle des
  Überschreiben-Dialogs sind in beiden Dateien geschrieben, um genuin verschiedene Layouts
  herum. Das bleibt so, solange es Markup ist.
- **Ein Wechsel über die 640px-Grenze mountet die andere Ansicht neu.** Ein getippter, noch
  nicht gesendeter Wert überlebt das nicht verlässlich. Im Regal kommt das nicht vor, am
  Schreibtisch beim Verkleinern des Fensters schon.
- **Das grosse Feld ist vom Designsystem abgekoppelt.** Ändert sich dort die Farbe eines
  Randes, ändert sie sich hier nicht mit. Deshalb steht der Grund als Kommentar am Feld und
  nicht nur hier.
- **Der Kamera-Scan ist damit eingehängt** — der in ADR-0016 und im Backend-ADR-0070 als noch
  offen vermerkte Punkt. Er steht in der Maske über beiden Ansichten und ist auf dem Telefon
  ohne Rollen erreichbar; der Handscanner füllt weiterhin dasselbe Sprungfeld.
- **Die Blätterleiste steht unter beiden Ansichten.** Eine Zählung über einen ganzen Lagerort
  läuft über mehr als eine Seite, und eine Zeile, die man nicht erreicht, zählt man nicht.
- **Wer eine zweite Kartenansicht will, schreibt ein ADR.** Diese Entscheidung ist ausdrücklich
  eine Ausnahme und kein Muster, das ab jetzt angewendet wird.
