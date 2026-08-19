# ADR-0001 — Auswahlwerte und Beschriftungen kommen aus der API

- **Status:** Angenommen
- **Datum:** 2026-08-19

## Kontext

Die Auswahlwerte standen doppelt: als Enum im Backend und als Beschriftungstabelle in
`src/lib/labels.ts`. Jede Rechtsform, jede Einheit, jede Anrede war damit im Frontend fest
verdrahtet, und eine Änderung im Backend brauchte eine zweite hier.

Mit [ADR-0016 des Backends](../../../webux-office/docs/adr/ADR-0016-stammdaten-listen.md)
sind die Werte Stammdatum geworden. Das Backend unterscheidet seither zwei Arten:

- **Gepflegte Listen** (`/api/tenants/{id}/{liste}`) — Rechtsform, Anrede, Einheit, Sprache,
  Land, Währung, Druckvorlage, Ertragskonto. Der Mandant legt Werte an, benennt um, sortiert
  und deaktiviert sie.
- **Kataloge** (`/api/tenants/{id}/catalogues`) — die strukturellen Enums wie `PartnerType`,
  `VatCategory` oder `DocumentStatus`. Sie steuern Logik, ihr Wertevorrat steht fest; der
  Mandant ändert nur Beschriftung, Kurzform, Reihenfolge und Sichtbarkeit.

Das Frontend kann den Wertevorrat damit nicht mehr kennen.

## Entscheidung

Kein Auswahlwert und keine Beschriftung dazu steht mehr im Frontend.

- Die Masken halten **den Code**, nicht die Id. Das Backend nimmt beides entgegen (die Id
  gewinnt), und der Code ist unveränderlich, sobald ein Wert angelegt ist. So bleiben die
  Formulare unverändert stringbasiert, und Kataloge — die gar keine Id haben — funktionieren
  nach denselben Regeln wie die Listen.
- Beschriftungen kommen aus der Antwort: gespeicherte Werte tragen ihr Label als
  `…Label`-Feld im DTO mit, Auswahllisten liefern es je Eintrag.
- Gelesen wird über `src/masterdata/`: `useMasterDataList`, `useCatalogues` und darauf
  `MasterDataSelect` beziehungsweise `CatalogueSelect`. Eine Maske nennt nur, welche Liste
  sie will; mehrere Felder über derselben Liste teilen sich eine Anfrage.
- Reine Funktionen dazu stehen in `src/lib/masterData.ts` und kennen React nicht.
- In `src/lib/labels.ts` bleibt nur der Rechtekatalog: das ist das Vokabular der Anwendung
  selbst, für jeden Mandanten gleich, und wird von keinem Endpunkt beschriftet.

## Begründung

Ein neues Verzeichnis `src/masterdata/` statt `components/`, weil ein Baustein in
`components/` keine Fachdomäne kennen darf; diese Felder wissen sehr wohl, dass es Mandanten
und Auswahllisten gibt. Der Schnitt ist derselbe wie bei `auth/`.

Der Code als Formularwert und nicht die Id: Kataloge haben keine Id, und zwei Wege für
dasselbe Feld wären eine Quelle für Fehler. Ausserdem bleibt ein Code beim Lesen von Logs und
Payloads erkennbar, eine Id nicht.

Ein gespeicherter Wert, der nicht mehr angeboten wird, bleibt in seinem Dropdown stehen
(`selectOptions`). Fiele er heraus, zeigte das Feld den nächstbesten Wert an, und ein Speichern
ohne jede Absicht würde den Datensatz stillschweigend umhängen.

Wo ein Feld einen Wert tragen muss und leer ist, füllt das Dropdown die Vorgabe der Liste ein.
Genau dafür trägt ein Eintrag das Kennzeichen, und niemand muss bei jeder neuen Firma dasselbe
Land auswählen.

## Alternativen

**Nur die Ids führen.** Näher an der Speicherung, aber für Kataloge nicht möglich und beim
Anlegen eines Mandanten unbrauchbar, dessen Listen noch nicht existieren.

**Die Beschriftungen im Frontend lassen und nur die Werte holen.** Hätte die Doppelspurigkeit
behalten, die abgeschafft werden sollte: ein umbenannter Wert hiesse in der Maske weiter, wie
er im Code steht.

**Alle Listen einmal beim Start laden.** Eine Anfrage weniger im Betrieb, aber acht Anfragen
für jede Anmeldung, auch für Bildschirme, die keine davon brauchen. Die Kataloge kommen ohnehin
in einer einzigen Antwort; die Listen werden geholt, wo sie gebraucht werden, und fünf Minuten
gehalten.

## Konsequenzen

- Ein neuer Auswahlwert ist im Frontend nichts: er steht sofort in der Maske.
- Eine neue Liste im Backend kostet hier einen Eintrag in `MasterDataList` und einen in der
  Pflegemaske.
- Die Maske `/auswahllisten` pflegt die acht Listen. Zahlungskonditionen und die Beschriftung
  der Kataloge haben noch keine Oberfläche.
- Ohne Mandant gibt es keine Auswahlwerte. Die Maske für einen **neuen** Mandanten zeigt die
  betroffenen Felder deshalb erst, wenn er angelegt ist — seine Listen entstehen mit ihm.
- Eine Sprache ist am Partner Pflicht, ein Land an jeder Adresse und eine Rechtsform an jeder
  Firma. Das prüft das Backend; die Masken fragen entsprechend danach.
