# ATLAS im Browser öffnen

Du brauchst einen GitHub-Account und einen Browser. Auf deinem Rechner muss nichts installiert werden. GitHub Codespaces startet eine eigene Entwicklungsumgebung mit der Anwendung und ihren Datenspeichern.

**Vor dem Start:** GitHub gewährt persönlichen Accounts ein monatliches Kontingent für Codespaces. Je nach Account, gewählter Maschine, Laufzeit und Speicher können zusätzliche Kosten entstehen. Prüfe die angezeigten Konditionen vor „Create codespace“. [GitHubs Abrechnung und Kontingente](https://docs.github.com/en/billing/concepts/product-billing/github-codespaces).

## Starten und anmelden

1. Öffne **[ATLAS in GitHub Codespaces starten](https://codespaces.new/steutersimon-a11y/hausverwaltung)** und melde dich bei GitHub an.
2. Klicke auf **Create codespace**. Die erste Einrichtung kann mehrere Minuten dauern. Abhängigkeiten, Datenbank und synthetische Demo werden automatisch eingerichtet; danach startet ATLAS automatisch.
3. Warte auf den ATLAS-Tab. Falls er nicht automatisch erscheint, öffne unten in der Entwicklungsumgebung **Ports**, wähle bei **3000** das Globus-Symbol beziehungsweise **Open in Browser**. Lasse die Sichtbarkeit auf **Private**.
4. Melde dich in ATLAS mit **`admin@atlas.example`** und **`Atlas-Demo-2026!`** an. Weitere synthetische Konten stehen in der [README](../README.md#synthetische-demo-zugänge).

Die private Adresse endet normalerweise auf `.app.github.dev` und gehört zu deinem Codespace. Für den Zugang verlangt GitHub deine Anmeldung; anschließend schützt die ATLAS-Anmeldung die Anwendung. GitHub setzt weitergeleitete Ports standardmäßig auf privat. [GitHubs Sicherheitsbeschreibung](https://docs.github.com/en/codespaces/reference/security-in-github-codespaces).

Es wird ausschließlich der Anwendungsport **3000** für den Browser vorgesehen. PostgreSQL und der Objektspeicher bleiben interne Dienste; ändere ihre Ports nicht auf öffentlich. Die Anwendung läuft als Entwicklungsvorschau.

## Welche Daten enthalten sind

Ein frischer Codespace enthält **ausschließlich synthetische Beispieldaten** aus dem öffentlichen Repository. Die 36 echten Quelldatensätze und die dazugehörigen abgerufenen Gebäudemodelle bleiben in der bisherigen privaten Arbeitsumgebung. Sie werden weder veröffentlicht noch automatisch in den Codespace übertragen. Die Demo umfasst ebenfalls 36 Einheiten; diese sind fiktiv und beschreiben nicht den echten Bestand.

Echte Dateien lassen sich später über den geschützten Datenimport prüfen und ausdrücklich übernehmen. Fehlende Angaben bleiben unbekannt. Für dauerhaft produktive Daten ist eine gesonderte Betriebs- und Sicherungslösung erforderlich.

## Wieder öffnen und beenden

Öffne deinen bestehenden Codespace über **[github.com/codespaces](https://github.com/codespaces)** erneut. ATLAS startet beim Starten der Umgebung automatisch; vorhandene Konfiguration und Datenvolumes werden erhalten. Ein neuer Codespace ist eine separate Installation mit eigener Demo.

Wenn du fertig bist, stoppe die Umgebung auf der Codespaces-Seite über das Menü **… → Stop codespace**. Ein geschlossener Browser-Tab beendet die Umgebung nicht sofort. Gestoppte Codespaces behalten Speicher und können weiterhin Speicherkosten verursachen. Lösche eine Umgebung erst, wenn du ihre Daten nicht mehr brauchst beziehungsweise gesichert hast; das Löschen entfernt auch ihre gespeicherten Anwendungsdaten. [Codespaces-Abrechnung](https://docs.github.com/en/billing/concepts/product-billing/github-codespaces).

## Wenn die Vorschau nicht erscheint

- Warte, bis die Ersteinrichtung abgeschlossen ist, und öffne **Ports → 3000 → Open in Browser**. Nutze dieselbe Adresse auch für die Anmeldung.
- Wenn der Browser den automatischen neuen Tab blockiert, erlaube ihn oder nutze den manuellen Weg über **Ports**.
- Bei einem fehlgeschlagenen Start enthält `work/browser-preview.log` die Diagnose. Die Einrichtung meldet Fehler im Codespaces-Erstellungsprotokoll; keine Secrets oder echten Datensätze in Fehlerberichte kopieren.

Technischer Aufbau: [`.devcontainer/devcontainer.json`](../.devcontainer/devcontainer.json). Der Startlink folgt [GitHubs dokumentiertem Codespaces-Linkformat](https://docs.github.com/en/codespaces/setting-up-your-project-for-codespaces/setting-up-your-repository/facilitating-quick-creation-and-resumption-of-codespaces).
