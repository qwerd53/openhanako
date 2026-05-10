import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

/**
 * Web CSP profiles — adapted from vite.config.ts for standalone web deployment.
 * Key differences from Electron:
 * - No `file:` protocol (web can't use it)
 * - connect-src uses wss:// and the actual server host (not hardcoded 127.0.0.1)
 * - img-src allows http/https origins (not file:)
 */
const CSP_PROFILES = {
  'web.html':
    "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self' data:; frame-src blob: data:",
};

function injectCsp() {
  return {
    name: 'hana-web-inject-csp',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        const filename = path.basename(ctx.filename);
        const profile = CSP_PROFILES[filename];
        if (!profile) return html;

        let csp = profile;
        if (process.env.NODE_ENV !== 'production') {
          csp = csp.replace(
            /script-src 'self'/,
            "script-src 'self' 'unsafe-inline'",
          );
          if (csp.includes('connect-src')) {
            csp = csp.replace(
              /connect-src 'self'/,
              "connect-src 'self' ws://localhost:5173",
            );
          }
        }

        return html.replace(
          /<meta\s+http-equiv="Content-Security-Policy"\s+content="[^"]*"\s*\/?>/,
          `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
        );
      },
    },
  };
}

/**
 * Copy legacy files needed at runtime (themes, locales, lib, styles, animations, assets).
 * Mirrors the copyLegacyFiles plugin from vite.config.ts.
 */
function copyLegacyFiles() {
  return {
    name: 'hana-web-copy-legacy-files',
    closeBundle() {
      const srcDir = path.resolve('desktop/src');
      const outDir = path.resolve('dist-web');

      const dirs = ['lib', 'modules', 'themes', 'assets', 'locales'];
      const files = ['styles.css', 'animations.css'];

      for (const dir of dirs) {
        const src = path.join(srcDir, dir);
        const dest = path.join(outDir, dir);
        if (fs.existsSync(src)) {
          fs.cpSync(src, dest, { recursive: true });
        }
      }

      for (const file of files) {
        const src = path.join(srcDir, file);
        const dest = path.join(outDir, file);
        if (fs.existsSync(src)) {
          fs.cpSync(src, dest);
        }
      }
    },
  };
}

export default defineConfig({
  root: 'desktop/src',
  base: '/',
  plugins: [
    react(),
    injectCsp(),
    copyLegacyFiles(),
  ],
  resolve: {
    alias: {
      '@hana/plugin-protocol': path.resolve('packages/plugin-protocol/src/index.ts'),
      '@hana/plugin-sdk': path.resolve('packages/plugin-sdk/src/index.ts'),
      '@hana/plugin-runtime': path.resolve('packages/plugin-runtime/src/index.ts'),
      '@hana/plugin-components': path.resolve('packages/plugin-components/src/index.ts'),
      '@': path.resolve('desktop/src/react'),
    },
  },
  css: {
    modules: {
      generateScopedName(name, filename) {
        if (name.startsWith('hana-')) return name;
        const hash = crypto.createHash('md5').update(filename + '|' + name).digest('hex').slice(0, 5);
        return `_${name}_${hash}`;
      },
    },
  },
  build: {
    outDir: '../../dist-web',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: path.resolve('desktop/src/web.html'),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
