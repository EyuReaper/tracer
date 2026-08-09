import type { Settings } from "../types";
import { DEFAULT_SETTINGS } from "../types";

const SETTINGS_KEY = "tracer_settings";

/**
 * Settings are stored as a single plain object under one key. Reads spread over
 * `DEFAULT_SETTINGS` so a fresh install (nothing stored) and an older install
 * (stored object missing a newly added field) both come back fully populated.
 */
export async function getSettings(): Promise<Settings> {
  const data = await browser.storage.local.get(SETTINGS_KEY);
  const stored = data[SETTINGS_KEY] as Partial<Settings> | undefined;
  return { ...DEFAULT_SETTINGS, ...stored };
}

/** Merges a partial update over the current settings. */
export async function setSettings(update: Partial<Settings>): Promise<void> {
  const current = await getSettings();
  await browser.storage.local.set({
    [SETTINGS_KEY]: { ...current, ...update },
  });
}
