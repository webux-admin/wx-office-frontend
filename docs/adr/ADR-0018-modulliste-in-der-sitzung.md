# ADR-0018 — Die Modulliste reist in der Sitzung, und die Module bekommen einen Bildschirm

- **Status:** Angenommen
- **Datum:** 2026-08-27
- **Erweitert:** [ADR-0011](ADR-0011-systemeinstellungen-und-moduleinstellungen.md). Dort steht
  als Konsequenz: «Kommt die Lizenz, braucht es einen Backend-Endpunkt, der die freigeschalteten
  Module nennt, und den Anschluss an `allowed` in `AppShell`.» Das ist dieser Anschluss.
  ADR-0011 wird nicht abgelöst; seine Sortierregel entscheidet hier sogar, wohin der neue
  Eintrag gehört.

## Kontext

Die Seitenleiste blendet das Lager aus, wenn der Mandant es nicht betreibt. Bisher las sie dafür
ein einzelnes Flag `TenantAccess.inventoryEnabled`, und `visibleNavGroups` nahm einen
vollständigen `Record<NavModule, boolean>` entgegen. Geschaltet wurde das Ganze über ein Kästchen
«Lager verwenden» im Mandantenformular.

Mit einem zweiten Modul hält davon nichts: das Flag hiesse ein zweites Feld, der `Record` zwänge
**jeden** Aufrufer, **jeden** Schlüssel zu nennen, und das Kästchen bekäme ein Geschwister neben
dem Fusstext auf Rechnungen.

Das Backend liefert seit [ADR-0079](../../wx-office/docs/adr/ADR-0079-modulschalter-auf-eigenem-bildschirm.md)
eine Modulliste in der Sitzung und die Endpunkte `GET`/`PUT /api/tenants/{tenantId}/modules`.

Randbedingung, die beim Lesen von ADR-0011 auffällt: `allowed` liegt entgegen seinem Wortlaut
**nicht** in `AppShell`, sondern als Closure in `visibleNavGroups`. `AppShell` reicht nur den
Modulwert hinein.

## Entscheidung

**Die Sitzung trägt `TenantAccess.modules: string[]`** — nicht optional, das Backend liefert es
immer. Gelesen wird sie über `runsModule(...)` in `lib/modules.ts`, von der Seitenleiste und von
der Übersicht.

**`visibleNavGroups(can, runs)`** nimmt eine Nachschlagefunktion `(module: NavModule) => boolean`
statt eines totalen Records — genau parallel zu `can`.

**Der Eintrag «Module» steht in den *Systemeinstellungen***, flach, zwischen «Mandanten» und
«Benutzer», mit `permission: 'TENANT_READ'` und **ohne `module`-Feld**.

**Die Maske bleibt nach dem Speichern offen** und ruft `AuthState.refresh()`.

**`ModulePage` hängt unter `RequireTenant`**, nicht unter `RequirePermission`.

## Begründung

**Eine Nachschlagefunktion statt eines Records**, weil ein vergessener Schlüssel sonst ein
Typfehler an einer Stelle wäre, an der niemand sucht. Und weil `can` dieselbe Frage schon so
beantwortet — zwei Muster für dieselbe Sache sind eines zu viel.

**Systemeinstellungen, weil ADR-0011 es selbst so sortiert:** «Wie viele Module lesen den Wert?
Einer → Moduleinstellungen, mehrere → Systemeinstellungen.» Den Modulschalter liest jedes Modul.
Dazu kommt ein Testbefund: `navGroupsListModuleSettingsPerModuleTest` verlangt für jeden Knoten
oberster Ebene unter *Moduleinstellungen* einen Ordner, und ein Ordner mit genau einem
Bildschirm widerspricht dem Ordnerbegriff aus ADR-0004. Neben «Mandanten» passt auch das Recht:
dort steht schon `TENANT_READ`.

**Kein `module`-Feld am Eintrag.** Der Ordner «Lager» unter *Moduleinstellungen* trägt eines;
erbte die neue Maske diese Mechanik, blendete sie sich aus, sobald jemand alles abschaltet — und
der Weg zurück führte nur noch über `psql`.

