import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs/promises';
import path from 'node:path';
const localAssets = {
  name: 'local-skill-assets',
  configureServer(server) {
    server.middlewares.use(async (request, response, next) => {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      if (pathname === '/api/submissions') {
        response.writeHead(503, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: 'Use npm run preview for the local submission API.' })); return;
      }
      let file, type = 'application/json';
      if (pathname === '/catalog.json') file = 'registry/catalog.json';
      const match = pathname.match(/^\/(documents|bundles|manifests)\/([a-z0-9._-]+)\.(md|zip|json)$/);
      if (match) {
        const dir = match[1] === 'manifests' ? 'registry' : '.cache';
        file = `${dir}/${match[1]}/${match[2]}.${match[3]}`;
        type = match[3] === 'md' ? 'text/plain; charset=utf-8' : match[3] === 'zip' ? 'application/zip' : type;
      }
      if (!file) return next();
      try { const buffer = await fs.readFile(path.resolve(import.meta.dirname, file)); response.writeHead(200, { 'Content-Type': type }); response.end(buffer); }
      catch { response.writeHead(404); response.end('Run npm run hydrate to prepare the skill assets.'); }
    });
  },
};
export default defineConfig({
  plugins: [react(), localAssets],
  build: { outDir: 'dist', sourcemap: false },
});
