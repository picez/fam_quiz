/**
 * Підробний кошик R2 (S3 API) для тестів: list-type=2 зі сторінками, PUT, GET, DELETE і багаточастинне завантаження.
 * Перевіряє підпис лише на наявність: справжній R2 у тестах не викликається.
 */
export function fakeR2(options: { pageSize?: number; failOn?: (request: Request) => boolean } = {}) {
  const objects = new Map<string, { bytes: Uint8Array; lastModified: Date }>();
  const uploads = new Map<string, { key: string; parts: Map<number, Uint8Array> }>();
  const requests: { method: string; url: string }[] = [];
  let uploadCounter = 0;
  const pageSize = options.pageSize ?? 1000;

  async function fetch(request: Request): Promise<Response> {
    requests.push({ method: request.method, url: request.url });
    if (!request.headers.get('authorization')?.startsWith('AWS4-HMAC-SHA256')) return new Response('unsigned', { status: 403 });
    if (options.failOn?.(request) === true) return new Response('boom', { status: 500 });
    const url = new URL(request.url);
    const [, , ...rest] = url.pathname.split('/');
    const key = rest.map(decodeURIComponent).join('/');
    const query = url.searchParams;

    if (request.method === 'GET' && key === '' && query.get('list-type') === '2') {
      const prefix = query.get('prefix') ?? '';
      const keys = [...objects.keys()].filter((name) => name.startsWith(prefix)).sort();
      const from = Number(query.get('continuation-token') ?? 0);
      const page = keys.slice(from, from + pageSize);
      const more = from + pageSize < keys.length;
      const body =
        '<?xml version="1.0" encoding="UTF-8"?><ListBucketResult>' +
        page
          .map((name) => {
            const object = objects.get(name)!;
            return `<Contents><Key>${name.replace(/&/g, '&amp;')}</Key><LastModified>${object.lastModified.toISOString()}</LastModified><Size>${object.bytes.length}</Size></Contents>`;
          })
          .join('') +
        `<IsTruncated>${more}</IsTruncated>${more ? `<NextContinuationToken>${from + pageSize}</NextContinuationToken>` : ''}</ListBucketResult>`;
      return new Response(body, { status: 200 });
    }
    if (request.method === 'POST' && query.has('uploads')) {
      uploadCounter += 1;
      const id = `upload-${uploadCounter}`;
      uploads.set(id, { key, parts: new Map() });
      return new Response(`<InitiateMultipartUploadResult><UploadId>${id}</UploadId></InitiateMultipartUploadResult>`, { status: 200 });
    }
    const uploadId = query.get('uploadId');
    if (uploadId !== null) {
      const upload = uploads.get(uploadId);
      if (upload === undefined) return new Response('<Error><Code>NoSuchUpload</Code></Error>', { status: 404 });
      if (request.method === 'PUT') {
        const number = Number(query.get('partNumber'));
        upload.parts.set(number, new Uint8Array(await request.arrayBuffer()));
        return new Response(null, { status: 200, headers: { etag: `"etag-${number}"` } });
      }
      if (request.method === 'POST') {
        const xml = await request.text();
        const numbers = [...xml.matchAll(/<PartNumber>(\d+)<\/PartNumber>/g)].map((found) => Number(found[1]));
        const chunks = numbers.map((number) => upload.parts.get(number)!);
        const bytes = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
        let at = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, at);
          at += chunk.length;
        }
        objects.set(upload.key, { bytes, lastModified: new Date() });
        uploads.delete(uploadId);
        return new Response('<CompleteMultipartUploadResult></CompleteMultipartUploadResult>', { status: 200 });
      }
      if (request.method === 'DELETE') {
        uploads.delete(uploadId);
        return new Response(null, { status: 204 });
      }
    }
    if (request.method === 'PUT') {
      objects.set(key, { bytes: new Uint8Array(await request.arrayBuffer()), lastModified: new Date() });
      return new Response(null, { status: 200 });
    }
    if (request.method === 'GET') {
      const object = objects.get(key);
      return object === undefined ? new Response('<Error><Code>NoSuchKey</Code></Error>', { status: 404 }) : new Response(object.bytes, { status: 200 });
    }
    if (request.method === 'DELETE') {
      objects.delete(key);
      return new Response(null, { status: 204 });
    }
    return new Response('unsupported', { status: 400 });
  }

  return {
    fetch,
    objects,
    uploads,
    requests,
    settings: { accountId: 'acc123', bucket: 'quiz-images', accessKeyId: 'test-key', secretAccessKey: 'test-secret', fetch },
  };
}
