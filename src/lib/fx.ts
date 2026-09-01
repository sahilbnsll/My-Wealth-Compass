import { useEffect, useState } from "react";
import { usdInrRate, type UsdInrRate } from "./data.functions";

/** Shared, module-level cache so every money field reuses one lookup. */
let cached: UsdInrRate | null = null;
let inFlight: Promise<UsdInrRate> | null = null;

export async function getUsdInr(): Promise<UsdInrRate> {
  if (cached) return cached;
  if (!inFlight) {
    inFlight = usdInrRate()
      .then((r) => {
        cached = r;
        return r;
      })
      .catch(() => ({ rate: null, source: null, asOf: null }))
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/** USD → INR rate for money inputs. Null while loading or unavailable. */
export function useUsdInr(enabled = true): UsdInrRate | null {
  const [rate, setRate] = useState<UsdInrRate | null>(cached);

  useEffect(() => {
    if (!enabled || rate) return;
    let active = true;
    void getUsdInr().then((r) => {
      if (active) setRate(r);
    });
    return () => {
      active = false;
    };
  }, [enabled, rate]);

  return rate;
}

export function formatUsd(value: number): string {
  return `$${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)}`;
}
