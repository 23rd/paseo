import { createContext, type ReactNode, useContext } from "react";
import { useWindowDimensions } from "react-native";

const MeasuredWindowWidthContext = createContext<number | null>(null);

export function resolveLayoutWindowWidth(measuredWidth: number | null, dimensionsWidth: number) {
  return measuredWidth !== null && measuredWidth > 0 ? measuredWidth : dimensionsWidth;
}

export function MeasuredWindowWidthProvider({
  width,
  children,
}: {
  width: number | null;
  children: ReactNode;
}) {
  return (
    <MeasuredWindowWidthContext.Provider value={width}>
      {children}
    </MeasuredWindowWidthContext.Provider>
  );
}

/** The root view's actual width survives fold changes that skip RN Dimensions updates. */
export function useLayoutWindowWidth(): number {
  const measuredWidth = useContext(MeasuredWindowWidthContext);
  const { width: dimensionsWidth } = useWindowDimensions();
  return resolveLayoutWindowWidth(measuredWidth, dimensionsWidth);
}
