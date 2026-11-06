> Vom Nutzer zur Umsetzung bereitgestellte Anforderungsquelle. Der geprüfte Ist-Stand steht in ROADMAP.md und VALIDATION.md. Angaben zu künftigen Modulen sind keine Fertigmeldung.

# MASTER-PROMPT FÜR CODEX – ATLAS PROPERTY OS

Du agierst als verantwortlicher Principal Software Engineer, Software Architect, Product Designer, Security Engineer und Spezialist für deutsche Miet- und WEG-Verwaltung. Dein Auftrag ist nicht, mir lediglich ein Konzept zu schreiben: **Baue in diesem Repository einen ausführbaren, hochwertig gestalteten, erweiterbaren Prototypen** der nachfolgend beschriebenen Anwendung. Arbeite selbstständig und iterativ, dokumentiere technische Entscheidungen, implementiere reale End-to-End-Abläufe mit Testdaten und führe Tests aus. Verwende sinnvolle Defaults, statt dich in Rückfragen zu verlieren. Fehlende personenbezogene Daten, geheime Zugangsdaten, Gebäudemodelle, Grundrisse oder Schnittstellen dürfen jedoch **niemals erfunden oder als echt ausgegeben** werden.

## 0. Kontext, Vision und Rahmen

**Arbeitstitel:** ATLAS Property OS (in den Einstellungen später umbenennbar).

Wir bauen eine moderne, deutschsprachige, zunächst intern genutzte Hausverwaltungsplattform für ein Familienunternehmen mit mehreren Verwaltungsobjekten. Die Software soll die klassische Miet- und WEG-Verwaltung durch eine räumliche, intuitive 3D-Objektansicht ergänzen. Langfristig können Immobilien-, Einheiten-, Eigentümer-, Mieter-, Vertrags-, Dokumenten-, Zahlungs-, Aufgaben- und Wartungsdaten an einem Ort zusammenlaufen.

Die Anwendung ist zunächst **ein Management- und Informations-Layer / Prototyp**, nicht stillschweigend der rechtlich oder buchhalterisch geprüfte Ersatz eines etablierten ERP-/Buchhaltungs-/DMS-Systems. Für produktiven Einsatz mit echten Personen-, Finanz- oder aufbewahrungspflichtigen Daten sind zusätzliche Freigaben, Datenschutz-, Sicherheits-, Verfahrens- und Compliance-Prüfungen nötig. Es darf keine behauptete GoBD-/DSGVO-/WEG-Zertifizierung geben.

**Wichtig:** Der Nutzer wird eine **Screenshot-Liste der realen Verwaltungsobjekte** in Codex als Bild anhängen oder im Repository unter `imports/portfolio-list.*` bereitstellen. Verwende diese ausschließlich als Quelle für die tatsächlich sichtbaren Objektinformationen. Falls der Screenshot noch nicht vorhanden ist: Implementiere den kompletten Upload-/Review-Workflow und starte mit ausdrücklich fiktiven Demoobjekten. Bitte nur dann gezielt um den Screenshot, wenn du ihn für die echten Objektdaten wirklich benötigst. Niemals Adressen, Namen, Mieten, Kontodaten oder Geometrien dazuerfinden. Eventuell erkennbare Daten nur nach menschlicher Bestätigung in den echten Objektbestand übernehmen.

**Arbeitsmodus:** Code first, running vertical slices, security by design, no fake buttons, no hardcoded feature screens without persistence. Funktionen ohne echte externe Zugänge müssen über einen klar gekennzeichneten Demo-Adapter vollständig testbar sein.

## 1. Produktziele und Use Cases

1. Ich sehe alle Verwaltungsobjekte auf einer eleganten, interaktiven Karte; zusätzlich gibt es eine leistungsfähige Listenansicht mit denselben Filtern.
2. Ich kann zu einem Gebäude fliegen, es auswählen, perspektivisch betrachten und innerhalb einer hierarchischen Gebäudestruktur von Gebäude -> Hausaufgang -> Geschoss -> Einheit navigieren (sofern diese Ebenen tatsächlich existieren).
3. Ich kann eine Einheit öffnen: Lage, Fläche, Nutzungsart, Vermietungsstatus, Mieter-/Eigentümerbeziehungen, Vertragsdaten, Sollmieten, Mietverlauf, Zahlungsstatus, Grundriss, Dokumente, offene Aufgaben und Historie.
4. Ich kann Daten ergänzen und ändern; jede relevante Änderung wird validiert, versioniert, nachvollziehbar protokolliert und bei kritischen Feldern zur Freigabe vorgemerkt.
5. Ich kann Mieteingänge und andere Forderungen periodenbezogen prüfen; Banktransaktionen werden als Vorschläge zugeordnet und nach nachvollziehbaren Regeln freigegeben.
6. Ich kann neue Stammdaten aus Screenshot, CSV/XLSX oder später einem unterstützten Aareon-Export importieren – stets zunächst in eine Staging-/Review-Ansicht mit Diff, Konflikten und expliziter Übernahme.
7. Ich kann klassische Verwaltungsaufgaben bearbeiten: Tickets, Schäden, Dienstleister, Wartungen, Fristen, Leerstände, Dokumente, Mieterwechsel und WEG-spezifische Vorgänge.
8. Ich erkenne über ein Portfolio-Dashboard Engpässe, Rückstände, offene Entscheidungen und unvollständige Daten.

## 2. Designrichtung – hochwertig, aber arbeitsfähig

