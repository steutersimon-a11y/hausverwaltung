# Importe und Integrationen

## Datenherkunft

Im öffentlichen Repository werden ausschließlich synthetische Fixtures gespeichert. Reale Screenshots, Exporte, Pläne und deren Abschriften gehören nach `imports/` und bleiben durch `.gitignore` ausgeschlossen. Das Weglassen aus Git ist keine Verschlüsselung: lokale Rechner und Sicherungen müssen selbst geschützt werden.

Ein früherer Pilot enthält lokal vorhandene reale Objektabschriften und amtliche Gebäudemodelle. Diese werden nicht automatisch zum öffentlichen Demobestand und nicht ungeprüft in die neue Datenbank übernommen. Eine vorhandene Gebäudekoordinate beweist noch nicht den vollständigen Verwaltungsumfang eines Objekts.

| Zustand | Kennzeichnung |
| --- | --- |
| Synthetischer Seed | `source = demo`; alle Namen, Adressen und Geometrien sind fiktiv |
| Manuell bestätigter Eintrag | `source = manual`; Bearbeiter und Änderung nachvollziehbar |
| Bestätigter Import | `source = import`, `sourceSystem`, `sourceRecordId` und Quellverweis |
| Unklare Geografie | `geoStatus = missing` oder `unverified`; keine erfundene Position |

## Screenshot- und Tabellenimport: vorgesehener Ablauf

```text
Upload → Dateiprüfung → Staging → Feldmapping → Validierung
       → Identitäts-/Dublettenprüfung → Diff → menschliche Übernahme
       → atomare Persistenz + Audit + Übernahmebericht
```

Die Umsetzung des vollständigen Review-/Übernahmeablaufs gehört zu Slice 2. Eine Dateiablage oder ein Parser allein ist noch kein abgeschlossener Importworkflow.

Für eine Screenshotzeile werden Quellbild, Zeilenposition, tatsächlich lesbare Angaben und Prüfstatus aufbewahrt. Leere Felder bleiben unbekannt; gedruckte Fragezeichen bleiben von leeren Zellen unterscheidbar. Ein erkannter Zahlenwert wird nicht still aus einer anderen Spalte abgeleitet. Die Quelle bleibt in der Reviewansicht einsehbar.

Tabellenimporte müssen vor einer Übernahme ihre Spaltenzuordnung zeigen. Die Vorschau und die Übernahme verwenden dieselbe validierte Änderungsmenge. Wiederholte Übernahme desselben Quellrecords darf keine Dublette erzeugen. Ein unvollständiger Export bedeutet nie automatisch eine Löschung. Bestehende manuelle Werte werden bei Konflikten nicht still überschrieben.

Dateinamen, CSV-Zellen und XML-/ZIP-basierte Formate sind nicht vertrauenswürdig. Bei späteren CSV-Exporten werden formelartige Werte entschärft; XLSX benötigt Größen-/Dekompressionsgrenzen. Proprietäre Backups werden ohne bekanntes unterstütztes Format nicht reverse-engineert.

## Geocoding und Kartendienste

Der Standardbetrieb verwendet keine externen Kartendienste. Ein künftiger Provideradapter muss pro Dienst dokumentieren:

- Zweck und tatsächlich gesendete Felder; zur Geokodierung nur die erforderliche Adresse.
- Nutzerentscheidung, Rechts-/Vertragsgrundlage, Datenregion und gegebenenfalls AVV.
- Lizenz, Attribution, Kosten, Kontingente, Rate-Limits, erlaubte Speicherung und Fehlerverhalten.
- Treffergenauigkeit: Gebäude, Adresse, Straße oder Ort; Mehrdeutigkeiten bleiben sichtbar.
- Herkunft und Aktualität von Gebäudeumriss, Höhe und 3D-Asset.

Mieter-/Eigentümernamen, Kontodaten, Mietbeträge und vollständige Verwaltungsmetadaten gehören nicht in Tile-URLs oder an den Kartenanbieter. Amtliche LoD2-Modelle liefern Außenkörper und Dachformen; daraus werden keine Innenaufteilung und keine geprüfte Wohnfläche abgeleitet.

## Aareon

Aktuell ist keine reale Aareon-Verbindung konfiguriert. Aareon ist eine Produktfamilie; Produkt, Version, Lizenz, unterstütztes Exportformat und zugängliche Schnittstelle müssen zuerst bekannt sein. Ein Produktname allein belegt keine API-Verfügbarkeit.

Phase A ist der generische, formatgeprüfte Stagingimport. Ein späterer Aareon-Adapter bleibt zunächst lesend und schützt manuell gepflegte Werte über Herkunft und Konfliktregeln. Schreibzugriffe auf ein echtes ERP sind ein eigener Anwendungsfall mit eigener Konfiguration. Periodischer Sync benötigt Cursor, Prüfsumme, Stichtag, Wiederholungssicherheit und einen Abgleichbericht.

## Banking und Finanzen

Es ist keine echte DKB-/Open-Banking-Verbindung eingerichtet. Ein späterer `DemoBankingProvider` arbeitet nur mit synthetischen Bewegungen. Ein `FileBankingProvider` akzeptiert nur dokumentierte und getestete Exportformate. CAMT.053 und MT940 gelten ohne Beispieldateien und Parsertests nicht als unterstützt.

Bankbewegungen bleiben als Quelle erhalten. Matching erzeugt einen erklärbaren Vorschlag; erst die fachliche Freigabe erzeugt eine Zuordnung. Identität von Ersteller und Reviewer, Periode, Konto, Rechtseinheit, Teilzahlung, Überzahlung, Sammelzahlung, Duplikat und Rücklastschrift müssen deterministisch getestet werden. Eine Zuordnung löst keine reale Überweisung aus.

## Aktuell benötigte reale Eingaben

Für weitere echte Datenübernahme genügen zunächst die überprüfbare Portfolioquelle, ein zuordenbarer Beispielgrundriss und eine Beschreibung der tatsächlich gepflegten Einheitenfelder. Für Aareon werden konkretes Produkt und ein unterstützter, bereinigter Beispielexport benötigt. Ein DKB-Kontomodell wird erst für den späteren Banking-Slice relevant und blockiert den Kernprototyp nicht.
