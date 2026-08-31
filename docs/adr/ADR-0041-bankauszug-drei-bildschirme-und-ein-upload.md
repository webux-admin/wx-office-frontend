# ADR-0041 — Bankauszug: drei Bildschirme, ein Upload-Baustein

- **Status:** Angenommen
- **Datum:** 2026-08-31
- **Verhältnis:** setzt Backend-ADR-0107 um. Ändert nichts an
  [ADR-0037](ADR-0037-zahlungseingang-als-eigener-bildschirm.md) — der Zahlungseingang bleibt,
  wo er ist; die Zuordnung eines Bankpostens dorthin ist noch nicht gebaut. Folgt der Linie von
  [ADR-0018](ADR-0018-modulschalter-in-der-navigation.md) für den Modulschalter und der von
  ADR-0033 für den Ordner.

## Kontext

Das Backend liest jetzt camt.053 und camt.054 ein (Backend-ADR-0107). Dazu fehlten dem Frontend
zwei Dinge, die es überhaupt noch nie hatte:

1. **Ein Weg, eine Datei hochzuladen.** `lib/api.ts` kennt `get`, `post`, `put`, `delete` und
   `file` — letzteres holt eine Datei, es sendet keine.
2. **Ein Feld, in das man eine Datei legt.** In `src/components` gibt es keines.

Dazu kam die Frage, wo die drei Bildschirme hingehören und was der Modulschalter verbirgt.

## Entscheidung

### Ein `api.upload`-Verb, und ausdrücklich **nicht** über `request`

```ts
upload: <T,>(path: string, file: File, field?: string) => upload<T>(path, file, field)
```

**Der Grund ist eine Zeile Code, die nicht dasteht.** `request` setzt
`Content-Type: application/json` und ruft `JSON.stringify`. Eine Multipart-Anfrage darf
**gar keinen** `Content-Type` tragen: den setzt der Browser selbst, weil nur er die Grenze
(`boundary`) kennt, die er gerade erzeugt hat. Wer den Header von Hand setzt, bekommt einen 500,
den niemand erklären kann.

Der CSRF-Token reist wie bei jedem anderen Schreibvorgang mit, und das Sitzungs-Cookie auch:
ein Upload ist ein Schreibvorgang wie jeder andere.

`api.test.ts` hält genau das fest — `uploadSetsNoContentTypeTest`.

### `FileDropField`: ziehen **und** auswählen, nie nur eins

Das versteckte `<input type="file">` **ist** das Feld, der sichtbare Kasten ist sein `<label>`.
Damit landen Tastatur und Screenreader auf einem echten Bedienelement statt auf einem `div` mit
angehängter `role`.

Eine reine Ablagefläche wäre ein Feld, das manche Leute nicht bedienen können.

**Die Obergrenze wird im Browser geprüft.** Eine 30-MB-Datei würde sonst eine Minute lang
übertragen, um abgewiesen zu werden — auf einer Mobilverbindung eine Minute vom Datenvolumen
eines Menschen. Der Server prüft trotzdem: die Prüfung im Browser ist eine Freundlichkeit,
keine Sperre.

**Nur die erste Datei.** Ein Drop mit zwei Dateien nähme sonst stillschweigend die zweite; das
Feld sagt «eine Datei».

### Drei Bildschirme unter einem Ordner «Bank», in der Gruppe Verkauf

| Bildschirm | Recht | Modulschalter |
| --- | --- | --- |
| Bankauszüge | `BANK_STATEMENT_READ` | **nein** |
| Bankposten | `BANK_STATEMENT_READ` | **nein** |
| Bankkonten | `BANK_STATEMENT_IMPORT` | **ja** |

**Der Ordner trägt keinen Schalter, die Kinder tragen ihn einzeln** — dieselbe Bauweise wie bei
den Mahnungen. Ein eingelesener Auszug ist ein Buchungsbeleg mit zehn Jahren
Aufbewahrungspflicht (OR Art. 958f); ein abgeschalteter Modulschalter darf ihn nicht verstecken.
Der Kontostamm dagegen ist eine Einstellung und verschwindet mit dem Schalter.

**Unter Verkauf und nicht unter Moduleinstellungen**, direkt nach den offenen Posten: «ist das
bezahlt» wird täglich gefragt, und der Auszug ist die Antwort darauf.

### Was die Masken zeigen — und was sie sagen

**Die Duplikate werden benannt, nie versteckt.** Wer die camt.053 nach der camt.054 einliest,
sieht «0 neu» und muss erkennen können, dass das die richtige Antwort ist und keine verlorene
Datei. Deshalb steht in der Liste «0 neu, 37 doppelt», und im Detail ein Satz dazu, warum.

**Eine kaputte Referenz wird markiert, eine fehlende nicht.** Eine Zahlung ohne Referenz ist
alltäglich. Eine Referenz, die wie eine QR-Referenz aussieht und deren Prüfziffer nicht hält,
ist ein Zahlendreher, den jemand finden kann — sie bekommt ein rotes Abzeichen.

