# Schriften

Beide Familien liegen hier im Projekt und werden von der Anwendung selbst ausgeliefert.
Es geht keine Anfrage an einen Font-CDN. Der erste Paint wartet auf niemanden, eine
Installation hinter einer Firmen-Firewall bekommt trotzdem ihre Buchstaben, und kein Besucher
wird bei jedem Seitenaufruf einem fremden Host gemeldet.

| Datei                          | Familie          | Achsen      | Herkunft                                            |
| ------------------------------ | ---------------- | ----------- | --------------------------------------------------- |
| `GoogleSansFlex-latin.woff2`     | Google Sans Flex | `opsz`, `wght` | Google Fonts, Subset `latin`                        |
| `GoogleSansFlex-latin-ext.woff2` | Google Sans Flex | `opsz`, `wght` | Google Fonts, Subset `latin-ext`                    |
| `GeistMono-latin.woff2`          | Geist Mono       | `wght`      | Google Fonts, Subset `latin`                        |
| `GeistMono-latin-ext.woff2`      | Geist Mono       | `wght`      | Google Fonts, Subset `latin-ext`                    |

Es sind Variable Fonts: das Gewicht ist eine Achse, keine Datei je Schnitt. Bei Google Sans
Flex kommt `opsz` dazu: die Zeichnung passt sich der Schriftgrösse an. Darum steht
`font-optical-sizing` nirgends fest, die Automatik ist genau der Sinn der Achse.

Geladen werden nur `latin` und `latin-ext`. Das deckt Deutsch, Französisch und Italienisch ab.
Wer weitere Subsets braucht (Griechisch, Kyrillisch), holt sie vom selben Endpunkt und ergänzt
eine `@font-face`-Regel mit der passenden `unicode-range` in `src/index.css`.

## Lizenz

Beide stehen unter der **SIL Open Font License 1.1**. Damit dürfen sie kommerziell verwendet,
in Software eingebettet und mitgeliefert werden. Zwei Auflagen sind zu beachten:

- Die Lizenzdatei bleibt bei der Schrift, deshalb liegen `GoogleSansFlex-OFL.txt` und
  `GeistMono-OFL.txt` hier und nicht nur im Repository-Wurzelverzeichnis.
- Die Schrift darf nicht für sich allein verkauft werden, und eine geänderte Fassung darf den
  ursprünglichen Namen nicht weiterführen.

Google Sans Flex wird von Google Fonts mit `"license": "ofl"` und `"isOpenSource": true`
ausgewiesen; als Gestalter ist Google genannt. Die mitgelieferte `OFL.txt` enthält den
Lizenztext ohne eigene Copyright-Zeile. Das ist so ausgeliefert und hier unverändert
übernommen. Geist Mono trägt `Copyright 2024 The Geist Project Authors`.

## Aktualisieren

Die Dateien stammen aus dem `css2`-Endpunkt von Google Fonts, der bereits woff2 nach
`unicode-range` zerlegt liefert. Zum Nachziehen einer neuen Version dieselben Subsets erneut
holen und die `unicode-range`-Angaben in `src/index.css` mit der Antwort abgleichen.
