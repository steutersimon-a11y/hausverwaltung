import { readFile, writeFile, mkdir, readdir, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, relative, extname } from 'node:path';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hosted = join(root, 'apps/hosted');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json; charset=utf-8', '.glb': 'model/gltf-binary', '.csv': 'text/csv; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2' };
const assets = {};
async function addDirectory(directory, prefix = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await addDirectory(path, `${prefix}/${entry.name}`);
    else if (entry.isFile()) {
      const bytes = await readFile(path);
      assets[`${prefix}/${entry.name}`] = { type: types[extname(entry.name)] ?? 'application/octet-stream', body: bytes.toString('base64') };
    }
  }
}
await addDirectory(join(hosted, 'dist/client'));
// The private Site retains its earlier browser-only pilot. It is never copied to the public repository.
if (existsSync(join(root, 'legacy'))) {
  await addDirectory(join(root, 'legacy'), '/pilot');
  assets['/pilot/'] = assets['/pilot/index.html'];
}
await writeFile(join(hosted, 'generated-assets.ts'), `export const assets: Record<string,{type:string;body:string}> = ${JSON.stringify(assets)};\n`);
await mkdir(join(hosted, 'dist/server'), { recursive: true });
await build({ entryPoints: [join(hosted, 'worker.ts')], outfile: join(hosted, 'dist/server/index.js'), bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true, sourcemap: false, logLevel: 'warning' });
const manifestPath = existsSync(join(root, '.openai/hosting.json')) ? join(root, '.openai/hosting.json') : join(hosted, '.openai/hosting.json');
await mkdir(join(hosted, 'dist/.openai'), { recursive: true });
await cp(manifestPath, join(hosted, 'dist/.openai/hosting.json'));
await cp(join(hosted, 'drizzle'), join(hosted, 'dist/drizzle'), { recursive: true });
console.info(JSON.stringify({ worker: relative(root, join(hosted, 'dist/server/index.js')), bytes: (await readFile(join(hosted, 'dist/server/index.js'))).byteLength, staticAssets: Object.keys(assets).length, source: 'same-checkout' }));
