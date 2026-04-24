export interface AppConfig {
  port: number;
  scraperTimeoutMs: number;
  scraperHeadless: boolean;
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  return value.toLowerCase() !== "false";
}

function readNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getConfig(): AppConfig {
  return {
    port: readNumber(process.env.PORT, 3001),
    scraperTimeoutMs: readNumber(process.env.SCRAPER_TIMEOUT_MS, 20_000),
    scraperHeadless: readBoolean(process.env.SCRAPER_HEADLESS, true)
  };
}
