import { DarkTheme, DefaultTheme, type Theme as NavigationTheme } from '@react-navigation/native';
import { getPalette } from '@/lib/palette';
import type { Theme } from '@/lib/storage/mmkv';

/**
 * React Navigation theme built from the same palette the screens use, so the
 * navigator background revealed during screen transitions matches the app's.
 */
function buildNavTheme(theme: Theme): NavigationTheme {
  const palette = getPalette(theme);
  return {
    ...(palette.isDark ? DarkTheme : DefaultTheme),
    colors: {
      background: palette.background,
      card: palette.background,
      border: palette.border,
      text: palette.text,
      primary: palette.accent,
      notification: palette.destructive,
    },
  };
}

// Built once per theme so ThemeProvider gets a stable value across renders.
const NAV_THEMES: Record<Theme, NavigationTheme> = {
  dark: buildNavTheme('dark'),
  light: buildNavTheme('light'),
  oled: buildNavTheme('oled'),
};

export function getNavTheme(theme: Theme): NavigationTheme {
  return NAV_THEMES[theme] ?? NAV_THEMES.dark;
}
