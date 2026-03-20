declare module "monetag-tg-sdk" {
  export default function createAdHandler(
    zoneId: string | number,
  ): (options?: unknown) => Promise<unknown>;
}
