import type { DateSignal, PageMetadata } from '../src/types';

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
    const content = el?.getAttribute('content');
    if (content && !isNaN(Date.parse(content))) {
      return {
        source: 'meta_tags',
        date: new Date(content).toISOString(),
        raw: content,
        reliability: 1,
      };
    }
  }

  return { source: 'meta_tags', date: null, raw: null, reliability: 0 };
}

function extractJsonLd(): DateSignal {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  const dateFields = ['datePublished', 'dateCreated', 'dateModified'];

  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent ?? '');
      for (const field of dateFields) {
        const val = data[field];
        if (val && !isNaN(Date.parse(val))) {
          return {
            source: 'schema_org',
            date: new Date(val).toISOString(),
            raw: String(val),
            reliability: 1,
          };
        }
      }
    } catch {
      continue;
    }
  }

  return { source: 'schema_org', date: null, raw: null, reliability: 0 };
}

function extractLastModified(): DateSignal {
  const header = document.lastModified;
  if (header && !isNaN(Date.parse(header))) {
    return {
      source: 'http_last_modified',
      date: new Date(header).toISOString(),
      raw: header,
      reliability: 1,
    };
  }
  return { source: 'http_last_modified', date: null, raw: null, reliability: 0 };
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
export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    lastMetadata = extractPageMetadata();
    browser.runtime.sendMessage({
      type: 'PAGE_METADATA',
      payload: lastMetadata,
    });
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === 'GET_METADATA' && lastMetadata) {
        sendResponse(lastMetadata);
      }
    })
  },
});
