export function normalizeText(value: string): string {
  return value
    .normalize('NFC')
    .replace(/[’ʼ`‘]/g, "'")
    .replace(/[“”«»„]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
