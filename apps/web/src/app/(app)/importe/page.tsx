'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { emptyImportProperty } from '@atlas/integrations';
import type { ImportBatchDto, ImportProperty, ImportRecordDto, ImportReviewDto } from '@atlas/integrations';

type EditableRow = Omit<ImportRecordDto, 'id'> & { id?: string };
const labels = { new: 'Neu', unchanged: 'Unverändert', conflict: 'Konflikt', invalid: 'Fehlerhaft', excluded: 'Ausgelassen' };
const date = (value: string) => new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Berlin' }).format(new Date(value));
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, credentials: 'same-origin', cache: 'no-store' });
  if (response.status === 401) throw new Error('Bitte erneut anmelden und die Seite neu öffnen.');
  const body: unknown = await response.json();
  if (!response.ok) throw new Error((body as { error?: { message?: string } }).error?.message ?? 'Die Anfrage konnte nicht verarbeitet werden.');
  return body as T;
}

export default function ImportsPage() {
  const [batches, setBatches] = useState<ImportBatchDto[]>([]);
  const [review, setReview] = useState<ImportReviewDto | null>(null);
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [sourceSystem, setSourceSystem] = useState('portfolio-upload');
  const [dataClass, setDataClass] = useState<'synthetic' | 'real'>('synthetic');
  const [file, setFile] = useState<File | null>(null);
  const [showSource, setShowSource] = useState(true);

  function acceptReview(value: ImportReviewDto) { setReview(value); setRows(value.records); setDirty(false); }
  async function refreshList() { setBatches((await api<{ batches: ImportBatchDto[] }>('/api/atlas/imports')).batches); }
  useEffect(() => { refreshList().catch((failure: unknown) => setError(failure instanceof Error ? failure.message : 'Importliste nicht verfügbar.')).finally(() => setLoading(false)); }, []);
  async function run(operation: () => Promise<void>) {
    setBusy(true); setError(null); setMessage(null);
    try { await operation(); } catch (failure) { setError(failure instanceof Error ? failure.message : 'Vorgang fehlgeschlagen.'); } finally { setBusy(false); }
  }
  async function openBatch(id: string) {
    if (dirty && !window.confirm('Nicht gespeicherte Review-Änderungen verwerfen?')) return;
    await run(async () => { acceptReview(await api<ImportReviewDto>(`/api/atlas/imports/${id}`)); });
  }
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    if (!file) { setError('Bitte eine Datei auswählen.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('Die Importdatei darf höchstens 5 MB groß sein.'); return; }
    await run(async () => {
      const form = new FormData(); form.set('file', file); form.set('sourceSystem', sourceSystem); form.set('dataClass', dataClass);
      const result = await api<ImportReviewDto>('/api/atlas/imports', { method: 'POST', body: form });
      acceptReview(result); setFile(null); element.reset(); await refreshList();
      setMessage(result.batch.format === 'screenshot' ? 'Screenshot geschützt abgelegt. Sichtbare Angaben manuell übertragen und jede Zeile prüfen.' : 'Datei eingelesen. Es wurden noch keine Objekte übernommen.');
    });
  }
  function edit(index: number, field: keyof ImportProperty, value: string) {
    setRows(previous => previous.map((row, current) => {
      if (index !== current) return row;
      const next = { ...row, data: { ...row.data }, confirmed: false };
      if (field === 'reportedUnitCount' || field === 'reportedResidentialCount' || field === 'reportedParkingCount') next.data[field] = value === '' ? null : Number(value);
      else if (field === 'managementType') next.data.managementType = value ? value as ImportProperty['managementType'] : null;
      else if (field === 'sourceRecordId' || field === 'note') next.data[field] = value;
      else next.data[field] = value || null;
      return next;
    })); setDirty(true); setMessage(null);
  }
  function toggle(index: number, field: 'included' | 'confirmed', value: boolean) {
    setRows(previous => previous.map((row, current) => current === index ? { ...row, [field]: value, ...(field === 'included' && !value ? { confirmed: false } : {}) } : row)); setDirty(true);
  }
  function addRow() {
    if (!review || rows.length >= 500) return;
    const line = Math.max(0, ...rows.map(row => row.sourceLine)) + 1;
    setRows(previous => [...previous, { sourceLine: line, revision: 1, included: true, confirmed: false, data: emptyImportProperty(`manual:${review.batch.id}:${line}`), issues: [], change: { kind: 'invalid', existingPropertyId: null, fields: [] } }]);
    setDirty(true);
  }
  async function saveReview() {
    if (!review) return;
    await run(async () => {
      acceptReview(await api<ImportReviewDto>(`/api/atlas/imports/${review.batch.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: review.batch.revision,
        records: rows.map(row => ({ id: row.id, revision: row.revision, sourceLine: row.sourceLine, included: row.included, confirmed: row.confirmed, data: row.data })) }) }));
      await refreshList(); setMessage('Review gespeichert. Die Vorschau entspricht jetzt dieser Revision.');
    });
  }
  async function commit() {
    if (!review || dirty || !window.confirm(`${review.summary.new} neue Objekte übernehmen? ${review.summary.unchanged} unveränderte Datensätze werden wiedererkannt. Es werden keine Einheiten oder Koordinaten erfunden.`)) return;
    await run(async () => {
      acceptReview(await api<ImportReviewDto>(`/api/atlas/imports/${review.batch.id}/commit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: review.batch.revision, confirmed: true }) }));
      await refreshList(); setMessage('Import atomar übernommen und im Audit-Protokoll festgehalten.');
    });
  }
  function exampleCsv() {
    const contents = '\uFEFFsourceRecordId;code;name;street;houseNumber;postalCode;city;managementType;note;reportedUnitCount\nDEMO-IMPORT-001;DEMO-IMP-001;Fiktiver Demo-Hof;Fiktivstraße;1;00000;Demostadt;rental;Ausschließlich synthetische Testdaten;4\n';
    const url = URL.createObjectURL(new Blob([contents], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'atlas-fiktiver-beispielimport.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const committed = review?.batch.status === 'imported';
  const canCommit = Boolean(review && !committed && !dirty && review.summary.new + review.summary.unchanged > 0 && !review.summary.invalid && !review.summary.conflict && !review.summary.unconfirmed);
  const input = (row: EditableRow, index: number, field: keyof ImportProperty, label: string, type = 'text') => <input aria-label={`${label}, Quellzeile ${row.sourceLine}`} value={row.data[field] ?? ''} type={type} onChange={event => edit(index, field, event.target.value)} disabled={busy || committed} maxLength={field === 'note' ? 4000 : 160} min={type === 'number' ? 0 : undefined} step={type === 'number' ? 1 : undefined} placeholder="Unbekannt" />;

  return <div className="imports-page">
    <header className="import-topbar"><Link href="/portfolio" className="import-brand" aria-label="ATLAS Property OS, zum Portfolio">ATLAS <span>PROPERTY OS</span></Link><Link href="/portfolio" className="import-back"><span aria-hidden="true">←</span> Zurück zum Portfolio</Link></header>
    <div className="page-heading"><div><p className="eyebrow">DATEN MIT HERKUNFT</p><h1 className="page-title">Import & Review</h1><p className="page-description">Einlesen, prüfen und bewusst übernehmen. Der Bestand bleibt bis zur Freigabe unverändert.</p></div><button className="button secondary" onClick={exampleCsv}>Beispiel-CSV laden ↓</button></div>
    {error ? <div className="error-panel" role="alert">{error}</div> : null}{message ? <div className="notice success" role="status">{message}</div> : null}
    <div className="import-layout">
      <aside className="import-sidebar">
        <form onSubmit={upload} className="import-upload"><p className="eyebrow">NEUER IMPORT</p><h2>Quelle hinterlegen</h2><p>CSV, JSON oder Screenshot. Maximal 5 MB und 500 Zeilen.</p>
          <label className="field">Quellsystem<input value={sourceSystem} onChange={event => setSourceSystem(event.target.value)} pattern="[a-z0-9][a-z0-9._-]{0,79}" required disabled={busy} /></label>
          <label className="field">Datenherkunft<select value={dataClass} onChange={event => setDataClass(event.target.value as 'synthetic' | 'real')} disabled={busy}><option value="synthetic">Fiktive Testdaten</option><option value="real">Echte Daten zur Prüfung</option></select></label>
          <label className="import-file"><span>Datei auswählen</span><input type="file" accept=".csv,.json,.png,.jpg,.jpeg,.webp" onChange={event => setFile(event.target.files?.[0] ?? null)} required disabled={busy} /><small>{file?.name ?? 'CSV · JSON · PNG · JPEG · WebP'}</small></label>
          <button className="button primary" type="submit" disabled={busy || !file}>{busy ? 'Wird verarbeitet …' : 'In Review einlesen'}</button><p className="import-hint">Screenshots werden manuell abgeschrieben. Keine automatische OCR oder Geokodierung.</p>
        </form>
        <div className="import-history"><p className="eyebrow">IMPORTVERLAUF</p>{loading ? <div className="skeleton" aria-label="Importliste lädt" /> : !batches.length ? <p className="import-hint">Noch keine Importe vorhanden.</p> : batches.map(batch => <button key={batch.id} disabled={busy} className={`batch-item ${review?.batch.id === batch.id ? 'active' : ''}`} onClick={() => openBatch(batch.id)}><span className="batch-format">{batch.format === 'screenshot' ? 'BILD' : batch.format.toUpperCase()}</span><strong>{batch.originalName}</strong><span>{batch.recordCount} Zeilen · {batch.status === 'imported' ? 'Übernommen' : 'In Prüfung'}</span><small>{date(batch.createdAt)}</small></button>)}</div>
      </aside>
      <section className="import-review" aria-label="Importvorschau">
        {!review ? <div className="import-empty"><div className="import-empty-symbol">↳</div><h2>Aus einer Liste wird ein Bestand.</h2><p>Jede Zeile erhält eine nachvollziehbare Herkunft und wird vor der Übernahme geprüft.</p><div className="import-steps"><span>01 · Quelle</span><span>02 · Review</span><span>03 · Übernahme</span></div><p className="import-hint">XLSX und konkrete Aareon-Formate sind noch nicht freigeschaltet. Verwende zunächst die dokumentierten CSV- oder JSON-Felder.</p></div> : <>
          <header className="review-heading"><div><p className="eyebrow">{review.batch.dataClass === 'synthetic' ? 'FIKTIVE TESTDATEN' : 'ECHTE DATEN · MANUELLE PRÜFUNG'} · REVISION {review.batch.revision}</p><h2>{review.batch.originalName}</h2><p>{review.batch.sourceSystem} · {committed ? `Übernommen am ${date(review.batch.importedAt!)}` : 'Noch nicht im Objektbestand'}</p></div><a className="button secondary small" href={review.batch.sourceUrl} target="_blank" rel="noreferrer">Originalquelle öffnen ↗</a></header>
          <div className="review-stats"><span><strong>{review.summary.new}</strong> Neu</span><span><strong>{review.summary.unchanged}</strong> Unverändert</span><span><strong>{review.summary.invalid + review.summary.conflict}</strong> Zu klären</span><span><strong>{review.summary.unconfirmed}</strong> Unbestätigt</span></div>
          {committed ? <div className="notice success"><strong>Übernahme abgeschlossen.</strong> {String(review.batch.report?.created ?? 0)} neue Objekte, {String(review.batch.report?.unchanged ?? 0)} wiedererkannte Datensätze, {String(review.batch.report?.excluded ?? 0)} ausgelassene Zeilen. Dieser Quellstand bleibt unveränderbar.</div> : <div className="notice"><strong>Jede ausgewählte Zeile ausdrücklich bestätigen.</strong> Fehlende Werte bleiben unbekannt. Einheitenzahlen bleiben Quellenangaben; daraus werden keine Wohnungen erzeugt. Bestehende Daten werden bei Konflikten nicht überschrieben.</div>}
          {review.batch.format === 'screenshot' ? <div className="source-preview"><div className="source-preview-top"><strong>Originalbild zur manuellen Abschrift</strong><button className="button ghost small" onClick={() => setShowSource(value => !value)}>{showSource ? 'Einklappen' : 'Anzeigen'}</button></div>{showSource ? <Image unoptimized width={1200} height={900} src={review.batch.sourceUrl} alt="Original der hochgeladenen Objektliste zur manuellen Abschrift" /> : null}<p>Keine automatische Texterkennung. Unleserliche Angaben beim Übertragen offen lassen.</p></div> : null}
          <div className="review-toolbar"><span>{rows.length} Quellzeilen · {dirty ? 'Ungespeicherte Änderungen' : 'Gespeicherte Vorschau'}</span>{!committed ? <div><button className="button ghost small" disabled={busy} onClick={() => { setRows(previous => previous.map(row => row.included ? { ...row, confirmed: true } : row)); setDirty(true); }}>Ausgewählte als geprüft markieren</button>{review.batch.format === 'screenshot' ? <button className="button secondary small" disabled={busy || rows.length >= 500} onClick={addRow}>Zeile ergänzen ＋</button> : null}</div> : null}</div>
          <div className="review-table-scroll"><table className="review-table"><thead><tr><th>Auswahl</th><th>Quelle</th><th>Objekt</th><th>Straße / Hausnr.</th><th>PLZ / Ort</th><th>Quell-ID</th><th>Prüfung</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row.id ?? `new-${row.sourceLine}`} className={!row.included ? 'excluded' : ''}>
            <td><label className="check-label"><input type="checkbox" checked={row.included} disabled={busy || committed} onChange={event => toggle(index, 'included', event.target.checked)} aria-label={`Quellzeile ${row.sourceLine} übernehmen`} /><span>Aufnehmen</span></label><span className={`badge ${row.change.kind === 'invalid' || row.change.kind === 'conflict' ? 'badge-warning' : 'badge-neutral'}`}>{dirty ? 'Neuprüfung' : labels[row.change.kind]}</span></td>
            <td className="source-line">Zeile {row.sourceLine}<small>Revision {row.revision}</small></td>
            <td>{input(row, index, 'name', 'Objektbezeichnung')}{input(row, index, 'code', 'Objektcode')}<select aria-label={`Verwaltungsart, Quellzeile ${row.sourceLine}`} value={row.data.managementType ?? ''} onChange={event => edit(index, 'managementType', event.target.value)} disabled={busy || committed}><option value="">Bitte auswählen</option><option value="rental">Mietverwaltung</option><option value="weg">WEG</option><option value="mixed">Gemischt</option></select></td>
            <td>{input(row, index, 'street', 'Straße')}{input(row, index, 'houseNumber', 'Hausnummer')}</td><td>{input(row, index, 'postalCode', 'Postleitzahl')}{input(row, index, 'city', 'Ort')}</td>
            <td>{input(row, index, 'sourceRecordId', 'Quell-ID')}<details><summary>Quellenangaben</summary><label>Einh.{input(row, index, 'reportedUnitCount', 'Einheiten laut Quelle', 'number')}</label><label>WE{input(row, index, 'reportedResidentialCount', 'Wohneinheiten laut Quelle', 'number')}</label><label>GA/ST{input(row, index, 'reportedParkingCount', 'Garagen und Stellplätze laut Quelle', 'number')}</label><label>Notiz{input(row, index, 'note', 'Notiz')}</label></details></td>
            <td><label className="check-label"><input type="checkbox" checked={row.confirmed} disabled={busy || committed || !row.included} onChange={event => toggle(index, 'confirmed', event.target.checked)} aria-label={`Quellzeile ${row.sourceLine} geprüft`} /><span>Geprüft</span></label>{row.issues.map((issue, issueIndex) => <p key={`${issue.code}-${issueIndex}`} className={`review-issue ${issue.severity}`}>{issue.message}</p>)}{row.change.fields.length ? <details><summary>{row.change.fields.length} Abweichungen zum Bestand</summary>{row.change.fields.map(field => <p className="field-diff" key={field.field}><strong>{field.field}</strong><del>{String(field.before ?? 'Unbekannt')}</del><ins>{String(field.after ?? 'Unbekannt')}</ins></p>)}</details> : null}</td>
          </tr>)}</tbody></table></div>
          {!committed ? <footer className="review-actions"><p>{dirty ? 'Änderungen speichern und die aktualisierte Vorschau prüfen.' : canCommit ? 'Alle ausgewählten Zeilen sind geprüft.' : 'Fehler, Konflikte oder unbestätigte Zeilen verhindern die Übernahme.'}</p><div><button className="button secondary" disabled={busy || !dirty} onClick={saveReview}>{busy ? 'Wird gespeichert …' : 'Review speichern'}</button><button className="button primary" disabled={busy || !canCommit} onClick={commit}>Bestätigt übernehmen →</button></div></footer> : null}
        </>}
      </section>
    </div>
    <style jsx>{`
      .import-topbar{display:flex;justify-content:space-between;align-items:center;gap:20px;min-height:76px;border-bottom:1px solid var(--line,#253546)}.import-topbar :global(.import-brand){display:flex;align-items:baseline;gap:12px;text-decoration:none;letter-spacing:3px;font-size:18px;font-weight:650;color:var(--text,#e6ecef)}.import-topbar :global(.import-brand)>span{font-size:8px;letter-spacing:1.6px;color:var(--muted,#91a5b2);font-weight:500}.import-topbar :global(.import-back){display:flex;align-items:center;gap:8px;color:var(--mint,#8ad6c1);text-decoration:none;font-size:12px;padding:10px 0}.import-topbar :global(.import-back):hover{text-decoration:underline}.import-topbar :global(a):focus-visible{outline:2px solid var(--mint,#8ad6c1);outline-offset:5px;border-radius:3px}@media(max-width:500px){.import-topbar{gap:12px;min-height:66px}.import-topbar :global(.import-brand){font-size:16px;letter-spacing:2px}.import-topbar :global(.import-brand)>span{display:none}.import-topbar :global(.import-back){font-size:11px}}
      .imports-page{padding:0 28px 28px;color:var(--text,#e6ecef)}.page-heading{padding:28px 0}.import-layout{display:grid;grid-template-columns:250px minmax(0,1fr);gap:20px;align-items:start}.import-sidebar,.import-review{background:var(--panel,#121e2a);border:1px solid var(--line,#253546);border-radius:12px;min-width:0}.import-upload{padding:20px;border-bottom:1px solid var(--line,#253546);display:grid;gap:15px}.import-upload h2{font-size:17px;margin:0}.import-upload>p:not(.eyebrow){font-size:12px;line-height:1.7;color:var(--muted,#91a5b2);margin:0}.import-upload .eyebrow{margin:0}.field{display:grid;gap:7px;font-size:12px;color:var(--muted,#91a5b2)}.field input,.field select,.review-table input:not([type=checkbox]),.review-table select{box-sizing:border-box;width:100%;min-width:0;background:var(--bg,#0c131d);border:1px solid var(--line,#253546);color:var(--text,#e6ecef);border-radius:5px;padding:9px;font:inherit;font-size:12px}.import-file{border:1px dashed var(--muted,#91a5b2);border-radius:7px;padding:15px;display:grid;gap:10px;font-size:12px;overflow:hidden}.import-file input{width:100%;font-size:10px}.import-file small{color:var(--muted,#91a5b2);font-size:10px;overflow-wrap:anywhere}.import-hint{font-size:11px!important;line-height:1.7;color:var(--muted,#91a5b2)}.import-history{padding:20px}.batch-item{border:1px solid transparent;border-radius:7px;width:100%;display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding:12px;margin:8px 0 0;background:transparent;text-align:left;color:var(--text,#e6ecef);cursor:pointer}.batch-item:hover,.batch-item.active{background:var(--panel-alt,#172532);border-color:var(--line,#253546)}.batch-item strong{font-size:12px;overflow-wrap:anywhere}.batch-item>span:not(.batch-format),.batch-item small{font-size:10px;color:var(--muted,#91a5b2)}.batch-format{font-size:8px;letter-spacing:1px;color:var(--mint,#8ad6c1)}.import-review{min-height:550px;overflow:hidden}.import-empty{padding:100px 35px;text-align:center;max-width:630px;margin:auto}.import-empty-symbol{color:var(--mint,#8ad6c1);font-size:44px}.import-empty h2{font-size:23px;letter-spacing:-.7px;margin:20px 0 15px}.import-empty>p{font-size:13px;line-height:1.9;color:var(--muted,#91a5b2)}.import-steps{display:flex;justify-content:center;gap:20px;margin:30px 0 20px;font-size:11px;color:var(--mint,#8ad6c1)}.review-heading{display:flex;gap:20px;align-items:center;justify-content:space-between;padding:23px}.review-heading h2{font-size:19px;margin:9px 0;overflow-wrap:anywhere}.review-heading p:not(.eyebrow){font-size:11px;color:var(--muted,#91a5b2);margin:0}.review-stats{display:grid;grid-template-columns:repeat(4,1fr);border-block:1px solid var(--line,#253546);padding:18px 24px;gap:14px}.review-stats span{font-size:11px;color:var(--muted,#91a5b2)}.review-stats strong{font-size:22px;font-weight:500;color:var(--text,#e6ecef);display:block;margin-bottom:4px}.import-review>.notice{margin:18px 22px;font-size:12px;line-height:1.8}.source-preview{margin:20px 22px;border:1px solid var(--line,#253546);border-radius:7px;overflow:hidden}.source-preview-top{display:flex;align-items:center;justify-content:space-between;padding:12px;font-size:11px;background:var(--panel-alt,#172532)}.source-preview :global(img){display:block;width:100%;height:auto;max-height:450px;object-fit:contain;background:#070c12}.source-preview>p{font-size:11px;color:var(--muted,#91a5b2);padding:0 13px;line-height:1.7}.review-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 22px;border-top:1px solid var(--line,#253546);font-size:11px;color:var(--muted,#91a5b2)}.review-toolbar>div{display:flex;gap:10px;flex-wrap:wrap}.review-table-scroll{overflow:auto;border-block:1px solid var(--line,#253546)}.review-table{width:100%;border-collapse:collapse;font-size:11px;min-width:1100px}.review-table th{font-size:10px;text-transform:uppercase;letter-spacing:.7px;color:var(--muted,#91a5b2);padding:14px 12px;text-align:left;background:var(--panel-alt,#172532)}.review-table td{padding:13px 10px;vertical-align:top;border-top:1px solid var(--line,#253546);min-width:130px;max-width:230px}.review-table td:first-child{min-width:105px}.review-table td:nth-child(2){min-width:75px}.review-table td:last-child{min-width:210px}.review-table input:not([type=checkbox]),.review-table select{margin:0 0 7px}.review-table input[type=checkbox]{accent-color:var(--mint,#8ad6c1);width:15px;height:15px;flex-shrink:0}.check-label{display:flex;gap:7px;align-items:center;font-size:11px;margin-bottom:12px;cursor:pointer}.source-line{font-size:11px;color:var(--muted,#91a5b2)}.source-line small{display:block;font-size:9px;margin-top:7px}.review-table .excluded{opacity:.55}.review-table details{font-size:10px;color:var(--muted,#91a5b2);line-height:1.7}.review-table summary{cursor:pointer;margin-bottom:8px}.review-table details label{display:block;font-size:10px}.review-issue{font-size:10px;line-height:1.6;color:var(--amber,#d9c5a2);margin:7px 0}.review-issue.error{color:#e7aaa3}.field-diff{display:grid;gap:4px;font-size:10px;overflow-wrap:anywhere}.field-diff del{color:#e7aaa3}.field-diff ins{color:var(--mint,#8ad6c1);text-decoration:none}.review-actions{padding:20px 22px;display:flex;gap:22px;align-items:center;justify-content:space-between}.review-actions p{font-size:11px;color:var(--muted,#91a5b2);line-height:1.8;max-width:430px}.review-actions>div{display:flex;gap:10px;flex-shrink:0}.imports-page>.notice,.imports-page>.error-panel{margin-bottom:20px}.button:disabled{opacity:.45;cursor:not-allowed}.review-table input:focus-visible,.review-table select:focus-visible,.field input:focus-visible,.field select:focus-visible{outline:2px solid var(--mint,#8ad6c1);outline-offset:2px}
      @media(max-width:1150px){.import-layout{grid-template-columns:220px minmax(0,1fr)}.imports-page{padding-inline:20px}.review-heading,.review-actions,.review-toolbar{align-items:flex-start;flex-direction:column}}@media(max-width:800px){.imports-page{padding:0 14px 20px}.import-layout{grid-template-columns:1fr}.import-sidebar{display:grid;grid-template-columns:1fr 1fr}.import-upload{border-right:1px solid var(--line,#253546);border-bottom:0}.import-history{max-height:470px;overflow:auto}.page-heading{gap:16px;align-items:flex-start;flex-direction:column}.review-stats,.review-toolbar{padding:16px}.review-actions>div{width:100%;flex-wrap:wrap}.review-actions button{flex:1}.review-heading{padding:18px}.import-empty{padding:60px 23px}.review-stats{grid-template-columns:repeat(2,1fr)}}@media(max-width:500px){.import-sidebar{grid-template-columns:1fr}.import-upload{border-right:0;border-bottom:1px solid var(--line,#253546)}.import-history{max-height:270px}.import-steps{gap:12px;font-size:10px}}
    `}</style>
  </div>;
}
