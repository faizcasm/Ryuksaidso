import { USER_AGENT, httpJson, softFail } from './util';


export const currencyConvertTool = {
  name: 'currency_convert',
  description:
    'Convert an amount between currencies using ECB reference rates. Input: { amount?: number (default 1), from: string, to: string } with 3-letter ISO codes, e.g. { amount: 250, from: "USD", to: "EUR" }.',
  category: 'Web',
  scope: 'currency:read',
  requiresApproval: false,
  execute: (input: Record<string, unknown>) =>
    softFail(async () => {
      const amount = Number(input.amount ?? 1);
      if (!Number.isFinite(amount) || amount < 0) throw new Error('amount must be a non-negative number');
      const from = String(input.from ?? input.base ?? '').trim().toUpperCase();
      const to = String(input.to ?? input.target ?? '').trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) {
        throw new Error('from and to must be 3-letter ISO currency codes such as USD, EUR, GBP, INR, JPY.');
      }
      const data = await httpJson(
        `https://api.frankfurter.app/latest?from=${from}&to=${to}`,
        { headers: { 'user-agent': USER_AGENT } },
        15_000,
      );
      const rate = Number(data?.rates?.[to]);
      if (!Number.isFinite(rate) || rate <= 0) {
        throw new Error(`No exchange rate for ${from}→${to}. Check that both codes are valid currencies.`);
      }
      const converted = Math.round(rate * amount * 100) / 100;
      return {
        amount, from, to,
        rate: Math.round(rate * 10000) / 10000,
        converted,
        date: data?.date,
        source: 'ECB reference rates via Frankfurter',
      };
    }),
};


type UnitDef = { factor: number; aliases?: string[] };

const UNIT_GROUPS: { group: string; units: Record<string, UnitDef> }[] = [
  {
    group: 'temperature',
    units: {
      c: { factor: 1, aliases: ['°c', 'celsius', 'centigrade'] },
      f: { factor: 1, aliases: ['°f', 'fahrenheit'] },
      k: { factor: 1, aliases: ['kelvin'] },
    },
  },
  {
    group: 'length',
    units: {
      m: { factor: 1, aliases: ['meter', 'meters', 'metre', 'metres'] },
      km: { factor: 1000, aliases: ['kilometer', 'kilometers', 'kilometre', 'kilometres'] },
      cm: { factor: 0.01, aliases: ['centimeter', 'centimeters'] },
      mm: { factor: 0.001, aliases: ['millimeter', 'millimeters'] },
      mi: { factor: 1609.344, aliases: ['mile', 'miles'] },
      ft: { factor: 0.3048, aliases: ['foot', 'feet'] },
      in: { factor: 0.0254, aliases: ['inch', 'inches', '"'] },
      yd: { factor: 0.9144, aliases: ['yard', 'yards'] },
    },
  },
  {
    group: 'mass',
    units: {
      kg: { factor: 1, aliases: ['kilogram', 'kilograms', 'kilo', 'kilos'] },
      g: { factor: 0.001, aliases: ['gram', 'grams'] },
      mg: { factor: 1e-6, aliases: ['milligram', 'milligrams'] },
      t: { factor: 1000, aliases: ['tonne', 'tonnes', 'metricton'] },
      lb: { factor: 0.45359237, aliases: ['lbs', 'pound', 'pounds'] },
      oz: { factor: 0.028349523125, aliases: ['ounce', 'ounces'] },
    },
  },
  {
    group: 'data',
    units: {
      b: { factor: 1, aliases: ['byte', 'bytes'] },
      kb: { factor: 1e3, aliases: ['kilobyte', 'kilobytes'] },
      mb: { factor: 1e6, aliases: ['megabyte', 'megabytes'] },
      gb: { factor: 1e9, aliases: ['gigabyte', 'gigabytes'] },
      tb: { factor: 1e12, aliases: ['terabyte', 'terabytes'] },
      kib: { factor: 1024, aliases: ['kibibyte', 'kibibytes'] },
      mib: { factor: 1048576, aliases: ['mebibyte', 'mebibytes'] },
      gib: { factor: 1073741824, aliases: ['gibibyte', 'gibibytes'] },
    },
  },
  {
    group: 'volume',
    units: {
      l: { factor: 1, aliases: ['liter', 'liters', 'litre', 'litres'] },
      ml: { factor: 0.001, aliases: ['milliliter', 'milliliters', 'millilitre', 'millilitres'] },
      gal: { factor: 3.785411784, aliases: ['gallon', 'gallons'] },
      qt: { factor: 0.946352946, aliases: ['quart', 'quarts'] },
      pt: { factor: 0.473176473, aliases: ['pint', 'pints'] },
      cup: { factor: 0.2365882365, aliases: ['cups'] },
      floz: { factor: 0.0295735295625, aliases: ['fl-oz', 'fluidounce'] },
    },
  },
  {
    group: 'speed',
    units: {
      mps: { factor: 1, aliases: ['m/s', 'meterspersecond'] },
      kmh: { factor: 0.2777777778, aliases: ['km/h', 'kph', 'kmh', 'kmph', 'kilometersperhour'] },
      mph: { factor: 0.44704, aliases: ['mi/h', 'milesperhour'] },
      knot: { factor: 0.5144444444, aliases: ['knots', 'kn', 'kt'] },
    },
  },
  {
    group: 'time',
    units: {
      s: { factor: 1, aliases: ['sec', 'secs', 'second', 'seconds'] },
      min: { factor: 60, aliases: ['mins', 'minute', 'minutes'] },
      h: { factor: 3600, aliases: ['hr', 'hrs', 'hour', 'hours'] },
      d: { factor: 86400, aliases: ['day', 'days'] },
      wk: { factor: 604800, aliases: ['week', 'weeks'] },
    },
  },
];

