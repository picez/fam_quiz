// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { readXlsx, writeXlsx, XLSX_LIMITS } from './xlsx';

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

function book(files: Record<string, string>): Uint8Array {
  const out: Record<string, Uint8Array> = {};
  for (const [name, text] of Object.entries(files)) out[name] = strToU8(text);
  return zipSync(out);
}

const WORKBOOK = `<?xml version="1.0"?><workbook xmlns="${NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>`;
const rels = (target: string) =>
  `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x/worksheet" Target="${target}"/></Relationships>`;
const sheet = (rows: string) => `<?xml version="1.0"?><worksheet xmlns="${NS}"><sheetData>${rows}</sheetData></worksheet>`;

describe('xlsx', () => {
  it('write then read gives the same cells', () => {
    const bytes = writeXlsx([
      ['Раунд', 'Тип'],
      ['Природа', 'число', 8, null, 'a & <b> "c"'],
    ]);
    const result = readXlsx(bytes);
    expect(result).toEqual({
      ok: true,
      rows: [
        ['Раунд', 'Тип'],
        ['Природа', 'число', '8', '', 'a & <b> "c"'],
      ],
    });
  });

  it('written parts are a valid workbook', () => {
    const files = unzipSync(writeXlsx([['a', 'b'], ['c', 1]], { boldFirstRow: true, widths: [10, 20] }));
    for (const name of ['[Content_Types].xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/styles.xml']) {
      expect(files[name], name).toBeDefined();
    }
    for (const [name, data] of Object.entries(files)) {
      const doc = new DOMParser().parseFromString(new TextDecoder().decode(data), 'application/xml');
      expect(doc.getElementsByTagName('parsererror').length, name).toBe(0);
    }
    const xml = new TextDecoder().decode(files['xl/worksheets/sheet1.xml']);
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const first = doc.getElementsByTagName('row')[0]!;
    expect(first.getElementsByTagName('c')[0]!.getAttribute('s')).toBe('1');
    const second = doc.getElementsByTagName('row')[1]!;
    expect(second.getElementsByTagName('c')[0]!.getAttribute('s')).not.toBe('1');
  });

  it('control characters are dropped', () => {
    expect(readXlsx(writeXlsx([['a\u0001b']]))).toEqual({ ok: true, rows: [['ab']] });
  });

  it('reads shared strings with rich runs', () => {
    const bytes = book({
      'xl/workbook.xml': WORKBOOK,
      'xl/_rels/workbook.xml.rels': rels('worksheets/sheet1.xml'),
      'xl/sharedStrings.xml': `<?xml version="1.0"?><sst xmlns="${NS}"><si><r><t>Мер</t></r><r><t>курій</t></r><rPh><t>x</t></rPh></si></sst>`,
      'xl/worksheets/sheet1.xml': sheet('<row r="1"><c r="A1" t="s"><v>0</v></c></row>'),
    });
    expect(readXlsx(bytes)).toEqual({ ok: true, rows: [['Меркурій']] });
  });

  it('reads numbers, booleans, formulas and gaps like Google Sheets', () => {
    const bytes = book({
      'xl/workbook.xml': WORKBOOK,
      'xl/_rels/workbook.xml.rels': rels('worksheets/sheet1.xml'),
      'xl/worksheets/sheet1.xml': sheet(
        '<row r="1"><c r="B1" t="b"><v>1</v></c><c r="C1"><f>1+1</f><v>42</v></c></row>' +
          '<row r="2"><c t="str"><v>x</v></c><c><v>0.5</v></c></row>' +
          '<row r="4"><c r="A4" t="inlineStr"><is><t>z</t></is></c></row>',
      ),
    });
    expect(readXlsx(bytes)).toEqual({
      ok: true,
      rows: [['', 'true', '42'], ['x', '0.5'], [], ['z']],
    });
  });

  it('follows the workbook relation to the first sheet', () => {
    const data = sheet('<row r="1"><c r="A1" t="inlineStr"><is><t>ok</t></is></c></row>');
    const viaRel = book({
      'xl/workbook.xml': WORKBOOK,
      'xl/_rels/workbook.xml.rels': rels('worksheets/data.xml'),
      'xl/worksheets/data.xml': data,
    });
    expect(readXlsx(viaRel)).toEqual({ ok: true, rows: [['ok']] });
    const outside = book({
      'xl/workbook.xml': WORKBOOK,
      'xl/_rels/workbook.xml.rels': rels('../../x.xml'),
      'xl/worksheets/sheet1.xml': data,
    });
    expect(readXlsx(outside)).toEqual({ ok: true, rows: [['ok']] });
    const none = book({
      'xl/workbook.xml': WORKBOOK,
      'xl/_rels/workbook.xml.rels': rels('../../x.xml'),
    });
    expect(readXlsx(none)).toEqual({ ok: false, error: 'io_not_table' });
  });

  it('refuses what is not a table', () => {
    expect(readXlsx(new Uint8Array([1, 2, 3, 4, 5]))).toEqual({ ok: false, error: 'io_not_table' });
    expect(readXlsx(book({ 'readme.txt': 'hi' }))).toEqual({ ok: false, error: 'io_not_table' });
    const broken = book({
      'xl/workbook.xml': WORKBOOK,
      'xl/_rels/workbook.xml.rels': rels('worksheets/sheet1.xml'),
      'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row></sheetData>',
    });
    expect(readXlsx(broken)).toEqual({ ok: false, error: 'io_not_table' });
    const big = book({
      'xl/workbook.xml': WORKBOOK,
      'xl/_rels/workbook.xml.rels': rels('worksheets/sheet1.xml'),
      'xl/worksheets/sheet1.xml': sheet(' '.repeat(XLSX_LIMITS.maxPartBytes + 1)),
    });
    expect(readXlsx(big)).toEqual({ ok: false, error: 'io_too_big' });
    const tall = book({
      'xl/workbook.xml': WORKBOOK,
      'xl/_rels/workbook.xml.rels': rels('worksheets/sheet1.xml'),
      'xl/worksheets/sheet1.xml': sheet('<row r="200000"><c r="A200000"><v>1</v></c></row>'),
    });
    expect(readXlsx(tall)).toEqual({ ok: false, error: 'io_too_many_rows' });
  });

  it('refuses entity declarations and ignores unknown parts', () => {
    const evil = book({
      'xl/workbook.xml': WORKBOOK,
      'xl/_rels/workbook.xml.rels': rels('worksheets/sheet1.xml'),
      'xl/worksheets/sheet1.xml': `<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "b">]>${sheet('<row r="1"><c r="A1"><v>&a;</v></c></row>')}`,
    });
    expect(readXlsx(evil)).toEqual({ ok: false, error: 'io_not_table' });
    const extra = unzipSync(writeXlsx([['a']]));
    const bytes = zipSync({ ...extra, '../../evil.txt': strToU8('x'), 'xl/media/x.bin': strToU8('y') });
    expect(readXlsx(bytes)).toEqual({ ok: true, rows: [['a']] });
  });
});
