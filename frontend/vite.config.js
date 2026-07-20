import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: mode === 'vworld' ? 'index-vworld.html' : 'index.html',
    },
  },
}));
