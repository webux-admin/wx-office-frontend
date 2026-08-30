# ADR-0031 — Ein Ordner der Seitenleiste ist zugleich die Registerleiste seiner Bildschirme

- **Status:** Angenommen
- **Datum:** 2026-08-30
- **Verhältnis:** erfüllt [ADR-0004](ADR-0004-navigation-mit-submenues.md) und
  [ADR-0011](ADR-0011-systemeinstellungen-und-moduleinstellungen.md), löst keines von beiden
  ab. ADR-0004s Kernsatz — «Ein Menüeintrag ist die einzige Stelle, an der die Anwendung sagt,
  was sie kann» — bleibt erfüllt, weil **kein Name aus dem Menü verschwindet**; seine
  Festlegung 4 bleibt gültig, weil `flattenNav` unverändert ist; ADR-0011s Zusage «keine Route
  ändert sich» wird eingehalten, nicht gedehnt. Beide Dateien sind nicht editiert.

## Kontext

Die Seitenleiste zählt 52 Bildschirme, allein «Systemeinstellungen» zwölf Zeilen. Das Bündeln
in Ordner ist der offensichtliche Weg — und genau der, den ADR-0004 misstraut: was hinter
einer Zeile verschwindet, findet niemand mehr.

Randbedingungen:

- **Ein Ordner ist heute keine Route.** Er trägt kein `href`, seine `children` sind eigene
  Bildschirme mit eigenen Adressen.
- **Ein Ordner im Ordner ist ausgeschlossen** — `children` ist `NavEntry[]`, nicht `NavNode[]`.
- Der Filter steht: `visibleNavGroups` prüft Recht, Superuser-Flag und Modulschalter an einer
  Stelle und filtert die Kinder einzeln.
- Die eingeklappte 64-Pixel-Leiste zeigt über `flattenNav` die Bildschirme selbst, nicht die
  Ordner.
- `Tabs.tsx` steht auf acht Bildschirmen und hält sein Register in `useState`.

## Entscheidung

**Ein Ordner ist ab jetzt zugleich die Registerleiste seiner Bildschirme.** Die Leiste wird aus
der Menüquelle **abgeleitet**, nicht gepflegt: `folderFor(pathname, can, runs, superuser)`
liefert den bereits gefilterten Ordner, dessen Kind genau diese Adresse trägt.

**Drei neue Artefakte, keine Änderung am Datenmodell:** `folderFor` in `layout/navigation.ts`,
`components/RegisterNav.tsx` und die pfadlose Layout-Route `layout/RegisterGroupLayout.tsx`.
`NavEntry`, `NavFolder` und `NavGroup` bekommen kein Feld, `NAV_GROUPS` bleibt unangetastet.

**Verglichen wird exakt**, nicht mit `startsWith` wie beim Auffalten: `/belegarten` trägt die
Leiste, `/belegarten/42` nicht.

**Der Ordnerkopf wird klickbar** und führt auf sein erstes **sichtbares** Kind; der Chevron
daneben faltet nur.

**`Tabs.tsx` bleibt unverändert**, auch sein Kopfkommentar.

## Begründung

**Abgeleitet statt gepflegt, weil eine gepflegte Leiste driftet.** Eine zweite Liste neben dem
Menü wäre der zweite Ort, an dem jemand einen Bildschirm vergisst — genau das Argument, mit dem
ADR-0018 die Übersetzungstabelle für Modulcodes verworfen hat.

**Damit trifft ADR-0004s Einwand diese Mechanik nicht.** Er gilt Namen, die *nur* hinter einem
Reiter stehen. Hier bleibt jeder Name eine Zeile im aufgeklappten Ordner **und** ein Symbol in
der eingeklappten Leiste; die Leiste kommt hinzu, sie ersetzt nichts. Und ADR-0011s Einwand
gilt Reitern ohne Adresse — hier trägt jedes Register die Adresse seines Menüeintrags.

**Der eigentliche Gewinn liegt nicht hier.** «Belege» führt heute neun Bildschirme hinter einer
Zeile, ohne Leiste darüber. Dass Bündeln einen Bildschirm nicht mehr unauffindbar macht, ist
die Voraussetzung dafür, in den Folge-Issues Zeilen zu bündeln. Ohne diese eine Mechanik
erfänden fünf Issues fünf eigene.

