import { USER_AGENT, httpJson, softFail } from './util';


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


type SearchHit = { title: string; url: string; snippet: string };

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
    hits.push({ title: TAGS(match[2]), url: href, snippet: '' });
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
  }));
  if (!hits.length) throw new Error(`No Wikipedia results for "${query}"`);
  return hits;
}

const decodeBingUrl = (href: string): string => {
  const target = href.replace(/&amp;/g, '&');
  const encoded = /[?&]u=a1([^&"]+)/.exec(target);
  const value = encoded
    ? Buffer.from(encoded[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    : target;
  return /^https?:\/\//i.test(value) ? value : '';
};

async function bing(query: string, limit: number): Promise<SearchHit[]> {
  const response = await fetch(
    `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${Math.max(limit, 5)}&setlang=en`,
    {
      headers: { 'user-agent': USER_AGENT, 'accept-language': 'en-US,en;q=0.9' },
      signal: AbortSignal.timeout(9000),
    },
  );
  if (!response.ok) throw new Error(`Bing HTTP ${response.status}`);
  const html = await response.text();
  const hits: SearchHit[] = [];
  for (const chunk of html.split(/<li[^>]*class="[^"]*\bb_algo\b[^"]*"/i).slice(1)) {
    if (hits.length >= limit) break;
    const link = /<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(chunk);
    if (!link) continue;
    const url = decodeBingUrl(link[1]);
    if (!url) continue;
    const caption = /class="[^"]*b_caption[^"]*"[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i.exec(chunk);
    hits.push({ title: TAGS(link[2]), url, snippet: caption ? TAGS(caption[1]) : '' });
  }
  if (!hits.length) throw new Error('Bing returned no parseable results');
  return hits;
}

export const webSearchTool = {
  name: 'web_search',
  description:
    'Search the public web for a query and return ranked results with titles, URLs and snippets. Input: { query: string, maxResults?: number (1-8) }. Tries DuckDuckGo, then Bing, then Wikipedia.',
  category: 'Web',
  scope: 'web:read',
  requiresApproval: false,
  execute: (input: Record<string, unknown>) =>
    softFail(async () => {
      const query = String(input.query ?? input.prompt ?? '').trim();
      if (!query) throw new Error('A non-empty query is required');
      const maxResults = Math.min(Math.max(Number(input.maxResults ?? 5) || 5, 1), 8);
      const engines: Array<[string, (q: string, n: number) => Promise<SearchHit[]>]> = [
        ['duckduckgo', duckDuckGo],
        ['bing', bing],
        ['wikipedia', wikipedia],
      ];
      const unavailable: string[] = [];
      for (const [engine, search] of engines) {
        try {
          const results = await search(query, maxResults);
          return {
            engine,
            query,
            results,
            ...(unavailable.length ? { note: `unavailable: ${unavailable.join(' | ')}` } : {}),
          };
        } catch (error) {
          unavailable.push(`${engine}: ${(error as Error).message}`);
        }
      }
      return { error: `Web search failed: ${unavailable.join('; ')}` };
    }),
};


async function githubApi(path: string) {
  const token = process.env.GITHUB_TOKEN?.trim();
  return httpJson(
    `https://api.github.com${path}`,
    {
      headers: {
        'user-agent': USER_AGENT,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    },
    15_000,
  );
}

export const githubTool = {
  name: 'github',
  description:
    "Read-only GitHub lookups. Input: { action: 'search_repos' | 'get_repo' | 'list_issues' | 'search_issues', query?: string, owner?: string, repo?: string, state?: 'open'|'closed'|'all', limit?: number }. Example: { action: 'search_repos', query: 'cli tooling stars:>5000' }. For writes (creating issues, comments, PRs) configure a GitHub MCP server via MCP_SERVERS.",
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
