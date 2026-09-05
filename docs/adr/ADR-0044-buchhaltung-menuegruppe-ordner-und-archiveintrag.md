# ADR-0044 — Die Buchhaltung bekommt eine eigene Menügruppe, einen Ordner unter Moduleinstellungen und einen Archiveintrag, den der Modulschalter nicht versteckt

- **Status:** Angenommen
- **Datum:** 2026-09-02
- **Verhältnis:** setzt Backend-ADR-0110 und Backend-ADR-0119 um. Führt
  [ADR-0032](ADR-0032-recht-und-modulschalter-gehoeren-zusammen.md) fort — die Reihenfolge
  Mandant → Modul → Recht in `RequireTenant` — und ordnet nach der Regel von
  [ADR-0011](ADR-0011-systemeinstellungen-und-moduleinstellungen.md) ein. Ändert an
  [ADR-0018](ADR-0018-modulliste-in-der-sitzung.md), ADR-0011 und ADR-0032 nichts.
- **Umfang:** Von den drei Bausteinen im Titel baute die erste Auslieferung (#89) **nur den
  mittleren**, den Ordner. Menügruppe und Archiveintrag wurden dort entschieden und begründet,
  damit die Entscheidung einmal fällt und nicht dreimal — gebaut werden sie mit den
  Auslieferungen, die ihnen einen Inhalt geben. **Die Menügruppe ist mit #92 gebaut; Abschnitt 5
  ist dort nachgetragen.** Der Archiveintrag folgt mit #94.

## Kontext

Das Backend hat `accounting` als fünftes schaltbares Modul geschnitten: ein Schalter, fünf
Rechte, eine Einstellungszeile je Mandant, sonst nichts. Es bucht in diesem Stand nichts, legt
kein Konto an, und `GET /settings` ist der einzige Leseweg.

Damit standen drei Fragen an der Navigation, die sich gegenseitig bedingen und deshalb zusammen
beantwortet werden: **Wo steht der eine Bildschirm, den es gibt? Bekommt die Buchhaltung schon
jetzt eine eigene Menügruppe? Und was tut der Modulschalter mit dem Menü, wenn er ausgeht?**

Dazu eine Eigenheit dieser Auslieferung: die Migration hat die fünf Rechte **keiner Rolle**
zugeteilt, auch nicht dem Administrator. Nach dem Einschalten hält in einem bestehenden
Mandanten also niemand die Buchhaltungsrechte — reparierbar nur von jemandem, der es weiss.

## Entscheidung

### 1. Ein Ordner «Buchhaltung» unter Moduleinstellungen, mit einem Eintrag «Zustand»

| | |
| --- | --- |
| Menüpfad | Moduleinstellungen → Buchhaltung → Zustand |
| Route | `/buchhaltung/einstellungen` |
| Recht | `ACCOUNTING_READ` |
| Modulschalter | `module: 'ACCOUNTING'` auf **Ordner und Eintrag** |

Der Ordner steht unter **Moduleinstellungen**, weil die Sortierregel von ADR-0011 fragt, ob ein
Wert eingerichtet oder täglich damit gearbeitet wird. Ein Zustandsbildschirm wird einmal
gelesen. Was täglich gebraucht wird — buchen, Journal, Auswertungen — bekommt die eigene
Gruppe, nicht diesen Ordner.

Der Schalter sitzt **auf beiden**, auf dem Ordner und auf dem einzigen Kind. Ohne Modul
verschwindet der Ordner über `visibleNavGroups`; die von Hand getippte Adresse fängt
`<RequireTenant permission module>` ab. Dessen Reihenfolge ist **Mandant → Modul → Recht**, und
das ist die richtige: wer das Modul nicht betreibt, soll «Modul nicht eingeschaltet» lesen und
nicht «keine Berechtigung». Der Satz über ein fehlendes Recht schickt einen Administrator auf
die Suche nach einer Berechtigung, die er längst erteilt hat (ADR-0032).

**Der Eintrag heisst «Zustand» und wird ab #91 «Einstellungen» heissen, die Adresse bleibt.**
Eine Beschriftung zu ändern ist billig, eine Adresse, die sich Leute gemerkt und in ein
Lesezeichen gelegt haben, ist es nicht.

### 2. In diesem Stand gibt es **keine** Menügruppe «Buchhaltung»

`visibleNavGroups` wirft eine Gruppe weg, sobald nichts mehr darin steht — **eine leere Gruppe
kann es technisch gar nicht geben.** Die Gruppe müsste also Einträge tragen, und die zeigten
auf Bildschirme, die diese Auslieferung nicht baut: ein Versprechen, das sie nicht hält.

`navigation.test.ts` hält den Zustand mit `accountingHasNoOwnGroupYetTest` fest, damit die
Gruppe später bewusst entsteht und nicht nebenbei. **#92 trägt sie nach**, zusammen mit dem
ersten Bildschirm, der etwas buchen kann, und dem Journal, in dem man das Gebuchte wiederfindet;
wie sie aussieht, steht in Abschnitt 5.

### 3. Der Archiveintrag, den der Schalter nicht versteckt — #94

`/buchhaltung/archiv` bekommt als einziger Eintrag der Buchhaltung **kein** `module`-Feld.
**GeBüV Art. 6 Abs. 1** verlangt, dass die Geschäftsbücher von einer berechtigten Person
eingesehen und geprüft werden können; berechtigt ist, wer das Leserecht hält — nicht, wer den
Modulschalter bedienen darf. Hinge das Archiv am Schalter, hätte eine Person mit
`ACCOUNTING_READ` und ohne Adminrecht keine Route zu den zehn Jahre aufzubewahrenden Büchern.
Die Linie ist dieselbe, die bei den ausgestellten Mahnungen bereits gezogen wurde (ADR-0032):
ein Modulschalter versteckt keine Buchungsbelege.

**Nicht in dieser Auslieferung**, und nicht aus Zeitgründen: in diesem Stand ist nichts gebucht.
Ein Archiv ohne Inhalt, das man nicht abschalten kann, erklärt niemandem etwas.

### 4. Der Rechte-Hinweis wird einmal gebaut und an zwei Stellen eingehängt

`components/MissingAccountingRightsNotice.tsx` sagt «Keine Rolle dieses Mandanten trägt die
Buchhaltungsrechte.» und verlinkt auf Benutzer → Rollen. Er hängt am **Zustandsbildschirm** und
am **Modulbildschirm** direkt nach dem Einschalten — dort steht der Administrator ohnehin.

Er ist eine Aussage über die **Rollen des Mandanten**, nicht über die Sitzung, und erscheint
genau dann, wenn drei Dinge zusammentreffen: die Sitzung hält `USER_READ`, `GET /roles` hat
geantwortet und keine Rolle trägt eines der fünf Rechte, und es liegt kein `blocker` vor.

**Seine Quelle ist `GET /roles`, nicht ein Feld am `AccountingSettingsDto`.** Der Satz ist eine
Aussage über `role_permission`, und diese Tabelle gehört dem Backend-Modul `user`; `accounting`
liest keine fremden Tabellen und bekommt für einen Hinweistext keine Kante. Im Browser stehen
beide Endpunkte ohnehin nebeneinander — das kostet keinen neuen Endpunkt, keine Replikation und
keine Modulkante.

### 5. Die Menügruppe «Buchhaltung» — nachgetragen mit #92

Sie entsteht in `layout/navigation.ts` mit genau drei Einträgen:

| Beschriftung | Route | Recht | Modul |
| --- | --- | --- | --- |
| Buchen | `/buchhaltung/buchen` | `ACCOUNTING_WRITE` | `ACCOUNTING` |
| Entwürfe | `/buchhaltung/entwuerfe` | `ACCOUNTING_READ` | `ACCOUNTING` |
| Journal | `/buchhaltung/journal` | `ACCOUNTING_READ` | `ACCOUNTING` |

**Warum sie erst jetzt entsteht und nicht in #88 oder #89.** Beide Auslieferungen haben sie
ausdrücklich weggelassen, und Abschnitt 2 hält den Grund fest: `visibleNavGroups` wirft eine
Gruppe weg, sobald nichts mehr darin steht — **eine leere Gruppe kann es technisch gar nicht
geben**. Die Gruppe hätte also Einträge tragen müssen, und die zeigten auf Bildschirme, die es
nicht gab. Ein Menüeintrag, der auf nichts zeigt, ist die Enttäuschung mit Ankündigung, die
dieselbe Überlegung auch für den Eintrag «Abschluss» verwirft. #92 ist die erste Auslieferung, in
der es etwas zu tippen und etwas nachzulesen gibt; darum gehören die drei Einträge und die Gruppe
in dieselbe Lieferung.

**Warum sie zwischen «Verkauf» und «Lager» steht.** Die Reihenfolge der Gruppen ist die des
Arbeitstags, nicht die des Alphabets: Übersicht, dann was verkauft wird, dann was gebucht wird,
dann was liegt, danach die Stammdaten und zuletzt die Einstellungen. Die Buchhaltung steht
**hinter** dem Verkauf, weil sie ihm folgt — gebucht wird, was fakturiert wurde —, und **vor**
dem Lager, weil sie das Hauptbuch führt und das Lager ein Hilfsbuch ist. Beide Gruppen standen
bisher unmittelbar hintereinander; ans Ende gesetzt wäre die Buchhaltung unter Stammdaten und
Einstellungen gerutscht, und die tägliche Arbeit stünde dann hinter der Einrichtung.

**`NavGroup` trägt kein `module`-Feld**, und das bleibt so. Der Typ ist
`{ title: string; entries: NavNode[] }` — mehr nicht. Die Gruppe verschwindet dadurch, dass
`visibleNavGroups` ihre Einträge einzeln prüft und die Gruppe wegwirft, sobald keiner übrig
bleibt. Ohne den Modulschalter fallen alle drei Einträge, und damit ist die ganze Gruppe fort,
ohne dass irgendwo ein zweites Mal `ACCOUNTING` steht. Ein `module` an der Gruppe wäre genau
diese zweite Stelle — und die erste, die jemand vergisst, wenn ein Eintrag ohne Schalter
dazukommt. Der Archiveintrag aus #94 ist dieser Fall: er trägt kein `module`-Feld, und die Gruppe
bleibt dann mit ihm allein stehen. Das ist gewollt und ginge nicht, wenn der Schalter an der
Gruppe hinge.

Der Ordner «Buchhaltung» unter Moduleinstellungen bleibt daneben bestehen. Die Regel von
ADR-0011 trennt die beiden sauber: eingerichtet wird im Ordner, gearbeitet wird in der Gruppe.

**`NavCounterKey` bleibt unverändert.** Der Zähler `ACCOUNTING_DRAFTS` am Eintrag «Entwürfe» und
die Verallgemeinerung von `AppShell.NavItem` — das heute fest `useNavCounters` aus
`lib/clearing.ts` ruft — sind Arbeit von #94. Ein Zähler, der eine zweite Quelle in die
Seitenleiste einzieht, ist eine eigene Entscheidung und keine Beigabe zu einer Menügruppe
(ADR-0043).

## Verworfene Alternativen

**Die Menügruppe schon jetzt anlegen, mit einem Platzhaltereintrag.** Ein Versprechen ohne
Bildschirm dahinter. Der Platzhalter wäre der einzige Inhalt einer Gruppe, die dadurch nur
existiert, um nicht leer zu sein.

**Den Ordner ohne `module`-Feld bauen und nur das Recht prüfen.** Dann sieht der Administrator
eines Mandanten ohne Buchhaltung — und Administratoren halten alle Rechte — einen Ordner, der
nichts tut, und dahinter eine Maske, die ihm «Modul nicht eingeschaltet» sagt. Das Menü soll
zeigen, was dieser Mandant betreibt.

**Den Rechte-Hinweis an die Sitzung hängen («Ihre Rolle trägt die Rechte noch nicht»).** Das ist
eine andere Aussage — eine fremde Rolle kann die Rechte sehr wohl halten — und sie beantwortet
die Frage nicht, um die es geht: ob in diesem Mandanten überhaupt jemand buchen darf.

**Den Rechte-Hinweis auch ohne `USER_READ` zeigen.** Ein Schloss ohne Schlüssel: wer die Rollen
nicht lesen darf, kann sie auch nicht ändern. Der Hinweis erzeugte eine Rückfrage und keine
Abhilfe. Deshalb wird die Rollenliste in dem Fall gar nicht erst geladen.

**Die Route `/buchhaltung/zustand` und später ein Umzug auf `/buchhaltung/einstellungen`.** Die
Beschriftung wechselt mit #91 ohnehin; eine Route, die mitwechselt, kostet die Nutzer ihre
Orientierung und die Lesezeichen ihre Gültigkeit. Die Adresse trägt den Endzustand von Anfang
an — dieselbe Überlegung, mit der ADR-0037 die Zahlungen gleich in einen Ordner mit einem
einzigen Kind gelegt hat, statt das Menü zweimal zu bauen.

**Den Archiveintrag ebenfalls am Schalter hängen.** Verletzte GeBüV Art. 6 Abs. 1 und wäre
zudem widersprüchlich: der Endpunkt dahinter bleibt aus demselben Grund auch abgeschaltet offen.

**`NavGroup` ein `module`-Feld geben** (nachgetragen mit #92). Es läse sich sauberer als drei
Einträge, die denselben Code tragen, und wäre die zweite Stelle, an der `ACCOUNTING` steht. Die
erste Gruppe, die einen Eintrag **ohne** Schalter bekommt — das Archiv in #94 —, verschwände
damit mitsamt dem Eintrag, den GeBüV Art. 6 Abs. 1 gerade sichtbar halten will. Eine Gruppe ist
eine Überschrift; sichtbar oder nicht sind ihre Einträge.

**Die Gruppe ans Ende der Leiste setzen** (nachgetragen mit #92). Sie stünde dann unter
Stammdaten und Einstellungen — also die tägliche Arbeit hinter der Einrichtung. Die Reihenfolge
der Gruppen ist die des Arbeitstags.

## Konsequenzen

- `layout/navigation.ts` bekommt einen Ordner mit einem Kind; `App.tsx` eine Route unter
  `RegisterGroupLayout` — die Registerleiste eines Bildschirms ist sein Ordner (ADR-0031).
- `lib/accounting.ts` ist neu: Modulcode, Pfad, die fünf Rechte, Adresse und Cache-Schlüssel der
  Einstellungen, `someRoleHoldsAccounting`. `lib/roles.ts` ist neu; `RolePage.tsx` liest Adresse
  und Schlüssel ab jetzt von dort, statt sie selbst zu schreiben.
- `lib/modules.ts`: `LicensedModuleCode` bekommt `'ACCOUNTING'`, `MODULE_NAMES` das Wort
  «Buchhaltung». Der geschlossene Typ erzwang beides, bevor irgendetwas kompilierte — genau
  wozu er da ist.
- `components/MissingAccountingRightsNotice.tsx` ist neu und hängt an zwei Bildschirmen;
  `pages/AccountingStatePage.tsx` ist neu; `pages/ModulePage.tsx` bekommt den
  `CONSEQUENCES`-Satz mit MWSTG Art. 79 und denselben Hinweis.
- `AppShell.NavItem` und `NavCounterKey` bleiben unangetastet. Ein Zähler für Buchungsentwürfe
  gehört zu der Auslieferung, die Entwürfe erzeugt.

**Mit #92 kommt dazu:**

- `NAV_GROUPS` bekommt die Gruppe «Buchhaltung» zwischen «Verkauf» und «Lager», mit den drei
  Einträgen aus Abschnitt 5; `navigation.test.ts` löst `accountingHasNoOwnGroupYetTest` durch die
  Prüfung ab, dass die Gruppe an ihrem Platz steht, ihre drei Einträge `module: 'ACCOUNTING'`
  tragen und ohne den Schalter die **ganze** Gruppe verschwindet.
- `lib/accounting.ts` bekommt `ENTRY_PATH`, `DRAFT_PATH` und `JOURNAL_PATH` sowie die
  Cache-Schlüssel und Verben der Buchung; `App.tsx` drei Routen.
- `NavGroup`, `NavCounterKey` und `AppShell.NavItem` bleiben weiterhin unverändert.

**Mit #94 kommt dazu, und damit ist dieses ADR eingelöst:**

- **«Konten» und «Archiv»**, die Einträge vier und fünf der Gruppe. «Konten» trägt
  `module: 'ACCOUNTING'` wie die drei davor; **«Archiv» trägt als einziges keines**, und daran
  hängt alles: die vier anderen fallen mit dem Schalter, dieses bleibt, und die Gruppe schrumpft
  auf genau diesen einen Eintrag zusammen, statt zu verschwinden.
  `accountingGroupVanishesWithoutTheModuleTest` wird durch
  `accountingGroupShrinksToTheArchiveWithoutTheModuleTest` abgelöst — die alte Prüfung hielt den
  früheren Zustand fest und wird nicht abgeschwächt, sondern beantwortet;
  `archiveEntryHasNoModuleTest` prüft die Aufteilung Eintrag für Eintrag.
- **Der Archiveintrag trägt auch keine Bestandsprüfung.** Er erscheint, sobald jemand
  `ACCOUNTING_READ` hält, auch wenn nie etwas gebucht wurde. `visibleNavGroups` entscheidet über
  `NAV_GROUPS`, `can` und `runs` und kennt keine Datenlage; eine Sichtbarkeit, die von einer
  Abfrage abhinge, wäre für den statischen Nachweis unsichtbar, den Abschnitt 5 gerade verlangt.
  Dahinter steht dann ein Leerzustand — besser als ein Eintrag, der je nach Datenlage auftaucht und
  verschwindet. Begründung in voller Länge in Backend-ADR-0119 und in
  `docs/processes/buchhaltung-abschalten.md` des Backends.
- **`NavCounterKey` wird zu `'CLEARING' | 'ACCOUNTING_DRAFTS'`**, und `useNavCounters` zieht aus
  `lib/clearing.ts` nach `layout/useNavCounters.ts` um — die Seitenleiste ist sein einziger
  Aufrufer. Es antwortet nicht mehr mit dem Zählsatz **eines** Bildschirms, sondern mit
  `Partial<Record<NavCounterKey, number>>`: jeder Eintrag liest seine eigene Zahl, und keiner weiss
  von den anderen. Beide Abfragen werden unbedingt deklariert und je über den Schlüssel
  eingeschaltet — Haken dürfen nicht in einer Bedingung stehen —, und React Query fasst die Aufrufe
  der einzelnen `NavItem` über den Schlüssel zusammen, sodass es bei einer Anfrage je Zähler bleibt.
- **Der Zähler am Eintrag «Entwürfe» erscheint nur, wenn `GET /entries/attention` ein `lockingOn`
  liefert.** Bei Handerfassung ist ein Entwurf der Normalfall, und ein Abzeichen, das dauerhaft für
  den Normalfall steht, bringt Leute dazu, Abzeichen nicht mehr anzuschauen — ausgerechnet auf dem
  Kanal, über den anderswo echte Probleme gemeldet werden. Die Frist rechnet das Backend; das
  Frontend prüft nur, ob das Feld gefüllt ist.
- **`ModulePage.tsx`** bekommt neben dem `ModuleUsage`-Satz den Verweis «Daten ansehen» auf
  `/buchhaltung/archiv` — nur für eine Sitzung mit `ACCOUNTING_READ`. Die Zuordnung Modulcode →
  Adresse steht **in `ModulePage.tsx`** und nicht in `lib/modules.ts`: `lib/accounting.ts` liest
  `LicensedModuleCode` von dort, und die Gegenrichtung wäre ein Importzyklus zwischen zwei
  Bausteinen, die beide fast überall gelesen werden.
- **`lib/files.ts` bekommt `downloadFile`**, und `BankStatementDetailPage` wird darauf gezogen.
  Beim zweiten Gebrauch geteilt statt beim dritten, weil die zwei Kopien schon auseinanderliefen:
  die dortige gab die Objekt-URL sofort wieder frei, sodass ein Browser, der den Download verzögert
  startet, eine tote URL bekam und eine leere Datei speicherte. Zwei Kopien, von denen eine falsch
  ist, sind kein Fall für die Dreierregel.

## Offen

Nichts aus diesem ADR.
