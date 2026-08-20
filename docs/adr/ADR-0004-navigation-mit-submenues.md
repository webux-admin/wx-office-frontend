# ADR-0004 — Navigation: jede Liste ein Eintrag, Submenüs statt Reiter

- **Status:** Angenommen
- **Datum:** 2026-08-20
- **Verhältnis:** Löst die Route `/auswahllisten` aus
  [ADR-0002](ADR-0002-stammdatenpflege-im-frontend.md) ab. Die drei übrigen Masken dieses
  ADR — `/feste-werte`, `/zahlungskonditionen`, `/mehrwertsteuer` — bleiben, wie sie sind,
  ebenso seine fünf Festlegungen zur Bezeichnung, zum vollständigen PUT und zum Rechnen.

## Kontext

Die Seitenleiste zählte fünfzehn Einträge, davon neun unter *Einstellungen*. Zwei davon waren
Sammelmasken mit Reitern:

- **Auswahllisten** (`/auswahllisten`) — acht gepflegte Listen hinter acht Reitern
- **Feste Werte** (`/feste-werte`) — neun Kataloge hinter neun Reitern

Wer eine Einheit suchte, musste wissen, dass «Einheiten» ein Reiter auf einer Maske namens
«Auswahllisten» ist. Das Wort steht auf keinem Beleg und in keinem Gespräch. Dazu kam: der
aktive Reiter war lokaler Zustand, es gab **keinen Deep-Link** auf eine einzelne Liste — jeder
Aufruf landete auf Rechtsformen.

Gleichzeitig wurden im Backend drei Listen ergänzt (Zahlungsarten, Mahnarten,
Verrechnungsarten, siehe ADR-0028 dort), womit die Sammelmaske auf elf Reiter gewachsen wäre.

## Entscheidung

**Jede gepflegte Liste ist ein eigener Bildschirm** unter `/basisdaten/<liste>` und ein eigener
Menüeintrag. Die Sammelmaske «Auswahllisten» verschwindet als Begriff; ihre Adresse leitet auf
die erste Liste um, damit ein Lesezeichen nicht ins Leere zeigt.

Dazu vier Festlegungen:

1. **Eine Quelle für die Listen.** `lib/basicData.ts` hält Slug, API-Liste, Bezeichnung und
   Beschreibung. Die Route liest daraus, das Menü verweist darauf, `navigation.test.ts` prüft,
   dass keine Liste im Menü fehlt. Ein Segment, das keine Liste kennt, leitet auf die erste um
   statt eine leere Maske zu zeigen.
2. **Die Gruppen heissen nach der Arbeit, nicht nach dem Modul**: *Übersicht*, *Verkauf*,
   *Stammdaten*, *Basisdaten*, *Einstellungen*.
3. **Ein Eintrag darf aufklappen.** `NavFolder` bündelt Bildschirme, von denen man einen
   zurzeit braucht — *Verkaufskonditionen* (Zahlungskonditionen, Preisgruppen) und *Weitere
   Werte* (die sechs Listen, die man einmal einrichtet). Er steht offen, **solange** der
   angezeigte Bildschirm darin liegt — auch wenn man per Adresse hineinspringt, weshalb er der
   Route folgt statt beim Aufbau einmal zu entscheiden. Ein Klick überstimmt das für die
   Sitzung. Über sie hinaus merkt er sich nichts: das Auf und Zu ist eine Art zu schauen, keine
   Einstellung.
4. **Die eingeklappte Leiste zeigt die Bildschirme selbst.** 64 Pixel haben keinen Platz zum
   Aufklappen, deshalb werden die Ordner dort aufgelöst (`flattenNav`). Jeder Bildschirm bleibt
   einen Klick entfernt.

Die **Feste Werte** bleiben eine Maske mit ihren neun Reitern. Sie steuern Logik, kein Wert
kommt dazu, und angefasst werden sie selten.

## Begründung

Ein Menüeintrag ist die einzige Stelle, an der die Anwendung sagt, was sie kann. Was hinter
einem Reiter liegt, sagt sie nicht — man muss es schon wissen. Elf Listen hinter einem Wort zu
verstecken, das keiner sucht, ist der teuerste Weg, eine Oberfläche unauffindbar zu machen.

Der Deep-Link ist der zweite Gewinn, und er kostet nichts extra: eine Liste lässt sich
verlinken, als Lesezeichen ablegen und aus einer Fehlermeldung heraus ansteuern.

Die Ordner sind der Ausgleich dafür. Ohne sie stünden zwölf Zeilen unter *Basisdaten* — dann
wäre die Übersichtlichkeit an der Stelle verloren, an der sie gewonnen werden sollte. Was
täglich gebraucht wird, steht direkt da; was einmal eingerichtet wird, eine Faltung tiefer.

## Alternativen

**Alles unter «Auswahllisten» lassen und nur die Gruppen neu ordnen.** Verworfen: der kleinste
Eingriff, der das eigentliche Problem nicht anfasst — die Reiter blieben unauffindbar und
unverlinkbar.

**Nur Einheiten, Währungen und MWST-Sätze hochziehen, den Rest hinter der Sammelmaske
lassen.** Verworfen. Zwei Wege zum selben Ort, und die Frage «warum steht Sprachen nicht im
Menü» wäre nicht zu beantworten.

**Die Gruppentitel selbst aufklappbar machen.** Verworfen. Dann klickt man erst eine Gruppe
auf, um zu sehen, dass sie einen einzigen Eintrag hat — *Übersicht* und *Verkauf* haben je
einen. Ein Titel ist eine Beschriftung, kein Bedienelement.

**Die Reiter als Deep-Link in der Adresse führen (`/auswahllisten?liste=einheiten`).**
Verworfen. Das löst den Link, nicht die Auffindbarkeit: im Menü stünde weiter ein Wort, das
niemand sucht.

## Konsequenzen

- Die Seitenleiste zeigt statt fünfzehn Zeilen nun neunzehn, davon zwei Faltungen; acht
  weitere Zeilen liegen darin und erscheinen erst beim Aufklappen. Erreichbar sind damit
  fünfundzwanzig Bildschirme statt fünfzehn. Der Tausch ist bewusst: mehr Namen, dafür sind es
  die Namen, nach denen jemand sucht.
- `AppShell.tsx` hält keine Navigationsdaten mehr; sie stehen in `layout/navigation.ts` und
  sind damit ohne Renderer prüfbar. `NAV_GROUPS` wäre in einer Komponentendatei ausserdem ein
  Verstoss gegen `react-refresh/only-export-components`.
- **Ein Menüpunkt «Mahnarten» pflegt heute Werte, die nichts liest.** Dasselbe gilt für
  Zahlungsarten und Verrechnungsarten — die Listen existieren, ihre Abnehmer noch nicht
  (ADR-0028 im Backend). Das ist der Preis der Entscheidung, die drei Begriffe jetzt zu bauen.
- **«MWST-Sätze» steht unter *Basisdaten*, ist aber rein lesend.** Die Sätze sind eidgenössisch
  und haben keinen Schreibendpunkt. Unter einer Überschrift, unter der sonst gepflegt wird,
  verspricht der Eintrag mehr, als die Maske hält; die Maske selbst sagt in einem Satz, warum.
- Seite, Sortierung und Suchbegriff einer Liste stehen weiterhin in `useState`, nicht in der
  Adresse. Der Deep-Link führt auf die Liste, nicht auf eine Stelle darin.
