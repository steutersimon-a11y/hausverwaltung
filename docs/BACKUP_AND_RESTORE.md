# Backup und Wiederherstellung

Dies ist eine Anleitung für lokale Tests und die Planung des späteren Betriebs. Ein ausgeführter Restore ist erst belegt, wenn das Ergebnis im Prüfprotokoll steht. Alle Beispiele betreffen synthetische Entwicklungsdaten. Sicherungen mit echten Daten sind vertraulich und gehören nicht in Git.

## Was zusammengehört

Ein konsistenter Wiederherstellungspunkt enthält:

- PostgreSQL-Dump mit Fach-, Auth-, Audit- und Dokumentmetadaten.
- Alle zu diesen Metadaten gehörenden S3-Objekte einschließlich gespeicherter Dokumentversionen.
- Commit-/Migrationsstand, Zeitpunkt, Bucketname und Prüfsummenmanifest.
- Sicher verwahrte Laufzeitkonfiguration und Secrets getrennt vom Quellcode. Ein geändertes Auth-Secret kann vorhandene Sitzungs-/MFA-Funktionen beeinflussen.

Lokal liegt der S3-Speicher in SeaweedFS 4.38, Compose-Service `objectstore`, Volume `atlas_objects`. Der Hostendpoint ist `http://127.0.0.1:9000`. Ein direktes Kopieren des laufend beschriebenen Volumes ist ohne ein geprüftes Snapshotverfahren kein konsistenter Objektspeicherbackup.

Ein DB-Dump ohne Binärdateien erzeugt defekte Dokumentverweise. Eine Bucketsicherung ohne DB kann die fachliche Zuordnung nicht wiederherstellen.

## Lokaler DB-Dump

Schreibende Webprozesse und Worker für diesen Entwicklungssnapshot anhalten. Der Compose-Service heißt im Beispiel `postgres`; bei abweichender Konfiguration den Namen aus `docker-compose.yml` verwenden. Das Dumpverzeichnis muss git-ignoriert sein.

```sh
mkdir -p backups/local-snapshot
docker compose exec -T postgres sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > backups/local-snapshot/database.dump
docker compose exec -T postgres sh -c 'exec pg_restore --list' < backups/local-snapshot/database.dump > backups/local-snapshot/database.contents
git rev-parse HEAD > backups/local-snapshot/commit.txt
```

Das Inhaltsverzeichnis prüft lediglich die Lesbarkeit des Dumpformats. Es ist kein Restore-Test. Fehlgeschlagene oder leere Dumps nicht als gültige Sicherung aufbewahren.

## Privaten Bucket sichern

Optional kann ein vertrauenswürdig installierter MinIO-Client `mc` als S3-Client für SeaweedFS verwendet werden. Das benötigt keinen MinIO-Server. Der zuvor sicher konfigurierte Alias `atlas-local` zeigt auf den lokalen SeaweedFS-S3-Endpoint `http://127.0.0.1:9000`. Zugangsdaten nicht in Shellhistory, Dokumentation oder Konsolenausgaben kopieren. `S3_BUCKET` bezeichnet den tatsächlich konfigurierten Bucketnamen, standardmäßig `atlas-private-documents`.

```sh
mc mirror "atlas-local/$S3_BUCKET" backups/local-snapshot/documents
```

Der Kern verwendet eigene Storagekeys je gespeicherter Dokumentversion. Werden später zusätzlich native S3-Objektversionen oder Object Lock genutzt, muss der Sicherungsweg diese Versionen und deren Metadaten ausdrücklich mitnehmen; ein gewöhnlicher Mirror allein genügt dann nicht.

Bei einem Live-System sind koordinierte Snapshots, Schreibpausen oder ein getestetes inkrementelles Verfahren notwendig. DB- und Bucketsicherung zu verschiedenen Zeitpunkten sind ohne Konsistenzverfahren kein gemeinsamer Wiederherstellungspunkt.

## Isolierter Restore-Test

1. Eine separate lokale PostgreSQL-/SeaweedFS-Testinstanz mit eigenen Volumes, Ports und Secrets vorbereiten. Der Restore-Service `objectstore` benötigt ein eigenes Volume statt des aktiven `atlas_objects`. Nicht die aktive Entwicklungs- oder Produktivdatenbank als Restoreziel verwenden.
2. Den dokumentierten Commit und Migrationsstand bereitstellen. Das Restoreziel muss mit dem Dump kompatibel sein.
3. Dump in eine neue leere Testdatenbank laden. Beispiel für einen bereits passend vorbereiteten Restore-Compose-Service:

```sh
docker compose -f docker-compose.restore.yml exec -T postgres sh -c 'exec pg_restore --exit-on-error --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < backups/local-snapshot/database.dump
```

`docker-compose.restore.yml` ist ein bewusst separat zu erstellendes Testsetup, kein im Kern vorausgesetzter Service. Vor Ausführung Zielhost, Datenbank und Volumes prüfen.

4. Dokumentobjekte in den privaten Restorebucket zurückkopieren, mit einem gesonderten sicheren Alias `atlas-restore`:

```sh
mc mirror backups/local-snapshot/documents "atlas-restore/$S3_BUCKET"
```

5. Die Testanwendung ausschließlich mit dieser Restoredatenbank und diesem Bucket starten.
6. Login, Objekt-/Einheitenzahlen, Revisionen und Auditbezüge prüfen. Eine Auswahl gespeicherter Dateien autorisiert herunterladen und ihre SHA-256-Werte mit den DB-Versionen vergleichen.
7. Fremdorganisations-/Objektzugriff erneut testen; eine Wiederherstellung darf Bucket- oder Rollenrechte nicht öffnen.
8. Zeitpunkt, Quellen, Ergebnis, Wiederherstellungsdauer, fehlende Objekte und Abhilfe dokumentieren. Erst danach Wiederherstellbarkeit behaupten.

## Migrationen und Vorfälle

Bestehende Migrationen werden nicht nachträglich verändert. Vor einer risikobehafteten Migration einen gemeinsamen DB-/Dateistand sichern. Eine fehlgeschlagene fachliche Änderung wird nach Möglichkeit durch eine getestete Vorwärtsmigration korrigiert. Ein vollständiger Restore kann neuere Änderungen verlieren und ist eine eigene Betriebsentscheidung.

Für den produktiven Betrieb sind RPO/RTO, Sicherungsintervall, Verschlüsselung, getrennte Sicherungsrechte, Aufbewahrung, Löschung und regelmäßige Wiederherstellungsübungen noch festzulegen.
