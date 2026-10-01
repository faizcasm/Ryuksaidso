import { USER_AGENT, assertPublicHttpUrl, httpJson, softFail } from './util';


export const currentTimeTool = {
  name: 'current_time',
  description:
    "Get the current date and time. Input: { timezone?: string } — an IANA timezone like 'Asia/Kolkata' or 'America/New_York' (defaults to the server's UTC clock).",
  category: 'Utilities',
  scope: 'time:read',
  requiresApproval: false,
  execute: async (input: Record<string, unknown>) => {
    const timezone = String(input.timezone ?? input.tz ?? '').trim() || 'UTC';
    const now = new Date();
    try {
      const local = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        weekday: 'short', year: 'numeric', month: 'short', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZoneName: 'short',
      }).format(now);
      return { timezone, local, utc: now.toISOString(), unixSeconds: Math.floor(now.getTime() / 1000) };
    } catch {
      throw new Error(`Unknown timezone "${timezone}". Use an IANA name such as "Asia/Kolkata".`);
    }
  },
};


const WMO_CODES: Record<number, string> = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Rime fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Dense drizzle',
  57: 'Freezing drizzle', 59: 'Dense freezing drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
  66: 'Freezing rain', 67: 'Heavy freezing rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Light rain showers', 81: 'Rain showers', 82: 'Violent rain showers',
  85: 'Light snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm with heavy hail',
};

async function metNoForecast(latitude: number, longitude: number, units: string) {
  const data = await httpJson(
    `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${latitude}&lon=${longitude}`,
    { headers: { 'user-agent': USER_AGENT } },
    15_000,
  );
  const details = data?.properties?.timeseries?.[0]?.data?.instant?.details;
  if (!details || !Number.isFinite(Number(details.air_temperature))) {
    throw new Error('met.no returned no current conditions');
  }
  const tempC = Number(details.air_temperature);
  const temperature = units === 'imperial' ? (tempC * 9) / 5 + 32 : tempC;
  const humidity = details.relative_humidity_at_sea_level ?? details.humidity_at_sea_level;
  const windMs = Number(details.wind_speed ?? 0);
  return {
    temperature: `${Math.round(temperature * 10) / 10} °${units === 'imperial' ? 'F' : 'C'}`,
    feelsLike: `${Math.round(temperature * 10) / 10} °${units === 'imperial' ? 'F' : 'C'}`,
    humidity: humidity != null ? `${Math.round(Number(humidity))}%` : 'n/a',
    wind: `${Math.round(windMs * 3.6 * 10) / 10} km/h`,
    conditions: 'Current conditions',
    observedAt: data?.properties?.timeseries?.[0]?.time,
    timezone: null as string | null,
  };
}

