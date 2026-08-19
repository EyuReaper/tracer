import type { DateSignal, PageMetadata } from "../src/types";

function extractMetaTags(): DateSignal {
  const selectors = [
    'meta[property="article:published_time"]',
    'meta[property="og:article:published_time"]',
    'meta[name="date"]',
    'meta[name="DC.date"]',
    'meta[name="pubdate"]',
    'meta[property="article:modified_time"]',
    'meta[property="og:article:modified_time"]',
    'meta[name="last-modified"]',
  ];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    const content = el?.getAttribute("content");
    if (content && !isNaN(Date.parse(content))) {
      return {
        source: "meta_tags",
        date: new Date(content).toISOString(),
        raw: content,
        reliability: 1,
        status: "found",
      };
    }
  }

  return {
    source: "meta_tags",
    date: null,
    raw: null,
    reliability: 0,
    status: "not_found",
  };
}

function extractJsonLd(): DateSignal {
  const scripts = document.querySelectorAll(
    'script[type="application/ld+json"]',
  );
  const dateFields = ["datePublished", "dateCreated", "dateModified"];

  // 1. Recursive helper to search through arrays and nested objects (like @graph)
  function findDate(obj: any): string | null {
    if (!obj || typeof obj !== "object") return null;

    // Handle Arrays (e.g., top-level array or @graph array)
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const found = findDate(item);
        if (found) return found;
      }
      return null;
    }

    // Check direct fields on the current object
    for (const field of dateFields) {
      const val = obj[field];
      if (typeof val === "string" && !isNaN(Date.parse(val))) {
        return val;
      }
    }

    // Recursively check all nested properties
    for (const key of Object.keys(obj)) {
      const found = findDate(obj[key]);
      if (found) return found;
    }

    return null;
  }

  // 2. Iterate over all JSON-LD scripts on the page
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent ?? "");
      const val = findDate(data);
      if (val) {
        return {
          source: "schema_org",
          date: new Date(val).toISOString(),
          raw: val,
          reliability: 1, // High reliability for JSON-LD structured data
          status: "found",
        };
      }
    } catch {
      // Ignore JSON parse errors from malformed scripts
      continue;
    }
  }

  // Fallback if nothing was found
  return {
    source: "schema_org",
    date: null,
    raw: null,
    reliability: 0,
    status: "not_found",
  };
}

function extractLastModified(): DateSignal {
  const header = document.lastModified;
  if (header && !isNaN(Date.parse(header))) {
    return {
      source: "http_last_modified",
      date: new Date(header).toISOString(),
      raw: header,
      reliability: 1,
      status: "found",
    };
  }
  return {
    source: "http_last_modified",
    date: null,
    raw: null,
    reliability: 0,
    status: "not_found",
  };
}

export function extractPageMetadata() {
  const signals: DateSignal[] = [
    extractMetaTags(),
    extractJsonLd(),
    extractLastModified(),
  ];

  return {
    url: window.location.href,
    title: document.title,
    signals,
  };
}

let lastMetadata: PageMetadata | null = null;
let lastUrl = window.location.href;
let extractTimer: ReturnType<typeof setTimeout> | undefined;

function extractAndSend() {
  const next = extractPageMetadata();
  if (JSON.stringify(next) === JSON.stringify(lastMetadata)) return;
  lastMetadata = next;
  browser.runtime.sendMessage({
    type: "PAGE_METADATA",
    payload: next,
  });
}

function scheduleExtract() {
  clearTimeout(extractTimer);
  extractTimer = setTimeout(extractAndSend, 200);
}

function handleUrlChange() {
  if (window.location.href === lastUrl) return;
  lastUrl = window.location.href;
  scheduleExtract();
}
export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    lastMetadata = extractPageMetadata();
    browser.runtime.sendMessage({
      type: "PAGE_METADATA",
      payload: lastMetadata,
    });
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === "GET_METADATA" && lastMetadata) {
        sendResponse(lastMetadata);
      }
      if (message.type === "URL_CHANGED") {
        handleUrlChange();
      }
    });

    const observer = new MutationObserver(scheduleExtract);
    observer.observe(document.body, { childList: true, subtree: true });
  },
});
