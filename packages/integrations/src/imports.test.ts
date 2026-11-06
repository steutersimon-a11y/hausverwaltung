import { describe, expect, it } from 'vitest';
import { emptyImportProperty, hasSpreadsheetFormula, ImportParseError, parseCsv, parsePropertyImport, propertyAddressFingerprint, validateImportProperty } from './imports';

const bytes = (value: string) => new TextEncoder().encode(value);
describe('bounded property import parser', () => {
  it('reads semicolon CSV with German headers and preserves missing counts', () => {
    const [row] = parsePropertyImport(bytes('Objekt-ID;Bezeichnung;Straße;Hausnummer;PLZ;Ort;WE;GA/ST\nDEMO-1;Fiktives Haus;Demoweg;3;00000;Demostadt;0;?'), 'csv', 'source');
    expect(row?.data).toMatchObject({ code: 'DEMO-1', street: 'Demoweg', reportedResidentialCount: 0, reportedParkingCount: null });
    expect(row?.issues.some(issue => issue.code === 'unknown_count')).toBe(true);
  });
  it('reads UTF-8 BOM and quoted separators/newlines', () => {
    expect(parseCsv('\uFEFFname,note\r\n"Demo, Haus","Zeile 1\nZeile 2"')).toEqual([['name', 'note'], ['Demo, Haus', 'Zeile 1\nZeile 2']]);
  });
  it('rejects malformed CSV and duplicate headers', () => {
    expect(() => parseCsv('name;note\n"offen;unvollständig')).toThrow(ImportParseError);
    expect(() => parsePropertyImport(bytes('name;name\nA;B'), 'csv', 's')).toThrow(/eindeutig/);
    expect(() => parsePropertyImport(bytes('code;Objekt-ID\nA;B'), 'csv', 's')).toThrow(/demselben Zielfeld/);
  });
  it('marks spreadsheet formulas for review rather than executing them', () => {
    for (const value of ['=1+1', ' @SUM(A1)', '+cmd', '-1']) expect(hasSpreadsheetFormula(value)).toBe(true);
    const [row] = parsePropertyImport(bytes('code;name\nDEMO-1;"=WEBSERVICE(""https://example.invalid"")"'), 'csv', 's');
    expect(row?.issues.some(issue => issue.code === 'formula')).toBe(true);
  });
  it('does not invent postal codes, coordinates or party data', () => {
    const [row] = parsePropertyImport(bytes('[{"name":"Fiktives Objekt"}]'), 'json', 'checksum');
    expect(row?.data).toMatchObject({ sourceRecordId: 'checksum:line:1', postalCode: null, city: null, reportedUnitCount: null });
    expect(row?.data).not.toHaveProperty('latitude');
    expect(row?.issues.some(issue => issue.code === 'address_incomplete')).toBe(true);
    expect(row?.data.managementType).toBeNull();
    expect(row?.issues.some(issue => issue.code === 'management_type_missing')).toBe(true);
  });
  it('keeps stable IDs for repeated imports of the same source', () => {
    const file = bytes('name;street\nDemohaus;Fiktivstraße');
    expect(parsePropertyImport(file, 'csv', 'sha256')[0]?.data.sourceRecordId).toEqual(parsePropertyImport(file, 'csv', 'sha256')[0]?.data.sourceRecordId);
  });
  it('marks repeated source identities', () => {
    const result = parsePropertyImport(bytes('[{"sourceRecordId":"A","name":"Demo 1"},{"sourceRecordId":"A","name":"Demo 2"}]'), 'json', 's');
    expect(result[1]?.issues.some(issue => issue.code === 'duplicate_source_id')).toBe(true);
  });
  it('rejects nested JSON, excessive columns and excessive rows', () => {
    expect(() => parsePropertyImport(bytes('[{"name":{"nested":true}}]'), 'json', 's')).toThrow(/nur Text/);
    expect(() => parsePropertyImport(bytes(JSON.stringify(Array.from({ length: 501 }, (_, index) => ({ name: `Demo ${index}` })))), 'json', 's')).toThrow(/500/);
    expect(() => parsePropertyImport(bytes(JSON.stringify([Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`field${i}`, 'x']))])), 'json', 's')).toThrow(/30/);
  });
  it('rejects non-UTF8 and over-size files', () => {
    expect(() => parsePropertyImport(new Uint8Array([0xff, 0xfe]), 'csv', 's')).toThrow(/UTF-8/);
    expect(() => parsePropertyImport(new Uint8Array(5 * 1024 * 1024 + 1), 'csv', 's')).toThrow(/5 MB/);
    expect(() => parsePropertyImport(bytes('[{"name":"\\u0000"}]'), 'json', 's')).toThrow(/Unicode/);
    expect(() => parsePropertyImport(bytes('[{"name":"\\ud800"}]'), 'json', 's')).toThrow(/Unicode/);
  });
  it('normalizes address fingerprints only for complete explicit addresses', () => {
    const data = { ...emptyImportProperty('A'), street: 'Demo-Straße', houseNumber: '1', postalCode: '00000', city: 'Demostadt' };
    expect(propertyAddressFingerprint(data)).toEqual(propertyAddressFingerprint({ ...data, street: 'Demo Straße' }));
    expect(propertyAddressFingerprint({ ...data, houseNumber: null })).toBeNull();
  });
  it('validates review edits and keeps null distinct from zero', () => {
    const data = { ...emptyImportProperty('A'), name: 'Demo', postalCode: '1234', reportedUnitCount: 0 };
    expect(validateImportProperty(data).some(issue => issue.field === 'postalCode' && issue.severity === 'error')).toBe(true);
    expect(data.reportedUnitCount).toBe(0);
    expect(data.reportedParkingCount).toBeNull();
  });
});
