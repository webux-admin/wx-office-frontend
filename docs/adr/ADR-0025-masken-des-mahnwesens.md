# ADR-0025 — Masken des Mahnwesens: eigener Ordner, zwei Bildschirme, Abweichung am Kunden

- **Status:** Angenommen
- **Datum:** 2026-08-29

## Kontext

Das Backend hat das Mahnwesen als eigenes schaltbares Modul gebaut: Einstellungen, Mahnstufen
mit Fristen und Gebühren, dazu eine Abweichung je Kunde
([Backend-ADR-0092](https://github.com/webux-admin/wx-office/blob/main/docs/adr/ADR-0092-mahnwesen-als-schaltbares-modul.md),
[Backend-ADR-0093](https://github.com/webux-admin/wx-office/blob/main/docs/adr/ADR-0093-mahnstufen-als-mandantendaten.md)).

Randbedingungen:

- **Das Modul ist schaltbar.** Ein Mandant ohne Mahnwesen bekommt **409** auf jeden Aufruf.
- **Die Konfiguration entsteht beim ersten Blick** — die Maske ist der Auslöser.
- **Die Bezeichnung einer Stufe kommt aus der Liste *Mahnarten*.** Der gedruckte Titel je
  Sprache ist etwas anderes und kommt später.
- **Eine Stufe wird oben angehängt und nur von oben entfernt.**
- **Nur Abweichungen je Kunde werden gespeichert.**
- Der Auftrag verlangt wörtlich, man müsse einstellen können, *wie viele Stufen es hat*.

## Entscheidung

**Ein eigener Ordner «Mahnwesen» unter *Moduleinstellungen*** mit zwei Einträgen:
*Einstellungen* und *Mahnstufen*. Beide tragen `module: 'DUNNING'` und verschwinden mit dem
Schalter.

**Zwei Bildschirme und nicht einer.** Die Einstellungen sind ein Formular, die Stufen eine
Tabelle mit Dialog — zwei verschiedene Arbeiten.

**Die aktive Stufenzahl steht im Untertitel beider Bildschirme** («3 von 4 Stufen aktiv»).

**Die Eskalationsprüfung läuft auch im Browser**, als Hinweis über der Tabelle, nicht als
Sperre.

**Abschalten und Löschen sind eine eigene Spalte, nicht ein Zeilenmenü.** Wo eine Stufe nicht
gehen darf, ist der Knopf **deaktiviert und sichtbar**, nicht versteckt.

**Die Abweichung je Kunde steht an der Kundenmaske**, im Register *Dokumente*, neben den
Ausfertigungs-Abweichungen — und nur, wenn der Mandant das Modul betreibt.

**«Vorgabe des Mandanten» ist der oberste Eintrag der Auswahl und schreibt keine Zeile.**

**`PERMISSION_VERBS.CONFIGURE: 'Einrichten'` wird nachgetragen** — es fehlte bisher, weshalb
`OUTBOX_CONFIGURE` als Rohcode in der Rollenmatrix stand.

## Begründung

**Ein eigener Ordner und keine Zeile unter «Belege»**, weil das Mahnwesen ein Modul ist und mit
seinem Schalter verschwindet, während die Belegarten daneben bleiben. Ein Ordner, der ganz
verschwindet, ist ehrlicher als ein Ordner, aus dem zwei Zeilen verschwinden.

**Die Stufenzahl im Untertitel**, weil der Auftrag sie ausdrücklich verlangt. Eine Anforderung,
die nur dadurch erfüllt ist, dass man Zeilen zählen kann, ist nicht sichtbar erfüllt.

**Die Eskalationsprüfung als Hinweis und nicht als Sperre**, weil der Server ohnehin die Regel
hält. Der Hinweis erklärt, was schief steht, bevor jemand auf Speichern drückt — die Sperre
bliebe die des Servers.

**Deaktivierte Knöpfe statt versteckter**, weil «warum kann ich Stufe 2 nicht abschalten» sonst
eine Frage ohne Antwort auf dem Bildschirm ist. Der Satz unter der Tabelle sagt das Warum.

**Die Abweichung am Kunden und nicht in einer eigenen Liste**, weil sie eine Eigenschaft des
Kunden ist. Neben den Ausfertigungs-Abweichungen, weil es dieselbe Art Sache ist: was dieser
eine Kunde anders macht.

**«Vorgabe des Mandanten» als Auswahlwert, der nichts schreibt.** Wer heute den Wert wählt, der
zufällig der Vorgabe entspricht, friert den Kunden darauf ein — eine spätere Änderung der
Vorgabe erreicht ihn nicht mehr. Das ist genau der Unterschied, den das Backend mit «nur
Abweichungen speichern» meint, und die Maske muss ihn anbieten, sonst ist er nicht erreichbar.

## Alternativen

**Ein Bildschirm für alles.** Verworfen: ein Formular und eine Tabelle mit Dialog auf einer
Seite ist zwei Arbeiten in einem Fenster.

**Die Stufen als Auswahlliste unter *Stammdaten*.** Verworfen, aus demselben Grund, aus dem das
Backend sie nicht in `master_data_entry` gelegt hat: eine Stufe trägt Fristen und einen Betrag.
Die *Mahnarten* bleiben dort, aber sie tragen nur noch die Bezeichnung — die Beschreibung der
Liste sagt das jetzt.

**Die Eskalationsprüfung nur im Backend.** Verworfen: der Benutzer erführe erst beim Speichern,
dass Stufe 3 milder ist als Stufe 2, und müsste den Dialog erneut öffnen.

**Die Aktionen im Zeilenmenü.** Verworfen: sie sind der Zweck des Bildschirms.

**Die Abweichung je Kunde in einer eigenen Liste «Kunden mit abweichender Mahnung».**
Verworfen für diesen Schritt: der Endpunkt für die Liste steht, aber wer eine Abweichung setzt,
tut das am Kunden. Eine Übersicht lohnt sich, sobald es viele gibt.

## Konsequenzen

- **`NavModule` hat einen dritten Wert.** Die Navigation bleibt die einzige Stelle, an der die
  Modulcodes stehen.
- **`PERMISSION_MODULES.DUNNING` und `PERMISSION_VERBS.CONFIGURE`** sind nachgetragen; die
  Rollenmatrix zeigt die vier neuen Rechte lesbar, und `OUTBOX_CONFIGURE` gleich mit.
- **Der Abschalten-Dialog nennt noch keine Zahl offener Rechnungen.** Das Issue verlangt sie,
  und sie ist heute **nicht ermittelbar**: es gibt noch keinen Mahnstand an einer Rechnung, weil
  das Ausstellen erst mit Issue 5/9 kommt. Der Dialog sagt stattdessen, was mit der Stufe
  geschieht und dass sie für bereits ausgestellte Mahnungen stehen bleibt. **Die Zahl wird mit
  5/9 nachgetragen** — eine Zahl zu zeigen, die immer 0 ist, wäre eine Zusicherung, die nichts
  zusichert.
- **Die Belegart der Gebührenrechnung ist noch nicht wählbar.** Das Feld steht im Backend, die
  Maske führt es nicht, weil die Gebührenlogik erst in Issue 8/9 entscheidet, welche Belegarten
  überhaupt in Frage kommen. Solange bleibt die Gebühr auf jeder Stufe 0.00, und die Maske sagt
  warum.
- **Die Mahntexte fehlen ganz.** Sie sind Issue 3/9; der Bildschirm dafür kommt dort.
- **Die Nummer ADR-0025 statt der in Backend-Issue #57 vorgemerkten ADR-0024:** die ging an das
  Register «Zahlungen» der Rechnung, das zuerst fertig wurde. Für ein noch nicht gebautes Issue
  wird keine Nummer reserviert.
