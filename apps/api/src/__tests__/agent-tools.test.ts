import { describe, expect, it, vi } from 'vitest';
import { buildTools, calculate, knowledgeTerms, webSearchTransport } from '@ryuksaidso/agent-tools';

describe('calculator (safe arithmetic)', () => {
  it('evaluates expressions with precedence, powers and functions', () => {
    expect(calculate('23*7+5')).toBe(166);
    expect(calculate('2+3^2')).toBe(11);
    expect(calculate('sqrt(16)+abs(-3)')).toBe(7);
    expect(calculate('(10/4)*2')).toBe(5);
  });

  it('never executes code', () => {
    expect(() => calculate('process.exit()')).toThrow(/Unknown identifier/);
    expect(() => calculate('2+')).toThrow();
    expect(() => calculate('')).toThrow(/Empty expression/);
  });
});

describe('knowledgeTerms (OR-ed retrieval)', () => {
  it('drops stopwords and dedupes conversational prompts', () => {
    expect(knowledgeTerms('Who is Faizan Hameed?')).toEqual(['faizan', 'hameed']);
    expect(knowledgeTerms('what does faizcasm do?')).toEqual(['faizcasm']);
  });
});

describe('tool registry', () => {
  const tools = buildTools({ prisma: {} });

  it('exposes the extended tool set with categories for the picker', () => {
    const expected = [
      'search_knowledge', 'get_ticket', 'add_ticket_message',
      'current_time', 'calculator', 'current_weather',
      'web_search', 'github',
      'currency_convert', 'unit_convert', 'dictionary', 'news', 'text_tools',
    ];
    for (const name of expected) expect(Object.keys(tools)).toContain(name);
    expect(new Set(Object.values(tools).map(t => t.category))).toEqual(
      new Set(['Knowledge', 'Tickets', 'Utilities', 'Web', 'Integrations']),
    );
  });

  it('every tool has metadata the API can serve and a safe approval default', () => {
    for (const tool of Object.values(tools)) {
      expect(tool.name).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(20);
      expect(tool.scope).toMatch(/^[a-z]+:/);
      expect(typeof tool.requiresApproval).toBe('boolean');
      expect(typeof tool.execute).toBe('function');
    }
    expect(tools.add_ticket_message.requiresApproval).toBe(true);
    expect(tools.search_knowledge.requiresApproval).toBe(false);
    expect(tools.current_time.requiresApproval).toBe(false);
  });

  it('merges extra tools (MCP) without clobbering built-ins', () => {
    const merged = buildTools({ prisma: {}, extra: { mcp__github__create_issue: { name: 'mcp__github__create_issue', description: 'x'.repeat(30), category: 'Integrations (MCP)', scope: 'mcp:github', requiresApproval: true, execute: async () => ({ ok: true }) } } });
    expect(Object.keys(merged)).toContain('mcp__github__create_issue');
    expect(merged.search_knowledge).toBeDefined();
    expect(merged.search_knowledge.name).toBe('search_knowledge');
    expect(typeof merged.search_knowledge.execute).toBe('function');
  });
});

describe('unit_convert (offline conversions)', () => {
  const tools = buildTools({ prisma: {} });
  const run = (input: Record<string, unknown>) => tools.unit_convert.execute(input, { user: { organizationId: 'o' } as any, runId: 'r' });

  it('converts within a family with floating-point noise cleaned up', async () => {
    expect(await run({ value: 72, from: 'f', to: 'c' })).toMatchObject({ result: 22.22222222, group: 'temperature' });
    expect(await run({ value: 10, from: 'km', to: 'mi' })).toMatchObject({ result: 6.213711922 });
    expect(await run({ value: 2, from: 'gb', to: 'mb' })).toMatchObject({ result: 2000 });
    expect(await run({ value: 100, from: 'c', to: 'f' })).toMatchObject({ result: 212 });
  });

  it('accepts word aliases like "miles" and "pounds"', async () => {
    const out = await run({ value: 1, from: 'miles', to: 'km' });
    expect(out).toMatchObject({ from: 'mi', to: 'km' });
  });

  it('refuses cross-family and unknown units', async () => {
    await expect(run({ value: 1, from: 'km', to: 'lb' })).rejects.toThrow(/different measurement families/);
    await expect(run({ value: 1, from: 'parsec', to: 'km' })).rejects.toThrow(/Unknown unit/);
  });
});

