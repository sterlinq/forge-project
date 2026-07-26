/// <reference types="vite/client" />

import type { SteamGame } from '../services/steam';
import type { BattlenetCharacterSummary, BattlenetEarnedAchievement } from '../services/battlenet';

interface ImportMetaEnv {
  readonly SUPABASE_URL: string;
  readonly SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface BattlenetCompleteAuthResult {
  battletag: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string;
  region: string;
}

interface BattlenetProfileResult {
  characters: BattlenetCharacterSummary[];
  achievementsByCharacter: Record<string, BattlenetEarnedAchievement[]>;
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
      battlenet: {
        startAuth: () => void;
        onCallback: (cb: (code: string) => void) => void;
        onError: (cb: (reason: string) => void) => void;
        completeAuth: (code: string) => Promise<BattlenetCompleteAuthResult>;
        fetchProfile: (accessToken: string, region: string) => Promise<BattlenetProfileResult>;
      };
    };
  }
}
