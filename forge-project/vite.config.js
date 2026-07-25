import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'src/renderer',
  // .env.example doesn't use the VITE_ prefix Vite requires by default —
  // explicitly allow-list instead of exposing all process env vars. Only
  // SUPABASE_ANON_KEY is meant to be client-visible; STEAM/RIOT/BATTLENET
  // keys are server-side secrets and must stay out of the renderer bundle —
  // platform API calls needing them go through main-process IPC instead
  // (see src/main/index.js's steam:fetchLibrary handler).
  envPrefix: ['SUPABASE_'],
  envDir: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
  },
});
