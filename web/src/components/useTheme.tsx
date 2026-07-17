"use client";

import {
  applyTheme,
  DEFAULT_MODE,
  DEFAULT_SEEDS,
  formatThemeShare,
  parseThemeShare,
  readStoredMode,
  readStoredSeeds,
  resolveMode,
  THEME_MODE_KEY,
  THEME_PRESETS,
  THEME_SEEDS_KEY,
  type ResolvedTheme,
  type ThemeMode,
  type ThemePreset,
  type ThemeSeeds,
} from "@/lib/theme";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type UseThemeResult = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  seeds: ThemeSeeds;
  setSeeds: (seeds: ThemeSeeds) => void;
  patchSeed: (key: keyof ThemeSeeds, hex: string) => void;
  shareString: string;
  setShareString: (raw: string) => boolean;
  applyPreset: (preset: ThemePreset) => void;
  resolvedMode: ResolvedTheme;
  presets: ThemePreset[];
};

const ThemeContext = createContext<UseThemeResult | null>(null);

/** Single app-wide theme state; syncs CSS vars on `<html>`. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return DEFAULT_MODE;
    return readStoredMode();
  });
  const [seeds, setSeedsState] = useState<ThemeSeeds>(() => {
    if (typeof window === "undefined") return DEFAULT_SEEDS;
    return readStoredSeeds();
  });
  const [prefersDark, setPrefersDark] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    setModeState(readStoredMode());
    setSeedsState(readStoredSeeds());
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setPrefersDark(mq.matches);
    const onChange = () => setPrefersDark(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    applyTheme(mode, seeds);
  }, [mode, seeds, prefersDark]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    window.localStorage.setItem(THEME_MODE_KEY, next);
  }, []);

  const setSeeds = useCallback((next: ThemeSeeds) => {
    setSeedsState(next);
    window.localStorage.setItem(THEME_SEEDS_KEY, formatThemeShare(next));
  }, []);

  const patchSeed = useCallback((key: keyof ThemeSeeds, hex: string) => {
    setSeedsState((prev) => {
      const next = { ...prev, [key]: hex };
      window.localStorage.setItem(THEME_SEEDS_KEY, formatThemeShare(next));
      return next;
    });
  }, []);

  const shareString = useMemo(() => formatThemeShare(seeds), [seeds]);

  const setShareString = useCallback((raw: string) => {
    const parsed = parseThemeShare(raw);
    if (!parsed) return false;
    setSeedsState(parsed);
    window.localStorage.setItem(THEME_SEEDS_KEY, formatThemeShare(parsed));
    return true;
  }, []);

  const applyPreset = useCallback((preset: ThemePreset) => {
    setSeedsState(preset.seeds);
    window.localStorage.setItem(THEME_SEEDS_KEY, formatThemeShare(preset.seeds));
  }, []);

  const resolvedMode = resolveMode(mode, prefersDark);

  const value = useMemo(
    () => ({
      mode,
      setMode,
      seeds,
      setSeeds,
      patchSeed,
      shareString,
      setShareString,
      applyPreset,
      resolvedMode,
      presets: THEME_PRESETS,
    }),
    [
      mode,
      setMode,
      seeds,
      setSeeds,
      patchSeed,
      shareString,
      setShareString,
      applyPreset,
      resolvedMode,
    ],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): UseThemeResult {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
