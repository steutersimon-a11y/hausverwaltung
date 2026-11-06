# ADR 0003: Private Dateiinhalte und serverseitige Fachrechte

**Status:** Für den Kernprototyp entschieden.

## Kontext

Grundrisse und spätere Vertragsdokumente dürfen nicht allein durch Kenntnis einer URL abrufbar sein. Authentifizierung bestimmt eine Identität, aber noch keinen Zugriff auf jedes Objekt derselben Anwendung.

## Entscheidung

Better Auth übernimmt Anmeldung und Sitzungen. Die Anwendung ergänzt Memberships und Objektgrants. Jede Daten- und Dateiroute prüft diesen Scope serverseitig. Dokumentmetadaten und Versionen stehen in PostgreSQL; Inhalte im privaten S3-Speicher. Anwendungsrouten streamen erlaubte Dateiversionen nach erneuter Prüfung.

## Folgen

Objektrechte wirken auch auf direkte Downloadlinks. Uploads benötigen serverseitige Inhalts-, Größen- und Zuordnungsprüfung. Die Versionierung verhindert keinen administrativen Missbrauch des Speichers; zusätzliche Integritäts-, Aufbewahrungs- und Restoremaßnahmen bleiben Betriebsaufgaben. Eine öffentliche Static-Dateiablage ist für private Uploads ausgeschlossen.
