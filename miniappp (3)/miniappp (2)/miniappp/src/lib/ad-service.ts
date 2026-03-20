import createAdHandler from "monetag-tg-sdk";

const ADSGRAM_REWARD_BLOCK_ID = "int-23213";
const ADSGRAM_SEQUENCE_BLOCK_IDS = ["int-23213", "int-23325", "int-23213"] as const;
const MONETAG_MAIN_ZONE_ID = 9917411;

type MonetagInterstitialOptions = {
  type: "inApp";
  inAppSettings: {
    frequency: number;
    capping: number;
    interval: number;
    timeout: number;
    everyPage?: boolean;
  };
};

type MonetagRewardedFn = {
  (): Promise<unknown>;
  (mode: "pop"): Promise<unknown>;
  (config: MonetagInterstitialOptions): Promise<unknown> | void;
};

type AdsgramShowResult = {
  done?: boolean;
};

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

let monetagHandler: MonetagRewardedFn | null | undefined;

function getMonetagHandler() {
  if (monetagHandler !== undefined) {
    return monetagHandler;
  }

  try {
    monetagHandler = createAdHandler(MONETAG_MAIN_ZONE_ID) as MonetagRewardedFn;
    return monetagHandler;
  } catch (error) {
    console.error("Monetag SDK init error", error);
    monetagHandler = null;
    return null;
  }
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

async function showMonetagRewarded(mode?: "pop") {
  const showMonetag = getMonetagHandler();
  if (!showMonetag) return false;

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
  for (let i = 0; i < count; i += 1) {
    const ok = await showMonetagRewarded(i === count - 1 ? "pop" : undefined);
    if (!ok) return false;

    if (i < count - 1) {
      await sleep(500);
    }
  }

  return true;
}

export async function showMiningRewardedAd() {
  if (await showAdsgramRewarded()) return true;
  return showMonetagRewarded();
}

export async function showReviveRewardedAd() {
  if (await showAdsgramRewarded()) return true;
  return showMonetagRewarded("pop");
}

export async function showTaskRewardedSequence() {
  const providers: Array<"adsgram" | "monetag"> = ["adsgram", "monetag"];
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

    if (provider === "monetag") {
      const ok = await showMonetagRewardedSequence(ADSGRAM_SEQUENCE_BLOCK_IDS.length);
      if (ok) return true;
    }
  }

  return false;
}

export function bootMonetagInAppAds() {
  const showMonetag = getMonetagHandler();
  if (!showMonetag) return;

  try {
    void showMonetag({
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
    console.error("Monetag in-app ads init error", error);
  }
}