Baue ein wiedererkennbares, produktreifes UI, nicht ein austauschbares Dashboard-Template. Inspiration: präzise Architekturvisualisierung, ruhige Enterprise-Fintech-Oberflächen und professionelles GIS. Keine überladenen Verläufe oder Glassmorphism-Spielereien.

- Default Dark Mode: tiefes Schiefer-/Graphitblau, warme neutrale Flächen, kontrastreiche Typografie; Akzente zurückhaltend in Petrol/Mint, ggf. Champagner für ausgewählte Highlights; zusätzlich echter Light Mode.
- Desktop-first mit linker, einklappbarer Navigation, zentraler Karten-/Arbeitsfläche, rechts kontextsensitivem Inspector/Drawer. Tablet gut bedienbar; mobile reduzierte Objekt-/Aufgabenansicht.
- Sanfte Kamerafahrten, dezente Übergänge, Skeletons, leere Zustände, präzise Lade- und Fehlerzustände, Tastatursteuerung und Command Palette (Suche nach Adresse, Objekt-ID, Einheit, berechtigten Namen, Vorgang).
- WCAG 2.2 AA als Ziel: Kontraste, Tastaturbedienung, Fokuszustände, reduzierte Bewegung, semantische Labels. Tabelle und Suchfunktion dürfen nie nur über 3D bedienbar sein.
- Objekte auf der Karte mit dezenten, **aggregierten** Statusindikatoren. Keine Namen, konkreten Mietbeträge oder sonstigen personenbezogenen Daten in öffentlich geladene Map-Tiles, URLs oder Client-Logs schreiben.
- Erzeuge zu Beginn eine konsistente Designsystem-Bibliothek (Tokens, Typografie, Abstände, Tabellen, Dialoge, Formulare, Toasts, Drawers, Tooltips, Badges, Statusfarben) und verwende sie überall.

## 3. Technische Zielarchitektur

Wähle einen **modularen Monolithen** mit gut separierten fachlichen Modulen, keine voreiligen Microservices. Vorschlag – prüfe bei Umsetzung die Kompatibilität und nutze jeweils stabile, unterstützte Versionen:

- Next.js 16 (App Router), React, TypeScript `strict`, pnpm.
- Tailwind CSS, shadcn/ui bzw. Radix-Primitives, Lucide Icons, sparsame Motion-Animationen.
- MapLibre GL JS mit rechtmäßig nutzbarem Vektor-Kartendienst. Kartendienst über Provider-Adapter konfigurierbar; Lizenz, Attribution, Kosten und Geocoding-Rate-Limits dokumentieren.
- Für anfängliches 3D: MapLibre `fill-extrusion` aus verfügbaren, lizenzierten Gebäudegrundrissen und Höhen; für tatsächlich vorhandene Modelle separate Three.js-/glTF-/GLB-Anzeige bzw. geeignete MapLibre-Integration. 3D Tiles/CityGML/IFC nur als spätere Adapter, wenn echte Daten und Nutzungsrechte vorhanden sind.
- PostgreSQL + PostGIS; Drizzle ORM (oder begründet gleichwertige Alternative), sauber versionierte SQL-Migrationen, Geometrieindizes, Foreign Keys, eindeutige Schlüssel, Check-Constraints.
- S3-kompatibler Dokumentenspeicher; lokal für Entwicklung z. B. MinIO; keine hochgeladenen privaten Dokumente im öffentlich erreichbaren `public/`-Verzeichnis.
- Server-seitige, validierte Domain-Services und API-Routen; Zod für Ein-/Ausgabevalidierung; typisierte Verträge, serverseitige Berechtigungsprüfung bei **jeder** Datenoperation.
- Bewährter Auth-Provider, z. B. Better Auth mit sicheren Sessions, Organisations-/Rollenmodell und MFA-Unterstützung. Nie selbst Kryptografie oder Sessions erfinden. Auch Auth-Provider-Rollen nicht ungeprüft als Objektberechtigungen interpretieren.
- Hintergrundjobs für Import, Dateiverarbeitung und perspektivisch Kontoabruf, z. B. pg-boss auf PostgreSQL; idempotente Handler mit Retry-/Fehlerzuständen.
- Vitest für Unit/Integration, Playwright für E2E, ESLint, Formatierung, Typechecking, CI-Workflow. Strukturierte Logs, zentrale Fehlerbehandlung und optional OpenTelemetry.
- Local-first Entwicklung mit Docker Compose für PostgreSQL/PostGIS und Objektspeicher. Keinen externen Produktivdienst aktivieren, solange der Nutzer ihn nicht ausdrücklich konfiguriert und autorisiert hat.

Eine mögliche Struktur:

```text
apps/web                    # Next.js Oberfläche und serverseitige Endpunkte
apps/worker                 # Hintergrundverarbeitung, falls gebraucht
packages/db                 # Schemata, Migrationen, DB-Repositories
packages/domain             # Fachlogik und Validierungsregeln
packages/integrations       # Import-, Banking-, Geocoding-, Aareon-Adapter
packages/ui                 # Wiederverwendbare Designkomponenten
imports/                    # Lokale, git-ignorierte Eingabedateien
fixtures/                   # Ausschließlich synthetische Testdaten
docs/                       # Architektur, Entscheidungen, Datenmodell etc.
AGENTS.md                   # Verbindliche Arbeitsregeln für spätere Codex-Runs
```

