# ADR 0002: Synthetischer Standardbetrieb und lokale Kartendarstellung

**Status:** Für den Kernprototyp entschieden.

## Kontext

Das Repository ist öffentlich. Reale Portfoliolisten und Grundrisse können interne Informationen enthalten. Schon der Aufruf externer Kartendienste kann durch Tilekoordinaten den betrachteten Ort offenlegen. Für einen funktionsfähigen Kern sind keine echten Kunden-, ERP- oder Bankdaten erforderlich.

## Entscheidung

Die Datenbank startet mit klar fiktiven Immobilien und Personen. Demofußabdrücke und Höhen werden sichtbar als synthetisch markiert. Reale Quellen bleiben lokal git-ignoriert und benötigen einen nachvollziehbaren Review-/Übernahmeschritt. Die Basiskarte ist zunächst neutral und lokal; externe Karten und Geocoding sind nicht automatisch aktiv.

## Folgen

Der Kernablauf kann ohne Drittanbieterzugänge geprüft werden. Echte Außenmodelle, Luftbilder und Geocoder benötigen später einen bewusst konfigurierten Adapter mit Lizenz, Zweck und Prüfstatus. Ein unbekanntes Objekt bleibt in Liste/Review, statt durch erfundene Koordinaten vollständig zu wirken.