describe('text_tools (offline text utilities)', () => {
  const tools = buildTools({ prisma: {} });
  const run = (input: Record<string, unknown>) => tools.text_tools.execute(input, { user: { organizationId: 'o' } as any, runId: 'r' });

  it('computes stats', async () => {
    const out = await run({ action: 'stats', text: 'Hello world. Two words here!\nNew line.' }) as any;
    expect(out.words).toBe(7);
    expect(out.lines).toBe(2);
    expect(out.characters).toBe(38);
  });

  it('round-trips base64 including unicode', async () => {
    const encoded = await run({ action: 'base64_encode', text: '✓ unicode' }) as any;
    expect(encoded.result).toBe('4pyTIHVuaWNvZGU=');
    const decoded = await run({ action: 'base64_decode', text: encoded.result }) as any;
    expect(decoded.result).toBe('✓ unicode');
    await expect(run({ action: 'base64_decode', text: '!!!not-base64!!!' })).rejects.toThrow(/not valid base64/);
  });

  it('slugifies text to the API pattern', async () => {
    const out = await run({ action: 'slugify', text: 'Hello, World! 2026' }) as any;
    expect(out.result).toBe('hello-world-2026');
    expect(out.result).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it('rejects unknown actions', async () => {
    await expect(run({ action: 'shout', text: 'hi' })).rejects.toThrow(/Unknown text_tools action/);
  });
});

describe('current_weather (two-source resilience)', () => {
  const tools = buildTools({ prisma: {} });
  const run = (input: Record<string, unknown>) => tools.current_weather.execute(input, { user: { organizationId: 'o' } as any, runId: 'r' });

  const ok = (data: unknown) => Promise.resolve(new Response(JSON.stringify(data)));

  it('serves from Open-Meteo when it answers', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (String(url).includes('geocoding-api')) return ok({ results: [{ latitude: 51.5, longitude: -0.12, name: 'London', admin1: 'England', country: 'United Kingdom' }] });
      if (String(url).includes('api.open-meteo.com')) return ok({ timezone: 'Europe/London', current: { time: '2026-09-27T12:00', temperature_2m: 18.6, apparent_temperature: 18.5, relative_humidity_2m: 87, wind_speed_10m: 16.2, weather_code: 3 } });
      return ok({});
    }));
    try {
      const out = await run({ city: 'London' }) as any;
      expect(out).toMatchObject({ temperature: '18.6 °C', humidity: '87%', source: 'open-meteo', timezone: 'Europe/London' });
      expect(out.conditions).toBe('Overcast');
    } finally { vi.unstubAllGlobals(); }
  });

  it('falls back to Nominatim geocoding + met.no forecast when Open-Meteo is down', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (String(url).includes('open-meteo')) return Promise.reject(new Error('simulated open-meteo outage'));
      if (String(url).includes('nominatim')) return ok([{ lat: '35.68', lon: '139.76', display_name: 'Tokyo, Japan' }]);
      if (String(url).includes('met.no')) return ok({ properties: { timeseries: [{ time: '2026-09-27T18:00:00Z', data: { instant: { details: { air_temperature: 21.2, wind_speed: 3.2 } } } }] } });
      return ok({});
    }));
    try {
      const out = await run({ city: 'Tokyo' }) as any;
      expect(out.source).toBe('met.no');
      expect(out.note).toMatch(/Open-Meteo unavailable/);
      expect(out.temperature).toBe('21.2 °C');
      expect(out.location).toContain('Tokyo');
    } finally { vi.unstubAllGlobals(); }
  });

  it('reports a soft error (not a throw) when every source fails', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network down'))));
    try {
      const out = await run({ city: 'Nowhere' }) as any;
      expect(out).toHaveProperty('error');
    } finally { vi.unstubAllGlobals(); }
  });
});

