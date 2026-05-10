import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  build: {
    outDir: 'dist-web/lib',
    emptyOutDir: false,
    minify: true,
    sourcemap: true,
    lib: {
      entry: path.resolve(__dirname, 'desktop/src/shared/theme.ts'),
      formats: ['iife'],
      name: 'HanaTheme',
      fileName: () => 'theme.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