function normalizeUnit(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '').replace(/°/g, '°');
}

function findUnit(name: string): { key: string; def: UnitDef; group: string } | null {
  const n = normalizeUnit(name);
  for (const { group, units } of UNIT_GROUPS) {
    for (const [key, def] of Object.entries(units)) {
      if (key === n || def.aliases?.includes(n)) return { key, def, group };
    }
  }
  return null;
}

function temperatureToCelsius(value: number, from: string): number {
  if (from === 'c') return value;
  if (from === 'f') return ((value - 32) * 5) / 9;
  return value - 273.15;
}

function temperatureFromCelsius(celsius: number, to: string): number {
  if (to === 'c') return celsius;
  if (to === 'f') return (celsius * 9) / 5 + 32;
  return celsius + 273.15;
}

export const unitConvertTool = {
  name: 'unit_convert',
  description:
    'Convert a measurement between units offline (no network). Supports temperature (c/f/k), length (m, km, cm, mm, mi, ft, in, yd), mass (kg, g, lb, oz, t), data (b, kb, mb, gb, tb, kib, mib, gib), volume (l, ml, gal, qt, pt, cup, floz), speed (mps, kmh, mph, knot) and time (s, min, h, d, wk). Input: { value: number, from: string, to: string } e.g. { value: 72, from: "f", to: "c" }.',
  category: 'Utilities',
  scope: 'unit:use',
  requiresApproval: false,
  execute: async (input: Record<string, unknown>) => {
    const value = Number(input.value ?? input.amount ?? input.v);
    if (!Number.isFinite(value)) throw new Error('value must be a finite number');
    const from = findUnit(String(input.from ?? input.unit ?? ''));
    const to = findUnit(String(input.to ?? input.target ?? ''));
    if (!from) throw new Error(`Unknown unit "${input.from ?? input.unit}". Try e.g. km, lb, °c, gb, mph.`);
    if (!to) throw new Error(`Unknown unit "${input.to ?? input.target}". Try e.g. mi, kg, °f, mb, kmh.`);
    if (from.group !== to.group) {
      throw new Error(`Cannot convert ${from.key} (${from.group}) to ${to.key} (${to.group}) — different measurement families.`);
    }

    let converted: number;
    if (from.group === 'temperature') {
      converted = temperatureFromCelsius(temperatureToCelsius(value, from.key), to.key);
    } else {
      converted = (value * from.def.factor) / to.def.factor;
    }
    const rounded = Number(converted.toPrecision(10));
    return { value, from: from.key, to: to.key, group: from.group, result: rounded };
  },
};


const stripHtml = (html: string) => html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