Halte die Architektur pragmatisch: keine Abstraktionsbibliotheken ohne konkreten Nutzen. Keine inkompatiblen Bibliotheksstände erzwingen. Schaffe einen sauberen Pfad für späteres Multi-Mandanten-Hosting.

## 4. Fachliches Domänenmodell – hier besonders sorgfältig sein

Trenne fachlich und technisch mindestens:

- `Organization`/Verwaltungsgesellschaft und `ManagementMandate`/Verwaltervertrag: Verwaltungsart (Mietverwaltung, WEG, Sondereigentumsverwaltung oder Kombination), Mandatslaufzeit, verantwortliche Person, Berechtigungen und **zuständige Rechtseinheit**.
- `Property`/Liegenschaft, `Building`, optional `Entrance`, `Floor`, `Unit` mit stabilen internen IDs und optional externen Referenzen. Adresse, PLZ, Ort, Koordinaten mit Prüfstatus, Gebäudepolygon/Footprint, optional 3D-Asset und Etagen-/Einheitengeometrie.
- `Party`/Person oder Organisation; Kontaktrollen wie Mieter, Mitmieter, Eigentümer, Bevollmächtigter, WEG-Beirat, Handwerker. Keine Annahme: eine Einheit = ein Mieter oder ein Eigentümer. Eigentümerwechsel und Mieterwechsel historisieren.
- `Ownership`/Miteigentumsanteile und bei WEG `Association`, Teilungserklärung-/MEA-Informationen, Beschlüsse, Verwaltungsbeirat. Gemeinschaftseigentum von Sondereigentum unterscheiden.
- `Lease`/Mietverhältnis, Vertragsparteien, Ein-/Auszug, Vertragsstatus; **zeitlich gültige** Mietkomponenten (Kaltmiete, Betriebskostenvorauszahlung, Heizkostenvorauszahlung, Stellplatz, sonstige Positionen), Fälligkeiten, Sondervereinbarungen.
- `Receivable`/Sollstellung pro Abrechnungsperiode und Forderungstyp, `BankAccount` pro berechtigter Rechtseinheit, `BankTransaction`, `PaymentAllocation`, `ReconciliationSuggestion`, `Approval`. **Ist-Zahlung und Sollforderung getrennt modellieren**, einschließlich Teilzahlung, Guthaben, Rücklastschrift, Korrekturbuchung, Rückstand, Vorauszahlung und Sammelüberweisung.
- `Document`, `DocumentVersion`, `DocumentRelation`, `Task`, `Issue`/Ticket, `WorkOrder`, `Vendor`, `Inspection`, `Deadline`, `Meter`, `MeterReading`, `Asset`/Anlage.
- `ImportBatch`, `ImportRecord`, `FieldMapping`, `ChangeProposal`, `ApprovalDecision`, `AuditEvent` und `IntegrationConnection`.

Wichtige Regeln:

1. Mietzahlungen, WEG-Hausgeld, Kautionen, Verwalterhonorare und Eigentümergelder sind **nicht austauschbare Zahlungsarten**. Sie müssen über richtige Rechtseinheiten, Konten und Forderungstypen abgegrenzt werden. Keine Vermischung von Fremdgeldern und eigenen Erlösen.
2. Stichtage gelten bei Mietanpassungen, Eigentümerwechseln, Verwaltungsmandaten und Zuordnungen. Historische Perioden nicht rückwirkend durch Überschreiben aktueller Werte verfälschen.
3. Finanzbeträge als `numeric/decimal` oder Ganzzahl-Cents plus Währung; nie binäre `float`-Berechnung. Zeitzonen für technische Events UTC, lokale Fälligkeiten und Perioden fachlich in Europe/Berlin.
4. Kritische Ereignisse append-only protokollieren; Korrekturen über Gegenbuchung/revidierte Datensätze statt stille Löschung. Klare Verweise auf Quelle, Auslöser, Bearbeiter, Zeitpunkt und Genehmigung.
5. Stabile UUIDs, Mandantenschlüssel, eindeutige externe IDs mit Source-System, Deduplizierung, Soft-Delete/Archivierung nur wo rechtlich und fachlich angemessen. Keine globale Löschung von historisierten Zahlungsdaten über einen gewöhnlichen UI-Button.
6. Alle Datenmodelle mit `createdAt`, `updatedAt` und wo nötig `validFrom`/`validTo`, `source`, `revision` oder Optimistic Locking.
7. CRUD bedeutet echte Persistenz, serverseitige Validierung, Berechtigung, verständliche Fehlermeldungen und Auditierung.

## 5. Hauptnavigation und konkrete Screens

**A. Portfolio / 3D Map:** Vollbildkarte mit Karte/3D/Satellit (nur falls lizenziert), Objektsuche, Gebäudefilter, Status-, Verwaltungsart- und Verantwortlichenfilter, Fit-to-Portfolio, Clustering bei großer Anzahl, Listen-/Karten-Synchronisation. Status „Leerstand“, „offene Vorgänge“, „ungeprüfte Zahlungen“ nur aggregiert. Gebäude auswählen: Kamerafahrt und Inspector mit Kennzahlen, Fotos und Aktionen. Ohne Footprint/Geokoordinaten wird das Objekt in der Liste und in einem Klärungs-Posteingang gezeigt, nicht zufällig auf die Karte gesetzt.

