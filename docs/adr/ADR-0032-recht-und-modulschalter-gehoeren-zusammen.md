# ADR-0032 — Recht und Modulschalter gehören zusammen, auch abseits der Seitenleiste

- **Status:** Angenommen
- **Datum:** 2026-08-30
- **Verhältnis:** setzt eine Konsequenz von [ADR-0018](ADR-0018-modulliste-in-der-sitzung.md)
  um. ADR-0018 wird weder abgelöst noch geändert; seine Nachschlageform («dieselbe Form wie
  `can`») entscheidet hier sogar, wie der Hook aussieht.

## Kontext

Die Seitenleiste filtert Einträge seit ADR-0018 richtig: `node.module !== undefined &&
!runs(node.module)` blendet aus, was der Mandant nicht betreibt. **Die Adresse tut das
nicht.** Wer `/bestand` tippt oder ein Lesezeichen auf `/mahnvorschlag` öffnet, kommt bei
einem Mandanten ohne das Modul durch.

Randbedingungen:

- **`RequireTenant` kannte nur das Recht.** Elf Masken hingen daran und konnten es gar nicht
  richtig machen.
- Nur zwei Masken prüften den Schalter von Hand — `PartnerPage` und `SalesDocumentPage` —,
  beide mit dem vollen `runsModule(user?.tenants, tenantId, MODUL)`. Vier Argumente Zeremonie
  um eine Frage.
- **Die falsche Auskunft hat zwei entgegengesetzte Formen.** Das Lager zeigt einem Mandanten
  ohne Lager eine vollständige Bestandsliste (die Lese-Endpunkte fragen den Schalter nicht),
  das Mahnwesen eine Fehlermeldung, die wie eine Störung aussieht (409 aus `requireEnabled`).
