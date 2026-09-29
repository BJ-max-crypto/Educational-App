/**
 * "Probably the same class" suggestions. The Schoology feed has no class field, so these are
 * hints the student confirms, never tags applied on their own.
 */

export type SuggestItem = {
  id: string;
  title: string;
  description: string | null;
  url: string | null;
};

export type Suggestion = {
  id: string;
  title: string;
  reasons: string[];
  score: number;
};

const STOPWORDS = new Set(
  "a an and are as at be by for from has have in into is it its of on or our s that the their this to was were will with you your yours we us all any each can do if not no so".split(
    " ",
  ),
);

/** Title words that show up in every class, so they can't link two items on their own. */
const GENERIC = new Set(
  "homework hw assignment assignments due quiz test exam class classwork work worksheet project reading read notes review chapter chapters unit lesson day week page pages mp quarter part final upload submit".split(
    " ",
  ),
);

const MONTHS =
  /\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sept?(ember)?|oct(ober)?|nov(ember)?|dec(ember)?)\b/g;

const NUMBER_WORDS =
  /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last)\b/g;

/** Posts made in the same Schoology session get nearly consecutive ids. */
const NEARBY_ID = 2_000;
const SHINGLE = 5;
const MAX_RESULTS = 25;

function titleTemplate(title: string) {
  return title
    .toLowerCase()
    .replace(MONTHS, "#")
    .replace(NUMBER_WORDS, "#")
    .replace(/\b[ivx]+\b/g, "#")
    .replace(/\d+(st|nd|rd|th)?/g, "#")
    .replace(/[^a-z#]+/g, " ")
    .replace(/(#\s*)+/g, "# ")
    .trim();
}

function words(text: string) {
  return text.toLowerCase().match(/[a-z]+/g) ?? [];
}

function titleTokens(title: string) {
  return new Set(words(title).filter((word) => word.length > 1 && !STOPWORDS.has(word)));
}

function cleanDescription(text: string | null) {
  if (!text) return "";
  return text
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\[\d+\]/g, " ")
    .replace(/-\s*link:/gi, " ");
}

/** Five-word phrases with at least three real words, e.g. "word revealed in sacred scripture". */
function phrases(text: string | null) {
  const list = words(cleanDescription(text));
  const out = new Set<string>();
  for (let i = 0; i + SHINGLE <= list.length; i++) {
    const slice = list.slice(i, i + SHINGLE);
    const real = slice.filter((word) => !STOPWORDS.has(word) && word.length > 2);
    if (real.length >= 3) out.add(slice.join(" "));
  }
  return out;
}

function assignmentNumber(url: string | null) {
  const match = url?.match(/\/assignment\/(\d+)/);
  return match ? Number(match[1]) : null;
}

type Prepared = {
  item: SuggestItem;
  template: string;
  exact: string;
  tokens: Set<string>;
  phrases: Set<string>;
  number: number | null;
};

function prepare(item: SuggestItem): Prepared {
  return {
    item,
    template: titleTemplate(item.title),
    exact: item.title.trim().toLowerCase(),
    tokens: titleTokens(item.title),
    phrases: phrases(item.description),
    number: assignmentNumber(item.url),
  };
}

function quote(title: string) {
  return title.length > 40 ? `“${title.slice(0, 39)}…”` : `“${title}”`;
}

/**
 * Ranks `candidates` (Unsorted items) by how much they look like the `examples` already tagged
 * with one course. Every suggestion says why it was picked.
 */
export function suggestSimilar(examples: SuggestItem[], candidates: SuggestItem[]): Suggestion[] {
  if (!examples.length || !candidates.length) return [];
  const known = examples.map(prepare);
  const pool = candidates.map(prepare);

  // Phrases found in many items ("upload a picture of your") are boilerplate, not a class.
  const frequency = new Map<string, number>();
  for (const entry of [...known, ...pool]) {
    for (const phrase of entry.phrases) frequency.set(phrase, (frequency.get(phrase) ?? 0) + 1);
  }
  const commonLimit = Math.max(6, Math.ceil((known.length + pool.length) * 0.05));

  const results: Suggestion[] = [];
  for (const candidate of pool) {
    const reasons = new Map<string, number>();
    const add = (reason: string, weight: number) => {
      if (!reasons.has(reason)) reasons.set(reason, weight);
    };

    for (const example of known) {
      if (example.item.id === candidate.item.id) continue;
      const name = quote(example.item.title);

      if (candidate.exact === example.exact) {
        add(`Same title as ${name}`, 2);
      } else if (candidate.template.includes("#") && candidate.template === example.template) {
        add(`Same series as ${name}`, 3);
      } else {
        const shared = [...candidate.tokens].filter((token) => example.tokens.has(token));
        const union = new Set([...candidate.tokens, ...example.tokens]).size;
        const specific = shared.filter((token) => !GENERIC.has(token));
        if (specific.length && union && shared.length / union >= 0.6) {
          add(`Similar title to ${name}`, 2);
        }
      }

      const phrase = [...candidate.phrases].find(
        (value) => example.phrases.has(value) && (frequency.get(value) ?? 0) <= commonLimit,
      );
      if (phrase) add(`Description shares “${phrase}” with ${name}`, 3);

      if (
        candidate.number !== null &&
        example.number !== null &&
        Math.abs(candidate.number - example.number) <= NEARBY_ID
      ) {
        add(`Posted in Schoology right around ${name}`, 1);
      }
    }

    if (reasons.size) {
      const sorted = [...reasons.entries()].sort((a, b) => b[1] - a[1]);
      results.push({
        id: candidate.item.id,
        title: candidate.item.title,
        reasons: sorted.slice(0, 2).map(([reason]) => reason),
        score: sorted.reduce((sum, [, weight]) => sum + weight, 0),
      });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, MAX_RESULTS);
}

export type ItemBatch = {
  id: string;
  itemIds: string[];
  titles: string[];
};

function sameClass(a: Prepared, b: Prepared, frequency: Map<string, number>, commonLimit: number) {
  if (a.item.id === b.item.id) return false;
  if (a.exact && a.exact === b.exact) return true;
  if (a.template.includes("#") && a.template === b.template) return true;
  const shared = [...a.tokens].filter((token) => b.tokens.has(token));
  const union = new Set([...a.tokens, ...b.tokens]).size;
  const specific = shared.filter((token) => !GENERIC.has(token));
  if (specific.length && union && shared.length / union >= 0.6) return true;
  return [...a.phrases].some((phrase) => b.phrases.has(phrase) && (frequency.get(phrase) ?? 0) <= commonLimit);
}

/**
 * Groups unsorted items that look like one class. Nothing is saved until the student names the group.
 */
export function batchSimilar(items: SuggestItem[]): ItemBatch[] {
  const pool = items.slice(0, 200).map(prepare);
  if (pool.length < 2) return [];
  const frequency = new Map<string, number>();
  for (const entry of pool) {
    for (const phrase of entry.phrases) frequency.set(phrase, (frequency.get(phrase) ?? 0) + 1);
  }
  const commonLimit = Math.max(6, Math.ceil(pool.length * 0.05));
  const parent = pool.map((_, index) => index);
  const find = (index: number): number => {
    let cursor = index;
    while (parent[cursor] !== cursor) cursor = parent[cursor];
    return cursor;
  };
  const unite = (left: number, right: number) => {
    const a = find(left);
    const b = find(right);
    if (a !== b) parent[b] = a;
  };
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      if (sameClass(pool[i], pool[j], frequency, commonLimit)) unite(i, j);
    }
  }
  const groups = new Map<number, Prepared[]>();
  for (let i = 0; i < pool.length; i++) {
    const root = find(i);
    const list = groups.get(root) ?? [];
    list.push(pool[i]);
    groups.set(root, list);
  }
  return [...groups.values()]
    .filter((group) => group.length >= 2)
    .sort((a, b) => b.length - a.length)
    .slice(0, 8)
    .map((group) => {
      const chosen = group.slice(0, 25);
      return {
        id: chosen.map((entry) => entry.item.id).join(":"),
        itemIds: chosen.map((entry) => entry.item.id),
        titles: chosen.map((entry) => entry.item.title),
      };
    });
}
