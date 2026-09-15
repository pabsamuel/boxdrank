import { create } from 'zustand';
import type { Sensitivity } from '../config/scoring.config';
import { getSetting, setSetting } from '../storage/db';

export interface Settings {
  mirrored: boolean;
  sensitivity: Sensitivity;
  voice: boolean;
  haptics: boolean;
  ghostOpacity: number;
  reducedMode: boolean;
  colorBlind: boolean;
  reduceMotion: boolean;
  skipFraming: boolean;
  onboarded: boolean;
}

const DEFAULTS: Settings = {
  mirrored: true,
  sensitivity: 'normal',
  voice: true,
  haptics: true,
  ghostOpacity: 0.35,
  reducedMode: false,
  colorBlind: false,
  reduceMotion: false,
  skipFraming: false,
  onboarded: false,
};

interface SettingsStore extends Settings {
  loaded: boolean;
  load: () => Promise<void>;
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}

export const useSettings = create<SettingsStore>((set, get) => ({
  ...DEFAULTS,
  loaded: false,
  load: async () => {
    const stored = await getSetting<Partial<Settings>>('settings', {});
    set({ ...DEFAULTS, ...stored, loaded: true });
  },
  update: (key, value) => {
    set({ [key]: value } as Pick<SettingsStore, typeof key>);
    const { loaded: _loaded, load: _load, update: _update, ...rest } = get();
    void setSetting('settings', { ...rest, [key]: value });
  },
}));