**B. Gebäudedetail / Digital Twin:** Gebäudesteckbrief, verfügbare 3D-Darstellung, Hausaufgänge, Etagenumschalter, Einheitenübersicht. Klicke ein Geschoss -> klicke eine Einheit -> öffne Datenpanel. Gebäudekörper aus Karten-Geometrie dürfen als „stilisierte Annäherung“ markiert sein; **keine Behauptung, ein maßhaltiges Architekturmodell sei automatisch erstellt worden**. Individuelle 3D-Modelle nur per vorhandener GLB/glTF-Datei mit kontrollierter Skalierung/Positionierung und Vorschau. Optional später IFC/BIM-Pipeline.

**C. Einheitendetail:** Reiter Übersicht, Personen & Verträge, Mietkonto, Dokumente, Grundrisse, Aufgaben/Wartung, Historie. Rollenbasiert ein- und ausblendbare sensible Daten. Grundriss-Viewer für PDF/SVG/PNG mit Zoomen, Drehen und optionaler Etagen-Zuordnung; in Phase 1 genügen echte hochgeladene Dokumente plus klar gekennzeichneter Demo-Grundriss. Keine Pseudo-Grundrisse aus Adressen.

**D. Verwaltung / Aufgaben:** Kanban + Tabelle für Schadenmeldungen, Instandhaltung, Beauftragungen, Fristen, Wiedervorlagen. Status, Priorität, Bearbeiter, Objekt/Einheit, Notizen, Anhänge, Fälligkeitsdatum, Verlauf. Beispielworkflow: Schaden -> Ticket -> Angebot -> Freigabe -> Auftrag -> erledigt -> Rechnung/Dokumentation. Finanzielle Freigaben nur bei entsprechender Rolle; keine automatische tatsächliche Bankzahlung.

**E. Dokumente:** Objekt- und Einheitenordner, Tags, Dateitypen, Vorschau, Versionshistorie, Upload, Download, Links zu Vorgängen. Optional später OCR/KI-Klassifikation, aber keine automatische Weitergabe personenbezogener Dokumente an externe Modelle. Aufbewahrungsfristen/Klassen konfigurierbar; keine unbelegte Compliance-Zusage.

**F. Finanzen:** Soll/Ist-Übersicht, Zahlungsabgleich, offene Posten, Überzahlungen und ungeklärte Umsätze mit Filter je Mandat/Konto/Monat. Menschlicher Review-Schritt als prominentes Bedienelement.

**G. Datenimport & Datenqualität:** Objektliste aus Screenshot, CSV/XLSX und später Aareon, Feldmapping, Vorschau, Konflikte, Dubletten, Freigabe, Übernahmebericht. Dashboard „fehlende Grundrisse/Flächen/Kontakte/Mietdaten“ mit Drilldown.

**H. Einstellungen:** Nutzer & Rollen, Organisations-/Objektzugriff, Audit-Log, Integrationen/Connectorstatus, Theme, Datenexport, Backup-/Restore-Informationen und Feature Flags.

## 6. Screenshot-Import der Verwaltungsobjekte

Ein zentraler Bestandteil der ersten Umsetzung. Der Nutzer wird den Screenshot später direkt im Codex-Chat anhängen oder in `imports/portfolio-list.*` ablegen.

- Akzeptiere in der UI PNG/JPEG/WebP (mit Upload-Beschränkung), zeige Bildvorschau. Wenn Codex die Bilddatei bereits direkt einsehen kann, extrahiere die sichtbaren Tabellen-/Listenfelder für die initiale Seed-Datei; automatisierte OCR ist optional und **nicht blind vertrauenswürdig**.
- Extrahiere nur tatsächlich lesbare Felder, z. B. Objekt-ID, Name, Straße, Hausnummer, PLZ, Ort, Typ. Fehlende Felder = `null`/„unbekannt“. OCR-Konfidenz oder „zu prüfen“ erfassen. Keine Namen, Mieten, Einheitenzahlen oder Adressbestandteile aus Vermutungen ergänzen.
- Zeige eine **editierbare Staging-Tabelle** mit Original-Bildausschnitt/Quellzeile, erkannten Feldern, Validierungsfehlern und Dublettenhinweisen. Der Nutzer bestätigt oder korrigiert Zeilen; erst danach „in Objektbestand übernehmen“.
- Geokodierung nur bei ausdrücklicher Freigabe und zulässigem Dienst; nur erforderliche Adressdaten senden, keine Mieter-/Kontodaten. Treffer mit Präzisionsgrad (Gebäude/Adresse/Straße/Ort) und Mehrdeutigkeiten kennzeichnen. Manuelle Korrektur per Kartenpin ermöglichen.
- Es muss einen sicheren Demo-Modus mit 3–5 **klar fiktiven** Immobilien mit mehreren Einheiten geben. Echte Screenshotdaten und synthetische Beispieldaten strikt kennzeichnen und nicht vermischen.
- Daten über eine `sourceRecordId`/`sourceSystem`-Zuordnung idempotent importieren, so dass mehrmaliger Import keine Objektdubletten anlegt.

## 7. Editierbarkeit und Freigaben

Alle sinnvollen Stammdaten editierbar machen. Formulare mit Zod-Schemas, Validierung, abgesicherten Server-Mutationen, Änderungsverlauf und optimistischem Sperrmechanismus gegen Überschreiben paralleler Bearbeitungen.

