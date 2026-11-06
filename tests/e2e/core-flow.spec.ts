import { expect, test, type Page } from "@playwright/test";

const ADMIN_EMAIL = "admin@atlas.example";
const ADMIN_PASSWORD = "Atlas-Demo-2026!";

interface OpenUnitOptions {
  propertyName: string;
  buildingName: string;
  floorName: string;
  unitLabel: string;
}

const editTarget: OpenUnitOptions = {
  propertyName: "Lindenquartier · Demo",
  buildingName: "Haus B · Demo",
  floorName: "1. Obergeschoss",
  unitLabel: "Wohnung links · Demo",
};

const documentTarget: OpenUnitOptions = {
  propertyName: "Hafenhof · Demo",
  buildingName: "Haus A · Demo",
  floorName: "Erdgeschoss",
  unitLabel: "Wohnung rechts · Demo",
};

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-Mail-Adresse", { exact: true }).fill(ADMIN_EMAIL);
  await page.getByLabel("Passwort", { exact: true }).fill(ADMIN_PASSWORD);
  for (let attempt = 0; attempt < 3; attempt++) {
    const signInResponse = page.waitForResponse(response =>
      new URL(response.url()).pathname === "/api/auth/sign-in/email" && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: /Arbeitsbereich öffnen/ }).click();
    const response = await signInResponse;
    if (response.status() !== 429 || attempt === 2) {
      expect(response.status(), "Die echte Demo-Anmeldung muss nach höchstens drei Versuchen erfolgreich sein.").toBe(200);
      break;
    }
    const retryAfter = response.headers()["retry-after"];
    const seconds = Number(retryAfter);
    const backoffMs = retryAfter && Number.isFinite(seconds) ? seconds * 1000 : 10_000;
    // Deliberate server-directed backoff; production authentication limits stay enabled.
    await page.waitForTimeout(Math.max(1000, backoffMs) + 300);
  }
  await expect(page).toHaveURL(/\/portfolio(?:\?.*)?$/);
  await expect(page.getByRole("heading", { name: "Euer Bestand. Im Zusammenhang.", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Objektliste", exact: true })).toBeVisible();
}

async function openUnit(page: Page, target: OpenUnitOptions) {
  const objectList = page.getByRole("region", { name: "Objektliste", exact: true });
  await objectList.getByRole("button", { name: new RegExp(target.propertyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).click();
  const propertyInspector = page.getByRole("complementary", { name: "Objektdetails", exact: true });
  await expect(propertyInspector.getByRole("heading", { name: target.propertyName, exact: true })).toBeVisible();
  await propertyInspector.getByLabel("Gebäude").selectOption({ label: target.buildingName });
  await propertyInspector.getByRole("tablist", { name: "Geschoss auswählen", exact: true })
    .getByRole("tab", { name: new RegExp(`^${target.floorName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) }).click();
  const unitRequest = page.waitForResponse(response =>
    /\/api\/atlas\/units\/[^/]+$/.test(new URL(response.url()).pathname) && response.request().method() === "GET",
  );
  await propertyInspector.locator(".unit-row").filter({ hasText: target.unitLabel }).click();
  const unitResponse = await unitRequest;
  expect(unitResponse.status()).toBe(200);
  const payload = await unitResponse.json() as { unit: { id: string; areaM2: number | null; note: string } };
  const inspector = page.getByRole("complementary", { name: "Einheitendetails", exact: true });
  await expect(inspector.getByRole("heading", { name: target.unitLabel, exact: true })).toBeVisible();
  await expect(inspector.getByRole("button", { name: "Änderungen speichern", exact: true })).toBeEnabled();
  return { inspector, unitId: payload.unit.id };
}

test("Einheitenänderung bleibt nach Reload erhalten und erscheint in der Historie", async ({ page }) => {
  await signIn(page);
  const map = page.getByTestId("portfolio-map");
  await expect(map).toHaveAttribute("data-map-state", "ready");
  await expect.poll(async () => Number(await map.getAttribute("data-rendered-buildings")), { message: "Der lokale MapLibre-Worker muss echte 3D-Gebäudeflächen rendern." }).toBeGreaterThan(0);
  const { inspector, unitId } = await openUnit(page, editTarget);
  const area = inspector.getByRole("spinbutton", { name: "Wohnfläche in Quadratmetern", exact: true });
  const previousArea = Number(await area.inputValue());
  const nextArea = previousArea === 73.25 ? 73.5 : 73.25;
  const note = `E2E-Kernablauf: gespeicherte Demofläche ${nextArea} m².`;
  await area.fill(String(nextArea));
  await inspector.getByRole("textbox", { name: "Notiz", exact: true }).fill(note);
  const saveResponse = page.waitForResponse(response =>
    new URL(response.url()).pathname === `/api/atlas/units/${unitId}` && response.request().method() === "PATCH",
  );
  await inspector.getByRole("button", { name: "Änderungen speichern", exact: true }).click();
  expect((await saveResponse).status()).toBe(200);
  await expect(page.getByRole("status").filter({ hasText: "Änderungen gespeichert und in der Historie protokolliert." })).toBeVisible();

  await page.reload();
  const reopened = await openUnit(page, editTarget);
  expect(reopened.unitId).toBe(unitId);
  await expect(reopened.inspector.getByRole("spinbutton", { name: "Wohnfläche in Quadratmetern", exact: true })).toHaveValue(String(nextArea));
  await expect(reopened.inspector.getByRole("textbox", { name: "Notiz", exact: true })).toHaveValue(note);
  await reopened.inspector.getByRole("tab", { name: "Historie", exact: true }).click();
  await expect(reopened.inspector.getByText("Angaben aktualisiert", { exact: true }).first()).toBeVisible();
  await reopened.inspector.getByText("Änderung anzeigen", { exact: true }).first().click();
  await expect(reopened.inspector.locator("pre").filter({ hasText: note }).first()).toBeVisible();
});

test("Originalgrundriss wird geschützt einer Einheit zugeordnet und unverändert angezeigt", async ({ page }) => {
  await signIn(page);
  const { inspector, unitId } = await openUnit(page, documentTarget);
  await inspector.getByRole("tab", { name: "Dokumente", exact: true }).click();
  await inspector.getByRole("button", { name: "Hochladen", exact: true }).click();
  const upload = page.getByRole("dialog", { name: "Ein Original am richtigen Ort.", exact: true });
  await expect(upload.getByText("Zusätzlich der geöffneten Einheit zugeordnet.", { exact: true })).toBeVisible();

  // A real PNG file generated solely for this test, visibly labelled as fictitious.
  const pngBase64 = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 600; canvas.height = 400;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Der Browser kann die synthetische Testdatei nicht erzeugen.");
    context.fillStyle = "white"; context.fillRect(0, 0, 600, 400);
    context.strokeStyle = "#222"; context.lineWidth = 5;
    context.strokeRect(35, 60, 530, 280);
    context.beginPath(); context.moveTo(320, 60); context.lineTo(320, 340); context.stroke();
    context.fillStyle = "#222"; context.font = "18px sans-serif";
    context.fillText("FIKTIVER TESTGRUNDRISS · KEIN ARCHITEKTURPLAN", 35, 35);
    context.fillText("Demoraum A", 100, 195); context.fillText("Demoraum B", 370, 195);
    context.font = "13px sans-serif"; context.fillText("Synthetische E2E-Datei · ohne Maßstabsbehauptung", 35, 375);
    return canvas.toDataURL("image/png").split(",")[1] ?? "";
  });
  const png = Buffer.from(pngBase64, "base64");
  const filename = `synthetischer-testgrundriss-${Date.now()}.png`;
  await upload.getByLabel("Originaldatei auswählen", { exact: true }).setInputFiles({ name: filename, mimeType: "image/png", buffer: png });
  const uploadResponse = page.waitForResponse(response =>
    new URL(response.url()).pathname === "/api/atlas/documents" && response.request().method() === "POST",
  );
  await upload.getByRole("button", { name: "Geschützt hochladen", exact: true }).click();
  const savedResponse = await uploadResponse;
  expect(savedResponse.status()).toBe(201);
  const saved = await savedResponse.json() as { document: { id: string; unitId: string | null } };
  expect(saved.document.unitId).toBe(unitId);
  await expect(upload).not.toBeVisible();

  const contentResponse = page.waitForResponse(response =>
    new URL(response.url()).pathname === `/api/atlas/documents/${saved.document.id}/content` && response.request().method() === "GET",
  );
  await inspector.getByRole("button", { name: `${filename} anzeigen`, exact: true }).click();
  const content = await contentResponse;
  expect(content.status()).toBe(200);
  expect(content.headers()["content-type"]).toContain("image/png");
  expect(await content.body()).toEqual(png);
  const image = page.getByRole("img", { name: `Hochgeladenes Original: ${filename}`, exact: true });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).complete && (element as HTMLImageElement).naturalWidth > 0)).toBe(true);
  await page.getByRole("button", { name: "Vergrößern", exact: true }).click();
  await expect(page.locator(".zoom-label")).toHaveText("125 %");
  await page.getByRole("button", { name: "Dokument drehen", exact: true }).click();
  await expect(image).toHaveAttribute("style", /rotate\(90deg\)/);
  await page.getByRole("button", { name: "Dialog schließen", exact: true }).click();
});

test("Mobile Listenansicht, Tastatursuche und Light Mode sind nutzbar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.getByRole("button", { name: "Helles Design aktivieren", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("button", { name: "Dunkles Design aktivieren", exact: true })).toBeVisible();

  await page.keyboard.press("Control+k");
  const search = page.getByRole("textbox", { name: "Schnellsuche", exact: true });
  await expect(search).toBeFocused();
  await search.fill("Lindenquartier");
  const commandResult = page.getByRole("dialog").getByRole("button", { name: /Lindenquartier · Demo/ });
  await commandResult.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByRole("complementary", { name: "Objektdetails", exact: true }).getByRole("heading", { name: "Lindenquartier · Demo", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Liste", exact: true }).click();
  await page.getByRole("textbox", { name: "Bestand durchsuchen", exact: true }).fill("Parkensemble");
  const table = page.getByRole("table", { name: "Gefilterte Verwaltungsobjekte, identisch zur Kartenansicht", exact: true });
  await expect(table.getByRole("row")).toHaveCount(2);
  const openProperty = table.getByRole("button", { name: "Parkensemble · Demo öffnen", exact: true });
  await openProperty.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("complementary", { name: "Objektdetails", exact: true }).getByRole("heading", { name: "Parkensemble · Demo", exact: true })).toBeVisible();
  const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, body: document.body.scrollWidth }));
  expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport + 1);
});
