# ATLAS Property OS – Produktvision

ATLAS verbindet eine räumliche Portfolioansicht mit der täglichen Arbeit einer Hausverwaltung. Eine Karte dient der Orientierung; die Tabelle, Suche und Detailansicht ermöglichen dieselben Aufgaben ohne 3D-Bedienung. Der Prototyp ist ein Management- und Informationslayer. Er ersetzt derzeit kein geprüftes ERP, keine Buchhaltung und kein revisionssicher nachgewiesenes DMS.

## Nutzer und Aufgaben

| Rolle | Häufige Aufgabe | Benötigte Sicht |
| --- | --- | --- |
| Verwaltungsleitung | Bestand und offene Entscheidungen überblicken | Organisation, aggregierte Kennzahlen, zugewiesene Objekte |
| Objektverwalter | Von Gebäude zu Einheit und Vorgang navigieren | Gebäudestruktur, Einheiten, Dokumente, Aufgaben |
| Sachbearbeitung | Angaben ergänzen und Vorgänge bearbeiten | Freigegebene Objekte, validierte Formulare, Historie |
| Lesender Nutzer | Informationen und Pläne einsehen | Ausschließlich berechtigte Objekte und Dateien |
| Buchhaltung, später | Forderungen und Zahlungsvorschläge prüfen | Rechtseinheit, Konto, Periode, nachvollziehbare Freigaben |

## Der erste vollständige Ablauf

1. Nutzer meldet sich mit einem synthetischen Demoaccount an.
2. Portfolio und Kennzahlen stammen aus der Datenbank. Alle Demoobjekte sind als fiktiv erkennbar.
3. Auswahl in Karte oder Liste öffnet dasselbe Objekt im Inspector.
4. Gebäude, Geschoss und Einheit führen zu gespeicherten Einheitendaten. Nicht vorhandene Hierarchiestufen werden nicht erfunden.
5. Eine berechtigte Änderung an Fläche, Nutzungsstatus oder Notiz wird validiert, mit Revisionsprüfung gespeichert und in der Historie angezeigt.
6. Ein PDF- oder Bildgrundriss wird einem berechtigten Objekt beziehungsweise einer Einheit zugeordnet, privat gespeichert und über einen geprüften Download geladen.
7. Ein Nutzer aus einer anderen Organisation kann weder die Daten noch den Dateiinhalt durch eine direkte URL erreichen.

## Informationsprinzipien

- Herkunft und Prüfstatus sind Teil der Information. Unbekannt ist ein gültiger Zustand.
- Die 3D-Darstellung zeigt Außenkörper. Ohne geprüfte Plan- und Maßinformationen entsteht daraus kein maßhaltiger digitaler Zwilling.
- Auf der Karte stehen nur aggregierte Objektindikatoren. Personen-, Miet- und Kontodaten erscheinen erst in den dafür berechtigten Details.
- Keine Platzhalteraktionen, die Erfolg vortäuschen. Noch nicht implementierte Fachmodule werden als geplante Erweiterungen beschrieben.
- Dark Mode und Light Mode, Tastaturbedienung, sichtbarer Fokus und eine vollständige Listenalternative gehören zur nutzbaren Oberfläche. WCAG 2.2 AA ist ein Prüfziel, keine bereits nachgewiesene Konformität.

## Spätere Nutzerabläufe

Importe führen über eine bearbeitbare Staging-Ansicht zu einer expliziten Übernahme. Aufgaben wachsen zu Vorgangsakten mit Angeboten und Freigaben. Finanzvorgänge trennen Sollforderung, Istbewegung, Vorschlag und genehmigte Zuordnung. Aareon und Banking werden erst an nachgewiesene Formate beziehungsweise autorisierte Dienste angebunden.

Prioritäten, Reifegrad und Abnahmebedingungen stehen in [ROADMAP.md](ROADMAP.md).