**Exakt vergleichen, weil eine Vollmaske kein Geschwister ist.** `/belegarten/42` ist nicht
eine der Schwesterseiten, sondern das, wohin eine von ihnen geführt hat. Der Ordner in der
Seitenleiste faltet dort weiterhin auf — das ist eine andere Frage, und `holdsCurrent`
beantwortet sie weiter mit `startsWith`.

**Links, keine Knöpfe — und kein `role="tablist"`.** Diese Register sind Bildschirme: Adresse,
Lesezeichen, Rücktaste, Mittelklick. `role="tablist"` verspräche eine Pfeiltastenbedienung
zwischen Panels *einer* Seite; hier ist es eine Reihe Links auf verschiedene Seiten. Der offene
trägt `aria-current="page"`, was ein Link über sich selbst sagt.

**Zwei Registerarten, und die Grenze steht hier statt in einem zweiten JavaDoc.** `Tabs` schaltet
ein Register *innerhalb* einer Maske, wo die Wahl Zustand des Bildschirms ist und keine zweite
URL für dieselbe Sache wert — für Datensatzmasken bleibt der Kopfkommentar von `Tabs.tsx`
richtig. `RegisterNav` schaltet zwischen Bildschirmen. Die Abgrenzung in `Tabs.tsx` zu
wiederholen hiesse, sie an zwei Orten zu führen; einer davon veraltet.

**Der Ordnerkopf führt irgendwohin, weil eine Zeile, die wie eine Überschrift aussieht und beim
Klick nichts tut, die Zeile ist, die alle zuerst anklicken.** Die Adresse steht nie im
Datenmodell — sie ist das erste Kind, das *diese Sitzung* sehen darf.

**Die pfadlose Layout-Route ist Hausmuster** (`AppShell` hängt genauso), und sie lässt jede
Adresse in Ruhe. Dass `/basisdaten/:liste` zehn Listen in drei Ordnern **und** drei Listen
ausserhalb bedient, ist deshalb ungefährlich: die Leiste entscheidet sich an der Adresse, nicht
an der Route.

## Alternativen

**Das Register als lokaler `useState`,** wie `ProductPage` es hält. Verworfen: diese Register
kommen aus Menüeinträgen mit Adresse und Lesezeichen — Zustand nimmt beides weg.

**Der Query-Parameter `?register=…`,** wie ihn `/profil` als einziger Bildschirm trägt.
Verworfen: dort ist das Register das Detail *eines* Bildschirms, hier ist es der Bildschirm.
Und es ist wörtlich die Variante, die ADR-0004 verworfen hat.

**Neue Sammelpfade wie `/werte/einheiten` mit Umleitung.** Verworfen: ADR-0011 sichert zu, dass
keine Route sich ändert, und eine Umleitungstabelle wäre ein zweiter Ort zum Vergessen.

**Den Ordner auflösen und nur den Sammeleintrag zeigen.** Verworfen: das ist die Rückkehr der
Sammelmaske, die ADR-0004 gerade abgeschafft hat.

**Alle vier stehen hier, damit sie in einem Jahr nicht erneut vorgeschlagen werden.**

## Konsequenzen

- **Die Register eines Bildschirms sind genau seine sichtbaren Geschwister.** Wem ein Recht
  oder ein Modulschalter die Geschwister nimmt, sieht eine Leiste mit einem Register — und das
  ist die ehrliche Auskunft, nicht ein Fehler.
- **Keine Route umbenannt, keine Umleitung, kein Lesezeichen gebrochen.** Fünfzehn Routenzeilen
  sind in einen Block gezogen und eingewickelt; React Router bewertet nach Genauigkeit, nicht
  nach Reihenfolge.
- **Detailrouten bleiben draussen.** Eine Vollmaske trägt keine Registerleiste über sich.
- Die eingeklappte Leiste ist unverändert: `flattenNav` ist nicht angefasst.
- **2/6 bis 6/6 fassen nur noch `navigation.ts` an.** Das ist der Zweck dieser Arbeit.
- Der Ordnerkopf ist jetzt ein Link plus ein Faltknopf statt eines Knopfes. Der Faltknopf trägt
  ein eigenes `aria-label`, weil ein Chevron allein nichts sagt.
- Offen: `RegisterGroupLayout` zeichnet die Leiste über dem `PageHeader`. Ein Bildschirm, der
  seinen Kopf selbst weglässt, bekäme dadurch eine Leiste ohne Überschrift — heute tut das
  keiner der zweiundzwanzig.
