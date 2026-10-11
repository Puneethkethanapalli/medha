import { useSettingsStore } from '@/stores/settings-store';
import type { Theme } from '@/lib/storage/mmkv';

/**
 * Raw colors for the active theme, mirroring the CSS variables in global.css.
 * Use these where a className can't reach: icon colors, native props
 * (placeholderTextColor, ripple), and Reanimated styles.
 */
export interface Palette {
  isDark: boolean;
  /** App background (`bg-background`). */
  background: string;
  /** Cards, inputs, pills (`bg-surface-container-low`). */
  surface: string;
  /** Bottom sheets and floating menus. */
  sheet: string;
  /** Icon tiles and pressed rows (`bg-surface-container`). */
  surfaceRaised: string;
  /** Selected rows and inactive toggle tracks (`bg-surface-container-high`). */
  surfaceHigh: string;
  /** Hairline borders on cards and pills. */
  border: string;
  /** Primary text (`text-foreground`). */
  text: string;
  /** Secondary text (`text-on-surface-variant`). */
  textSecondary: string;
  /** Captions and placeholders (`text-muted-foreground`). */
  textMuted: string;
  /** Default icon color. */
  icon: string;
  /** De-emphasized icons (timestamps, inactive list rows). */
  iconMuted: string;
  /** Solid primary fill (send button, primary buttons). */
  accent: string;
  /** Content on top of `accent`. */
  onAccent: string;
  destructive: string;
  success: string;
  backdrop: string;
  handle: string;
  ripple: string;
}

const DARK: Palette = {
  isDark: true,
  background: 'hsl(240, 3.7%, 7.5%)',
  surface: 'hsl(240, 3.7%, 11%)',
  sheet: 'hsl(240, 3.7%, 10%)',
  surfaceRaised: 'hsl(240, 2.4%, 13%)',
  surfaceHigh: 'hsl(240, 0%, 17%)',
  border: 'hsla(0, 0%, 100%, 0.08)',
  text: 'hsl(0, 0%, 98%)',
  textSecondary: 'hsl(0, 0%, 78%)',
  textMuted: 'hsl(240, 4%, 62%)',
  icon: 'hsl(0, 0%, 66%)',
  iconMuted: 'hsl(0, 0%, 46%)',
  accent: 'hsl(0, 0%, 98%)',
  onAccent: 'hsl(240, 3.7%, 7.5%)',
  destructive: 'hsl(0, 84%, 64%)',
  success: 'hsl(142, 70%, 50%)',
  backdrop: 'rgba(0, 0, 0, 0.6)',
  handle: 'hsla(0, 0%, 100%, 0.18)',
  ripple: 'hsla(0, 0%, 100%, 0.08)',
};

const OLED: Palette = {
  ...DARK,
  background: 'hsl(0, 0%, 0%)',
  surface: 'hsl(0, 0%, 3%)',
  sheet: 'hsl(0, 0%, 6%)',
  surfaceRaised: 'hsl(0, 0%, 5%)',
  surfaceHigh: 'hsl(0, 0%, 8%)',
  border: 'hsla(0, 0%, 100%, 0.1)',
  text: 'hsl(0, 0%, 100%)',
  textSecondary: 'hsl(0, 0%, 75%)',
  textMuted: 'hsl(0, 0%, 60%)',
  accent: 'hsl(0, 0%, 100%)',
  onAccent: 'hsl(0, 0%, 0%)',
  backdrop: 'rgba(0, 0, 0, 0.7)',
};

const LIGHT: Palette = {
  isDark: false,
  background: 'hsl(0, 0%, 100%)',
  surface: 'hsl(240, 5%, 96.5%)',
  sheet: 'hsl(0, 0%, 100%)',
  surfaceRaised: 'hsl(240, 5%, 94%)',
  surfaceHigh: 'hsl(240, 5%, 90%)',
  border: 'hsla(240, 6%, 10%, 0.09)',
  text: 'hsl(240, 5%, 4%)',
  textSecondary: 'hsl(240, 4%, 32%)',
  textMuted: 'hsl(240, 4%, 46%)',
  icon: 'hsl(240, 4%, 40%)',
  iconMuted: 'hsl(240, 4%, 58%)',
  accent: 'hsl(240, 5%, 8%)',
  onAccent: 'hsl(0, 0%, 100%)',
  destructive: 'hsl(0, 72%, 51%)',
  success: 'hsl(142, 71%, 36%)',
  backdrop: 'rgba(9, 9, 11, 0.4)',
  handle: 'hsla(240, 6%, 10%, 0.16)',
  ripple: 'hsla(240, 6%, 10%, 0.06)',
};

const PALETTES: Record<Theme, Palette> = { dark: DARK, light: LIGHT, oled: OLED };

export function getPalette(theme: Theme): Palette {
  return PALETTES[theme] ?? DARK;
}

export function usePalette(): Palette {
  return getPalette(useSettingsStore((s) => s.theme));
}