async function geocodeCity(location: string) {
  try {
    const geo = await httpJson(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`,
      { headers: { 'user-agent': USER_AGENT } },
      15_000,
    );
    const place = geo?.results?.[0];
    if (place) {
      return {
        latitude: Number(place.latitude),
        longitude: Number(place.longitude),
        name: [place.name, place.admin1, place.country].filter(Boolean).join(', '),
      };
    }
  } catch {
  }
  const geo = await httpJson(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(location)}`,
    { headers: { 'user-agent': USER_AGENT } },
    15_000,
  );
  const place = Array.isArray(geo) ? geo[0] : null;
  if (!place) throw new Error(`Could not geocode location "${location}"`);
  const name = String(place.display_name || location).split(',').slice(0, 3).join(',').trim();
  return { latitude: Number(place.lat), longitude: Number(place.lon), name };
}

export const currentWeatherTool = {
  name: 'current_weather',
  description:
    "Get current weather conditions. Input: { city: string } (e.g. 'Paris') OR { latitude: number, longitude: number }, plus optional units: 'metric' | 'imperial'. Uses Open-Meteo with Nominatim geocoding and a met.no fallback (no API key).",
  category: 'Utilities',
  scope: 'weather:read',
  requiresApproval: false,
  execute: (input: Record<string, unknown>) =>
    softFail(async () => {
      const units = String(input.units ?? 'metric').toLowerCase() === 'imperial' ? 'imperial' : 'metric';
      let latitude = Number(input.latitude ?? input.lat ?? NaN);
      let longitude = Number(input.longitude ?? input.lon ?? input.lng ?? NaN);
      let location = String(input.city ?? input.location ?? '').trim();

      if ((!Number.isFinite(latitude) || !Number.isFinite(longitude)) && location) {
        const place = await geocodeCity(location);
        latitude = place.latitude;
        longitude = place.longitude;
        location = place.name;
      }
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        throw new Error('Provide a city name or a latitude/longitude pair.');
      }

      const params = new URLSearchParams({
        latitude: String(latitude), longitude: String(longitude),
        current: 'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day',
        timezone: 'auto',
      });
      if (units === 'imperial') params.set('temperature_unit', 'fahrenheit');
      const symbol = units === 'imperial' ? 'F' : 'C';
      let current: any;
      let timezone: string | null = null;
      let source = 'open-meteo';
      let note: string | undefined;
      try {
        const forecast = await httpJson(
          `https://api.open-meteo.com/v1/forecast?${params}`,
          { headers: { 'user-agent': USER_AGENT } },
          15_000,
        );
        current = forecast?.current;
        if (!current) throw new Error('Open-Meteo returned no current conditions');
        timezone = forecast?.timezone ?? null;
      } catch (primaryError) {
        const fallback = await metNoForecast(latitude, longitude, units);
        return {
          location: location || `${latitude}, ${longitude}`,
          ...fallback,
          source: 'met.no',
          note: `Open-Meteo unavailable (${(primaryError as Error).message}); answered from met.no`,
        };
      }
      return {
        location: location || `${latitude}, ${longitude}`,
        timezone,
        conditions: WMO_CODES[Number(current.weather_code)] ?? `Weather code ${current.weather_code}`,
        temperature: `${current.temperature_2m} °${symbol}`,
        feelsLike: `${current.apparent_temperature} °${symbol}`,
        humidity: `${current.relative_humidity_2m}%`,
        wind: `${current.wind_speed_10m} km/h`,
        observedAt: current.time,
        source,
        note,
      };
    }),
};


type SearchHit = { title: string; url: string; snippet: string; publishedAt?: string; source?: string };

const TAGS = (html: string) => html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

async function duckDuckGo(query: string, limit: number): Promise<SearchHit[]> {
  const response = await fetch('https://html.duckduckgo.com/html/', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': USER_AGENT },
    body: `q=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(9000),
  });
  if (!response.ok) throw new Error(`DuckDuckGo HTTP ${response.status}`);
  const html = await response.text();
  const hits: SearchHit[] = [];
  const pattern = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) && hits.length < limit) {
    let href = match[1];
    const redirected = /[?&]uddg=([^&]+)/.exec(href);
    if (redirected) {
      try { href = decodeURIComponent(redirected[1]); } catch {  }
    }
    if (href.startsWith('//')) href = `https:${href}`;
    hits.push({ title: TAGS(match[2]), url: href, snippet: '', source: 'duckduckgo' });
  }
  const snippets = /class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div|td)>/g;
  let idx = 0;
  while ((match = snippets.exec(html)) && idx < hits.length) hits[idx++].snippet = TAGS(match[1]);
  if (!hits.length) throw new Error('DuckDuckGo returned no parseable results');
  return hits;
}

async function wikipedia(query: string, limit: number): Promise<SearchHit[]> {
  const data = await httpJson(
    `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&list=search&srsearch=${encodeURIComponent(query)}&srlimit=${limit}&srprop=snippet`,
    { headers: { 'user-agent': USER_AGENT } },
    8000,
  );
  const hits = (data?.query?.search ?? []).map((entry: any) => ({
    title: String(entry.title),
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(String(entry.title).replace(/ /g, '_'))}`,
    snippet: TAGS(String(entry.snippet ?? '')),
    source: 'wikipedia',
  }));
  if (!hits.length) throw new Error(`No Wikipedia results for "${query}"`);
  return hits;
}

const decodeEntities = (text: string): string =>
  text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

