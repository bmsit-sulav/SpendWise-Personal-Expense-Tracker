const fs = require("node:fs/promises");
const path = require("node:path");

const SUPPORTED_CURRENCIES = ["INR", "USD", "EUR", "GBP", "NPR"];
const RATE_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const RATE_API_URL = "https://open.er-api.com/v6/latest/INR";

function serviceError(message, statusCode = 503) {
  return Object.assign(new Error(message), { statusCode });
}

function createExchangeRateService(options = {}) {
  const cacheFile = options.cacheFile || path.resolve(__dirname, "../data/exchange-rates.json");
  const fetchRates = options.fetchRates || defaultFetchRates;
  const now = options.now || (() => new Date());
  let cachedRates;
  let cacheLoaded = false;
  let refreshInProgress;

  async function loadCache() {
    if (cacheLoaded) return;
    cacheLoaded = true;
    try {
      cachedRates = JSON.parse(await fs.readFile(cacheFile, "utf8"));
      if (!isValidSnapshot(cachedRates)) {
        cachedRates = undefined;
        throw new Error("Cached exchange-rate data has an invalid format.");
      }
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
  }

  async function refresh() {
    if (!refreshInProgress) {
      refreshInProgress = (async () => {
        const response = await fetchRates();
        if (!response || response.result !== "success" || response.base_code !== "INR") {
          throw new Error("The exchange-rate provider returned an invalid response.");
        }
        const rates = { INR: 1 };
        for (const currency of SUPPORTED_CURRENCIES) {
          if (currency === "INR") continue;
          const rate = response.rates?.[currency];
          if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
            throw new Error(`The exchange-rate provider did not return a valid ${currency} rate.`);
          }
          rates[currency] = rate;
        }

        const snapshot = {
          base: "INR",
          rates,
          updatedAt: response.time_last_update_utc || now().toISOString(),
          fetchedAt: now().toISOString(),
        };
        await fs.mkdir(path.dirname(cacheFile), { recursive: true });
        const temporaryPath = `${cacheFile}.${process.pid}.tmp`;
        await fs.writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
        await fs.rename(temporaryPath, cacheFile);
        cachedRates = snapshot;
        return snapshot;
      })().finally(() => {
        refreshInProgress = undefined;
      });
    }
    return refreshInProgress;
  }

  return {
    async getRates() {
      await loadCache();
      const isFresh = cachedRates && now().getTime() - Date.parse(cachedRates.fetchedAt) < RATE_CACHE_MAX_AGE_MS;
      if (isFresh) {
        return { ...cachedRates, stale: false };
      }
      try {
        return { ...(await refresh()), stale: false };
      } catch (error) {
        if (cachedRates) {
          console.warn("Using cached exchange rates because the provider is unavailable:", error.message);
          return { ...cachedRates, stale: true };
        }
        throw serviceError("Exchange rates are unavailable. Try again when you are online.");
      }
    },
  };
}

async function defaultFetchRates() {
  const response = await fetch(RATE_API_URL, { signal: AbortSignal.timeout(6000) });
  if (!response.ok) {
    throw new Error(`Exchange-rate provider returned HTTP ${response.status}.`);
  }
  return response.json();
}

function isValidSnapshot(snapshot) {
  if (
    !snapshot ||
    snapshot.base !== "INR" ||
    !snapshot.rates ||
    !Number.isFinite(Date.parse(snapshot.fetchedAt)) ||
    typeof snapshot.updatedAt !== "string"
  ) {
    return false;
  }
  return SUPPORTED_CURRENCIES.every((currency) => {
    const rate = snapshot.rates[currency];
    return typeof rate === "number" && Number.isFinite(rate) && rate > 0;
  });
}

module.exports = { createExchangeRateService, SUPPORTED_CURRENCIES };
