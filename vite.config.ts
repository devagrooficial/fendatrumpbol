import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Site multi-página: hub (raiz) + um HTML por jogo. Sem isso, `vite build`
// só emitiria a página raiz.
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        hub: resolve(import.meta.dirname, 'index.html'),
        trumpbol: resolve(import.meta.dirname, 'trumpbol.html'),
        flysim: resolve(import.meta.dirname, 'flysim.html'),
      },
    },
  },
});
