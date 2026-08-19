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
        futtrool: resolve(import.meta.dirname, 'futtrool.html'),
        login: resolve(import.meta.dirname, 'login.html'),
        signup: resolve(import.meta.dirname, 'signup.html'),
        forgotPassword: resolve(import.meta.dirname, 'forgot-password.html'),
        resetPassword: resolve(import.meta.dirname, 'reset-password.html'),
        admin: resolve(import.meta.dirname, 'admin.html'),
      },
    },
  },
});
