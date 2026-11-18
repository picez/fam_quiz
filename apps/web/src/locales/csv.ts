/** CSV за RFC 4180: UTF-8 з BOM, кома, CRLF, лапки навколо клітинок з комою, лапкою чи переносом. */

const BOM = '﻿';

function cell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(rows: string[][]): string {
  return BOM + rows.map((row) => `${row.map(cell).join(',')}\r\n`).join('');
}

/** Роздільник — той із `,` і `;`, якого більше в першому рядку поза лапками (нічия — кома). */
export function detectDelimiter(text: string): ',' | ';' {
  const source = text.startsWith(BOM) ? text.slice(1) : text;
  let commas = 0;
  let semicolons = 0;
  let quoted = false;
  for (const char of source) {
    if (char === '"') quoted = !quoted;
    else if (!quoted) {
      if (char === '\n' || char === '\r') break;
      if (char === ',') commas++;
      else if (char === ';') semicolons++;
    }
  }
  return semicolons > commas ? ';' : ',';
}

/**
 * Знімає BOM, приймає LF і CRLF, лапки й переноси в лапках. Порожні рядки пропускає,
 * а з `keepEmpty` лишає як `['']` (щоб номери рядків збігалися з файлом).
 */
export function parseCsv(text: string, options: { delimiter?: ',' | ';'; keepEmpty?: boolean } = {}): string[][] {
  const delimiter = options.delimiter ?? ',';
  const source = text.startsWith(BOM) ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const endRow = () => {
    row.push(field);
    field = '';
    if (options.keepEmpty || !(row.length === 1 && row[0] === '')) rows.push(row);
    row = [];
  };
  for (let index = 0; index < source.length; index++) {
    const char = source[index]!;
    if (quoted) {
      if (char !== '"') field += char;
      else if (source[index + 1] === '"') {
        field += '"';
        index++;
      } else quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n') endRow();
    else if (char === '\r') {
      if (source[index + 1] === '\n') index++;
      endRow();
    } else field += char;
  }
  if (field !== '' || row.length > 0) endRow();
  return rows;
}
