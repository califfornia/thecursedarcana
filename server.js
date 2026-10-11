import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.mp3': 'audio/mpeg',
  '.riv': 'application/octet-stream',
  '.wasm': 'application/wasm',
};
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const relatives = pathname === '/'
      ? ['index.html']
      : pathname.startsWith('/data/')
        ? [pathname.slice(1), pathname.slice('/data/'.length)]
        : [pathname.slice(1)];
    let content;
    let file;
    for (const relative of relatives) {
      const candidate = path.resolve(root, relative);
      if (!candidate.startsWith(`${root}${path.sep}`)) continue;
      try {
        content = await readFile(candidate);
        file = candidate;
        break;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    if (!file) throw new Error('Not found');
    response.writeHead(200, { 'content-type': `${types[path.extname(file)] ?? 'application/octet-stream'}; charset=utf-8` });
    response.end(content);
  } catch {
    response.writeHead(404); response.end('Not found');
  }
});

server.on('error', (error) => {
  console.error(`Unable to start the Tarot demo at http://127.0.0.1:5175/: ${error.message}`);
  process.exitCode = 1;
});

server.listen(5175, '127.0.0.1', () => {
  console.log('Tarot demo running at http://127.0.0.1:5175/');
});
