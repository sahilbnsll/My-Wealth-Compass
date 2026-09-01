/** AMFI publishes the full India mutual-fund NAV list as a plain-text feed. */
const AMFI_NAV_URL = "https://www.amfiindia.com/spages/NAVAll.txt";

export type NavRecord = { schemeCode: string; isin: string | null; name: string; nav: number; date: string };

/** Parse the semicolon-delimited AMFI feed. Header/section lines are skipped. */
export function parseAmfiNav(text: string): NavRecord[] {
  const out: NavRecord[] = [];
  for (const line of text.split("\n")) {
    const parts = line.split(";");
    if (parts.length < 6) continue;
    const [code, isinGrowth, isinReinvest, name, navRaw, date] = parts.map((p) => p.trim());
    if (!code || !/^\d+$/.test(code)) continue;
    const nav = Number(navRaw);
    if (!Number.isFinite(nav) || nav <= 0) continue;
    const isin = isinGrowth && isinGrowth !== "-" ? isinGrowth : isinReinvest && isinReinvest !== "-" ? isinReinvest : null;
    out.push({ schemeCode: code, isin, name: name ?? "", nav, date: date ?? "" });
  }
  return out;
}

export async function fetchAmfiNav(): Promise<NavRecord[]> {
  const res = await fetch(AMFI_NAV_URL, { headers: { accept: "text/plain" } });
  if (!res.ok) throw new Error(`AMFI feed unavailable (${res.status})`);
  return parseAmfiNav(await res.text());
}

/** The full feed is ~2MB — cache it briefly so repeated searches don't re-download. */
let cache: { at: number; navs: NavRecord[] } | null = null;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

async function cachedNav(): Promise<NavRecord[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.navs;
  const navs = await fetchAmfiNav();
  cache = { at: Date.now(), navs };
  return navs;
}

/** Case-insensitive name search over the AMFI feed, prefix matches ranked first. */
export async function searchAmfiFunds(query: string, limit = 8): Promise<NavRecord[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const navs = await cachedNav();
  const prefix: NavRecord[] = [];
  const contains: NavRecord[] = [];
  for (const n of navs) {
    const name = n.name.toLowerCase();
    if (name.startsWith(q)) prefix.push(n);
    else if (name.includes(q)) contains.push(n);
    if (prefix.length >= limit && contains.length >= limit) break;
  }
  return [...prefix.slice(0, limit), ...contains.slice(0, limit)].slice(0, limit);
}