- Normale Änderungen (z. B. zusätzliche Objektnotiz) dürfen berechtigte Sachbearbeiter direkt speichern.
- Kritische Felder (z. B. Vertragsmiete, Bankverbindung, Eigentümerwechsel, Zuordnung einer Zahlung, Import mit massenhaften Änderungen) erzeugen `ChangeProposal` bzw. `Approval` mit vorher/nachher, Kommentar, Akteur und Zeitstempel.
- Vier-Augen-Prinzip bei kritischen Finanzkorrekturen: Reviewer darf nicht derselbe Benutzer sein wie Ersteller, soweit dafür zwei Benutzer verfügbar sind; im Demo-Modus gesondert sichtbar simulieren, ohne das Sicherheitskonzept produktiv zu umgehen.
- Alle Freigaben auch serverseitig prüfen. Nach Ablehnung bleibt ursprünglicher Datenstand unverändert. Undo nur als versionierte Wiederherstellung bzw. Gegenänderung.
- Granulare Rollen und Objekt-Scope, z. B. Administrator, Verwalter, Buchhaltung, Sachbearbeiter, nur lesend, später externer Dienstleister. Rechte gelten auch für APIs, Dateidownloads, Suchergebnisse und Reports.

## 8. Zahlungsabgleich – DKB-ready, zunächst mit sicheren Mock- und Importpfaden

**Keine direkte, unautorisierte Verbindung zum DKB-Onlinebanking bauen. Keine Passwortspeicherung, kein Browser-Scraping und keine TAN-/SCA-Umgehung.** DKB unterstützt PSD2/XS2A für entsprechend berechtigte Drittanbieter und je nach Geschäftskundenkonstellation FinTS/EBICS; eine reale Integration benötigt die Prüfung des konkreten Kontomodells, Berechtigung, Verträge/Provider und Nutzereinwilligung.

Baue eine `BankingProvider`-Schnittstelle mit mindestens:

1. `DemoBankingProvider` (synthetische Kontoauszüge und Bewegungen).
2. `FileBankingProvider` mit sicherem Import tatsächlich verfügbarer Exportformate (zunächst CSV; CAMT.053 / MT940 nur nach überprüften Beispieldateien und Parser-Tests). Importdaten unveränderbar bzw. mit Quellbeleg speichern.
3. `OpenBankingProvider` als **deaktivierter** Adapter mit Dokumentation der benötigten Anbindung über einen autorisierten Kontoinformationsdienst; kein vorgetäuschter Live-Sync.

Domain-Workflow:

- Erzeuge je vertraglicher Fälligkeit periodenbezogene Sollforderungen mit getrennten Mietkomponenten, Stichtagen, Mandant und Bankkonto.
- Importiere Banktransaktionen eindeutig nach Konto, Provider-ID bzw. belastbarem Fingerprint, Buchungsdatum, Währung und Betrag. Erkenne Duplikate, Stornos, Rücklastschriften und bereits zugeordnete Umsätze. Eingelesene Umsätze nicht still verändern.
- Erstelle Matching-Vorschläge anhand IBAN (wenn rechtmäßig vorhanden), strukturierter Referenz/Mietvertrags-ID, Verwendungszweck, Betrag, zeitlicher Nähe und offenen Forderungen. Setze nachvollziehbare Regelprioritäten und Score/Begründung ein; kein undurchsichtiger KI-Abgleich als finale Buchungsgrundlage.
- Fälle: Vollzahlung, Teilzahlung, Überzahlung, Rundungsdifferenz, mehrere Monate in einer Zahlung, mehrere Einheiten in einer Sammelzahlung, Zahlung durch Dritte, fehlender Verwendungszweck, Rückbuchung, falsches Konto, Mehrdeutigkeit.
- Status fachlich differenzieren: `offen`, `teilweise ausgeglichen`, `ausgeglichen`, `überzahlt`, `klärungsbedürftig`; gesonderter Review-Status `vorgeschlagen`, `freigegeben`, `abgelehnt`.
- **„Bezahlt“ nicht einfach per Boolean auf dem Vertrag speichern.** Der Zahlungsstatus ergibt sich aus Sollstellungen minus genehmigten Allokationen, je Periode und Forderungstyp. Keine Überschreibung historischer Sollbeträge.
- Zunächst muss jeder echte Import zumindest einer expliziten Review-Aktion unterliegen. Spätere Auto-Freigabe nur als eigene Opt-in-Regel für eindeutig definierte risikoarme Fälle, nach Tests, Audit und administrativer Freigabe.
- Buchungs-/Zahlungsfreigabe darf keine tatsächliche Banküberweisung auslösen. Keine automatische Mahnung in der ersten Version.
- UI: Review-Inbox, Soll/Ist-Differenz, Match-Gründe, Quelltransaktion, Freigabe/Ablehnung/Split, Prüfprotokoll und Monatsabschlussstatus.

Implementiere mindestens 10 deterministische Testfälle für Matching inklusive Duplikat, Teilzahlung, Mehrfachbezug, Rücklastschrift und Reviewer-Konflikt.

## 9. Aareon – bewusst zweistufige Integration

Aareon ist eine Produktfamilie. **Nicht annehmen**, dass eine binäre Sicherungsdatei direkt parsebar ist oder die konkret eingesetzte Aareon-Version dieselben APIs besitzt wie Wodis Yuneo, Wodis Sigma, PowerHaus usw. Prüfe für reale Integration zuerst Produkt, Version, Lizenz, Vertragsbedingungen und verfügbare unterstützte Exportformate. Keine proprietären Backups reverse-engineeren, wenn Format, Zugriff oder Nutzungsrechte unklar sind.

