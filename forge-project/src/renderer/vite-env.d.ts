/// <reference types="vite/client" />

import type { SteamGame } from '../services/steam';

interface ImportMetaEnv {
  readonly SUPABASE_URL: string;
  readonly SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  interface Window {
    forge: {
      version: string;
      steam: {
        login: () => void;
        onCallback: (cb: (steamId64: string) => void) => void;
        fetchLibrary: (steamId64: string) => Promise<SteamGame[]>;
      };
    };
  }
}
