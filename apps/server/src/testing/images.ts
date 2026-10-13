const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (value: string) => [...value].map((char) => char.charCodeAt(0));

/** Найменші зразки, які мають правильну сигнатуру формату. */
export const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...ascii('JFIF'), 0x00, 0x01);
export const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, ...ascii('IHDR'));
export const WEBP = bytes(...ascii('RIFF'), 0x1a, 0x00, 0x00, 0x00, ...ascii('WEBPVP8 '));
