# Validierung – 6. November 2026

Die Anwendung wurde tatsächlich mit PostgreSQL/PostGIS, privatem S3-Speicher und Chromium gestartet. Dies ist keine Produktions-, Rechts-, Compliance- oder WCAG-Zertifizierung.

| Prüfung | Ergebnis | Nachweis / Grenze |
| --- | --- | --- |
| Installation | Bestanden | Node 24.22.1, pnpm 11.25.0, Lockfile und freigegebene esbuild-Installationsskripte. |
| Lokale Dienste | Bestanden | PostGIS 17-3.5-alpine und SeaweedFS 4.38 healthy; nur Loopback-Ports. |
| Migrationen und Seed | Bestanden | Migrationen 0001–0003; vier fiktive Objekte, davon drei mit sechs Gebäuden, 18 Geschossen und 36 Einheiten. Vierter Datensatz ohne erfundene Geografie; Seed idempotent. |
| Lint | Bestanden | Root-Lint ohne Warnungen; unveränderter lizenzierter MapLibre-Worker als Fremdcode ausgenommen. |
| Typecheck | Bestanden | Web-App, Pakete, Skripte und Tests unter TypeScript strict. |
| Unit-Tests | Bestanden | **51 Tests** für Uploads/Bildgrenzen, Importparser, Geografiegates und die private Browser-Konfiguration. |
| DB-Integration | Bestanden | **10 Tests** für organisations-/objektbezogene FKs, Constraints, PostGIS-Index und unveränderbare Audit-Historie. |
| Playwright | Bestanden | **15 Abläufe**, sequenziell in zwei Läufen: Zugriff/Kern/Lifecycle (12) und Importreview (3). Keine API-Mocks. |
| Produktionsbuild | Bestanden | Next.js 16.4.5 / React 19.3.1; optimierter Build einschließlich TypeScript und Routen. |
| Optimierter Start | Bestanden | `pnpm start` auf 127.0.0.1:3000; echte Browseranmeldung, gerenderte 3D-Flächen und Dark-/Light-Screenshots. |
| Falsches Passwort | Bestanden | HTTP 401 und sichtbare verständliche Meldung; richtige Anmeldung anschließend erfolgreich. |
| Browsernetzwerk | Geprüft | Produktions-Browserlauf ohne JavaScriptfehler und ohne Requests an externe Hosts im Standardpfad. Better-Auth-Telemetrie explizit deaktiviert; Next-Telemetrie im Startbeispiel deaktiviert. |
| Mobile/Tastatur | Kernpfad bestanden | 390×844: Liste, Command Palette, Fokus und persistierendes Theme. Desktop mit reduzierter Bewegung. Vollständiger Accessibility-Audit offen. |
| Backup/Restore | Offen | Anleitung vorhanden, getrennte Wiederherstellungsabnahme nicht ausgeführt. |
| GitHub-CI | Separater Nachweis | Workflow vorhanden; lokale Ergebnisse ersetzen keinen beobachteten Actions-Lauf. |
| Browser-Startkonfiguration | Lokal geprüft | Compose-Auflösung, Shellsyntax und zehn Tests für exakte Vorschauadresse, Konfigurationserhalt und private Auth-Secrets. Noch kein echter Codespace erstellt oder gestartet. |

## Geprüfte Abläufe

