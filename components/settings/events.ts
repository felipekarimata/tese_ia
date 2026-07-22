export const AUTORIA_SETTINGS_UPDATED = 'autoria-settings-updated';

export function dispatchSettingsUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AUTORIA_SETTINGS_UPDATED));
  }
}
