import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

// Same-origin route to the archive for `npm run dev` / `npm run preview`: the browser talks to this server, which
// forwards to the archive, so no CORS header is needed (src/lib/archiveFetch.ts tries this route first on localhost).
const archiveProxy = {
  '/__archive': {
    target: 'https://search.archives.nat.tn',
    changeOrigin: true,
    secure: true,
    rewrite: (p: string) => p.replace(/^\/__archive/, ''),
    headers: { Referer: 'https://search.archives.nat.tn/' },
  },
};

export default defineConfig({
  server: { proxy: archiveProxy },
  preview: { proxy: archiveProxy },
  // GitHub Pages serves the site from /<repo>/ ; the workflow sets VITE_BASE
  base: process.env.VITE_BASE || '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
