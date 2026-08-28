# ADR-0023: Die erzwungene Einrichtung steht im Anmeldebildschirm

- **Status:** Angenommen
- **Datum:** 2026-08-28
- **Betrifft:** `LoginPage`, `SecurityPolicyPage`, `navigation.ts`, `AuthProvider`,
  `profile/TwoFactorPanel`

## Kontext

Das Backend kann seit [ADR-0090](../../../wx-office/docs/adr/ADR-0090-zweiter-faktor-als-pflicht-der-installation.md)
für die ganze Installation verlangen, dass jedes Konto einen zweiten Faktor hat. Wer keinen hat,
bekommt bei der Anmeldung nach dem richtigen Passwort einen dritten Zustand geantwortet:

```json
{ "secondFactorRequired": true, "enrolmentRequired": true, "methods": [] }
```

Das Frontend muss daraus zwei Dinge bauen: einen Schalter für den Betreiber, und einen Weg für
alle anderen, der Pflicht nachzukommen. Der zweite ist der schwierige, denn die Person, die ihn
braucht, ist **nicht angemeldet** — sie kann das eigene Konto nicht öffnen, in dem die Einrichtung
sonst wohnt (ADR-0022).

## Entscheidung

### Die Einrichtung ist ein dritter Schritt auf `LoginPage`

`ForcedEnrolmentStep` steht neben `SecondFactorStep` in derselben Datei und wird von derselben
Verzweigung gewählt: `challenge.enrolmentRequired ? Einrichten : Code eingeben`. Beides sind
Zustände einer Anmeldung, keine Routen. Eine Route, die nur mit schwebendem Zustand in der Session
funktioniert, ist eine Route, die jemand einmal aufruft und dann ohne Aufgabe davorsteht — dieselbe
Begründung, mit der ADR-0022 den zweiten Schritt hier gelassen hat.

Der Schritt zeigt drei nummerierte Sätze (App holen, scannen, Code eingeben), das QR-Bild, das
Geheimnis zum Abtippen und ein Codefeld, das bei der sechsten Ziffer von selbst abschickt.

### Die Wiederherstellungscodes kommen **vor** der Anwendung

`POST /second-factor/enrol/confirm` antwortet mit Benutzer **und** den zehn Codes. Die naheliegende
Reaktion — Benutzer in den `AuthProvider`, fertig — wäre falsch: sobald `user` gesetzt ist,
zeichnet sich die Anwendung über den Bildschirm, auf dem die Codes stehen, und sie stehen nur
dieses eine Mal da.

Deshalb hält der Schritt die Antwort zurück, zeigt die Codes mit *Herunterladen* und *Drucken*, und
erst hinter dem Häkchen «Ich habe die Codes gesichert» geht es weiter. Das ist dieselbe Haltung wie
im eigenen Konto: der Weg weiter steht hinter einem Häkchen, nicht hinter einem Schliessen-Kreuz.

Dafür bekommt `AuthState` **eine** neue Methode:

```ts
adoptSession: (user: AuthenticatedUser) => void
```

Sie öffnet nichts — das Cookie steht ohnehin schon. Sie sagt der Anwendung nur, wessen Sitzung das
ist.

### Der Schalter ist ein eigener Bildschirm, und er hängt am Superuser

*Systemeinstellungen → Sicherheit*, als letzter Eintrag der Gruppe und als einziger, der zu keinem
Mandanten gehört. `NavEntry` bekommt dafür ein Feld `superuser?: boolean`, und `visibleNavGroups`
einen dritten Parameter.

**Kein Recht**, obwohl das der Hausbrauch wäre: jedes Recht in diesem System ist einer Rolle *eines*
Mandanten zuweisbar, und der Administrator eines Mandanten darf nicht bestimmen, wie sich alle
anderen anmelden. Der Bildschirm ist auch nur für Superuser sichtbar — lesen dürfte ihn jeder, aber
ein Bildschirm ohne Knopf ist eine Sackgasse.

### Einschalten geht durch einen Dialog, ausschalten nicht

Der Dialog nennt drei Folgen: niemand wird ausgesperrt, jede Person braucht eine App, und der
eigene Faktor lässt sich danach nicht mehr abschalten. Ausschalten braucht keine Rückfrage —
dabei geht nichts verloren und niemand bleibt draussen.