const decodeBingUrl = (href: string): string => {
  const target = decodeEntities(href.trim());
  const encoded = /[?&]u=a1([^&"]+)/.exec(target);
  const value = encoded
    ? Buffer.from(encoded[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    : target;
  return /^https?:\/\//i.test(value) ? value : '';
};

const SEARCH_STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'of', 'in', 'on', 'at', 'to', 'for', 'and', 'or', 'not',
  'with', 'what', 'who', 'when', 'where', 'why', 'how', 'which', 'tell', 'show', 'please', 'current', 'latest', 'now',
  'today', 'find', 'get',
]);

const searchTokens = (text: string): Set<string> =>
  new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 2 && !SEARCH_STOPWORDS.has(token)),
  );

async function bing(query: string, limit: number): Promise<SearchHit[]> {
  const needles = [...searchTokens(query)];
  const stripped = needles.join(' ');
  const candidates = stripped && stripped !== query.toLowerCase().trim() ? [query, stripped] : [query];
  let lastError = '';
  for (const candidate of candidates) {
    const hits: SearchHit[] = [];
    try {
      const response = await fetch(
        `https://www.bing.com/search?q=${encodeURIComponent(candidate)}&format=rss`,
        {
          headers: {
            'user-agent': USER_AGENT,
            accept: 'application/rss+xml, application/xml, text/xml, */*',
          },
          signal: AbortSignal.timeout(9000),
        },
      );
      if (!response.ok) throw new Error(`Bing HTTP ${response.status}`);
      const xml = await response.text();
      for (const chunk of xml.split('<item>').slice(1)) {
        if (hits.length >= 10) break;
        const title = /<title>([\s\S]*?)<\/title>/.exec(chunk);
        const link = /<link>([\s\S]*?)<\/link>/.exec(chunk);
        if (!title || !link) continue;
        const url = decodeBingUrl(link[1]);
        if (!url) continue;
        const description = /<description>([\s\S]*?)<\/description>/.exec(chunk);
        const published = /<pubDate>([\s\S]*?)<\/pubDate>/.exec(chunk);
        hits.push({
          title: TAGS(decodeEntities(title[1])),
          url,
          snippet: TAGS(decodeEntities(description?.[1] ?? '')),
          ...(published?.[1] && !Number.isNaN(Date.parse(published[1])) ? { publishedAt: new Date(published[1]).toISOString() } : {}),
          source: 'bing',
        });
      }
      if (!hits.length) throw new Error('Bing returned no parseable results');
      if (!needles.length) return hits.slice(0, limit);
      const relevant = hits.filter((hit) => {
        const haystack = searchTokens(`${hit.title} ${hit.snippet} ${hit.url}`);
        return needles.some((token) => haystack.has(token));
      });
      if (relevant.length) return relevant.slice(0, limit);
      lastError = 'Bing returned results unrelated to the query';
    } catch (error) {
      lastError = (error as Error).message;
    }
  }
  throw new Error(lastError || 'Bing search failed');
}

async function googleNews(query: string, limit: number): Promise<SearchHit[]> {
  const response = await fetch(
    `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`,
    { headers: { 'user-agent': USER_AGENT, accept: 'application/rss+xml, application/xml, text/xml, */*' }, signal: AbortSignal.timeout(9000) },
  );
  if (!response.ok) throw new Error(`Google News HTTP ${response.status}`);
  const xml = await response.text();
  const hits: SearchHit[] = [];
  for (const chunk of xml.split('<item>').slice(1)) {
    if (hits.length >= limit * 2) break;
    const title = /<title>([\s\S]*?)<\/title>/.exec(chunk);
    const link = /<link>([\s\S]*?)<\/link>/.exec(chunk);
    if (!title || !link) continue;
    const published = /<pubDate>([\s\S]*?)<\/pubDate>/.exec(chunk);
    const source = /<source[^>]*>([\s\S]*?)<\/source>/.exec(chunk);
    const description = /<description>([\s\S]*?)<\/description>/.exec(chunk);
    hits.push({
      title: TAGS(decodeEntities(title[1])),
      url: TAGS(decodeEntities(link[1])),
      snippet: TAGS(decodeEntities(description?.[1] ?? '')).slice(0, 400),
      ...(published?.[1] && !Number.isNaN(Date.parse(published[1])) ? { publishedAt: new Date(published[1]).toISOString() } : {}),
      ...(source?.[1] ? { source: TAGS(decodeEntities(source[1])) } : { source: 'google-news' }),
    });
  }
  if (!hits.length) throw new Error('Google News returned no parseable results');
  return hits;
}

