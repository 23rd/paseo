import * as ScreenOrientation from "expo-screen-orientation";
import { useEffect, useState } from "react";
import { Dimensions, Platform } from "react-native";
import { useLayoutWindowWidth } from "@/constants/window-width";
import { getAndroidPhysicalScreenSize } from "./screen-geometry";
import { resolveAndroidOrientationPolicy } from "./policy";

const isAndroid = Platform.OS === "android";

export function useAdaptiveOrientation(): boolean {
  const layoutWindowWidth = useLayoutWindowWidth();
  const [screen, setScreen] = useState(() =>
    isAndroid ? getAndroidPhysicalScreenSize() : Dimensions.get("screen"),
  );
  const policy = resolveAndroidOrientationPolicy(screen);
  const [ready, setReady] = useState(() => !isAndroid || policy === "system");

  useEffect(() => {
    if (!isAndroid) return;
    const updateScreen = () => {
      const nextScreen = getAndroidPhysicalScreenSize();
      setScreen((current) =>
        current.width === nextScreen.width && current.height === nextScreen.height
          ? current
          : nextScreen,
      );
    };
    updateScreen();
    const subscription = Dimensions.addEventListener("change", updateScreen);
    return () => subscription.remove();
  }, [layoutWindowWidth]);

  useEffect(() => {
    if (!isAndroid) return;

    let active = true;
    const request =
      policy === "portrait"
        ? ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP)
        : ScreenOrientation.unlockAsync();

    void request
      .catch((error) => {
        console.warn("[Orientation] Could not apply Android screen orientation:", error);
      })
      .finally(() => {
        if (active) setReady(true);
      });

    return () => {
      active = false;
    };
  }, [policy]);

  // An unrestricted native cold start can briefly report a landscape phone
  // window; wait for the portrait request before mounting layout content.
  return ready;
}
