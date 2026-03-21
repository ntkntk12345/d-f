const ADSGRAM_SCRIPT_SRC = "https://sad.adsgram.ai/js/sad.min.js";
const ADSGRAM_REWARD_BLOCK_ID = "int-23213";
const ADSGRAM_SEQUENCE_BLOCK_IDS = ["int-23213", "int-23325", "int-23213"] as const;
const MONETAG_MAIN_ZONE_ID = 9917411;

type MonetagRewardedFn = {
  (): Promise<unknown>;
  (mode: "pop"): Promise<unknown>;
};

type AdsgramShowResult = {
  done?: boolean;
};

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

let monetagHandler: MonetagRewardedFn | null | undefined;
let monetagHandlerPromise: Promise<MonetagRewardedFn | null> | null = null;
let adsgramReadyPromise: Promise<boolean> | null = null;

async function getMonetagHandler() {
  if (monetagHandler !== undefined) {
    return monetagHandler;
  }

  if (monetagHandlerPromise) {
    return monetagHandlerPromise;
  }

  monetagHandlerPromise = import("monetag-tg-sdk")
    .then(({ default: createAdHandler }) => {
      try {
        monetagHandler = createAdHandler(MONETAG_MAIN_ZONE_ID) as MonetagRewardedFn;
        return monetagHandler;
      } catch (error) {
        console.error("Monetag SDK init error", error);
        monetagHandler = null;
        return null;
      }
    })
    .catch((error) => {
      console.error("Monetag SDK load error", error);
      monetagHandler = null;
      return null;
    })
    .finally(() => {
      monetagHandlerPromise = null;
    });

  return monetagHandlerPromise;
}

async function ensureAdsgramReady() {
  if (typeof window === "undefined") {
    return false;
  }

  if (window.Adsgram) {
    return true;
  }

  if (adsgramReadyPromise) {
    return adsgramReadyPromise;
  }

  adsgramReadyPromise = new Promise<boolean>((resolve) => {
    const handleLoad = () => resolve(Boolean(window.Adsgram));
    const handleError = () => {
      console.error("Adsgram script load error");
      adsgramReadyPromise = null;
      resolve(false);
    };

    const existingScript = document.querySelector<HTMLScriptElement>('script[data-adsgram-sdk="true"]');
    if (existingScript) {
      existingScript.addEventListener("load", handleLoad, { once: true });
      existingScript.addEventListener("error", handleError, { once: true });

      if (window.Adsgram) {
        resolve(true);
      }

      return;
    }

    const script = document.createElement("script");
    script.src = ADSGRAM_SCRIPT_SRC;
    script.async = true;
    script.dataset.adsgramSdk = "true";
    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });
    document.head.appendChild(script);
  });

  return adsgramReadyPromise;
}

async function showAdsgramRewarded(blockId = ADSGRAM_REWARD_BLOCK_ID) {
  const isReady = await ensureAdsgramReady();
  if (!isReady || !window.Adsgram) {
    return false;
  }

  try {
    const controller = window.Adsgram.init({ blockId });
    const result = (await controller.show()) as AdsgramShowResult;
    return Boolean(result?.done);
  } catch (error) {
    console.error(`Adsgram rewarded error (${blockId})`, error);
    return false;
  }
}

async function showAdsgramRewardedSequence() {
  const isReady = await ensureAdsgramReady();
  if (!isReady || !window.Adsgram) {
    return false;
  }

  try {
    for (const [index, blockId] of ADSGRAM_SEQUENCE_BLOCK_IDS.entries()) {
      const controller = window.Adsgram.init({ blockId });
      const result = (await controller.show()) as AdsgramShowResult;

      if (!result?.done) {
        return false;
      }

      if (index < ADSGRAM_SEQUENCE_BLOCK_IDS.length - 1) {
        await sleep(500);
      }
    }

    return true;
  } catch (error) {
    console.error("Adsgram sequence error", error);
    return false;
  }
}

async function showMonetagRewarded(mode?: "pop") {
  const showMonetag = await getMonetagHandler();
  if (!showMonetag) {
    return false;
  }

  try {
    if (mode === "pop") {
      await showMonetag("pop");
      return true;
    }

    await showMonetag();
    return true;
  } catch (error) {
    console.error("Monetag rewarded error", error);
    return false;
  }
}

async function showMonetagRewardedSequence(count: number) {
  for (let index = 0; index < count; index += 1) {
    const isLastAd = index === count - 1;
    const ok = await showMonetagRewarded(isLastAd ? "pop" : undefined);
    if (!ok) {
      return false;
    }

    if (!isLastAd) {
      await sleep(500);
    }
  }

  return true;
}

export async function showMiningRewardedAd() {
  if (await showAdsgramRewarded()) {
    return true;
  }

  return showMonetagRewarded();
}

export async function showReviveRewardedAd() {
  if (await showAdsgramRewarded()) {
    return true;
  }

  return showMonetagRewarded("pop");
}

export async function showTaskRewardedSequence() {
  if (await showAdsgramRewardedSequence()) {
    return true;
  }

  return showMonetagRewardedSequence(ADSGRAM_SEQUENCE_BLOCK_IDS.length);
}