const normalizeDomains = (value: unknown): string[] => {
  const list = Array.isArray(value) ? value : typeof value === 'string' && value.trim() ? value.split(/[,\s]+/) : [];
  return [...new Set(list.map((entry) => String(entry).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')).filter(Boolean))]
    .slice(0, 10);
};

const hitDomain = (url: string): string => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
};

const applyDomainFilter = (hits: SearchHit[], domains: string[]): SearchHit[] =>
  domains.length ? hits.filter((hit) => domains.some((domain) => { const host = hitDomain(hit.url); return host === domain || host.endsWith(`.${domain}`); })) : hits;

const FRESHNESS_WINDOWS: Record<string, number> = { day: 1, week: 7, month: 30, year: 365 };

const freshnessCutoff = (freshness: string): Date | null => {
  const days = FRESHNESS_WINDOWS[freshness];
  if (!days) return null;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return cutoff;
};

const applyFreshness = (hits: SearchHit[], cutoff: Date | null): { kept: SearchHit[]; undated: number } => {
  if (!cutoff) return { kept: hits, undated: 0 };
  const kept: SearchHit[] = [];
  let undated = 0;
  for (const hit of hits) {
    if (!hit.publishedAt) {
      undated += 1;
      continue;
    }
    const published = new Date(hit.publishedAt);
    if (!Number.isNaN(published.getTime()) && published >= cutoff) kept.push(hit);
  }
  return { kept, undated };
};

const DOCS_HOST_PATTERN = /(^|\.)(docs?|developer|developers|reference|learn|readthedocs|mdn|stackoverflow|stackexchange|npmjs|pypi|pkg\.go|crates|gitbook|notion|wiki|help|support|api|blog)\.|github\.io$|github\.com$|gitlab\.com$|\.readthedocs\./i;

const docsScore = (url: string): number => (DOCS_HOST_PATTERN.test(hitDomain(url)) ? 1 : 0);

const searchEnginesFor = (type: string, cutoff: Date | null): Array<[string, (q: string, n: number) => Promise<SearchHit[]>]> => {
  if (type === 'news') return [['google-news', googleNews], ['bing', bing], ['duckduckgo', duckDuckGo]];
  if (cutoff) return [['bing', bing], ['duckduckgo', duckDuckGo], ['wikipedia', wikipedia]];
  return [['duckduckgo', duckDuckGo], ['bing', bing], ['wikipedia', wikipedia]];
};

export const webSearchTool = {
  name: 'web_search',
  description:
    'Search the public web and return ranked results with titles, URLs and snippets. Input: { query: string, maxResults?: number (1-8), type?: "web" | "news" | "docs", domains?: string[] (only keep results from these domains), freshness?: "day" | "week" | "month" | "year" (only keep results published inside this window) }. type:"news" searches news outlets with publication dates; type:"docs" biases toward documentation/developer pages; include site:example.com in the query to target one site. Combine with fetch_page to read a result.',
  category: 'Web',
  scope: 'web:read',
  requiresApproval: false,
  execute: (input: Record<string, unknown>) =>
    softFail(async () => {
      const query = String(input.query ?? input.prompt ?? '').trim();
      if (!query) throw new Error('A non-empty query is required');
      const maxResults = Math.min(Math.max(Number(input.maxResults ?? 5) || 5, 1), 8);
      const type = ['web', 'news', 'docs'].includes(String(input.type)) ? String(input.type) : 'web';
      const domains = normalizeDomains(input.domains ?? input.domain);
      const freshnessRaw = String(input.freshness ?? '').trim().toLowerCase();
      const cutoff = FRESHNESS_WINDOWS[freshnessRaw] ? freshnessCutoff(freshnessRaw) : null;
      const engines = searchEnginesFor(type, cutoff);
      const attempts: string[] = [];
      for (const [engine, search] of engines) {
        try {
          const raw = await search(query, maxResults * 2);
          const domainFiltered = applyDomainFilter(raw, domains);
          if (domains.length && !domainFiltered.length) {
            attempts.push(`${engine}: no results from domains [${domains.join(', ')}]`);
            continue;
          }
          const { kept, undated } = applyFreshness(domainFiltered, cutoff);
          if (cutoff && !kept.length) {
            attempts.push(`${engine}: no results with dates inside the last ${FRESHNESS_WINDOWS[freshnessRaw]} day(s)`);
            continue;
          }
          const results = (type === 'docs' ? [...kept].sort((a, b) => docsScore(b.url) - docsScore(a.url)) : kept).slice(0, maxResults);
          const notes = [
            ...(cutoff && undated ? [`${undated} result(s) without a publication date were excluded by the recency filter.`] : []),
            ...(attempts.length ? [attempts.join(' | ')] : []),
          ];
          return {
            engine,
            type,
            query,
            results,
            filters: {
              ...(domains.length ? { domains } : {}),
              ...(cutoff ? { freshness: freshnessRaw, publishedSince: cutoff.toISOString() } : {}),
            },
            ...(notes.length ? { note: notes.join(' | ') } : {}),
          };
        } catch (error) {
          attempts.push(`${engine}: ${(error as Error).message}`);
        }
      }
      return { error: `Web search failed: ${attempts.join('; ')}` };
    }),
};

const BLOCKED_TEXT_TYPES = /pdf|zip|gzip|octet-stream|image\/|video\/|audio\/|font\//i;

const decodeHtmlEntities = (text: string): string =>
  decodeEntities(text)
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)));

