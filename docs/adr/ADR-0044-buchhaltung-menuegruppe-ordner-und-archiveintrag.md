# ADR-0044 — Die Buchhaltung bekommt eine eigene Menügruppe, einen Ordner unter Moduleinstellungen und einen Archiveintrag, den der Modulschalter nicht versteckt

- **Status:** Angenommen
- **Datum:** 2026-09-02
- **Verhältnis:** setzt Backend-ADR-0110 und Backend-ADR-0119 um. Führt
  [ADR-0032](ADR-0032-recht-und-modulschalter-gehoeren-zusammen.md) fort — die Reihenfolge
  Mandant → Modul → Recht in `RequireTenant` — und ordnet nach der Regel von
  [ADR-0011](ADR-0011-systemeinstellungen-und-moduleinstellungen.md) ein. Ändert an
  [ADR-0018](ADR-0018-modulliste-in-der-sitzung.md), ADR-0011 und ADR-0032 nichts.
- **Umfang:** Von den drei Bausteinen im Titel baut diese Auslieferung **nur den mittleren**,
  den Ordner. Menügruppe und Archiveintrag werden hier entschieden und begründet, damit die
  Entscheidung einmal fällt und nicht dreimal — gebaut werden sie mit den Auslieferungen, die
  ihnen einen Inhalt geben (#92 und #94).

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
ersten Bildschirm, der etwas buchen kann, und dem Journal, in dem man das Gebuchte wiederfindet.

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

## Offen

Beides ist zugewiesen, keines eine offene Frage:

- **Die Menügruppe «Buchhaltung» — #92.** Sie entsteht mit dem ersten Bildschirm, der etwas
  buchen kann, und dem Journal, in dem man das Gebuchte wiederfindet. Dieses ADR wird dort um
  ihren Aufbau ergänzt.
- **Der Archiveintrag `/buchhaltung/archiv` — #94.** Ohne `module`-Feld, aus dem oben genannten
  Grund. Dieses ADR wird dort um ihn ergänzt.
