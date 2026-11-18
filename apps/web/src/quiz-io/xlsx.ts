import { strToU8, unzipSync, zipSync, type Unzipped } from 'fflate';

export type XlsxCell = string | number | null;

export const XLSX_LIMITS = { maxPartBytes: 20 * 1024 * 1024, maxRow: 100_000 } as const;

const MAX_ENTRIES = 2000;
const MAX_COLUMN = 16_384;
const FALLBACK_SHEET = 'xl/worksheets/sheet1.xml';
const SHEET_NAME = 'Quiz';

// ---- writing ----

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';

/** Керівні символи, заборонені в XML 1.0, прибираються; решта екранується. */
function escapeXml(text: string): string {
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function columnName(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

export function writeXlsx(
  rows: XlsxCell[][],
  options: { boldFirstRow?: boolean; widths?: number[] } = {},
): Uint8Array {
  const cols = options.widths?.length
    ? `<cols>${options.widths
        .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
        .join('')}</cols>`
    : '';
  const body = rows
    .map((row, r) => {
      const style = options.boldFirstRow && r === 0 ? ' s="1"' : '';
      const cells = row
        .map((value, c) => {
          const ref = `${columnName(c)}${r + 1}`;
          if (typeof value === 'number') return Number.isFinite(value) ? `<c r="${ref}"${style}><v>${value}</v></c>` : '';
          if (value === null || value === '') return '';
          return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
        })
        .join('');
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join('');
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '</Types>',
    ),
    '_rels/.rels': strToU8(
      `${XML_HEAD}<Relationships xmlns="${NS_PKG_REL}">` +
        `<Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    'xl/workbook.xml': strToU8(
      `${XML_HEAD}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><sheets>` +
        `<sheet name="${SHEET_NAME}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `${XML_HEAD}<Relationships xmlns="${NS_PKG_REL}">` +
        `<Relationship Id="rId1" Type="${NS_REL}/worksheet" Target="worksheets/sheet1.xml"/>` +
        `<Relationship Id="rId2" Type="${NS_REL}/styles" Target="styles.xml"/></Relationships>`,
    ),
    'xl/styles.xml': strToU8(
      `${XML_HEAD}<styleSheet xmlns="${NS_MAIN}">` +
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
        '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
        '</styleSheet>',
    ),
    'xl/worksheets/sheet1.xml': strToU8(
      `${XML_HEAD}<worksheet xmlns="${NS_MAIN}">${cols}<sheetData>${body}</sheetData></worksheet>`,
    ),
  };
  return zipSync(files);
}

// ---- reading ----

type ReadError = 'io_not_table' | 'io_too_big' | 'io_too_many_rows';

class XlsxError extends Error {
  constructor(readonly code: ReadError) {
    super(code);
  }
}

/** Розпаковує лише названі частини; заявлений розмір понад ліміт — io_too_big, брехня про розмір — io_not_table. */
function unpack(bytes: Uint8Array, wanted: ReadonlySet<string>): Unzipped {
  let seen = 0;
  let tooBig = false;
  let lying = false;
  const declared = new Map<string, number>();
  let files: Unzipped;
  try {
    files = unzipSync(bytes, {
      filter: (file) => {
        seen += 1;
        if (seen > MAX_ENTRIES || !wanted.has(file.name)) return false;
        if (file.originalSize > XLSX_LIMITS.maxPartBytes || file.size > XLSX_LIMITS.maxPartBytes) {
          tooBig = true;
          return false;
        }
        if (file.compression === 0 && file.size !== file.originalSize) {
          lying = true;
          return false;
        }
        declared.set(file.name, file.originalSize);
        return true;
      },
    });
  } catch {
    throw new XlsxError('io_not_table');
  }
  if (tooBig) throw new XlsxError('io_too_big');
  if (lying) throw new XlsxError('io_not_table');
  for (const [name, size] of declared) if (files[name]?.length !== size) throw new XlsxError('io_not_table');
  return files;
}

function parseXml(bytes: Uint8Array): Document {
  const text = new TextDecoder().decode(bytes);
  // Entities are never defined or resolved: a DOCTYPE is refused outright.
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new XlsxError('io_not_table');
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(text, 'application/xml');
  } catch {
    throw new XlsxError('io_not_table');
  }
  if (doc.getElementsByTagName('parsererror').length > 0) throw new XlsxError('io_not_table');
  return doc;
}

function byLocalName(parent: Element | Document, name: string): Element[] {
  return Array.from(parent.getElementsByTagName('*')).filter((el) => el.localName === name);
}

function attributeByLocalName(el: Element, name: string): string | null {
  for (const attr of Array.from(el.attributes)) if (attr.localName === name) return attr.value;
  return null;
}

/** Сума всіх `<t>` усередині, окрім фонетичних підказок `<rPh>`. */
function joinedText(el: Element): string {
  let out = '';
  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      if (child.localName === 'rPh') continue;
      if (child.localName === 't') out += child.textContent ?? '';
      else walk(child);
    }
  };
  walk(el);
  return out;
}

