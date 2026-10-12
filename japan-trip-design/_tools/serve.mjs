import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
const ROOT = 'C:/Users/Soul/Desktop/AI/Claude/japan-trip';
const T = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json',
  '.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.mp4':'video/mp4','.webm':'video/webm'};
createServer(async (q, r) => {
  try {
    const p = decodeURIComponent(q.url.split('?')[0]);
    // content-type 은 요청 경로가 아니라 실제로 읽는 파일의 확장자로 정한다.
    // '/' 를 octet-stream 으로 보내면 브라우저가 페이지 대신 다운로드 창을 띄운다.
    const file = p === '/' ? '/index.html' : p;
    const b = await readFile(join(ROOT, file));
    r.writeHead(200, {'content-type': T[extname(file).toLowerCase()] || 'application/octet-stream', 'accept-ranges': 'bytes'}); r.end(b);
  } catch { r.writeHead(404); r.end(); }
}).listen(8765, () => console.log('serving 8765'));