- Login → Objekt → Gebäude → Geschoss → Einheit; Fläche/Notiz ändern, speichern, neu laden und Audit öffnen.
- Tatsächlich gerenderte 3D-Gebäude aus gespeicherten Geometrien, lokaler Worker; mehrere Gebäude eines Objekts werden gemeinsam eingerahmt.
- PNG-Grundriss privat hochladen, einer Einheit zuordnen, anzeigen, zoomen/drehen und byteidentisch laden.
- Organisationsgrenze, Objektgrant, Leserechte, CSRF-Origin und Revision serverseitig prüfen; fremde Objekt-, Einheiten-, Datei- und Importquellen-IDs verweigern Zugriff.
- Einheit anlegen, Duplikat verweigern, ändern und archivieren; Audit und Originaldokument bleiben erhalten.
- Aufgabe offen → in Bearbeitung → erledigt; Statushistorie und Rechte bleiben erhalten.
- Dokumentversionen bleiben einzeln und byteidentisch abrufbar; FK-Widersprüche und alte Revisionen werden abgelehnt.
- CSV nur nach Review und expliziter Bestätigung übernehmen; unveränderte Wiedereinfuhr erzeugt keine Dublette oder künstliche Einheiten.
- Screenshot als private manuelle Quelle, speicherbares Review und geschütztes Original. Fehlerhafte/zu große Dateien, Formeln und doppelte Identitäten bleiben blockiert.

Die Tests respektieren Better Auths Anmeldebegrenzung mit Server-Backoff bei HTTP 429; die Schutzfunktion wurde nicht abgeschaltet.

## Ausgeführte Kommandos

`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:e2e`, `pnpm exec playwright test tests/e2e/import-review.spec.ts`, `pnpm build`, `pnpm start`.

Die 15 Playwright-Abläufe wurden als zwölf Kern-/API-Abläufe und anschließend drei Importabläufe ausgeführt. Das gemeinsame Root-Script entdeckt inzwischen alle 15. Eine ergänzende Produktions-Browserprüfung bestätigte Anmeldung, Fehleranzeige, Renderzustand und Netzwerkpfad.

## Screenshots

Aufnahmen aus der optimierten App, ausschließlich synthetische Daten. Nach Importtests kann die Demo mehr als die vier Seedobjekte enthalten.

- [Dark Mode](screenshots/portfolio-dark.png)
- [Light Mode](screenshots/portfolio-light.png)

## Behobene Umgebungsprobleme

Die Cloud-Umgebung hat etwa 8 GB beschreibbaren Speicher und Docker-VFS. Für lokale QA wurden identische, nie gestartete Image-Dateisysteme per `docker export`/`docker import` zu temporären flachen Kopien zusammengeführt. Nur eigene temporäre Container und ungenutzte Originalkopien wurden entfernt; kein Speichertreiberwechsel und kein Löschen von Datenvolumes. `work/compose-cloud.yml` bleibt ignoriert; das öffentliche Compose verwendet offizielle Images.

MinIO-Images waren über Docker Hub nicht verfügbar und über Quay nicht anonym abrufbar. SeaweedFS 4.38 wurde als privater S3-kompatibler Entwicklungsdienst geprüft. Der Loopback-Healthcheck vermeidet eine Proxy-Umleitung dieses lokalen Aufrufs.

pnpm benötigte beschreibbare XDG-Cachepfade. Die pnpm-11-Konfiguration verwendet `allowBuilds`. Next startet über einen Umgebungs-Loader, weil direkte Node-Envfile-Flags unzulässig in `NODE_OPTIONS` weitergegeben wurden. MapLibre erhält einen passenden lokalen Worker, weil Turbopack die ursprüngliche Worker-URL nicht korrekt bewahrte. Der echte Dialogfokus wurde korrigiert.

## Reale Daten und offene Prüfungen

36 Originalobjekte liegen nur lokal unter dem ignorierten Importbereich und als nicht bestätigter Reviewbatch. Keine Übernahme in den aktiven Bestand: Verwaltungsarten und unsichere Adressfelder benötigen menschliche Prüfung. Die drei vorhandenen amtlichen Modelle bleiben lokal erhalten; kontrollierter GLB-Import ist noch offen.

Offen: vollständige MFA-/Nutzerverwaltung, Finanz-/WEG-Fachmodule, Live-Aareon/Banking, Malware-Quarantäne, Last-/Sicherheits-/Accessibility-Audit und Restore-Abnahme. Für nicht implementiertes Finanzmatching werden keine Testerfolge behauptet.
