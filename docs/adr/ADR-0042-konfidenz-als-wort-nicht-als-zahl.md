# ADR-0042 — Konfidenz als Wort, nicht als Zahl

- **Status:** Angenommen
- **Datum:** 2026-08-31
- **Verhältnis:** setzt Backend-ADR-0108 um. Ergänzt
  [ADR-0041](ADR-0041-bankauszug-drei-bildschirme-und-ein-upload.md) um einen vierten Bildschirm
  und einen Abschnitt am Partner. Ändert nichts an ADR-0037 und ADR-0038.

## Kontext

Das Backend rechnet jetzt aus einer Bankbewegung Zuordnungsvorschläge (Backend-ADR-0108). Jeder
Vorschlag trägt ein Merkmalstupel, eine Konfidenzstufe, ein Prüfflag und einen
Begründungssatz.

Zwei Dinge brauchen eine Entscheidung im Frontend: **wie eine Konfidenz aussieht** und **wo die
gelernte Zahler-IBAN sichtbar wird**. Die Arbeitsmaske selbst — der Klärungskorb mit der
Split-View — ist 6/8; hier entstehen nur die Bausteine, die sie brauchen wird.

## Entscheidung

### 1. Drei benannte Stufen, ein Abzeichen, ein Satz — und nirgends eine Prozentzahl

| Stufe | Abzeichen | Was sie heisst |
| --- | --- | --- |
| Hoch | `success` | Der Beleg steht durch eine unabhängige, nachprüfbare Tatsache fest |
| Mittel | `accent` | Plausibel — ein Mensch entscheidet |
| Tief | `muted` | Ein Hinweis; nie eine Buchungsgrundlage |

**Keine Prozentzahl, auch nicht als Tooltip.** Eine Zahl täuscht eine Kalibrierung vor, die ein
regelbasiertes System nicht hat, und ist gegenüber einer Kontrolle nicht erklärbar. Was der
Bildschirm zeigt, ist der Satz:

> Die QR-Referenz zeigt auf RE-2026-0418 von Muster Bau AG, und der Betrag stimmt auf den
> Rappen.

**Der einzige Zahlenwert, der sichtbar bleibt, ist der Namensscore** — als Chip «Name 0,93», und
nur dort, wo er wirklich gerechnet wurde. Er beschreibt eine Messung an zwei Zeichenketten und
behauptet nichts über die Richtigkeit der Zuordnung. Genau diesen Unterschied macht die
Darstellung: Abzeichen für die Konfidenz, Chip für die Messung.

### 2. `MatchReason` ist eine eigene Komponente, obwohl es sie erst einmal gibt

Der Klärungskorb wird dasselbe in einer Split-View zeigen. **Eine Formulierung für eine
Tatsache, an einer Stelle** — sonst steht in der Liste «Prüfung nötig» und im Detail
«nachkontrollieren», und beide meinen dasselbe Flag.

### 3. Der Regelkatalog ist ein Bildschirm, kein Abschnitt in den Systemeinstellungen

Unter *Bank → Zuordnungsregeln*, neben den Bankkonten und **hinter dem Modulschalter**: eine
Regel ohne Auszüge entscheidet nichts. Vorbild ist der Mahnstufen-Bildschirm.

**Das Merkmalstupel ist nach dem Anlegen gesperrt.** Eine Regel, die eine andere Frage
beantwortet, ist eine andere Regel; sie unter derselben Priorität umzuschreiben würde jeden
Vorschlag stillschweigend umbewerten, der darauf zeigt. Der Server weist es ohnehin ab, und ein
Feld, dessen Inhalt verworfen wird, ist eine Lüge.

**Was ohne Nachfrage durchgeht, steht als Text über der Tabelle** — nicht als Fussnote. Dass
genau zwei der zehn Regeln automatisch buchen dürfen, ist die wichtigste Eigenschaft dieses
Bildschirms, und sie ist aus einer Tabelle mit zehn Zeilen nicht abzulesen.

### 4. Die Toleranz sitzt auf diesem Bildschirm, nicht am Mandanten

Ein eigener Dialog hinter «Toleranz». Sie gehört zur Kaskade und nirgendwo sonst hin — und der
Text im Dialog sagt ausdrücklich, dass sie **nichts schreibt**. Das ist der Unterschied zur
Ausbuchungstoleranz und zur Überzahlungsschwelle, und er wird sonst verwechselt.

