import { StyleSheet } from "react-native-unistyles";
import { BREAKPOINTS } from "./breakpoints";
import { REGISTERED_THEMES } from "./theme";

StyleSheet.configure({
  themes: REGISTERED_THEMES,
  breakpoints: BREAKPOINTS,
  settings: {
    adaptiveThemes: true,
  },
});

// Type augmentation for TypeScript
type AppThemes = typeof REGISTERED_THEMES;

interface AppBreakpoints {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
}

declare module "react-native-unistyles" {
  export interface UnistylesThemes extends AppThemes {}
  export interface UnistylesBreakpoints extends AppBreakpoints {}
}