function htmlToText(html: string): { title: string; description: string; text: string } {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? '';
  const description = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i.exec(html)?.[1] ?? '';
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|section|article|li|tr|h[1-6]|blockquote|pre|br)>/gi, '\n')
    .replace(/<(br|hr)\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  const text = decodeHtmlEntities(cleaned)
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { title: decodeHtmlEntities(title), description: decodeHtmlEntities(description).trim(), text };
}

const relevantPassages = (text: string, query: string): Array<{ text: string; score: number }> => {
  const terms = [...searchTokens(query)];
  if (!terms.length) return [];
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter((p) => p.length > 60);
  const scored = paragraphs.map((paragraph) => {
    const words = searchTokens(paragraph);
    let score = 0;
    for (const term of terms) if (words.has(term)) score += 1;
    return { text: paragraph.slice(0, 700), score };
  });
  return scored.filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
};

export const fetchPageTool = {
  name: 'fetch_page',
  description:
    'Fetch a public web page and return its readable text content. Input: { url: string, maxLength?: number (default 8000, max 40000), query?: string — when provided, also returns the passages most relevant to these terms }. Use after web_search to read a result. Private/internal hosts are blocked.',
  category: 'Web',
  scope: 'web:read',
  requiresApproval: false,
  execute: (input: Record<string, unknown>) =>
    softFail(async () => {
      const rawUrl = String(input.url ?? input.link ?? '').trim();
      if (!rawUrl) throw new Error('url is required');
      let url = assertPublicHttpUrl(rawUrl);
      let response: Response | null = null;
      for (let hop = 0; hop <= 3; hop += 1) {
        response = await fetch(url.toString(), {
          headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.8' },
          redirect: 'manual',
          signal: AbortSignal.timeout(15_000),
        });
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location');
          if (!location) break;
          url = assertPublicHttpUrl(new URL(location, url).toString());
          continue;
        }
        break;
      }
      if (!response) throw new Error('Fetch produced no response');
      if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${url.hostname}`);
      const finalUrl = assertPublicHttpUrl(response.url || url.toString());
      const contentType = response.headers.get('content-type') ?? '';
      if (BLOCKED_TEXT_TYPES.test(contentType)) throw new Error(`Unsupported content-type "${contentType.split(';')[0]}"`);
      const maxLength = Math.min(Math.max(Number(input.maxLength ?? 8000) || 8000, 500), 40_000);
      const query = String(input.query ?? '').trim();

      if (/application\/json/.test(contentType)) {
        const body = (await response.text()).slice(0, maxLength);
        return { url: finalUrl.toString(), contentType, title: '', text: body, truncated: body.length >= maxLength, passages: [] };
      }

      const html = await response.text();
      const { title, description, text } = htmlToText(html);
      const truncated = text.length > maxLength;
      const clipped = truncated ? text.slice(0, maxLength) : text;
      return {
        url: finalUrl.toString(),
        contentType,
        title,
        description: description.slice(0, 400),
        text: clipped,
        truncated,
        wordCount: clipped.split(/\s+/).filter(Boolean).length,
        passages: query ? relevantPassages(clipped, query) : [],
      };
    }),
};


async function githubApi(path: string, init: { method?: string; body?: unknown } = {}) {
  const token = process.env.GITHUB_TOKEN?.trim();
  const method = (init.method ?? 'GET').toUpperCase();
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      'user-agent': USER_AGENT,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    const message = data && typeof data === 'object' ? String(data.message ?? '') : String(data ?? '').slice(0, 200);
    const hint = response.status === 401 ? ' — check GITHUB_TOKEN' : response.status === 403 ? ' — rate limited or missing permission' : '';
    throw new Error(`GitHub ${response.status}: ${message || 'request failed'}${hint}`);
  }
  return data;
}

export const githubTool = {
  name: 'github',
  description:
    "Read-only GitHub lookups. Input: { action: 'search_repos' | 'get_repo' | 'list_issues' | 'search_issues', query?: string, owner?: string, repo?: string, state?: 'open'|'closed'|'all', limit?: number }. Example: { action: 'search_repos', query: 'cli tooling stars:>5000' }. For file reads, issues, branches and pull requests use the dedicated github_* tools (github_read_file, github_create_issue, github_update_issue, github_comment_issue, github_create_branch, github_get_pull_request, github_create_pull_request).",
  category: 'Integrations',
  scope: 'github:read',
  requiresApproval: false,
  execute: (input: Record<string, unknown>) =>
    softFail(async () => {
      const action = String(input.action ?? '').trim();
      const limit = Math.min(Math.max(Number(input.limit ?? 5) || 5, 1), 10);

      if (action === 'search_repos') {
        const query = String(input.query ?? '').trim();
        if (!query) throw new Error('query is required for search_repos');
        const data = await githubApi(`/search/repositories?q=${encodeURIComponent(query)}&per_page=${limit}`);
        return {
          action,
          results: (data?.items ?? []).map((repo: any) => ({
            fullName: repo.full_name, description: repo.description, stars: repo.stargazers_count,
            language: repo.language, openIssues: repo.open_issues_count, url: repo.html_url,
          })),
          totalMatches: data?.total_count,
        };
      }

      if (action === 'get_repo') {
        const owner = String(input.owner ?? '').trim();
        const repo = String(input.repo ?? input.repository ?? '').trim();
        if (!owner || !repo) throw new Error('owner and repo are required for get_repo');
        const data = await githubApi(`/repos/${owner}/${repo}`);
        return {
          action, fullName: data.full_name, description: data.description, stars: data.stargazers_count,
          forks: data.forks_count, openIssues: data.open_issues_count, watchers: data.watchers_count,
          defaultBranch: data.default_branch, license: data.license?.spdx_id ?? null,
          lastPush: data.pushed_at, url: data.html_url,
        };
      }

      if (action === 'list_issues') {
        const owner = String(input.owner ?? '').trim();
        const repo = String(input.repo ?? input.repository ?? '').trim();
        if (!owner || !repo) throw new Error('owner and repo are required for list_issues');
        const state = ['open', 'closed', 'all'].includes(String(input.state)) ? String(input.state) : 'open';
        const data = await githubApi(`/repos/${owner}/${repo}/issues?state=${state}&per_page=${limit}`);
        return {
          action,
          issues: (Array.isArray(data) ? data : [])
            .filter((issue: any) => !issue.pull_request)
            .map((issue: any) => ({
              number: issue.number, title: issue.title, state: issue.state,
              labels: (issue.labels ?? []).map((l: any) => l.name), url: issue.html_url, updatedAt: issue.updated_at,
            })),
        };
      }

      if (action === 'search_issues') {
        const query = String(input.query ?? '').trim();
        if (!query) throw new Error('query is required for search_issues');
        const data = await githubApi(`/search/issues?q=${encodeURIComponent(query)}&per_page=${limit}`);
        return {
          action,
          results: (data?.items ?? []).map((issue: any) => ({
            title: issue.title, state: issue.state, url: issue.html_url,
            repository: issue.repository_url?.replace('https://api.github.com/repos/', ''),
          })),
          totalMatches: data?.total_count,
        };
      }

      throw new Error(`Unknown github action "${action}". Use search_repos, get_repo, list_issues or search_issues.`);
    }),
};
