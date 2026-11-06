# ATLAS als private Website

Die gehostete ATLAS-Anwendung ist unter **[ATLAS öffnen](https://neuhaus-objektkarte-dinslaken.fhfhzfmsqw.chatgpt.site)** veröffentlicht. Für die Nutzung reichen Browser und das berechtigte ChatGPT-Konto; eine lokale Installation und Demo-Zugangsdaten sind nicht erforderlich. Am 6. November 2026 wurden 36 Objekte und drei amtliche Außenmodelle in den privaten Website-Speicher übernommen und erneut aus der veröffentlichten Anwendung abgerufen.

## Im Browser arbeiten

1. Den vorhandenen privaten Website-Link öffnen und mit dem Konto anmelden, dem die Website gehört. Der Zugangsschutz der Hosting-Plattform gilt auch für API-Aufrufe und Dateien.
2. **Portfolio** öffnen. Die Suche findet Objekte über Bezeichnung, Adresse oder Kennung; **Karte** und **Liste** bieten zwei Ansichten desselben Bestands. Mit `Strg` + `K` beziehungsweise `⌘` + `K` lässt sich die Schnellsuche öffnen.
3. Ein Objekt in der Liste oder auf der Karte auswählen. Die Detailansicht trennt **Einheiten laut Quelle** von **einzeln erfassten Einheiten**. Fehlende Angaben bleiben als offen gekennzeichnet.
4. Für vorhandene Unterlagen im Objekt auf **Dokumente** und **Hochladen** gehen. Objekt und Kategorie wählen, eine PDF-, PNG-, JPEG- oder WebP-Datei bis 15 MB auswählen und **Geschützt hochladen** ausführen. Erst die Erfolgsanzeige bestätigt das Speichern. Die Vorschau zeigt das Original; Zoom, Drehung und Download stehen dort zur Verfügung.
5. Unter **Aufgaben** einen Vorgang mit Objektbezug anlegen und seinen Status pflegen. Nach einer Änderung neu laden, um den gespeicherten Stand erneut abzurufen.
6. Vorhandene einzelne Einheiten öffnen, bekannte Angaben ergänzen und **Änderungen speichern** wählen. Bei einem zwischenzeitlich geänderten Datensatz zuerst den aktuellen Stand laden. Neue Einheiten werden nur aus tatsächlich vorliegenden Angaben erfasst; eine Quellenanzahl erzeugt keine Wohnungen, Etagen oder Personen.

Die Anzeige von Einheiten, Parteien und Gebäudestrukturen hängt von den tatsächlich erfassten Daten ab. Der vorbereitete reale Erstbestand enthält noch keine einzelnen Einheiten oder Mieterdatensätze.

## Was die 3D-Ansicht aussagt

Der vorbereitete Erstbestand umfasst 36 ausgewählte Verwaltungsobjekte aus den beiden bereitgestellten Listen. Für drei Objekte liegen amtlich zugeordnete LoD2-Außenmodelle von Geobasis NRW vor. Ihre vorhandenen Dach-, Wand- und Bodenflächen werden übernommen. Bei den übrigen Objekten bleiben Koordinaten und Modellgeometrie offen, bis belastbare Quellen vorliegen. Sie sind weiterhin über die Liste erreichbar.

Ein Verwaltungsobjekt kann mehrere Gebäudekörper umfassen. Der genaue Verwaltungsumfang der vorhandenen Außenmodelle ist noch zu prüfen. Die Modelle enthalten keine bestätigten Wohnungen, Geschosse, Fassadenfotos oder Innenmaße. Der Upload eines Grundrisses erzeugt ebenfalls noch keine maßgeprüfte 3D-Innenaufteilung. Für eine spätere maßhaltige Darstellung werden Maßstab beziehungsweise Referenzmaß und eine geprüfte Zuordnung benötigt.

Die Quellenzahlen bleiben getrennte Herkunftsangaben: Sichtbare Einh.-Werte ergeben 303, während auf dem Blatt 279 gedruckt steht. Die ausgewählten sichtbaren WE-Werte ergeben 232; fehlende Werte bleiben offen. Diese Angaben werden weder zu einer bestätigten Gesamtzahl erklärt noch in einzelne Einheiten umgewandelt.

## Speicherung und Zugriff

Der gehostete Prototyp verwendet eine serverseitige Datenbank für den Arbeitsstand und privaten Objektspeicher für Originaldateien und Modelle. Gespeicherte Fachdaten sollen damit nach einem Browserwechsel erneut abrufbar sein. Die Oberfläche zeigt Speicherfehler und parallele Änderungen an; eine fehlgeschlagene Anfrage gilt nicht als gespeichert.

Der Zugang ist auf den Website-Eigentümer beschränkt. Die Hosting-Anmeldung stellt die Identität für den privaten Arbeitsbereich bereit. Teamkonten, Objektfreigaben und das Rollenmodell des separaten Next.js-Prototyps sind für diese gehostete Variante noch keine ausgelieferte Funktion. Ein Link zu einer Datei muss den gleichen serverseitigen Zugangsschutz wie der Arbeitsbereich durchlaufen.

Fachliche Änderungen werden mit Version beziehungsweise Revision und einem Änderungsereignis gespeichert. Dieser Verlauf ist eine nachvollziehbare Anwendungshistorie. Eine rechtliche Unveränderbarkeits- oder Archivierungszertifizierung ist damit nicht verbunden.

Diese erste gehostete Fassung hält den strukturierten Arbeitsstand einschließlich Historie in einem atomar versionierten Datensatz. Sie begrenzt dessen Größe auf 1,9 MB und weist weitere Änderungen verständlich zurück, bevor die Speicherkapazität überschritten wird. Für einen langfristigen Produktivbetrieb sind normalisierte Tabellen, ein geprüfter Sicherungs-/Wiederherstellungsweg und eine passende Historienverwaltung erforderlich.

## Vorhandene Daten der früheren Pilotkarte

Die frühere Pilotkarte hat manuelle Einträge und hochgeladene Dateien in IndexedDB des jeweiligen Browsers gespeichert. Die neue Anwendung löscht diesen vorhandenen Browserspeicher nicht. Solche Einträge werden durch die neue serverseitige Speicherung aber auch nicht automatisch übertragen. Sie können in einem anderen Browser bereits bisher fehlen und benötigen eine bewusste Export-/Übernahmefunktion. Bis eine solche Übernahme umgesetzt und geprüft ist, bleibt dieser frühere Datenbestand separat.

Die bisherige Oberfläche bleibt unter `/pilot/` auf derselben privaten Website erreichbar. Sie verwendet zur Wiederaufnahme der alten Browserdaten einen lokalen Hintergrund und ruft keine externen Kartenkacheln mehr ab.

Die Initialübernahme aus den bereitgestellten Objektlisten erfolgt über einen geschützten, einmaligen Bootstrap. Eine identische Wiederholung darf keine Duplikate erzeugen. Ein bereits bearbeiteter Bestand wird dabei nicht ersetzt. Die tatsächlichen Quelldateien und Modellpakete liegen ausschließlich im ignorierten Verzeichnis `imports/` beziehungsweise im geschützten Anwendungsspeicher. Das öffentliche GitHub-Repository enthält dafür den Anwendungscode und synthetische Prüfdaten.

## Verhältnis zum lokalen Prototyp

| Bereich | Gehostete Website | Separater lokaler Prototyp |
| --- | --- | --- |
| Oberfläche | React/Vite unter `apps/hosted/client` | Next.js unter `apps/web` |
| Server | Hosting-Worker unter `apps/hosted/server` | Next.js-Server und API |
| Fachdatenspeicher | D1 | PostgreSQL mit PostGIS |
| Private Dateien | R2 | S3-kompatibler Objektspeicher, lokal SeaweedFS |
| Zugang | Privater Website-Eigentümer | Better Auth und Organisations-/Objektrechte |
| Datenübernahme | Eigener geschützter Bootstrap | Eigene Migrationen und Imports |

Diese Laufzeiten haben getrennte Datenbestände. Tests oder Datenbankmigrationen des lokalen Prototyps belegen keinen erfolgreichen Betrieb der gehosteten Website. Es gibt noch keine laufende Aareon-Anbindung, keine Bankanbindung und keine vollständige Finanzbuchhaltung oder WEG-Abrechnung. Auch eine automatische, maßhaltige Grundrissrekonstruktion gehört nicht zum jetzigen Funktionsumfang.

## Abschlussprüfung der gehosteten Version

Diese Punkte müssen an der tatsächlich veröffentlichten privaten Website geprüft werden; ein Build allein reicht dafür nicht:

- Unberechtigte Aufrufe von Oberfläche, API, Originaldateien und Modellen werden abgewehrt.
- Der reale Bootstrap enthält 36 Objekte und nur drei belegte Gebäudemodelle. Unbekannte Angaben bleiben offen; eine identische Wiederholung erzeugt keine Duplikate.
- Amtliche Außenmodelle sind sichtbar, auswählbar und korrekt mit dem jeweiligen Objekt verbunden. Die übrigen Objekte bleiben in der Liste nutzbar.
- Eine gespeicherte Änderung ist nach Neuladen und in einer weiteren berechtigten Browsersitzung vorhanden.
- Ein Grundriss lässt sich hochladen, nach Neuladen öffnen und unverändert herunterladen. Fehlerhafte Dateitypen und Übergrößen werden serverseitig abgelehnt.
- Aufgaben und tatsächliche Einheiten lassen sich anlegen und ändern; veraltete Revisionen werden als Konflikt angezeigt.
- Die mobile Ansicht und Tastaturbedienung funktionieren; es gibt keine unerwarteten externen Geocoding- oder Modelldownloads.

### Ausgeführter Abschlusslauf

- Veröffentlichung erfolgreich, gespeicherte Website-Version **2**; Eigentümerzugang erhalten.
- D1-Migration angewendet, Tabelle `app_state` über die Hosting-Verwaltung bestätigt.
- 36 echte Quelldatensätze erneut abrufbar, drei belegte Standorte und Modelle; 0 erfundene Einzelwohnungen oder Personen. 36 noch ungeklärte Verwaltungsarten bleiben `null`.
- Alle drei Modelloriginale nach dem R2-Upload bytegenau gegen ihre lokalen Quelldateien geprüft; unabhängiger erneuter HTTP-Abruf erfolgreich.
- Website-HTML, Anwendungsdatei und lokaler Karten-Worker über den veröffentlichten Link mit HTTP 200 abrufbar. Nicht angemeldete Aufrufe sowie Serviceaufrufe ohne Anwendungsschlüssel liefern 401.
- Anfrage mit korrekter Website-Origin erreicht die Eingabevalidierung; eine fremde Origin wird mit 403 abgewiesen, ohne Daten anzulegen.
- **21 Hosted-Tests** mit echten lokalen D1-/R2-Bindings, einschließlich Originaldateien, Versionen, konkurrierenden Änderungen und Importen. Zusätzlich wurde der kompilierte Worker in der Edge-Laufzeit per HTTP geprüft. Typechecks, ESLint und Build bestanden; 51 bestehende Unit-Tests bestanden.

Ein vollständiger visueller Browser-, Mobil- und Tastaturabschlusslauf ist in dieser Umgebung nicht ausgeführt: Das von Sites verlangte Browserwerkzeug und der Vorschau-Relay stehen hier nicht zur Verfügung. Die Plattform kann eigene Vorschauaufnahmen erstellen; diese ersetzen keine behauptete manuelle Sichtprüfung. Die im lokalen Worker getestete CSP wird vom Hosting-Dispatch am veröffentlichten HTML nicht unverändert ausgegeben; der tatsächliche Zugriffsschutz und die Origin-Prüfung wurden deshalb über HTTP geprüft. Eine langfristige Produktions- oder Sicherheitszertifizierung wird nicht behauptet.
