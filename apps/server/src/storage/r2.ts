import { AwsClient } from 'aws4fetch';
import { isMediaName, type ImageStorage } from './images';

export interface R2Settings {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Підміняється в тестах. */
  fetch?: (request: Request) => Promise<Response>;
}

/** Сховище в Cloudflare R2 через S3 API. Потрібне там, де диск сервера не зберігається між запусками. */
export function r2Storage(settings: R2Settings): ImageStorage {
  const client = new AwsClient({
    accessKeyId: settings.accessKeyId,
    secretAccessKey: settings.secretAccessKey,
    service: 's3',
    region: 'auto',
  });
  const send = settings.fetch ?? ((request: Request) => fetch(request));
  const urlOf = (name: string) =>
    `https://${settings.accountId}.r2.cloudflarestorage.com/${settings.bucket}/${name}`;

  return {
    async put(name, bytes, contentType) {
      if (!isMediaName(name)) throw new Error('invalid media name');
      const request = await client.sign(urlOf(name), {
        method: 'PUT',
        headers: { 'content-type': contentType },
        body: Buffer.from(bytes),
      });
      const response = await send(request);
      if (!response.ok) throw new Error(`image storage answered ${response.status}`);
    },
    async get(name) {
      if (!isMediaName(name)) return null;
      const response = await send(await client.sign(urlOf(name), { method: 'GET' }));
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`image storage answered ${response.status}`);
      return { bytes: new Uint8Array(await response.arrayBuffer()) };
    },
  };
}
