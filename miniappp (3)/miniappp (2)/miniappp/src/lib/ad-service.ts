const ADSGRAM_REWARD_BLOCK_ID = "int-23213";
const ADSGRAM_SEQUENCE_BLOCK_IDS = ["int-23213", "int-23325", "int-23213"] as const;

type FlyInterstitialOptions = {
  type: "inApp";
  inAppSettings: {
    frequency: number;
    capping: number;
    interval: number;
    timeout: number;
    everyPage: boolean;
  };
};

type FlyRewardedFn = {
  (): Promise<unknown>;
  (mode: "pop"): Promise<unknown>;
  (config: FlyInterstitialOptions): Promise<unknown> | void;
};

type AdsgramShowResult = {
  done?: boolean;
};

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getFlyRewarded() {
  const candidate = (window as Window & { show_9917411?: FlyRewardedFn }).show_9917411;
  return typeof candidate === "function" ? candidate : null;
}

async function showAdsgramRewarded(blockId = ADSGRAM_REWARD_BLOCK_ID) {
  if (!window.Adsgram) return false;

  try {
    const controller = window.Adsgram.init({ blockId });
    const result = (await controller.show()) as AdsgramShowResult;
    return Boolean(result?.done);
  } catch (error) {
    console.error(`Adsgram rewarded error (${blockId})`, error);
    return false;
  }
}

async function showFlyRewarded(mode?: "pop") {
  const showFly = getFlyRewarded();
  if (!showFly) return false;

  try {
    if (mode === "pop") {
      await showFly("pop");
      return true;
    }

    await showFly();
    return true;
  } catch (error) {
    console.error("Fly rewarded error", error);
    return false;
  }
}

async function showFlyRewardedSequence(count: number) {
  for (let i = 0; i < count; i += 1) {
    const ok = await showFlyRewarded(i === count - 1 ? "pop" : undefined);
    if (!ok) return false;

    if (i < count - 1) {
      await sleep(500);
    }
  }

  return true;
}

export async function showMiningRewardedAd() {
  if (await showAdsgramRewarded()) return true;
  return showFlyRewarded();
}

export async function showReviveRewardedAd() {
  if (await showAdsgramRewarded()) return true;
  return showFlyRewarded("pop");
}

export async function showTaskRewardedSequence() {
  const providers: Array<"adsgram" | "fly"> = ["adsgram", "fly"];
  if (Math.random() >= 0.5) {
    providers.reverse();
  }

  for (const provider of providers) {
    if (provider === "adsgram" && window.Adsgram) {
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
      }
    }

    if (provider === "fly") {
      const ok = await showFlyRewardedSequence(ADSGRAM_SEQUENCE_BLOCK_IDS.length);
      if (ok) return true;
    }
  }

  return false;
}

export function bootFlyInAppAds() {
  const showFly = getFlyRewarded();
  if (!showFly) return;

  try {
    void showFly({
      type: "inApp",
      inAppSettings: {
        frequency: 2,
        capping: 0.1,
        interval: 30,
        timeout: 5,
        everyPage: false,
      },
    });
  } catch (error) {
    console.error("Fly in-app ads init error", error);
  }
}