async function dictionaryApi(word: string) {
  const data = await httpJson(
    `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
    { headers: { 'user-agent': USER_AGENT } },
    7000,
  );
  if (!Array.isArray(data) || !data.length) throw new Error(`No dictionary entry found for "${word}"`);
  const entry = data[0];
  const phonetic =
    entry.phonetic ||
    (Array.isArray(entry.phonetics) ? entry.phonetics.map((p: any) => p.text).filter(Boolean)[0] : '') ||
    '';
  const meanings = (Array.isArray(entry.meanings) ? entry.meanings : []).slice(0, 4).map((m: any) => ({
    partOfSpeech: String(m.partOfSpeech ?? ''),
    definitions: (Array.isArray(m.definitions) ? m.definitions : []).slice(0, 2).map((d: any) => ({
      definition: String(d.definition ?? ''),
      example: d.example ? String(d.example) : undefined,
    })),
  }));
  return { word: entry.word || word, phonetic, meanings };
}

async function wiktionaryApi(word: string) {
  const data = await httpJson(
    `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`,
    { headers: { 'user-agent': USER_AGENT } },
    7000,
  );
  const entries = data?.en;
  if (!Array.isArray(entries) || !entries.length) throw new Error(`No dictionary entry found for "${word}"`);
  const meanings = entries.slice(0, 4).map((m: any) => ({
    partOfSpeech: String(m.partOfSpeech ?? ''),
    definitions: (Array.isArray(m.definitions) ? m.definitions : []).slice(0, 2).map((d: any) => ({
      definition: stripHtml(String(d.definition ?? '')),
    })),
  }));
  return { word, phonetic: '', meanings, source: 'wiktionary' };
}

export const dictionaryTool = {
  name: 'dictionary',
  description:
    "Look up the definition, pronunciation and example usage of an English word. Input: { word: string } e.g. { word: 'ephemeral' }. Falls back to Wiktionary if the primary dictionary is unavailable.",
  category: 'Web',
  scope: 'dictionary:read',
  requiresApproval: false,
  execute: (input: Record<string, unknown>) =>
    softFail(async () => {
      const word = String(input.word ?? input.query ?? '').trim().toLowerCase();
      if (!word) throw new Error('word is required');
      if (!/^[a-z][a-z' -]{0,63}$/.test(word)) throw new Error('word must be 1-64 letters');
      try {
        return await dictionaryApi(word);
      } catch (primaryError) {
        try {
          return { ...(await wiktionaryApi(word)), note: `Primary dictionary unavailable (${(primaryError as Error).message})` };
        } catch (fallbackError) {
          throw new Error(`Definition lookup failed: ${(primaryError as Error).message}; fallback failed: ${(fallbackError as Error).message}`);
        }
      }
    }),
};


export const newsTool = {
  name: 'news',
  description:
    'Read trending technology stories from Hacker News (keyless). Input: { topic?: string, limit?: number (1-10) }. Omit topic for the current front page; pass a topic like "rust" or "llm" to search.',
  category: 'Web',
  scope: 'news:read',
  requiresApproval: false,
  execute: (input: Record<string, unknown>) =>
    softFail(async () => {
      const topic = String(input.topic ?? input.query ?? '').trim();
      const limit = Math.min(Math.max(Number(input.limit ?? 5) || 5, 1), 10);
      const url = topic
        ? `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(topic)}&tags=story&hitsPerPage=${limit}`
        : `https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=${limit}`;
      const data = await httpJson(url, { headers: { 'user-agent': USER_AGENT } }, 15_000);
      const stories = (data?.hits ?? []).map((hit: any) => ({
        title: String(hit.title ?? ''),
        url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
        hnUrl: `https://news.ycombinator.com/item?id=${hit.objectID}`,
        points: Number(hit.points ?? 0),
        comments: Number(hit.num_comments ?? 0),
        author: String(hit.author ?? ''),
        postedAt: hit.created_at,
      }));
      if (!stories.length) throw new Error(`No stories found${topic ? ` for "${topic}"` : ''}`);
      return { source: 'hacker-news', topic: topic || 'front page', stories };
    }),
};


function toSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200);
}

function base64Encode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function base64Decode(encoded: string): string {
  const binary = atob(encoded.trim());
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export const textToolsTool = {
  name: 'text_tools',
  description:
    'Offline text utilities. Input: { action: "stats" | "base64_encode" | "base64_decode" | "slugify", text: string }. stats returns character/word/line counts and reading time; the others encode, decode or URL-safe-ify the text.',
  category: 'Utilities',
  scope: 'text:use',
  requiresApproval: false,
  execute: async (input: Record<string, unknown>) => {
    const action = String(input.action ?? '').trim();
    const text = String(input.text ?? input.value ?? '');
    if (!action) throw new Error('action is required: stats, base64_encode, base64_decode or slugify');

    if (action === 'stats') {
      const words = text.split(/\s+/).filter(Boolean);
      const lines = text.length ? text.split(/\r?\n/).length : 0;
      const sentences = (text.match(/[.!?]+(\s|$)/g) || []).length;
      return {
        action,
        characters: text.length,
        charactersNoSpaces: text.replace(/\s+/g, '').length,
        bytes: new TextEncoder().encode(text).length,
        words: words.length,
        lines,
        sentences,
        readingTimeSeconds: Math.max(1, Math.round((words.length / 200) * 60)),
      };
    }
    if (action === 'base64_encode') return { action, result: base64Encode(text) };
    if (action === 'base64_decode') {
      try {
        return { action, result: base64Decode(text) };
      } catch {
        throw new Error('text is not valid base64');
      }
    }
    if (action === 'slugify') {
      const slug = toSlug(text);
      if (!slug) throw new Error('text contains no letters or numbers to slugify');
      return { action, result: slug };
    }
    throw new Error(`Unknown text_tools action "${action}". Use stats, base64_encode, base64_decode or slugify.`);
  },
};
