import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  // `browser.storage.local` is only available when the permission is declared —
  // WXT only auto-adds it for its own `wxt/storage` wrapper, which we don't use.
  manifest: {
    permissions: ['storage'],
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
