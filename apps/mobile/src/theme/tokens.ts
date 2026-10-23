export const brand = {
  burgundy: "#4B1426",
  burgundyHover: "#5E1B31",
  offWhite: "#F5F5F7",
  nearBlack: "#191919",
  champagneGold: "#B88A5A",
} as const;

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceMuted: string;
  surfaceRaised: string;
  border: string;
  borderStrong: string;
  foreground: string;
  mutedForeground: string;
  primary: string;
  primaryForeground: string;
  primarySubtle: string;
  accent: string;
  accentForeground: string;
  accentSubtle: string;
  accentBorder: string;
  success: string;
  successSubtle: string;
  danger: string;
  dangerSubtle: string;
  warning: string;
  warningSubtle: string;
  info: string;
  infoSubtle: string;
  disabled: string;
  disabledForeground: string;
  heroBackground: string;
  heroForeground: string;
  heroMuted: string;
  heroAccent: string;
  heroPositive: string;
  heroNegative: string;
}

export const lightColors: ThemeColors = {
  background: "#F5F5F7",
  surface: "#FFFFFF",
  surfaceMuted: "#ECECEF",
  surfaceRaised: "#FFFFFF",
  border: "#E4E4E9",
  borderStrong: "#8A8A94",
  foreground: "#191919",
  mutedForeground: "#5F5F6A",
  primary: "#4B1426",
  primaryForeground: "#FFFFFF",
  primarySubtle: "#F6EBEF",
  accent: "#B88A5A",
  accentForeground: "#191919",
  accentSubtle: "#FBF4EC",
  accentBorder: "#E5CEB2",
  success: "#15803D",
  successSubtle: "#F0FDF4",
  danger: "#C81E1E",
  dangerSubtle: "#FEF2F2",
  warning: "#B45309",
  warningSubtle: "#FFFBEB",
  info: "#0369A1",
  infoSubtle: "#F0F9FF",
  disabled: "#E8E8EC",
  disabledForeground: "#8C8C96",
  heroBackground: "#4B1426",
  heroForeground: "#FFFFFF",
  heroMuted: "#E7CDD6",
  heroAccent: "#D9B183",
  heroPositive: "#A7E8BC",
  heroNegative: "#F6B8C1",
};

export const darkColors: ThemeColors = {
  background: "#191919",
  surface: "#212121",
  surfaceMuted: "#2A2A2A",
  surfaceRaised: "#262626",
  border: "#333333",
  borderStrong: "#6E6E78",
  foreground: "#F5F5F7",
  mutedForeground: "#9A9AA6",
  primary: "#C98BA4",
  primaryForeground: "#191919",
  primarySubtle: "#34202A",
  accent: "#B88A5A",
  accentForeground: "#191919",
  accentSubtle: "#33281D",
  accentBorder: "#5C4832",
  success: "#4ADE80",
  successSubtle: "#052E16",
  danger: "#F87171",
  dangerSubtle: "#450A0A",
  warning: "#FBBF24",
  warningSubtle: "#451A03",
  info: "#38BDF8",
  infoSubtle: "#082F49",
  disabled: "#2A2A2A",
  disabledForeground: "#6E6E78",
  heroBackground: "#2A1219",
  heroForeground: "#F5F5F7",
  heroMuted: "#C9A6B2",
  heroAccent: "#D9B183",
  heroPositive: "#A7E8BC",
  heroNegative: "#F6B8C1",
};

export const fontFamily = {
  regular: "Pinar-Regular",
  medium: "Pinar-Medium",
  bold: "Pinar-Bold",
  extraBold: "Pinar-ExtraBold",
} as const;

export type FontWeightName = keyof typeof fontFamily;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;