describe('web_search (three-engine fallback)', () => {
  const tools = buildTools({ prisma: {} });
  const run = (input: Record<string, unknown>) => tools.web_search.execute(input, { user: { organizationId: 'o' } as any, runId: 'r' });

  const html = (body: string, status = 200) => Promise.resolve(new Response(body, { status }));
  const json = (data: unknown) => Promise.resolve(new Response(JSON.stringify(data)));
  const anomaly = '<html><head><title>DuckDuckGo</title></head><body>Our systems have detected an anomaly challenge.</body></html>';
  const bingHtml = [
    '<ol id="b_results">',
    '<li class="b_algo" data-id iid=SERP.1><div><h2><a href="https://www.bing.com/ck/a?!&amp;&amp;p=abc&amp;u=a1aHR0cHM6Ly9ub2RlanMub3JnL2VuL2Rvd25sb2Fk&amp;ntb=1">Download &lt;strong&gt;Node.js&lt;/strong&gt;</a></h2></div><div class="b_caption"><p>Learn more about Node.js releases &amp; schedules.</p></div></li>',
    '<li class="b_algo" data-id iid=SERP.2><div><h2><a href="https://nodejs.org/en/about/releases/">Releases</a></h2></div><div class="b_caption"><p>LTS schedule.</p></div></li>',
    '</ol>',
  ].join('');
  const bingRss = [
    '<?xml version="1.0" encoding="utf-8" ?><rss version="2.0"><channel><title>Bing: node.js lts</title>',
    '<item><title>Download &lt;strong&gt;Node.js&lt;/strong&gt;</title><link>https://nodejs.org/en/download</link><description>Learn more about Node.js releases &amp; schedules.</description><pubDate>Wed, 30 Sep 2026 01:35:00 GMT</pubDate></item>',
    '<item><title>Releases</title><link>https://nodejs.org/en/about/releases/</link><description>LTS schedule.</description></item>',
    '</channel></rss>',
  ].join('');
  const originalH2 = webSearchTransport.htmlOverH2;
  const noH2 = async () => {
    throw new Error('http/2 unavailable in tests');
  };

  it('serves from Bing HTML over HTTP/2 when DuckDuckGo is challenged', async () => {
    webSearchTransport.htmlOverH2 = async () => bingHtml;
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      const u = String(url);
      if (u.includes('duckduckgo')) return html(anomaly, 202);
      if (u.includes('format=rss')) return html('<rss/>');
      return html('');
    }));
    try {
      const out = await run({ query: 'node.js lts' }) as any;
      expect(out.engine).toBe('bing');
      expect(out.note).toContain('duckduckgo');
      expect(out.results).toHaveLength(2);
      expect(out.results[0]).toMatchObject({
        title: 'Download Node.js',
        url: 'https://nodejs.org/en/download',
        snippet: 'Learn more about Node.js releases & schedules.',
      });
      expect(out.results[1].url).toBe('https://nodejs.org/en/about/releases/');
    } finally {
      vi.unstubAllGlobals();
      webSearchTransport.htmlOverH2 = originalH2;
    }
  });

  it('falls back to the Bing RSS feed when HTTP/2 is unavailable', async () => {
    webSearchTransport.htmlOverH2 = noH2;
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      const u = String(url);
      if (u.includes('duckduckgo')) return html(anomaly, 202);
      if (u.includes('format=rss')) return html(bingRss);
      return html('');
    }));
    try {
      const out = await run({ query: 'node.js lts' }) as any;
      expect(out.engine).toBe('bing');
      expect(out.note).toContain('duckduckgo');
      expect(out.results).toHaveLength(2);
      expect(out.results[0].url).toBe('https://nodejs.org/en/download');
      expect(out.results[0].snippet).toBe('Learn more about Node.js releases & schedules.');
      expect(out.results[1].title).toBe('Releases');
    } finally {
      vi.unstubAllGlobals();
      webSearchTransport.htmlOverH2 = originalH2;
    }
  });

  it('reaches Wikipedia as the last engine and reports what was unavailable', async () => {
    webSearchTransport.htmlOverH2 = noH2;
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      const u = String(url);
      if (u.includes('duckduckgo')) return html(anomaly, 202);
      if (u.includes('format=rss')) return html('<html><body>no results here</body></html>');
      if (u.includes('wikipedia.org')) return json({ query: { search: [{ title: 'Node.js', snippet: 'A cross-platform runtime' }] } });
      return html('');
    }));
    try {
      const out = await run({ query: 'node.js' }) as any;
      expect(out.engine).toBe('wikipedia');
      expect(out.note).toContain('duckduckgo');
      expect(out.note).toContain('bing');
      expect(out.results[0].url).toBe('https://en.wikipedia.org/wiki/Node.js');
    } finally {
      vi.unstubAllGlobals();
      webSearchTransport.htmlOverH2 = originalH2;
    }
  });

  it('reports a soft error naming every engine when all of them fail', async () => {
    webSearchTransport.htmlOverH2 = noH2;
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network down'))));
    try {
      const out = await run({ query: 'anything' }) as any;
      expect(out).toHaveProperty('error');
      expect(out.error).toContain('duckduckgo');
      expect(out.error).toContain('bing');
      expect(out.error).toContain('wikipedia');
    } finally {
      vi.unstubAllGlobals();
      webSearchTransport.htmlOverH2 = originalH2;
    }
  });
});
