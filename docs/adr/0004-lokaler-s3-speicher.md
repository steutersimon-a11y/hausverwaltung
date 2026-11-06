# ADR 0004: SeaweedFS als lokaler S3-Speicher

**Status:** Im lokalen Prototyp konfiguriert; Upload-/Restore-Abnahme wird getrennt dokumentiert.

## Kontext

Der Kern benötigt eine tatsächlich startbare private S3-kompatible Dateiablage. Die zunächst vorgesehenen MinIO-Images waren im aktuellen Arbeitslauf weder über die geprüfte Docker-Hub-Quelle noch über Quay abrufbar. Der Dateispeicher soll keinen Wechsel der Fach- und API-Verträge erzwingen.

## Entscheidung

Die lokale Compose-Konfiguration verwendet `chrislusf/seaweedfs:4.38` mit Apache-2.0-Lizenz. Der offizielle Quick Start dokumentiert `weed mini` für eine kompakte lokale S3-Instanz mit AWS-Zugangswerten und Bucketkonfiguration. Der Compose-Service heißt `objectstore`; `atlas_objects` ist sein persistentes Volume. Der Host veröffentlicht nur `127.0.0.1:9000` auf den internen S3-Port 8333. Interne Verwaltungsports werden nicht auf dem Host veröffentlicht. [Offizieller Quick Start](https://github.com/seaweedfs/seaweedfs#quick-start)

## Folgen

Anwendung, Uploadprüfung, private Storagekeys und Dateidownloads verwenden unverändert den S3-Adapter. MinIO bleibt eine mögliche alternative Implementierung eines privaten S3-Dienstes, ist aber nicht der im aktuellen Compose-Setup gestartete Server. Der optionale MinIO-Client `mc` kann als S3-Werkzeug weiterhin mit SeaweedFS arbeiten.

`weed mini` ist hier eine lokale Entwicklungsentscheidung. Verfügbarkeit, Verschlüsselung, verteilte Topologie, Berechtigungen und Wiederherstellung für einen produktiven Betrieb werden dadurch nicht automatisch nachgewiesen. Ein gemountetes Volume allein ist kein Backup.