/** Ціль зв'язку відносно `xl/`; лише всередині архіву, інакше null. */
function resolveTarget(target: string): string | null {
  const parts = target.startsWith('/') ? [] : ['xl'];
  for (const part of target.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (parts.length === 0) return null;
      parts.pop();
    } else parts.push(part);
  }
  return parts.length > 0 ? parts.join('/') : null;
}

function firstSheetPath(files: Unzipped): string {
  const workbook = files['xl/workbook.xml'];
  if (!workbook) throw new XlsxError('io_not_table');
  const sheetEl = byLocalName(parseXml(workbook), 'sheet')[0];
  const rid = sheetEl ? attributeByLocalName(sheetEl, 'id') : null;
  const relsBytes = files['xl/_rels/workbook.xml.rels'];
  if (rid && relsBytes) {
    const rel = byLocalName(parseXml(relsBytes), 'Relationship').find((el) => el.getAttribute('Id') === rid);
    const resolved = rel?.getAttribute('Target') ? resolveTarget(rel.getAttribute('Target')!) : null;
    if (resolved) return resolved;
  }
  return FALLBACK_SHEET;
}

function columnIndex(ref: string): number | null {
  const letters = /^([A-Za-z]+)/.exec(ref)?.[1];
  if (!letters) return null;
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function readXlsx(
  bytes: Uint8Array,
): { ok: true; rows: string[][] } | { ok: false; error: ReadError } {
  try {
    const head = unpack(bytes, new Set(['xl/workbook.xml', 'xl/_rels/workbook.xml.rels']));
    const sheetPath = firstSheetPath(head);
    const files = unpack(bytes, new Set([sheetPath, 'xl/sharedStrings.xml']));
    const sheetBytes = files[sheetPath];
    if (!sheetBytes) throw new XlsxError('io_not_table');
    const shared = files['xl/sharedStrings.xml']
      ? byLocalName(parseXml(files['xl/sharedStrings.xml']), 'si').map(joinedText)
      : [];
    const doc = parseXml(sheetBytes);
    const rows: string[][] = [];
    let nextRow = 1;
    for (const rowEl of byLocalName(doc, 'row')) {
      const declaredRow = Number(rowEl.getAttribute('r'));
      const rowNumber = Number.isInteger(declaredRow) && declaredRow >= 1 ? declaredRow : nextRow;
      if (rowNumber > XLSX_LIMITS.maxRow) throw new XlsxError('io_too_many_rows');
      nextRow = rowNumber + 1;
      const cells: string[] = [];
      let nextCol = 0;
      for (const cellEl of Array.from(rowEl.children)) {
        if (cellEl.localName !== 'c') continue;
        const ref = cellEl.getAttribute('r');
        const col = (ref ? columnIndex(ref) : null) ?? nextCol;
        nextCol = col + 1;
        if (col >= MAX_COLUMN) continue;
        const type = cellEl.getAttribute('t');
        const valueEl = Array.from(cellEl.children).find((el) => el.localName === 'v');
        const value = valueEl?.textContent ?? '';
        let text: string;
        if (type === 's') text = shared[Number(value)] ?? '';
        else if (type === 'inlineStr') {
          const is = Array.from(cellEl.children).find((el) => el.localName === 'is');
          text = is ? joinedText(is) : '';
        } else if (type === 'b') text = value.trim() === '1' ? 'true' : 'false';
        else text = value;
        while (cells.length < col) cells.push('');
        cells[col] = text;
      }
      while (rows.length < rowNumber - 1) rows.push([]);
      rows[rowNumber - 1] = cells;
    }
    return { ok: true, rows };
  } catch (error) {
    if (error instanceof XlsxError) return { ok: false, error: error.code };
    return { ok: false, error: 'io_not_table' };
  }
}