### Im eigenen Konto verschwindet der Knopf, statt zu erblinden

Gilt die Pflicht, zeigt das Register *Zwei-Faktor* an der Stelle von «Zwei-Faktor abschalten» einen
Satz, warum es nicht geht und wer zurücksetzen kann. **Kein ausgegrauter Knopf**: das Backend
antwortet 409, und ein grauer Knopf lädt zu genau dem Klick ein, der das herausfindet. Neue
Wiederherstellungscodes zu ziehen bleibt offen — das schwächt nichts.

## Begründung

**Warum der Bildschirm und nicht ein Weiterleiten auf `/profil`?** Weil es dorthin keinen Weg gibt.
Zwischen Passwort und Faktor existiert keine Sitzung, `RequireAuth` wirft zurück auf `/anmelden`,
und die Endpunkte des eigenen Kontos antworten 401. Die beiden `enrol`-Endpunkte sind eigens dafür
offen.

**Warum keine Mailmethode im Anmeldebildschirm?** Sie hängt an einem Mailserver, den die
Installation vielleicht nicht hat. Eine Pflicht, die man nicht erfüllen kann, ist eine verschlossene
Tür. Wer die App nicht will, wählt die Mailmethode danach im eigenen Konto.

**Warum `adoptSession` und nicht `completeEnrolment` im Provider?** Weil der Provider dann die
Codes durchreichen und der Bildschirm sie zwischenlagern müsste — dieselbe Zurückhaltung, nur an
zwei Stellen. Eine Methode, die eine fertige Sitzung übernimmt, ist ehrlicher als eine, die einen
Vorgang zu kennen vorgibt, der oben stattfindet.

## Verworfene Alternativen

**Eigene Route `/zwei-faktor-einrichten`.** Sähe sauberer aus und wäre eine Adresse, die ohne
schwebenden Zustand ins Leere zeigt. Verworfen aus demselben Grund wie in ADR-0022.

**Die Codes erst nach dem Anmelden zeigen**, im eigenen Konto. Sie sind nach der Antwort nirgends
mehr abrufbar — es gäbe nichts zu zeigen.

**Den Bildschirm hinter `TENANT_WRITE` hängen.** Wäre einfacher und wäre das Loch: dieses Recht hat
in jeder mittelgrossen Installation mehr als eine Person, und jede davon aus einem einzelnen
Mandanten.

**Ein ausgegrauter «Abschalten»-Knopf mit Erklärungstext daneben.** Weniger Code, mehr Frust: ein
Knopf, den man nicht drücken kann, wird trotzdem gedrückt.

**Die Pflicht aus dem Sitzungsobjekt lesen** statt über `GET /api/login-policy`. Hätte die Abfrage
gespart und den Wert im Moment des Umschaltens veralten lassen — das eigene Konto zeigte dann einen
Knopf, den das Backend ablehnt.

## Konsequenzen

- **Neu:** `lib/loginPolicy.ts`, `pages/SecurityPolicyPage.tsx` (+ Test),
  `ForcedEnrolmentStep` in `LoginPage.tsx`.
- **Geändert:** `authContext.ts` (`enrolmentRequired`, `adoptSession`), `AuthProvider.tsx`,
  `navigation.ts` (`superuser`-Feld, dritter Parameter, Eintrag *Sicherheit*), `AppShell.tsx`,
  `App.tsx` (Route), `profile/TwoFactorPanel.tsx`.
- **`AuthState` hat ein Mitglied mehr**, was 34 Testdateien betrifft, die es als Objektliteral
  bauen. Sie wurden mechanisch nachgezogen.
- Wer die Codes im Anmeldebildschirm wegklickt, hat sie verloren — wie im eigenen Konto.

## Referenzen

- [ADR-0022 — Zweiter Faktor als Register im eigenen Konto](ADR-0022-zweiter-faktor-als-register-im-eigenen-konto.md)
- [ADR-0018 — Modulliste in der Sitzung](ADR-0018-modulliste-in-der-sitzung.md)
- Backend: ADR-0087, ADR-0089, ADR-0090
