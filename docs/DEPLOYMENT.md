# Lokaler Betrieb und spätere Bereitstellung

## Standard

ATLAS startet als lokale Entwicklungsanwendung. PostgreSQL/PostGIS und S3-kompatibler Speicher werden über die dokumentierte Compose-Konfiguration bereitgestellt; Next.js läuft mit der lokalen Konfiguration. Installation und genaue Befehle stehen im Root-[README](../README.md).

Die Compose-Services sind `postgres` (`postgis/postgis:17-3.5-alpine`) und `objectstore` (`chrislusf/seaweedfs:4.38`, Apache-2.0). SeaweedFS startet über `weed mini`, verwendet das persistente Volume `atlas_objects` und stellt S3 lokal unter `http://127.0.0.1:9000` bereit; intern wird Port 8333 angesprochen. Es wird kein administrativer Storageport auf dem Host veröffentlicht. Die Dokumentenablage bleibt über den normalen S3-Adapter austauschbar. [Offizieller Quick Start](https://github.com/seaweedfs/seaweedfs#quick-start)

Die lokale Instanz verwendet ausschließlich synthetische Seeds. Die bekannten Demo-Zugangsdaten sind Entwicklungsdaten und dürfen nicht als Produktivzugänge übernommen werden. Eine öffentliche GitHub-URL veröffentlicht Quellcode, keine freigegebene Verwaltungsinstanz.

Keine externe Produktivressource wird durch den Standardstart aktiviert. Eine zuvor separat erstellte private Kartenvorschau ist nicht die Laufzeitumgebung oder Datenbank dieses Repositorys.

## Konfiguration und Zuständigkeit

| Bereich | Konfiguration | Betriebspflicht |
| --- | --- | --- |
| Anwendung | Origin-/Auth-URL, Auth-Secret, Laufzeitmodus | HTTPS, sichere Cookies, Session-/MFA-Prozess |
| PostgreSQL | DB-Verbindung und versionierte Migrationen | Zugriff, Backup, Restore, Updates, Kapazität |
| Objektspeicher (`objectstore`) | SeaweedFS-S3-Endpoint, Region, Zugang, privater Bucket | Bucketpolicy, Verschlüsselung, Versionen und Sicherung |
| Karte | Im Standard lokale neutrale Darstellung | Externe Anbieter nur mit bewusster Konfiguration und dokumentiertem Zweck |
| Integrationen | Im Standard keine echten Verbindungen | Produkt-/Formatnachweis und minimaler autorisierter Scope |

Umgebungswerte sind serverseitig zu halten. `NEXT_PUBLIC_*` ist für Geheimnisse ungeeignet. Eine Regionseinstellung allein belegt keine Datenschutzkonformität oder ausschließliche Datenverarbeitung in dieser Region.

## Optionen für einen späteren EU-Betrieb

| Variante | Vorteil | Zu prüfen |
| --- | --- | --- |
| Eigene EU-VM mit Anwendung, DB und privatem Speicher | Klare Topologie und weitreichende Kontrolle | Patchen, Ausfallkonzept, Backup außerhalb des Hosts, TLS und Wiederherstellung selbst betreiben |
| EU-Anwendungshost plus verwaltetes PostgreSQL und S3 | Getrennte Lebenszyklen, verwaltete DB-Funktionen | Konkrete Daten-/Backupregionen, AVV, Supportzugriff, Pooling und Dienstabhängigkeiten |
| Betrieb im bestehenden Unternehmensnetz | Nähe zu internen Daten und Zuständigkeiten | Erreichbarkeit, Updates, Kapazität, Remotezugriff und professionelles Backup |

Die konkrete Auswahl erfolgt anhand der tatsächlichen Datenklassen, Verantwortlichkeiten, Verfügbarkeit, Kosten und Verträge. Der Prototyp trifft keine pauschale Hosting- oder Compliance-Zusage.

## Vor einer produktiven Bereitstellung

1. Synthetische und echte Umgebungen einschließlich DB, Bucket, Domain und Secrets trennen.
2. Demoaccounts deaktivieren beziehungsweise durch einen definierten Einladungs-/MFA-Prozess ersetzen.
3. Alle Test- und Buildprüfungen ausführen und die Autorisierungsgrenzen praktisch prüfen.
4. Private Bucket-/DB-Rechte, Cacheheader, TLS, Sessionwiderruf und Logredaktion prüfen.
5. Migrationen mit Sicherung und konkretem Vorwärts-/Wiederherstellungspfad proben.
6. Gemeinsame DB-/Dateisicherung und einen isolierten Restore nachweisen.
7. Fachliche Datenhoheit, Zugriffsrollen, Aufbewahrung und externe Verarbeitungszwecke dokumentieren.

Ein erfolgreicher Build und eine private Vorschau ersetzen diese Schritte nicht. Das Dokument ist eine Betriebsvorbereitung, keine automatische Veröffentlichungserlaubnis.
