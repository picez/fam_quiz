import { AwsClient } from 'aws4fetch';
import type { R2Settings } from './r2';

/** Об'єкт у кошику: ключ, розмір у байтах, час останньої зміни. */
export interface StoredObject {
  key: string;
  size: number;
  lastModified: Date;
}

/** Куди пишеться резервна копія порціями; close завершує запис, abort прибирає недописане. */
export interface BackupSink {
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
}

/** Мінімальна частина багаточастинного завантаження S3/R2: усі частини, крім останньої, однакові й не менші за 5 МіБ. */
export const MIN_PART_BYTES = 5 * 1024 * 1024;

export interface R2Objects {
  /** Усі об'єкти з ключем, що починається з prefix (сторінками по 1000). */
  list(prefix: string): Promise<StoredObject[]>;
  remove(key: string): Promise<void>;
  /** Потоковий запис: частини по partBytes, у пам'яті не більше однієї частини; малий об'єкт — одним PUT. */
  upload(key: string, contentType: string): BackupSink;
  /** Тіло об'єкта потоком або null, якщо такого немає. */
  download(key: string): Promise<ReadableStream<Uint8Array> | null>;
}

const decodeXml = (value: string) =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

const tag = (xml: string, name: string) => {
  const found = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml);
  return found === null ? null : decodeXml(found[1]!);
};

const encodeKey = (key: string) => key.split('/').map(encodeURIComponent).join('/');

/**
 * Довільні об'єкти кошика R2 через S3 API (резервні копії бази). Окремо від r2Storage: той пускає лише назви зображень і стікерів,
 * а цей — під ключі, які сервер ніколи не віддає через /uploads і /stickers.
 */
export function r2Objects(settings: R2Settings, partBytes = MIN_PART_BYTES): R2Objects {
  const client = new AwsClient({
    accessKeyId: settings.accessKeyId,
    secretAccessKey: settings.secretAccessKey,
    service: 's3',
    region: 'auto',
  });
  const send = settings.fetch ?? ((request: Request) => fetch(request));
  const bucketUrl = `https://${settings.accountId}.r2.cloudflarestorage.com/${settings.bucket}`;
  const urlOf = (key: string, query = '') => `${bucketUrl}/${encodeKey(key)}${query}`;

  async function call(url: string, init: RequestInit, what: string): Promise<Response> {
    const response = await send(await client.sign(url, init));
    if (!response.ok) throw new Error(`backup storage answered ${response.status} to ${what}`);
    return response;
  }

  return {
    async list(prefix) {
      const found: StoredObject[] = [];
      let token: string | null = null;
      do {
        const query = new URLSearchParams({ 'list-type': '2', prefix });
        if (token !== null) query.set('continuation-token', token);
        const xml = await (await call(`${bucketUrl}?${query}`, { method: 'GET' }, 'list')).text();
        for (const block of xml.match(/<Contents>[\s\S]*?<\/Contents>/g) ?? []) {
          const key = tag(block, 'Key');
          if (key === null) continue;
          found.push({ key, size: Number(tag(block, 'Size') ?? 0), lastModified: new Date(tag(block, 'LastModified') ?? 0) });
        }
        token = tag(xml, 'IsTruncated') === 'true' ? tag(xml, 'NextContinuationToken') : null;
      } while (token !== null);
      return found;
    },

    async remove(key) {
      await call(urlOf(key), { method: 'DELETE' }, 'delete');
    },

    async download(key) {
      const response = await send(await client.sign(urlOf(key), { method: 'GET' }));
      if (response.status === 404) return null;
      if (!response.ok || response.body === null) throw new Error(`backup storage answered ${response.status} to download`);
      return response.body;
    },

    upload(key, contentType) {
      let pending: Buffer[] = [];
      let pendingBytes = 0;
      let uploadId: string | null = null;
      const parts: { number: number; etag: string }[] = [];

      const take = (bytes: number) => {
        const all = Buffer.concat(pending);
        pending = all.length > bytes ? [all.subarray(bytes)] : [];
        pendingBytes = all.length - bytes;
        return all.subarray(0, bytes);
      };

      async function putPart(body: Buffer) {
        if (uploadId === null) {
          const xml = await (await call(urlOf(key, '?uploads'), { method: 'POST', headers: { 'content-type': contentType } }, 'multipart start')).text();
          uploadId = tag(xml, 'UploadId');
          if (uploadId === null) throw new Error('backup storage gave no UploadId');
        }
        const number = parts.length + 1;
        const query = `?partNumber=${number}&uploadId=${encodeURIComponent(uploadId)}`;
        const response = await call(urlOf(key, query), { method: 'PUT', body }, 'part upload');
        const etag = response.headers.get('etag');
        if (etag === null) throw new Error('backup storage gave no ETag for a part');
        parts.push({ number, etag });
      }

      return {
        async write(chunk) {
          pending.push(Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength));
          pendingBytes += chunk.byteLength;
          while (pendingBytes >= partBytes) await putPart(take(partBytes));
        },
        async close() {
          if (uploadId === null) {
            // Усе вмістилося в одну частину: звичайний PUT.
            await call(urlOf(key), { method: 'PUT', headers: { 'content-type': contentType }, body: take(pendingBytes) }, 'upload');
            return;
          }
          if (pendingBytes > 0) await putPart(take(pendingBytes));
          const body =
            '<CompleteMultipartUpload>' +
            parts.map((part) => `<Part><PartNumber>${part.number}</PartNumber><ETag>${part.etag}</ETag></Part>`).join('') +
            '</CompleteMultipartUpload>';
          const xml = await (
            await call(urlOf(key, `?uploadId=${encodeURIComponent(uploadId)}`), { method: 'POST', headers: { 'content-type': 'application/xml' }, body }, 'multipart complete')
          ).text();
          // S3 може відповісти 200 з помилкою в тілі.
          if (xml.includes('<Error>')) throw new Error(`backup storage failed to complete the upload: ${tag(xml, 'Code') ?? 'unknown'}`);
        },
        async abort() {
          pending = [];
          pendingBytes = 0;
          if (uploadId === null) return;
          await call(urlOf(key, `?uploadId=${encodeURIComponent(uploadId)}`), { method: 'DELETE' }, 'multipart abort');
        },
      };
    },
  };
}