- Backend-[ADR-0060](https://github.com/webux-admin/wx-office/blob/main/docs/adr/ADR-0060-lager-modulschnitt-und-beleganschluss.md)
  hat die Unterscheidung entschieden: «das Recht sagt, **wer** darf, der Schalter sagt, ob der
  Mandant das Modul **überhaupt betreibt** … 403 schickt einen Administrator auf die Suche
  nach einem Recht, das längst erteilt ist; 409 nennt den Schalter.»

## Entscheidung

**`RequireTenant` bekommt ein optionales `module`.** Die Reihenfolge ist **Mandant → Modul →
Recht**: kein Mandant ergibt `NoTenantNotice`, ein abgeschaltetes Modul die neue
`ModuleOffNotice`, ein fehlendes Recht wie bisher `ForbiddenNotice`. Ohne `module` verhält
sich die Komponente exakt wie vorher.

**`lib/modules.ts` bekommt `useRunsModule()`** — dieselbe Nachschlageform wie `can` — und
**`MODULE_NAMES`** als einzige Quelle des Modulnamens auf dem Bildschirm. Der Typ
`LicensedModuleCode` steht dort; `NavModule` ist von nun an nur ein zweiter Name dafür.

**Elf Stellen bekommen einen Schalter, eine bleibt bewusst ohne.** Acht Lagerbildschirme, der
Mahnvorschlag, die Mahnstopps und das Register «Lager» der Produktmaske. **Die Liste der
ausgestellten Mahnungen bekommt keinen.**

## Begründung

**Das Modul steht vor dem Recht, weil es die genauere Auskunft ist.** «Für diesen Bereich
fehlt das Recht `INVENTORY_READ`» schickt einen Administrator auf die Suche nach einem Recht,
das er längst erteilt hat. Der Schalter ist die Antwort, die weiterhilft — und der Weg dorthin
steht in derselben Meldung.

**Ein Hook statt vier Argumenten.** `runsModule(user?.tenants, tenantId, MODUL)` ist der Grund,
warum die Prüfung in elf Masken schlicht unterblieben ist: sie kostet mehr Zeilen als sie wert
aussieht. `useRunsModule()` kostet eine, wie `can`.

**Ein Katalog für den Namen.** Das Backend hat zwei Wortlaute für dieselbe Sache — *«Das Lager
ist für diesen Mandanten nicht eingeschaltet. Es lässt sich unter «Systemeinstellungen →
Module» einschalten»* gegen *«Der Mandant betreibt das Mahnwesen nicht»* —, und der zweite
nennt den Weg zum Schalter nicht. `MODULE_NAMES` ist ein `Record` über einen abschliessenden
Typ: ein Modul ohne Namen fällt beim Übersetzen auf, nicht auf dem Bildschirm.

**Der Typ zieht nach `lib/`.** Die Seitenleiste brauchte die Liste zuerst, die Masken sind die
zweite Stelle — und von zwei Listen driftet eine. `NavModule` bleibt als Name bestehen, damit
keine Verwendung angefasst werden muss.

**Die Mahnungsliste ist die Ausnahme, und sie ist begründet.** Eine ausgestellte Mahnung ist
Geschäftskorrespondenz nach OR Art. 958f; Backend-ADR-0092 sagt wörtlich, «ein Modulschalter
darf keine Geschäftskorrespondenz verstecken». Die Seitenleiste zieht die Grenze schon: von den
drei Mahneinträgen trägt «Mahnungen» als einziger kein `module`. Die Masken übernehmen das eins
zu eins.

**Das Register der Produktmaske wird abgeleitet, nicht korrigiert.** Fällt das gewählte
Register weg — das Modul wird nebenan abgeschaltet, das letzte Freifeld deaktiviert —, zeigt
die Maske «Hauptdaten» statt einer leeren Seite. Berechnet beim Zeichnen und nicht in einem
Effekt, damit kein Zustand nachgeführt werden muss; der gespeicherte Artikel wird dabei nie
angefasst.

## Alternativen

**Nur `ProductPage.tsx:136` reparieren**, wie der Auftragspunkt es wörtlich verlangt.
Verworfen: es ist derselbe Fehler an zwölf Stellen, und elf davon blieben stehen.

**Die Prüfung in `ProductStock`, `ProductLots` und `StockReservations`.** Verworfen: dieselbe
Regel an vier Orten statt an einem — und `ProductStock.test.tsx` würde rot, dessen Sitzung
`tenants: []` trägt.

**Die Routen in `App.tsx` ummanteln.** Verworfen: eine zweite Bildschirmliste neben der
Seitenleiste, die auseinanderläuft — und das Produktregister hat gar keine Route.

**Den Wortlaut des Backends je Modul abschreiben.** Verworfen: zwei Formen, von denen eine den
Weg zum Schalter verschweigt. Der Satz gehört dorthin, wo er gezeigt wird.

**Die Lese-Endpunkte des Lagers auf 409 ziehen.** Verworfen — und ausdrücklich nicht, weil es
falsch wäre, sondern weil es hier nicht entschieden wird. Backend-ADR-0060 stellt nur die
**schreibenden** Lagerendpunkte auf 409 und sagt über die Lesewege nichts;
Backend-ADR-0086 zieht die Linie sogar andersherum. Das ist eine Backend-Entscheidung mit
eigenem ADR. **Steht hier, damit es in einem Jahr nicht erneut vorgeschlagen wird.**

## Konsequenzen

- `RequireTenant` prüft für elf Masken zusätzlich den Schalter; jede Maske ohne `module`
  verhält sich unverändert, und keine bestehende Prüfung wurde entfernt.
- **`ModulePage` bekommt ausdrücklich kein `module`.** Ein Mandant, der alles abschaltet,
  sperrte sich sonst den Rückweg aus — ADR-0018 hält das schon fest.
- `PartnerPage` und `SalesDocumentPage` behalten ihre Prüfungen von Hand: sie schalten ein
  Panel innerhalb einer Maske, nicht die Maske. Sie liessen sich später auf `useRunsModule`
  umstellen; das ist Aufräumen, keine Fehlerbehebung.
- **Der Bildschirm ist zu, die Antwort dahinter unverändert.** Die Lese-Endpunkte des Lagers
  liefern weiterhin Zahlen, wenn jemand sie direkt aufruft. Das ist Bequemlichkeit, kein
  Schutz — wie jede Rechteprüfung im Frontend.
- Neu abgedeckt: `ProductPage.test.tsx` gab es bisher nicht, die Registerleiste war ungetestet.
- Offen und weitergereicht: die Belegmaske fragt `…/dunning/states` allein am Recht, und
  `dunning.error` wird nirgends gezeichnet — der 409 fällt still. Die Stelle stand nicht unter
  den zwölf und gehört in eine eigene Runde.
