import type {
  BackgroundMessage,
  CachedResult,
  ConfidenceResult,
  DateSignal,
  PageMetadata,
} from '../src/types';
import { computeConfidence } from '../src/utils/confidence';
const STORAGE_KEY = 'tracer_cache';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24hr
const FRESH_TTL_MS = 60 * 60 * 1000; // 1hr

async function readCache(): Promise<Map<string, CachedResult>> {
  const data = await browser.storage.local.get(STORAGE_KEY);
  return new Map(Object.entries(data[STORAGE_KEY] ?? {}));
}

async function writeCache(cache: Map<string, CachedResult>): Promise<void> {
  //Evict entries older than 24hr
  const now = Date.now();
  for (const [url, entry] of cache) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      cache.delete(url);
    }
  }
  await browser.storage.local.set({
    [STORAGE_KEY]: Object.fromEntries(cache),
  });
}

async function fetchWaybackFirstSeen(
  url: string,
): Promise<DateSignal> {
  try {
    const api = `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`;
    const res = await fetch(api);
    const data = await res.json();
    const snapshot = data?.archived_snapshots?.closest;
    if (snapshot?.timestamp) {
      const ts = snapshot.timestamp;
      const dateStr = `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(8, 10)}:${ts.slice(10, 12)}:${ts.slice(12, 14)}Z`;
      return {
        source: 'wayback_machine',
        date: dateStr,
        raw: snapshot.timestamp,
        reliability: 1,
      };
    }
  } catch {
    // Wayback API unavailable
  }
  return { source: 'wayback_machine', date: null, raw: null, reliability: 0 };
}

async function fetchSitemapLastmod(
  url: string,
): Promise<DateSignal> {
  try {
    const origin = new URL(url).origin;
    const sitemapUrl = `${origin}/sitemap.xml`;
    const res = await fetch(sitemapUrl);
    if (!res.ok) return { source: 'sitemap_lastmod', date: null, raw: null, reliability: 0 };
    const text = await res.text();
    const match = text.match(/<lastmod>([^<]+)<\/lastmod>/);
    if (match?.[1] && !isNaN(Date.parse(match[1]))) {
      return {
        source: 'sitemap_lastmod',
        date: new Date(match[1]).toISOString(),
        raw: match[1],
        reliability: 1,
      };
    }
  } catch {
    // Sitemap unavailable
  }
  return { source: 'sitemap_lastmod', date: null, raw: null, reliability: 0 };
}

async function processMetadata(
  metadata: PageMetadata,
): Promise<ConfidenceResult> {
  const cache = await readCache();
  const entry = cache.get(metadata.url);

  // cache-hit shortcut: if < 1hr old, skip fetch
  if (entry && Date.now() - entry.timestamp < FRESH_TTL_MS) {
    return entry.result;
  }

  // fresh fetch from external APIs
  const [waybackSignal, sitemapSignal] = await Promise.all([
    fetchWaybackFirstSeen(metadata.url),
    fetchSitemapLastmod(metadata.url),
  ]);

  metadata.signals.push(waybackSignal, sitemapSignal);
  const result = computeConfidence(metadata);

  // Persist to storage
  cache.set(metadata.url, { result, timestamp: Date.now() });
  await writeCache(cache);

  return result;
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener(
    (
      message: BackgroundMessage,
      _sender,
      sendResponse: (response: ConfidenceResult) => void,
    ) => {
      if (message.type === 'PAGE_METADATA') {
        processMetadata(message.payload).then((result) => {
          sendResponse(result);
        });
        return true;
      }
    },
  );
});