**Die Maske bleibt offen**, weil eine aus dem Menü geöffnete Einstellungsmaske keine
Ursprungsmaske hat, zu der ADR-0003 sie zurückführen könnte. Das Vorbild ist `PriceEntryPage`
([ADR-0013](ADR-0013-preistabelle-mit-tastatur-und-einem-speichern.md)): ein PUT über den ganzen
Stand, `onSuccess` leert die Bearbeitungen und lädt neu, kein `navigate`.

**`refresh()`, weil die Sitzung kein Query ist.** Ein `invalidateQueries` erreicht sie nicht, und
ohne den Aufruf zeigten Seitenleiste und Übersicht nach dem Umschalten den alten Stand, bis
jemand neu lädt — bei einer Maske, deren einziger Zweck das Umschalten ist, kein
Schönheitsfehler.

**`RequireTenant`, weil jede Anfrage dieser Maske nach `/api/tenants/{id}/…` geht.**
`useTenantId()` allein liefert einem Superuser ohne gewählten Mandanten `null`, und die Maske
baute `/api/tenants/null/modules`. `RequireTenant` bringt dafür `NoTenantNotice` mit — dessen
JSDoc begründet genau das: «keeps the screens free of a null check they would otherwise all
repeat».

## Alternativen

**`ReadonlySet<NavModule>` statt der Nachschlagefunktion.** Funktioniert ebenso, ist aber ein
zweites Muster neben `can` für dieselbe Frage.

**Eine Übersetzungstabelle Menükennung ↔ Backend-Code.** Verworfen: sie wäre die zweite Stelle,
an der man ein Modul vergisst. `NavModule` trägt jetzt die Backend-Codes, Schreibweise
inbegriffen.

**`switchTenant(activeTenantId)` als Abkürzung für `refresh()`.** Verworfen: sie benennt etwas
anderes, als sie tut, und scheitert bei einem Superuser ohne gewählten Mandanten.

**Ein Ordner «Module» unter *Moduleinstellungen*.** Verworfen: siehe Begründung. Möglich wäre
er — `navGroupsListModuleSettingsPerModuleTest` bliebe grün —, aber ADR-0011 bräuchte eine
ausdrückliche Ausnahme.

**Sofort wirkendes Umschalten je Klick, nach dem Muster von `CataloguePage`.** Verworfen: ein
Modul abzuschalten hat Folgen, und ein Klick, der schon passiert ist, während man ihn noch
überlegt, ist kein bewusster Abschluss.

**Ein eigener Schalter-Baustein statt `CheckboxField`.** Verworfen: `CheckboxField` ist das
einzige Ja/Nein-Element des Bestands und bleibt es. Ein neues Bauteil wäre eine gestalterische
Entscheidung mit eigener ADR-Pflicht.

## Konsequenzen

- **Ein Menüeintrag zu einer Modulmaske darf niemals selbst modulgeschaltet sein.** Das gilt
  über diesen Fall hinaus und gehört bei jedem künftigen Schalter geprüft.
- `TenantAccess.modules` ist nicht optional. Würde die Antwort je auf «Feld fehlt, wenn das
  Modul aus ist» umgestellt, liefe das durch jedes `includes` still hindurch — deshalb liefert
  das Backend immer eine Liste, notfalls eine leere.
- Die zwei Zählschwellen der Begründungspflicht stehen jetzt in der Modulmaske. Das
  Mandantenformular sendet sie nicht mehr, und ein weggelassenes Feld ändert nichts — genau
  darauf beruht, dass jedes Speichern des Mandantenformulars den Schalter in Ruhe lässt.
- **Für `AppShell` gibt es keinen Test.** `src/layout/` enthält nur `navigation.test.ts`. Die
  Verdrahtung Sitzung → `visibleNavGroups` bleibt ungetestet; das wäre ein eigenes Vorhaben.
- **Kein `visibleNavGroupsWithASecondModuleTest`.** Mit `NavModule = 'INVENTORY'` als
  Ein-Element-Union liesse sich ein zweiter Wert nur über einen erzwungenen Cast bauen, und kein
  Menüknoten trüge ihn — der Test prüfte nichts. Er wird nachgereicht, sobald das Backend einen
  zweiten `LicensedModule`-Wert hat.
- `scripts/seed.mjs` legt Mandanten ohne Modulbezug an. Eine geseedete Datenbank hat alles aus;
  wer die Maske von Hand prüft, schaltet zuerst dort ein.
