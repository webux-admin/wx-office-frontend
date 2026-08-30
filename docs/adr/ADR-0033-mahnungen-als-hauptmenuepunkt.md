# ADR-0033 — Mahnungen als ein Menüpunkt, mit «Neuer Mahnlauf erstellen»

- **Status:** Angenommen
- **Datum:** 2026-08-30
- **Verhältnis:** wendet [ADR-0031](ADR-0031-ordner-ist-registerleiste.md) an und berührt
  [ADR-0026](ADR-0026-mahnvorschlag-eine-zeile-ist-ein-brief.md),
  [ADR-0027](ADR-0027-mahnungen-ausstellen-und-zuruckziehen.md) und
  [ADR-0029](ADR-0029-mahnstopp-in-der-maske.md) in **genau einem Punkt**: die drei
  Bildschirme stehen zusätzlich als Register nebeneinander. Keiner der drei wird abgelöst oder
  editiert; ihre Aussagen über Modulschalter, Auswahl und Stopp gelten unverändert.

## Kontext

Drei Zeilen unter *Verkauf* — «Mahnvorschlag», «Mahnungen», «Mahnstopps» —, drei Bildschirme,
die zusammengehören und von denen einer nach dem anderen gebraucht wird.

Randbedingungen:

- **Der Modulschalter sitzt nicht überall gleich.** «Mahnungen» trägt keinen: eine ausgestellte
  Mahnung ist Geschäftskorrespondenz mit zehnjähriger Aufbewahrungspflicht (Backend-ADR-0092,
  Frontend-ADR-0027). Vorschlag und Stopps tragen ihn, weil sie Einstellungen des Moduls sind
  (Frontend-ADR-0026, ADR-0029).
- **Nur ein Bildschirm hat heute eine Kopfaktion**, der Vorschlag: Stichtagsfeld und
  Freigabeknopf. Der Stichtag ist blosser Bildschirmzustand und steht in keiner Adresse.
- **Backend-ADR-0096 verwirft den Automaten:** «Der Arbeitsvorrat ist eine Abfrage, das
  Ausstellen eine bewusste Freigabe. Es gibt keinen `@Scheduled`-Lauf.»
- Das Wort «Mahnlauf» steht im Haus bereits dreimal: als Panel-Titel der Einstellungsmaske, im
  Dateinamen von ADR-0028 und im Namen des gedruckten Sammel-PDF.

## Entscheidung

**Ein Ordner «Mahnungen» unter *Verkauf* mit drei Registern in dieser Reihenfolge:**
Mahnungen, Mahnvorschlag, Mahnstopps.

**Der Schalter sitzt am Register, nicht am Ordner.** Der Ordner trägt `permission`, aber kein
`module`; das erste Kind trägt ebenfalls keines, die beiden anderen `DUNNING`.

**Vorgaberegister ist «Mahnungen»** — es ist das schalterfreie, und der Ordnerkopf öffnet nach
ADR-0031 das erste sichtbare Kind.

**Oben rechts auf allen drei Registern steht «Neuer Mahnlauf erstellen».** Der Knopf öffnet
einen Dialog «Mahnlauf» mit einem Feld — Stichtag — und führt auf den Mahnvorschlag. **Er
stellt nichts aus und ruft nichts.**

**Der Stichtag reist als Suchparameter** `?stichtag=yyyy-MM-dd`.

## Begründung

**«Mahnungen» zuerst, weil es das Register ist, das immer da ist.** Ein Mandant ohne Mahnwesen
behält genau dieses eine — und bekommt eine Leiste mit einem Link, nicht einen Ordner, der ins
Leere führt. Hätte der Ordner selbst ein `module`, nähme ein Schalter die
aufbewahrungspflichtige Liste mit; genau das verbietet ADR-0027.