**Phase A (im Prototyp):** Baue die generische Staging-Pipeline für CSV/XLSX/JSON bzw. dokumentiert lesbare Dateien:
`Upload -> Formatprüfung -> Quarantäne/Parsing -> Feldmapping -> Normalisierung -> Validierung -> Dubletten-/Identitätsabgleich -> Diff-Vorschau -> manuelle Freigabe -> atomare/idempotente Übernahme -> Audit + Rollback-/Revisionskonzept`.

In der Diff-Ansicht zeige: neue Datensätze, unveränderte Datensätze, vorgeschlagene Änderungen, Konflikte, ungültige Daten, potenzielle Löschungen. Löschungen aus einem unvollständigen Export **niemals** automatisch ableiten. Bestehende manuelle Werte mit Feldherkunft und Änderungspriorität schützen; Konflikte zur Entscheidung vorlegen. Import-Preview und tatsächliche Übernahme müssen dieselbe validierte Änderungsmenge verwenden.

**Phase B (später, Feature Flag):** `AareonAdapter` für konkret nachgewiesene Aareon-Export/API-Formate. Nur Daten lesen, solange Schreibzugriffe nicht separat ausdrücklich autorisiert sind. Plan für periodischen Sync inkl. Cursor, Checksummen, Stichtag, Reconciliation Report, Idempotenz und Fehlermeldungen erstellen. Dokumentiere pro Datentyp „Source of Truth“ und Datenhoheit.

## 10. Klassische Hausverwaltung intelligent integriert

Implementiere in Phase 1 nur die Basis, plane die späteren Fachmodule aber sauber im Datenmodell und in der Navigation:

- **Mietverwaltung:** Mietvertragslaufzeiten, Index-/Staffelmieten als Vertragsmerkmale (rechtliche Wirksamkeit nicht automatisch behaupten), Kaution getrennt, Zahlungskonto, Mietrückstände, Mieterwechsel, Leerstand, Übergabeprotokolle, Betriebskosten-Unterlagen.
- **WEG:** Gemeinschaft, Eigentümer und MEA, Wirtschaftsplan, Hausgeld-Soll, Jahresabrechnungen/Vermögensbericht, Eigentümerversammlung, Einladungs-/Fristenworkflow, Beschluss-Sammlung mit Historie, Beirat, Rücklage und Maßnahmen; klare Trennung von WEG- und Sondereigentumsdaten. Fachlich an §§ 24 und 28 WEG orientieren; rechtssichere Automatisierung erst nach Prüfung.
- **Technisches Gebäudemanagement:** Wartungsobjekte (Aufzug, Heizung, Rauchwarnmelder usw.), Prüfintervalle, Dienstleister, Angebote, Aufträge, Protokolle, Zählerstände, Energieausweise, Versicherungs- und Gewährleistungsfristen.
- **Kommunikation & DMS:** zentrale Vorgangsakte mit Dokumenten/Notizen; Vorlagen für Eigentümer-/Mieterbriefe später, Versand nur nach Prüfung.
- **Übergabe-Cockpit / Verwalterwechsel:** Geplante Übernahme oder interne Aufteilung von Verwaltungsmandaten zwischen verantwortlichen Teams bzw. Rechtseinheiten mit Stichtag, Akten-/Schlüssel-/Vollmachts-/Konten-/Vertragscheckliste, Zuständigkeitswechsel, dokumentiertem Datenbestand, offenen Vorgängen und Freigabeverlauf. Alte und neue Zuständigkeiten historisieren; niemals ohne Berechtigung Objekte oder personenbezogene Daten zwischen Gesellschaften teilen.
- **Portfolio-Controlling:** Leerstandsquote, Soll-/Ist-Eingänge, Rückstände nach Alter, Instandhaltungsbudget, offene Tickets, Kosten pro m² und Datenvollständigkeit. KPIs klar mit Berechnungsdefinition, Bezugszeitraum und Datenquelle dokumentieren.
- **Intelligente To-dos:** „Die Wartung ist fällig“, „Dokument fehlt“, „Zahlung unklar“, „Mieterwechsel zum Stichtag“, „WEG-Aufgabe offen“. Keine unbelegten juristischen Handlungsempfehlungen.

## 11. Sicherheits-, Datenschutz- und Compliance-Anforderungen

Wegen Personen-, Vertrags- und Zahlungsdaten handelt es sich um eine sensible Verwaltungsanwendung. Implementiere mindestens:

