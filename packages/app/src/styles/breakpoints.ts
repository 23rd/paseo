export const BREAKPOINTS = {
  xs: 0,
  sm: 576,
  md: 720,
  lg: 992,
  xl: 1200,
} as const;

export function isCompactWindowWidth(width: number): boolean {
  return width < BREAKPOINTS.md;
}
