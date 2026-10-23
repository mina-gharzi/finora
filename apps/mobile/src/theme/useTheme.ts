import { useColorScheme } from "react-native";

import {
  darkColors,
  lightColors,
  type ThemeColors,
} from "./tokens.ts";

export interface Theme {
  colors: ThemeColors;
  isDark: boolean;
}

export function useTheme(): Theme {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";

  return {
    colors: isDark ? darkColors : lightColors,
    isDark,
  };
}