- Default nur lokal/isoliert mit synthetischen Fixtures; niemals echte Nutzer-/Mieter-/Bankdaten in öffentliche Repositories, Test-Snapshots, Analytics, Sentry oder externe KI-Dienste senden.
- Bedrohungsmodell vor der Produktion; Sicherheitsanforderungen an OWASP ASVS 5.0 (geeignete Anforderungen mindestens Level 2) und OWASP Top 10 ausrichten; keine Zertifizierung behaupten.
- Authentifizierung mit MFA-Option; Session-Sicherheit, Rate Limits, sichere Cookies, CSRF-Schutz passend zum Auth-Framework, serverseitige Objekt-/Mandantenautorisierung (IDOR-Tests), Auditierung von Lese-/Änderungszugriffen auf besonders sensible Bereiche soweit erforderlich.
- Mandanten- und Objekt-Scope bei jedem Query; nach Möglichkeit PostgreSQL Row Level Security als zusätzliche Schutzebene prüfen; niemals ausschließlich Frontend-Filter für Datenschutz nutzen.
- Verschlüsselung auf Transport- und Storage-Ebene im Produktivkonzept, Secret Management, klar getrennte Umgebungen, Log-Redaktion und Least Privilege.
- Datei-Upload-Whitelists, Größen-/Anzahlgrenzen, Inhaltsprüfung, MIME-Sniffing, sichere Dateinamen, Schutz vor CSV Formula Injection, XXE, ZIP-Bombs und Path Traversal, optional Malware-Scan/Quarantäne. Signed URLs kurzlebig und berechtigungsgeprüft.
- Backups, Restore-Test, Migrations-Rollback, Ereignisprotokoll, Export und Lösch-/Sperrprozesse konzeptionell vorsehen. Aufbewahrung nach Dokument-/Datentyp und anwendbarem Recht; historische Pflichten und DSGVO-Löschansprüche fachlich abwägen.
- Für aufbewahrungspflichtige Buchungsbelege: Integrität, nachvollziehbare Änderungen, Originalformat und mögliche GoBD-Anforderungen berücksichtigen. Eine hübsche Dokumentablage allein ist **kein** GoBD-nachgewiesenes DMS.
- Geodaten, Banktransaktionen und Namen nicht an Kartenanbieter/Telemetrie übermitteln. Für externe Geocoding- und KI-Dienste vorab Datenschutz/AVV und Übermittlungszweck prüfen.
- Kein direkter Live-Zugriff auf DKB, keine realen Bankdaten oder echte Aareon-Bestände ohne ausdrückliche Konfiguration, Rechtsgrundlage und Nutzerfreigabe.

## 12. Nichtfunktionale Anforderungen

- Entwickle für zunächst mehrere Dutzend bis einige hundert Immobilien und viele tausend Einheiten; Karten-Clustering, serverseitige Pagination/Filterung, DB-Indizes, lazy loading für teure 3D-Assets.
- Responsive, performante Navigation; kein unnötiges Neurendering der Karte bei Formularänderungen. Kartenfallback bei WebGL-Problemen.
- Barrierearme Tabellen- und Suchansicht als vollwertige Alternative zur 3D-Interaktion.
- Strukturierte Fehlerzustände, Retry, Abbruch, Importfortschritt und klare Synchronisations-Status („Demo“, „bereit“, „Prüfung nötig“, „getrennt“, „Fehler“).
- Alle Zeiträume, Mietbeträge und Berechnungen über reproduzierbare Unit-Tests absichern.
- Europäische Daten-/Hosting-Optionen im Deployment-Dokument vergleichen, aber keine Produktion ohne Freigabe veröffentlichen.

## 13. Konkreter Umsetzungsplan – beginne jetzt zu coden

Arbeite in überprüfbaren **Vertical Slices**. Nach jedem Slice müssen App, relevante Tests und Demo wieder startbar sein.

**Slice 0 – Repository / Architektur / Design:**
Bestand prüfen; falls leer Projekt initialisieren. `AGENTS.md`, README, `.env.example`, Docker Compose, CI, Design Tokens und dokumentierte ADRs anlegen. Setup mit einem dokumentierten Kommando startbar machen; synthetische Seed-Daten bereitstellen. Technische Entscheidungen und offene Risiken dokumentieren.

**Slice 1 – überzeugender, echter Kernprototyp (höchste Priorität):**
Baue authentifizierte App-Shell, Premium-Design, Portfolio-Dashboard, MapLibre-Karte mit Demo-Buildings und optionalen 3D-Extrusionen, synchrone Objektliste/Filter, Gebäudedetail, Geschoss-/Einheiten-Navigation, Einheiten-Detaildrawer, echte CRUD-Formulare, Datenpersistenz, Grundriss-Upload/Viewer und Audit-Historie. Das soll eine durchklickbare, visuell herausragende App sein, keine reine Landingpage.

**Slice 2 – Screenshot & Datenimport:**
Datei-Upload, Review-Tabelle, Adress-/ID-Validierung, Deduplizierung, Mapping, Vorschau und bestätigte Übernahme implementieren; echten Screenshot bei Vorliegen einlesen. Keine ungeprüfte Übernahme. Fehler und unleserliche Zeilen sichtbar machen.

**Slice 3 – klassischer Verwaltungsworkflow:**
Tickets, Aufgaben, Fristen, Vorgangsakte, Dokumentenzuordnung, Datenqualitätsindikatoren, Verantwortliche und Statushistorie. E2E-Workflow vom Gebäudeklick bis zur erledigten Aufgabe.

**Slice 4 – Finanz-Vertical-Slice:**
Mietkomponenten und Sollstellungen, fiktive Banktransaktionen, CSV-Import, regelbasiertes Matching, Review/Freigabe, Teilzahlungen, offene Posten und Abgleich-Reporting. Keine echte Bankverbindung.

**Slice 5 – Aareon-ready Staging:**
Generischer Importadapter, Feldmapping, Snapshot-Diff, Konfliktauflösung und Audit; Aareon-Konkretadapter nur nach bekanntem Produkt/Format.

**Slice 6 – Reifegrad & Roadmap:**
UX-Polish, Rechte-/Sicherheitstests, Performance-Audit, Backup-/Restore-Anleitung, Deployment-Optionen, dokumentierte WEG-/Mietverwaltungs-Erweiterungspunkte.

