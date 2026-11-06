import { assets } from './generated-assets';
import { createWorker } from './workerlogic';

export default createWorker(path => {
  const asset = assets[path];
  if (!asset) return null;
  const bytes = Uint8Array.from(atob(asset.body), character => character.charCodeAt(0));
  return new Response(bytes, { headers: { 'Content-Type': asset.type, 'Cache-Control': path.startsWith('/assets/') ? 'private, max-age=31536000, immutable' : 'private, no-store' } });
});