### 5. Die gelernten Zahlungskonten stehen am Partner, jedes einzeln löschbar

Ein Abschnitt im Register *Dokumente* des Partners, mit IBAN, Datum, Herkunft und
Bestätigungszahl.

**Das ist keine Bequemlichkeit, sondern revDSG Art. 25.** Eine gelernte IBAN ist ein
Personendatum am Stammsatz: das Auskunftsrecht braucht einen Ort, der es zeigt, und das
Löschrecht eine Schaltfläche, die es entfernt. **Ein Datum, das niemand sehen kann, ist ein
Recht, das niemand ausüben kann.**

Der Abschnitt **verschwindet ganz**, wenn der Mandant das Modul nicht betreibt oder nichts
gelernt wurde — ein leerer Kasten mit einer Erklärung wäre Lärm an einem Bildschirm, der ohnehin
voll ist.

## Begründung

**Warum der Namensscore als Chip bleibt und die Konfidenz nicht.** Der Score ist eine Messung
(«diese zwei Zeichenketten sind zu 0,93 ähnlich»), die Konfidenz wäre eine Behauptung («diese
Zuordnung stimmt zu 87 %»). Die erste ist überprüfbar, die zweite ist erfunden.

**Warum der Regelbildschirm die Regeln nicht sortieren lässt.** Die Priorität *ist* die
Sortierung, sie steht als Zahl da und ist eindeutig. Ein Ziehen mit der Maus müsste beim
Loslassen mehrere Zeilen umnummerieren — und jede Umnummerierung berührt eine Zeile, auf die
Vorschläge zeigen.

**Warum eine Regel abgeschaltet und nicht gelöscht wird.** Dieselbe Begründung wie im Backend:
bestehende Vorschläge zeigen darauf, und warum eine Zahlung letztes Jahr zugeordnet wurde, muss
lesbar bleiben.

## Verworfene Alternativen

**Eine Prozentzahl oder ein Balken.** Der Kern von Backend-ADR-0108; im Frontend wäre er in
einer Zeile wieder zunichte gemacht.

**Ein Ampelsymbol ohne Wort.** Grün-gelb-rot ist für rund 8 % der Männer nicht unterscheidbar,
und «rot» hiesse hier «schwacher Hinweis», nicht «Fehler» — die Farbe würde die falsche Sache
sagen.

**Den Begründungssatz nur im Tooltip.** Er ist der Belegnachweis, kein Zusatz. Was man
aufklappen muss, liest niemand.

**Die gelernten Konten in einem eigenen Bildschirm** «Zahlungskonten». Ein Auskunftsbegehren
gilt einer Person; die Angabe gehört zu dieser Person und nicht in eine Liste über alle Kunden.

**Die Regeln in den Systemeinstellungen neben den Modulen.** Dort steht, *welche* Module ein
Mandant betreibt, nicht *wie* eines rechnet.

**Den Toleranzdialog am Mandantenbildschirm**, neben der Überzahlungsschwelle. Genau die
Verwechslung, die Backend-ADR-0108 ausräumt: die eine verfügt über fremdes Geld, die andere
schreibt nichts.

## Konsequenzen

- `lib/matching.ts` ist neu, neben `lib/banking.ts`: die Auszüge sind das eine, was jemand
  daraus macht, das andere.
- `lib/types.ts` wächst um sieben Typen. `MatchProposal.partyMatch` und die zwei Nachbarn sind
  als `Exclude<…, 'EGAL'>` typisiert — `EGAL` beschreibt eine Regel, nie einen Befund, und
  TypeScript hält das fest.
- `pages/banking/MatchReason.tsx`, `pages/MatchRulePage.tsx`,
  `pages/partner/PartnerPayerAccounts.tsx`.
- Ein Navigationseintrag unter *Bank*, hinter dem Modulschalter.
- 18 neue Testfälle in `matching.test.ts`, darunter einer, der festhält, dass in keinem
  Konfidenznamen eine Ziffer vorkommt.

## Offen

- **Die Arbeitsmaske** — Split-View, Sammelaktion «alle sicheren übernehmen», Zähler — ist 6/8.
  `MatchReason` ist für sie gebaut.
- **Ein Bildschirm für die Vorschläge selbst** fehlt bewusst: ohne die Übernahme wäre er eine
  Liste, an der man nichts tun kann.
- **Eine Zuordnungsstatistik je Mandant**, damit ein Betrieb seine eigene Quote kennt.
