import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
const ROOT = 'C:/Users/Soul/Desktop/AI/Claude/japan-trip';
const T = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.jpg':'image/jpeg','.ico':'image/x-icon','.json':'application/json'};
createServer(async (q, r) => {
  try {
    const p = decodeURIComponent(q.url.split('?')[0]);
    const b = await readFile(join(ROOT, p === '/' ? '/japan-trip-planner.html' : p));
    r.writeHead(200, {'content-type': T[extname(p)] || 'application/octet-stream'}); r.end(b);
  } catch { r.writeHead(404); r.end(); }
}).listen(8765, () => console.log('serving 8765'));
