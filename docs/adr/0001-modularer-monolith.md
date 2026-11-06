# ADR 0001: Modularer Monolith

**Status:** Für den Kernprototyp entschieden.

## Kontext

Ein kleines Verwaltungsteam benötigt zusammenhängende Objekt-, Einheiten-, Dokumenten- und Aufgabenabläufe. Fachgrenzen entwickeln sich noch. Separate Dienste würden zusätzliche Deployments und verteilte Konsistenzprobleme schaffen, bevor diese notwendig sind.

## Entscheidung

Next.js stellt Oberfläche und serverseitige API bereit. Drizzle und PostgreSQL bilden die zentrale Persistenz. Der Dateispeicher bleibt als private S3-Schnittstelle getrennt. Browsergeeignete Verträge werden ohne DB-Laufzeitimporte geteilt. Fachoperationen bleiben vom UI und von externen Adaptern separiert.

## Folgen

Änderung, Revision und Audit können in einer DB-Transaktion konsistent bleiben. Der erste Ablauf lässt sich lokal mit wenigen Prozessen testen. Neue Pakete und Hintergrundjobs werden erst bei konkretem Bedarf ergänzt. Der Monolith ersetzt keine konsequente Organisations-/Objektisolierung und keine Tests.