**Der Knopf löst ADR-0096 nicht ab, weil ADR-0096 den Zeitgeber verwirft und nicht das Wort.**
Er startet nichts: er nimmt einen Stichtag entgegen und navigiert. Dahinter steht derselbe
Mensch vor derselben Liste und demselben Bestätigungsdialog — «die einzige Stelle, an der der
Irrtum noch auffällt». Was sich ändert, ist die Beschriftung: der Sachbearbeiter nennt diese
Arbeit «Mahnlauf», und die Oberfläche darf ihn beim Namen nennen, solange kein Automat
dahintersteht. Der Knopf im Dialog heisst deshalb **«Vorschlag rechnen»** und nicht «Starten».

**Das Recht am Knopf ist `DUNNING_READ`, nicht `DUNNING_RUN`.** Er mahnt niemanden. Die
Freigabe behält ihr eigenes Recht, dort wo sie stattfindet.

**Der Stichtag gehört in die Adresse.** Der Dialog muss ihn an den Vorschlag übergeben können,
ein Neuladen darf ihn nicht verlieren, und ein Link auf «was wäre am 30.06. zu mahnen» ist
brauchbar. `location.state` überlebt kein Neuladen. ADR-0026 bleibt gültig: das Kopffeld ist
der Herr, der Parameter trägt den Wert nur herein — wer das Feld ändert, schreibt ihn zurück.

**Ein unlesbarer Parameter ist heute.** Eine von Hand geschriebene Adresse darf den
Arbeitsvorrat nicht in einen Zustand bringen, den er nicht rechnen kann.

**Panel-Titel und Dialog heissen beide «Mahnlauf», und keiner wird umbenannt.** Beide meinen
dieselbe Sache — was für einen Lauf gilt, und der Lauf selbst. Ein zweites Wort für dieselbe
Arbeit wäre die teurere Verwirrung.

## Alternativen

**«Arbeitsvorrat öffnen» als Beschriftung.** Verworfen: ein Wort aus dem Backend, das auf
keinem Beleg und in keinem Kundengespräch vorkommt.

**Ein Knopf, der ohne Dialog sofort ausstellt.** Verworfen: das ist der Automat mit einem
Menschen als Auslöser, und genau ihn hat ADR-0096 abgelehnt.

**Der Stichtag im `location.state`.** Verworfen: überlebt kein Neuladen und lässt sich nicht
verlinken.

**`module` am Ordner.** Verworfen: nähme die aufbewahrungspflichtige Liste mit.

**`DUNNING_RUN` am Knopf.** Verworfen: er stellt nichts aus, und ein Leser darf den Vorschlag
sehen.

**Zwei verschiedene Wörter für Panel und Dialog.** Verworfen, siehe oben.

**Alle sechs stehen hier, damit sie in einem Jahr nicht erneut vorgeschlagen werden.**

## Konsequenzen

- Aus drei Menüzeilen wird eine; kein Bildschirm verschwindet, keine Route ändert sich, alle
  drei Lesezeichen öffnen dasselbe wie vorher.
- **Ein Mandant ohne Mahnwesen sieht einen Ordner mit einem Register und keinen Knopf** — und
  seine ausgestellten Mahnungen. Das setzt voraus, dass die mandantenweite Liste ohne Modul
  antwortet; der Fehler war echt und ist mit #71 behoben.
- Die Einrichtung wird **kein** viertes Register: ihr Ordner steht unter *Moduleinstellungen*
  und verschwindet dort ganz, wenn das Modul aus ist (ADR-0025).
- Der Mahnvorschlag hat ab jetzt zwei Kopfaktionen: den Laufknopf und die Freigabe. Sie stehen
  nebeneinander, weil sie zwei verschiedene Dinge tun.
- **Die erste Testdatei für eine Mahnmaske entsteht mit dieser Arbeit.** Sechs der sechs
  Mahnbildschirme hatten keine; die Aufbewahrungsregel lebte in keinem Frontend-Test.
- Offen: der Stichtag steht jetzt in der Adresse des Vorschlags, aber nicht in der von
  «Mahnungen» oder «Mahnstopps». Wer vom Vorschlag auf ein Nachbarregister wechselt und
  zurückkommt, steht wieder auf heute. Das ist richtig so — der Stichtag ist eine Frage an den
  Vorschlag, nicht an die drei Bildschirme.
