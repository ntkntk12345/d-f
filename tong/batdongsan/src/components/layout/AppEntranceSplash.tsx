import { useEffect } from "react";

const LOADING_STAGE_MS = 1700;
const OPENING_STAGE_MS = 1100;

function prefersReducedMotion() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function AppEntranceSplash() {
  useEffect(() => {
    const splash = document.getElementById("boot-splash");
    if (!splash) {
      return;
    }

    const reduceMotion = prefersReducedMotion();
    const loadingDelay = reduceMotion ? 450 : LOADING_STAGE_MS;
    const openingDelay = reduceMotion ? 250 : OPENING_STAGE_MS;

    const loadingTimer = window.setTimeout(() => {
      splash.classList.add("boot-splash--opening");
    }, loadingDelay);

    const doneTimer = window.setTimeout(() => {
      splash.classList.add("boot-splash--done");
      document.documentElement.classList.remove("boot-splash-active");
      document.body.classList.remove("boot-splash-active");
      splash.remove();
    }, loadingDelay + openingDelay);

    return () => {
      window.clearTimeout(loadingTimer);
      window.clearTimeout(doneTimer);
      splash.remove();
      document.documentElement.classList.remove("boot-splash-active");
      document.body.classList.remove("boot-splash-active");
    };
  }, []);

  return null;
}