**Die Auszugslücke steht am Kopf des Auszugs**, mit dem Satz, was zu tun ist: die fehlenden
Auszüge nachladen, doppelte Posten fallen von selbst weg.

**Die Originaldatei ist eine Schaltfläche**, kein Link. Über `api.file`, damit eine abgelaufene
Sitzung auf dem Anmeldebildschirm endet statt in einem neuen Tab mit einem nackten 401.

### Nachfragen nur, solange gelesen wird

Der Upload antwortet, bevor die Datei gelesen ist. Die Liste fragt deshalb nach — aber
**nur, solange eine Datei im Zustand `RECEIVED` dabei ist**:

```ts
refetchInterval: (result) => ((result.state.data ?? []).some(isBeingRead) ? 1500 : false)
```

Eine ruhende Liste hält keine Verbindung für nichts in Bewegung.

## Begründung

**Warum die Bankkonten eine eigene Maske bekommen und nicht in die Mandanteneinstellungen
gehen.** Dort steht `tenant.iban`, und das ist eine andere Sache: die Angabe für den
**Zahlteil des Belegs**, eine je Mandant. Der Kontostamm ist die **Empfangsseite**, und davon
gibt es mehrere. Beide auf einen Bildschirm zu legen hiesse, zwei Begriffe zu vermischen, die
im Backend ausdrücklich getrennt sind (Backend-ADR-0107).

**Warum IBAN und Währung nach dem Anlegen gesperrt sind.** Gespeicherte Buchungen tragen die
IBAN. Sie zu ändern hiesse, einen Buchungsbeleg umzuschreiben — der Server weist es ohnehin ab,
und ein Feld, das man ausfüllen darf und dessen Inhalt verworfen wird, ist eine Lüge.

**Warum es kein Löschen eines Kontos gibt.** Es trägt seine Auszüge. Stillgelegt fällt es aus
der Auswahl und behält seine Geschichte.

**Warum `formatByteCount` wiederverwendet und nicht neu geschrieben wurde.** Es stand schon in
`lib/format.ts`. Die erste Fassung von `FileDropField` brachte ein eigenes `formatBytes` mit —
zwei Formate für dieselbe Zahl im selben Bildschirm.

## Verworfene Alternativen

**Den Upload über `api.post` mit einem `FormData`-Körper.** `request` stringifiziert den Körper
und setzt den JSON-Header; beides ist hier falsch. Eine Sonderbehandlung *innerhalb* von
`request` hätte die eine Funktion, durch die alles geht, um einen Zweig erweitert, der für neun
von zehn Aufrufen nie zutrifft.

**Nur eine Dateiauswahl, ohne Ablagefläche.** Wer die Datei gerade aus dem E-Banking geladen
hat, hat den Ordner offen daneben.

**Nur eine Ablagefläche.** Ein Feld, das die Tastatur nicht erreicht.

**Die Bankposten als Register des Auszugs statt als eigener Bildschirm.** Die Frage «wo ist die
Zahlung von Muster AG» wird gestellt, ohne zu wissen, in welcher Datei sie steckt.

**Den ganzen Ordner hinter den Modulschalter.** Dann verschwände mit dem Schalter auch, was
schon eingelesen ist — Buchungsbelege, die zehn Jahre lesbar bleiben müssen.

**Ein Fortschrittsbalken beim Lesen.** Der Server meldet keinen Fortschritt, und einer, der
nur so tut, ist schlimmer als keiner. Die Liste sagt «Wird gelesen …» und fragt nach.

## Konsequenzen

- `lib/api.ts` bekommt `upload`; `api.test.ts` wächst um sieben Fälle.
- `components/FileDropField.tsx` ist neu, mit elf Testfällen. Es ist allgemein gehalten, weil
  der nächste Upload (ein Logo, ein Produktbild) denselben Baustein braucht.
- `lib/banking.ts`, `lib/types.ts` (neun Typen), vier Bildschirme, vier Routen, ein
  Navigationsordner.
- `lib/modules.ts` bekommt `BANKING` in `LicensedModuleCode` und in `MODULE_NAMES`. Der
  geschlossene Typ erzwang beides — genau wozu er da ist.
- **`ReferenceType` heisst für den Bankposten `BankReferenceType`.** Der bestehende
  `ReferenceType` ist die Referenzart des Mandanten für den Zahlteil (`QRR | SCOR | NON`); der
  neue ist, was auf einem Auszug ankommt (`QRR | SCOR | OTHER | NONE`). Zwei Vokabulare, zwei
  Namen.

## Offen

- **Die Zuordnung eines Bankpostens zu einem offenen Posten** ist nicht gebaut. Der Posten
  steht auf «Neu» und bleibt dort, bis 5/8 kommt.
- **Der Klärungskorb** für Posten, die zu nichts passen, ist 6/8.
- **Keine Massenaktion auf der Postenliste.** Ohne Zuordnung gäbe es nichts, was man mit einer
  Auswahl täte.
