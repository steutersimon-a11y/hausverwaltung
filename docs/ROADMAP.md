# Lieferumfang und nächste Schritte

## Implementierter Kern

| Slice | Stand |
| --- | --- |
| 0 | Workspace, lokale Dienste, Migrationen, synthetischer Seed, Designsystem, CI und Dokumentation. Einrichtung und Start tatsächlich ausgeführt. |
| 1 | Authentifizierte App, Objektberechtigungen, Karte/Liste, Gebäude-/Etagen-/Einheitennavigation, CRUD, private Grundrisse, Revisionen und Audit implementiert und im Browser geprüft. |
| 2 | CSV/JSON und private Screenshotquelle, manuelle Abschrift, editierbares Review, Konflikte, Bestätigung und atomare/idempotente Übernahme geprüft. XLSX, OCR und freies Feldmapping bleiben offen. |
| 3, Basis | Persistente Aufgaben mit Priorität/Frist, Statusübergängen, Objekt-/Einheitenbezug und Historie. Vollständiger Schaden-/Angebot-/Freigabe-/Auftragsprozess offen. |

Konkrete Prüfergebnisse: [VALIDATION.md](VALIDATION.md). Keine Produktions- oder Compliance-Freigabe aus einem erfolgreichen Build ableiten.

## Kernabnahme

- [x] Entwicklungsstart und optimierter Build gestartet, Datenbankseed geladen.
- [x] Anmeldung mit synthetischem Account; falsches Passwort verständlich abgewiesen.
- [x] Drei fiktive Liegenschaften mit mehreren Gebäuden/Etagen/Einheiten und ein ungeklärter vierter Datensatz.
- [x] Karte/Liste zum richtigen Inspector, echte gerenderte Gebäudeflächen und eigenständig bedienbare Liste.
- [x] Einheit ändern → speichern → Reload → Audit; veraltete Revision und ungültige Angaben abgelehnt.
- [x] Originaldatei privat hochgeladen, korrekt zugeordnet und byteidentisch autorisiert geladen; Versionen erhalten.
- [x] Mandantengrenze, fehlender Grant, Leserechte, CSRF und fremde Downloads direkt geprüft.
- [x] Dark/Light, mobile Liste und Tastaturfokus im Kernpfad; vollständiger WCAG-Audit offen.
- [x] Lint, Typecheck, 41 Unit-, 10 DB- und 15 Playwright-Abläufe sowie Produktionsbuild erfolgreich.
- [ ] Getrennter Backup-/Restore-Test.
- [ ] Produktive MFA-/Benutzerverwaltung, Last-/Sicherheitsprüfung und Betriebsfreigabe.

## Reale Portfolioquelle

Die 36 ausgewählten Originalobjekte sind lokal als nicht bestätigte Importprüfung vorbereitet. Alle grauen Quellzeilen sind enthalten; der vom Nutzer ausgeschlossene Eintrag bleibt ausgelassen. Keine Verwaltungsarten, Mieterdaten, Flächen oder Standorte wurden ergänzt. Echte Daten und abgerufene amtliche Modelle bleiben aus dem öffentlichen Repository ausgeschlossen.

Nächste Schritte:

1. Verwaltungsart und unsichere Adressfelder im Review bestätigen; widersprüchliche Einheitensumme separat klären. Keine Einheiten aus Summen erfinden.
2. Vorhandenen Grundriss dem richtigen Objekt bzw. der Einheit zuordnen; Maßstab und anklickbare Einheiten-/Raumflächen ergänzen.
3. Kontrollierten GLB-/glTF-Import mit Vorschau, Position, Rotation, Skalierung und bestätigtem Gebäudeumfang implementieren. Die drei erhaltenen amtlichen Modelle können dafür die reale Grundlage bilden.

## Weitere Fachslices

| Slice | Offen |
| --- | --- |
| 3, Ausbau | Schäden, Angebote, Freigaben, Aufträge, Zuständigkeiten, Wartung und vollständige Vorgangsakte. |
| 4 | Zeitlich gültige Mietkomponenten, Sollforderungen/Zahlungen, Demo-/Dateibanking, erklärbares Matching, getrennte Freigabe und Teil-/Überzahlung/Rücklastschrift. Mindestens zehn deterministische Matchingtests erst mit diesem Modul. |
| 5 | Aareon-Konkretadapter nach bekanntem Produkt, Version, Format und Nutzungsrechten; Cursor, Herkunft, Konflikte, Abgleichbericht. |
| 6 | Vollständiger MFA-/Benutzerlebenszyklus, Rechteverwaltung, RLS als zusätzliche Schutzschicht, Malware-Quarantäne, Restore-Test, Last-/Sicherheits-/Accessibility-Audit und Betrieb. |
| WEG/Miete | Verträge, Eigentumsanteile, Beschlüsse, Hausgeld, Wirtschaftsplan, Abrechnung, Betriebskosten und fachlich geprüfte Prozesse. Das Domänenmodell beschreibt Ziel und Erweiterungspunkte; diese Module sind nicht fertig. |

Keine automatischen Nachrichten, Mahnungen, Bankzahlungen, Live-ERP-Verbindungen oder Produktionsaktivierungen sind eingerichtet. Ein Grundrissupload erzeugt kein maßgeprüftes Architekturmodell. Aufbewahrung und Rechts-/Buchhaltungsanforderungen benötigen eine eigene fachliche Abnahme.
