# webux-office-frontend-react — Oberfläche zum ERP

## Projektkontext

React-Frontend zum CRM/ERP [webux-office](../webux-office). Das Backend ist die einzige
Quelle der Wahrheit: **fachliche Logik gehört dorthin, nie hierher.** Das Frontend zeigt an,
sammelt Eingaben und schickt sie an die API — es rechnet keine Beträge nach, vergibt keine
Belegnummern und entscheidet nicht, ob ein Beleg finalisiert werden darf.

Vorlage für die Gestaltung ist das Figma-File
[Untitled](https://www.figma.com/design/ta5hqPPEpRZ7TQx82eN2qy/Untitled?node-id=26-769).
Die Designtokens daraus stehen als CSS-Variablen in `src/index.css` und heissen dort gleich
wie in Figma.

Stand der Module (in dieser Reihenfolge gebaut):
- **auth** — Anmeldung, Sitzung, Mandantenwechsel, geschützte Routen. ✅ umgesetzt
- **shell** — Seitenleiste, Kopfzeile, Navigation. ✅ umgesetzt
- **dashboard** — Übersicht mit Modulkacheln. ✅ umgesetzt
- **partner** — Kunden und Lieferanten
- **product** — Produkte, Preisgruppen, Kundenpreise
- **document** — Offerte, Lieferschein, Rechnung

## Tech-Stack (nicht ohne Rückfrage ändern)

- React 19, TypeScript, Vite 8
- React Router 7, TanStack Query 5
- Tailwind CSS 4 (`@tailwindcss/vite`, Tokens über `@theme`)
- Motion (`motion/react`) für Animationen, `lucide-react` für Icons
- ESLint 10 mit `typescript-eslint`, Vitest für Tests

## Das Backend gehört dazu

Zu dieser Oberfläche gehört das Spring-Backend **`../webux-office`** (eigene `CLAUDE.md`,
eigene `docs/adr/`, eigenes Git-Repository). Beide Seiten werden zusammen entwickelt.

**Eine Anforderung wird als Ganzes umgesetzt.** Eine Maske, die etwas anzeigen soll, das
kein Endpunkt liefert, ist nicht umsetzbar — dann wird der Endpunkt dort gebaut, im selben
Schritt, und nicht hier im Browser nachgerechnet. Umgekehrt zieht eine geänderte
Antwortform die aufrufende Maske sofort nach: eine grüne Backend-Testsuite neben einem
Frontend, das die alte Form erwartet, ist keine fertige Arbeit.

Wer eine Sitzung hier startet, macht das Backend-Verzeichnis einmalig verfügbar:

```
/add-dir <Pfad zu webux-office>
```

Umgekehrt ist dieses Verzeichnis dort schon dauerhaft freigegeben, über
`.claude/settings.json` (`permissions.additionalDirectories`).

Beide Projekte werden **gemeinsam grün** gehalten: hier `npm run check`, dort
`./gradlew test`. Berührt eine Änderung beide Seiten, laufen vor dem Commit beide.

---

## 1. Sprache

Zwei Sprachen, sauber getrennt — die Regel ist dieselbe wie im Backend:

- **Code, Bezeichner, Kommentare und JSDoc sind Englisch.** Auch wenn wir hier Deutsch
  sprechen. Fachbegriffe bleiben Englisch: `invoice`, `offer`, `deliveryNote`, `partner`,
  `priceGroup`.
- **Sichtbare Texte sind Deutsch (de-CH).** Beschriftungen, Fehlermeldungen, leere Zustände.
  Schweizer Schreibweise: `ss` statt `ß`, Tausendertrennung mit `’` (`1’842`), Beträge nach
  `de-CH` formatiert.
- **Diese Datei und alles unter `/docs` ist Deutsch.**
- Kein Mischen innerhalb einer Datei: `const rechnungen = …` neben `invoiceTotal` ist ein
  Fehler, nicht Geschmackssache.

## 2. Architektur

```
src/
├── main.tsx                  Einstiegspunkt
├── App.tsx                   Router und Provider
├── index.css                 Designtokens und Basisstile
├── lib/                      Technikschicht ohne React (api, types, format, theme)
├── auth/                     Sitzung, Kontext, geschützte Routen
├── components/               wiederverwendbare Bausteine ohne Fachwissen
├── layout/                   Rahmen der angemeldeten Anwendung
└── pages/                    eine Datei pro Route
```

- **`lib/` kennt React nicht.** Reine Funktionen und Typen, damit sie ohne Renderer testbar
  bleiben.
- **`components/` kennt die Fachdomäne nicht.** Ein `Button` weiss nichts von Rechnungen.
  Sobald ein Baustein einen Fachbegriff braucht, gehört er zum Modul, nicht hierher.
- **Jede Route ist genau eine Datei in `pages/`.** Wird sie zu gross, wandern Teile in ein
  Unterverzeichnis daneben — nicht in `components/`.
- **Der API-Zugriff läuft ausschliesslich über `lib/api.ts`.** Kein `fetch` in einer
  Komponente: Session-Cookie, CSRF-Token und die Behandlung von 401 stehen an einer Stelle.
- Typen der Backend-DTOs stehen in `lib/types.ts` und entsprechen **1:1** den Records in
  `ch.webux.office.*.web`. Ändert sich ein DTO, ändert sich dieser Typ mit — kein
  stillschweigendes Umbenennen.
- Serverzustand gehört in TanStack Query, nicht in `useState`. `useState` ist für das, was
  nur im Browser existiert: offene Menüs, Formulareingaben, Fokus.

## 3. Code-Qualität

- Sprechende Namen, keine Abkürzungen. Fachsprache aus der Domäne, konsistent.
- Funktionen machen genau eine Sache und sind kurz. Verschachtelung durch frühe Rückgabe
  flach halten.
- **Komponenten sind Funktionen mit typisierten Props.** Kein `React.FC`, kein `any`, kein
  `as` ausser mit Begründung im Kommentar.
- `type` statt `interface`, ausser wenn eine Deklarationszusammenführung gebraucht wird.
- Unveränderlichkeit als Default. Keine Mutation von Props oder Query-Daten.
- **Keine `console.log` im ausgelieferten Code.** Fehler landen in einer sichtbaren
  Fehlermeldung, nicht in der Konsole.
- Keine auskommentierten Code-Leichen, kein toter Code, keine ungenutzten Exporte.
- Wiederholt sich Logik zum dritten Mal, wird sie extrahiert — vorher nicht.

## 4. Gestaltung

- **Farben, Radien und Schriften kommen aus den Tokens in `src/index.css`.** Kein Hex-Wert
  direkt in einer Komponente, keine Tailwind-Standardfarbe wie `bg-slate-800`, auch nicht in
  einer Schattenangabe. Fehlt ein Wert, wird er als Token ergänzt und im Figma-File
  nachgeführt.
- **Es gibt zwei Erscheinungsbilder, hell und dunkel.** Hell ist der Default und steht im
  `@theme`-Block; dunkel überschreibt unter `:root[data-theme='dark']` **nur dieselben
  Variablen**. Eine Komponente weiss nie, welches aktiv ist — steht in einer Datei
  `dark:`-irgendwas, ist ein Token zu wenig da. Beide Erscheinungsbilder werden beim Bauen
  angeschaut, nicht nur eines.
- Zwei Fallen dabei: **Grün auf Dunkel** braucht einen eigenen Wert (`accent-text`), weil der
  Figma-Ton auf dunklem Grund unter 4.5:1 fällt. Und **dunkel auf dunkel** — die Seitenleiste
  gegen die Arbeitsfläche — braucht eine Kante, sonst verschwimmt der Aufbau.
- Das Erscheinungsbild wird **vor dem ersten Paint** gesetzt (Inline-Skript in `index.html`).
  Wer die Logik ändert, ändert sie an beiden Stellen — das Skript kann nichts importieren.
- Schrift ist **Google Sans Flex**, Belegnummern und Beträge in **Geist Mono** — Ziffern
  dürfen beim Aktualisieren nicht springen (`font-variant-numeric: tabular-nums`).
- **Die Schriften liegen im Projekt** (`public/fonts`, SIL OFL 1.1) und werden von der
  Anwendung selbst ausgeliefert. Kein Font-CDN: der erste Paint soll auf keinen fremden Host
  warten. Es sind Variable Fonts — Gewicht ist eine Achse, kein eigener Schnitt, und
  `opsz` bei Google Sans Flex bleibt auf der Automatik. Wird eine Schrift ausgetauscht,
  wandert ihre Lizenzdatei mit.
- **Animationen sind kurz und dienen der Orientierung**: 150–400 ms, `ease-out`, nur
  `transform` und `opacity`. Nichts animiert dauerhaft, was der Benutzer lesen soll.
- **`prefers-reduced-motion` wird respektiert.** Die Regel dazu steht in `index.css` und gilt
  global; wer eine Animation in JavaScript baut, prüft die Einstellung selbst.
- **Jeder Zustand wird gestaltet**: Laden, leer, Fehler, kein Recht. Ein Bildschirm, der nur
  den Erfolgsfall kennt, ist nicht fertig.
- Bedienbar mit der Tastatur, sichtbarer Fokus, Beschriftung an jedem Eingabefeld.
  Fehlermeldungen werden per `aria-live` angesagt.

## 5. Sicherheit

- **Rechte werden im Backend geprüft.** Was das Frontend mit `permissions` macht, ist
  Bequemlichkeit: eine Schaltfläche ausblenden, die ohnehin 403 ergäbe. Es ist **kein**
  Schutz und wird nie als solcher behandelt.
- Das Backend antwortet bei fehlender Sitzung mit **401**. Der Client wirft dann
  `UnauthorizedError` und leitet zur Anmeldung — kein Redirect-Folgen, kein stiller Retry.
- Schreibende Anfragen tragen den CSRF-Token aus dem `XSRF-TOKEN`-Cookie im Header
  `X-XSRF-TOKEN`. Das erledigt `lib/api.ts`.
- **Keine Passwörter, Token oder Personendaten in `localStorage`, in der URL oder im Log.**
  Die Sitzung lebt im HttpOnly-Cookie und sonst nirgends.
- Kein `dangerouslySetInnerHTML` mit Daten aus der API.

## 6. Dokumentation

- **JSDoc auf allen exportierten Funktionen, Komponenten und Typen**, auf Englisch.
- JSDoc sagt **was fachlich passiert** und **warum**, nicht wie der Code funktioniert.
  Kein `/** The button. */` auf `Button` — das ist Rauschen, dann lieber weglassen.
- **So kurz wie möglich, so lang wie nötig.** Ein Satz reicht meistens. Mehr nur, wenn ohne
  die Erklärung etwas falsch verstanden würde (Randfälle, Einheiten, Nebenwirkungen).
- Ein Kommentar im Code erklärt eine **Entscheidung**, nicht die Syntax. Warum der Proxy
  statt CORS, warum dieser Token nicht maskiert wird — das gehört hin.
- Entscheidungen mit Bindungswirkung (Zustandsverwaltung, Routing, Designsystem,
  Bibliothekswahl) gehören als ADR nach `docs/adr/`, im selben Format wie im Backend.
  Kein ADR für Kleinkram.

## 7. Tests

- **Zu jeder neu hinzugefügten Funktion in `lib/` gehört ein Unit-Test.** Ohne Test gilt sie
  als nicht fertig.
- Pro Funktion werden drei Arten von Fällen getestet: **Normalfall** (ein gewöhnlicher Wert
  aus der Mitte des Wertebereichs), **Randfälle** (leer, genau eins, Minimum, Maximum,
  `null`, Rundungsgrenzen) und **Fehlerfälle** (jede dokumentierte Ausnahme).
- **Namensschema: Funktionsname + `Test`** — `formatAmountTest`,
  `formatAmountWithZeroTest`. Struktur Arrange / Act / Assert, ein Verhalten pro Test.
- Komponenten werden über ihr sichtbares Verhalten getestet, nicht über interne Zustände:
  was der Benutzer sieht und anklickt.
- Netzwerkzugriffe werden auf `fetch`-Ebene abgefangen, nicht durch Mocken von `lib/api.ts` —
  sonst testet niemand mehr die Behandlung von 401 und CSRF.

## 8. Arbeitsweise (verbindlicher Ablauf)

1. Vor grösseren Änderungen kurz den geplanten Schnitt (Route, Komponente, API-Aufruf)
   nennen.
2. Änderung umsetzen — inklusive JSDoc und Tests, im selben Schritt.
3. **`npm run check` ausführen und grün bekommen, bevor an der nächsten Sache
   weitergearbeitet wird.** Das ist Pflicht, nicht Nacharbeit: der Befehl fasst Linter,
   Typprüfung, Tests und Build zusammen. Keine parallelen Baustellen auf rotem Build.
4. Meldet der Linter etwas: Ursache beheben. Regeln werden **nicht** abgeschwächt und
   Zeilen **nicht** mit `eslint-disable` stillgelegt, um grün zu werden. Ist eine Regel
   wirklich falsch, wird sie in `eslint.config.js` mit Begründung im Kommentar geändert.
5. Am Ende berichten: was geändert, welche Routen betroffen, welche Prüfungen laufen — und
   ehrlich, was nicht funktioniert oder offen ist.
6. Keine ungefragten Zusatz-Features und keine Stack-/Versionswechsel.

### Commit Messages

- **Englisch, kurz, prägnant.** Betreffzeile im Imperativ, max. 72 Zeichen, kein Punkt am
  Ende: `Add login screen`, `Fix tenant switch after logout`.
- Die Betreffzeile sagt **was sich ändert**, nicht was getan wurde (`Add …` statt `Added …`).
- Body nur, wenn das **Warum** nicht offensichtlich ist.
- Ein Commit = eine abgeschlossene Sache. Komponente, Styles, JSDoc und Tests dazu gehören
  in denselben Commit.

### Befehle

```bash
npm run dev        # Entwicklungsserver auf http://localhost:5173, /api geht an :8080
npm run lint       # ESLint
npm run typecheck  # TypeScript ohne Ausgabe
npm run test       # Vitest, einmalig (im Wachmodus: npx vitest)
npm run build      # Typprüfung und Produktionsbuild
npm run check      # lint + typecheck + test + build — das gilt vor jedem Commit
npm run seed       # füllt eine leere Backend-Datenbank mit Beispieldaten
```

### Backend starten

Das Frontend ist ohne Backend nicht benutzbar. Im Verzeichnis `../webux-office`:

```bash
./gradlew bootRun --args="--webux.security.initial-admin.password=webux-admin-2026"
```

Docker Compose startet PostgreSQL mit. Danach einmalig `npm run seed` hier ausführen.