WENN Zeit oder Kontext begrenzt sind: Slice 1 vollständig und funktionsfähig ausliefern, statt alle Module halb anzulegen. Anschließend sauber priorisierte offene Aufgaben und den nächsten Schritt dokumentieren. Arbeite weiter, solange dein aktueller Arbeitslauf und die verfügbaren Ressourcen es zulassen; behaupte nicht, ein nicht gebautes Modul sei fertig.

## 14. Abnahmekriterien für den ersten Prototyp

Akzeptiert wird Slice 1 nur, wenn die folgenden Nutzerabläufe nachweisbar funktionieren:

1. App lokal starten und einloggen (nur synthetischer Demo-Account).
2. Mindestens 3 fiktive Immobilien mit mehreren Gebäuden/Etagen/Einheiten aus einer Datenbank laden.
3. Von Karte oder Liste auf ein Objekt klicken -> Kamera/Selektion aktualisiert -> Detailpanel zeigt die richtige Immobilie.
4. Eine Etage und eine Einheit auswählen -> die korrekten, tatsächlich gespeicherten Daten erscheinen.
5. Fläche, Status oder Notiz in einem Formular ändern -> validieren -> speichern -> nach Reload erhalten -> Änderung in Audit-Historie finden.
6. Einen realen Test-Grundriss als PDF/PNG hochladen -> berechtigt anzeigen -> dem richtigen Objekt bzw. der Einheit zuordnen.
7. Unvollständige/geografisch unklare Objekte erscheinen in einem Review-Status statt mit ausgedachten Koordinaten.
8. Ein nicht berechtigter Nutzer kann über URL/API nicht auf fremde Objekte oder Dateien zugreifen (automatisierter Test).
9. Responsive, Tastaturfokus und Fehler-/Ladezustände geprüft.
10. `lint`, `typecheck`, Unit-/Integrations-Tests, E2E-Hauptablauf und Production Build erfolgreich; bei Abweichungen Fehler mit Ursache dokumentieren.

Ab Slice 4 zusätzlich: Zahlungsabgleich nach Periode, Zahlungsvorschläge erklärbar, getrennte Freigabe, Idempotenz, Teilzahlung/Überzahlung/Rücklastschrift getestet.

## 15. Pflichtartefakte und Arbeitsdisziplin für Codex

Erzeuge und halte aktuell:

- `README.md`: Installation, Voraussetzungen, Start, Test, Troubleshooting; konkrete Kommandos.
- `AGENTS.md`: Projektregeln, Architekturgrenzen, Code-Konventionen, Security-Checkliste, Testpflichten, Definition of Done.
- `docs/PRODUCT_VISION.md`: Personas, User Journeys, Scope und Prioritäten.
- `docs/ARCHITECTURE.md`: System-/Datenflussdiagramm, Technologieentscheidungen, Sicherheit und Deployment.
- `docs/DOMAIN_MODEL.md`: Entitäten, Beziehungen, Stichtags-/Buchungsregeln.
- `docs/IMPORTS_AND_INTEGRATIONS.md`: Screenshot, Banking, Aareon, Geocoding; was Demo, was verifiziert, was offen ist.
- `docs/SECURITY_AND_PRIVACY.md`: Bedrohungsmodell, Schutzmaßnahmen, Datenklassen, Aufbewahrungskonzept, offene Prüfungspunkte.
- `docs/ROADMAP.md`: implementiert, teilweise, geplant; keine beschönigten Statusangaben.
- `.env.example`, `docker-compose.yml`, Migrations-/Seed-Skripte und nachvollziehbare Tests.

Bei Tool- oder Paketproblemen zunächst Logs lesen, Ursache beheben und nicht blind neue Dependencies installieren. Nutze verfügbare Agenten-/Tooling-Fähigkeiten sinnvoll, vermeide unnötige Rückfragen. Änderungen in kleinen, nachvollziehbaren Einheiten. Vor Ende aktuellen Stand der App, geprüfte Testkommandos, Screenshots (falls lokal technisch möglich), bekannte Einschränkungen und exakte nächsten Schritte ausgeben.

## 16. Jetzt konkret starten

1. Inspiziere zuerst das Repository und vorhandene Assets; überschreibe keine bestehenden Projekte oder Nutzerdaten.
2. Prüfe stabile Versionen und Lizenzbedingungen der wichtigsten Libraries, lege Designsystem und Architektur fest.
3. Implementiere unmittelbar **Slice 0 + Slice 1** vollständig. Danach, soweit möglich, Slice 2 und die weiteren Slices in der genannten Reihenfolge.
4. Falls die Objektliste als Screenshot bereits vorliegt: Führe eine nachvollziehbare Extraktion in eine Review-Datei/Staging-Tabelle aus; lasse unsichere Werte offen. Falls nicht: Baue die Screenshot-Importfunktion und verwende ausschließlich synthetische Seeds, bis der Nutzer das Bild bereitstellt.
5. Stelle durch echte Ausführung sicher, dass die Anwendung startet; führe Typecheck, Tests, Lint und Build aus und behebe aufgedeckte Fehler.
6. Berichte am Ende kurz und präzise, welche Funktionen wirklich implementiert sind, wie ich die App lokal starte und welche Eingaben (Screenshot, Beispielgrundriss, Datenfelder, genaue Aareon-Version, DKB-Kontomodell) als Nächstes benötigt werden.

**Die Leitlinie: Designqualität wie ein Premium-SaaS-Produkt, Modellqualität wie ein ernstzunehmendes ERP, Sicherheitsdenken wie eine Finanzanwendung – aber in kleinen, tatsächlich lauffähigen und überprüfbaren Schritten.**
