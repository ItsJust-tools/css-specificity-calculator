import type { Tool, DeserializeResult } from '@itsjust/core';
import toolConfig from './tool.config';
import {
  INLINE_STYLE_LABEL,
  DEFAULT_STATE,
  type ScoredEntry,
  type SelectorScore,
  type SpecificityTuple,
  type ToolState,
} from './types';

// ---------------------------------------------------------------
// Selector parsing
// ---------------------------------------------------------------

type SimpleKind = 'id' | 'class' | 'attribute' | 'pseudo-class' | 'element' | 'pseudo-element';

interface ParsedSimple {
  kind: SimpleKind;
  text: string;
}

type Token = ParsedSimple | { kind: 'combinator' };

/**
 * Tokenize a single complex selector (no commas) into simple selectors and combinator
 * separators. Whitespace and combinator characters inside (), [] and functional
 * pseudo-classes are preserved as part of the compound. Tolerant: malformed input
 * yields `valid: false` but never throws.
 */
function tokenize(selector: string): { items: Token[]; valid: boolean } {
  const items: Token[] = [];
  let valid = true;
  const trimmed = selector.trim();
  if (!trimmed) return { items, valid: false };

  let chunk = '';
  let depth = 0;
  let pendingSpace = false;
  let pendingComb = false;
  let sawSimple = false;

  const flush = () => {
    const c = chunk.trim();
    chunk = '';
    pendingSpace = false;
    if (!c) return;
    if (c === '*') {
      // Universal selector contributes zero specificity.
      sawSimple = true;
      return;
    }
    if (c === ',' || /^[,]+$/.test(c)) {
      valid = false;
      return;
    }
    const compound = parseCompound(c);
    if (compound === null) {
      valid = false;
      return;
    }
    for (const s of compound) items.push(s);
    if (compound.length === 0) {
      valid = false;
    } else {
      sawSimple = true;
    }
  };

  let i = 0;
  while (i < trimmed.length) {
    const ch = trimmed[i] ?? '';
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    const atTop = depth === 0;
    if (atTop && (ch === '>' || ch === '+' || ch === '~')) {
      flush();
      pendingComb = true;
      pendingSpace = false;
      i++;
      continue;
    }
    if (atTop && /\s/.test(ch)) {
      if (chunk.trim()) {
        flush();
        pendingSpace = true;
      }
      i++;
      continue;
    }
    if (pendingComb) {
      items.push({ kind: 'combinator' });
      pendingComb = false;
    } else if (pendingSpace) {
      items.push({ kind: 'combinator' });
      pendingSpace = false;
    }
    chunk += ch;
    i++;
  }
  flush();
  if (!sawSimple) valid = false;
  return { items, valid };
}

/**
 * Parse a compound selector chunk (e.g. `#a.b:hover::before[hidden]`) into simples.
 * Returns null only when the chunk is fundamentally malformed.
 */
function parseCompound(chunk: string): ParsedSimple[] | null {
  const out: ParsedSimple[] = [];
  let i = 0;
  let typeSeen = false;
  while (i < chunk.length) {
    const ch = chunk[i] ?? '';
    if (ch === '#') {
      const name = /^#([\w-]+|\\.)/.exec(chunk.slice(i));
      if (!name) return null;
      out.push({ kind: 'id', text: chunk.slice(i, i + name[0].length) });
      i += name[0].length;
    } else if (ch === '.') {
      const name = /^\.([\w-\\]+)/.exec(chunk.slice(i));
      if (!name) return null;
      out.push({ kind: 'class', text: chunk.slice(i, i + name[0].length) });
      i += name[0].length;
    } else if (ch === '[') {
      const close = findClosing(chunk, i, '[', ']');
      if (close === -1) return null;
      out.push({ kind: 'attribute', text: chunk.slice(i, close + 1) });
      i = close + 1;
    } else if (ch === ':') {
      if (chunk[i + 1] === ':') {
        const name = /^(?:\*|[\w-]+)/.exec(chunk.slice(i + 2));
        if (!name) return null;
        let end = i + 2 + name[0].length;
        // Functional pseudo-element like ::slotted(...) remains in the element column.
        if (chunk[end] === '(') {
          const close = findClosing(chunk, end, '(', ')');
          if (close === -1) return null;
          end = close + 1;
        }
        out.push({ kind: 'pseudo-element', text: chunk.slice(i, end) });
        i = end;
      } else {
        const body = readPseudoClass(chunk, i);
        if (!body) return null;
        if (isFunctionalLogical(body.text)) {
          const nameMatch = /^:([\w-]+)\(/.exec(body.text);
          const fn = nameMatch?.[1] ?? '';
          const innerSel = body.text.slice(body.text.indexOf('(') + 1, -1);
          if (fn === 'where') {
            // :where() always contributes zero specificity.
          } else {
            // :is(), :not() and :has() take the most specific argument.
            const best = mostSpecificArgument(innerSel as string);
            if (best === null) return null;
            out.push(...best);
          }
        } else {
          out.push({ kind: 'pseudo-class', text: body.text });
        }
        i = body.end;
      }
    } else if (/[A-Za-z_*|]/.test(ch) && !typeSeen) {
      const name = /^(\*|-?[_A-Za-z][\w-]*|\|)/.exec(chunk.slice(i));
      if (!name) return null;
      typeSeen = true;
      out.push({ kind: 'element', text: name[0] });
      i += name[0].length;
    } else if (ch === '*') {
      // Universal selector after a type: skip silently, zero specificity.
      i += 1;
    } else {
      // Unknown character: tolerate by skipping it (never crash).
      i += 1;
    }
  }
  return out;
}

function findClosing(text: string, start: number, open: string, close: string): number {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Read a pseudo-class token starting at `start` (after a single colon). */
function readPseudoClass(chunk: string, start: number): { text: string; end: number } | null {
  const name = /^([\w-]+)/.exec(chunk.slice(start + 1));
  if (!name) return null;
  let end = start + 1 + name[0].length;
  if (chunk[end] === '(') {
    const close = findClosing(chunk, end, '(', ')');
    if (close === -1) return null;
    end = close + 1;
  }
  return { text: chunk.slice(start, end), end };
}

function isFunctionalLogical(text: string): boolean {
  const m = /^:([\w-]+)\(/.exec(text);
  if (!m) return false;
  return ['is', 'where', 'not', 'has'].includes(m[1] as string);
}

/** Split a selector list at top-level commas (respecting brackets/parens). */
export function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of input) {
    if (ch === '[' || ch === '(') depth++;
    else if (ch === ']' || ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts.map((p) => p.trim());
}

/**
 * Score a compound argument of :is()/:not()/:has() and return its simples,
 * or null when the argument is empty/malformed beyond repair.
 */
function mostSpecificArgument(innerSel: string): ParsedSimple[] | null {
  const args = splitTopLevel(innerSel).filter((a) => a.trim());
  if (args.length === 0) return null;
  let best: { simples: ParsedSimple[]; total: number } | null = null;
  for (const arg of args) {
    const { items, valid } = tokenize(arg);
    if (!valid) continue;
    let a = 0;
    let b = 0;
    let c = 0;
    const simples: ParsedSimple[] = [];
    for (const item of items) {
      if (item.kind === 'combinator') continue;
      const s = item as ParsedSimple;
      simples.push(s);
      if (s.kind === 'id') a++;
      else if (s.kind === 'class' || s.kind === 'attribute' || s.kind === 'pseudo-class') b++;
      else c++;
    }
    if (simples.length === 0) continue;
    const total = a * 10000 + b * 100 + c;
    if (best === null || total > best.total) best = { simples, total };
  }
  if (best === null) return null;
  return best.simples.map((s) => mapInnerSimple(s));
}

/**
 * Map simples from inside :is()/:not()/:has() into their counting kinds:
 * nested pseudo-elements count in the element column, everything class-like in b.
 */
function mapInnerSimple(s: ParsedSimple): ParsedSimple {
  if (s.kind === 'id' || s.kind === 'class' || s.kind === 'attribute' || s.kind === 'pseudo-class')
    return s;
  return s; // element / pseudo-element keep their kind
}

// ---------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------

/**
 * Score a single selector (complex, no commas) into an (a, b, c) tuple.
 * Malformed selectors are tolerated: they populate `error` but never throw.
 */
export function scoreSelector(raw: string): SelectorScore {
  const trimmedRaw = raw.trim();
  const important = /!\s*important\s*$/i.test(trimmedRaw);
  const body = trimmedRaw.replace(/\s*!\s*important\s*$/i, '').trim();
  const base: SelectorScore = {
    raw: trimmedRaw,
    error: null,
    tuple: { a: 0, b: 0, c: 0 },
    total: 0,
    important,
    breakdown: { ids: [], classes: [], elements: [] },
  };
  if (!body) {
    return { ...base, error: 'Empty selector' };
  }
  const { items, valid } = tokenize(body);
  let a = 0;
  let b = 0;
  let c = 0;
  const ids: string[] = [];
  const classes: string[] = [];
  const elements: string[] = [];
  for (const item of items) {
    if (item.kind === 'combinator') continue;
    const simple = item as ParsedSimple;
    if (simple.text === '*') continue;
    if (simple.kind === 'id') {
      a++;
      ids.push(simple.text);
    } else if (
      simple.kind === 'class' ||
      simple.kind === 'attribute' ||
      simple.kind === 'pseudo-class'
    ) {
      b++;
      classes.push(simple.text);
    } else {
      c++;
      elements.push(simple.text);
    }
  }
  const tuple: SpecificityTuple = { a, b, c };
  return {
    ...base,
    error: valid ? null : 'Malformed selector — best-effort scoring',
    tuple,
    total: toTotal(tuple),
    breakdown: { ids, classes, elements },
  };
}

function toTotal(t: SpecificityTuple): number {
  return t.a * 10000 + t.b * 100 + t.c;
}

/** Format a tuple like (1, 2, 0). */
export function formatTuple(t: SpecificityTuple): string {
  return `(${t.a}, ${t.b}, ${t.c})`;
}

/** Human-readable description of a tuple. */
export function tupleToLabel(t: SpecificityTuple): string {
  return `${t.a} IDs, ${t.b} classes/attrs/pseudo-classes, ${t.c} elements`;
}

/**
 * Score the full cascade: every selector in the comma-separated list, plus the optional
 * inline style attribute entry. Entries with !important rank above all others.
 */
export function scoreSelectorList(
  text: string,
  inlineStyleActive: boolean,
  inlineImportant: boolean
): ScoredEntry[] {
  const entries: ScoredEntry[] = [];
  const selectors = splitTopLevel(text);
  for (const s of selectors) {
    if (!s.trim()) continue;
    const score = scoreSelector(s);
    entries.push({ kind: 'selector', label: s, important: score.important, score });
  }
  if (inlineStyleActive) {
    entries.push({
      kind: 'inline',
      label: INLINE_STYLE_LABEL,
      important: inlineImportant,
      score: {
        raw: INLINE_STYLE_LABEL,
        error: null,
        tuple: { a: 1, b: 0, c: 0 },
        total: 10000,
        important: inlineImportant,
        breakdown: { ids: [], classes: [], elements: [] },
      },
    });
  }
  return entries.sort((x, y) => {
    if (x.important !== y.important) return x.important ? -1 : 1;
    return y.score.total - x.score.total;
  });
}

/** Winner of a cascade: important entries first, otherwise highest total. */
export function findWinner(entries: ScoredEntry[]): ScoredEntry | null {
  if (entries.length === 0) return null;
  const first = entries[0];
  return first ?? null;
}

/** Compare two selectors; flags which wins (returns 'tie' on equal specificity). */
export function compareSelectors(
  a: string,
  b: string
): { scoreA: SelectorScore; scoreB: SelectorScore; winner: 'a' | 'b' | 'tie' } {
  const scoreA = scoreSelector(a);
  const scoreB = scoreSelector(b);
  let winner: 'a' | 'b' | 'tie';
  if (scoreA.important !== scoreB.important) {
    winner = scoreA.important ? 'a' : 'b';
  } else {
    winner = scoreA.total === scoreB.total ? 'tie' : scoreA.total > scoreB.total ? 'a' : 'b';
  }
  return { scoreA, scoreB, winner };
}

/**
 * Cascade tie-breaking explanation: when two candidates have equal specificity, the one
 * appearing later in source order wins.
 */
export function tieBreakerNote(): string {
  return 'When specificity ties, the declaration that appears later in the stylesheet (or in a later-imported cascade layer) wins. Inline styles sit between !important rules and normal author rules.';
}

/** Copyable text summary of scored entries. */
export function copyEntriesAsText(entries: ScoredEntry[]): string {
  const lines: string[] = ['Selector specificity — (a, b, c) = (IDs, classes, elements)', ''];
  for (const e of entries) {
    const prefix = e.important ? '[!important] ' : '';
    lines.push(`${prefix}${e.label}`.padEnd(40) + formatTuple(e.score.tuple));
  }
  lines.push('', tieBreakerNote());
  return lines.join('\n');
}

/** Copyable markdown table of scored entries. */
export function copyEntriesAsMarkdown(entries: ScoredEntry[]): string {
  const lines = [
    '| Specificity | Selector | IDs | Classes | Elements |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const e of entries) {
    lines.push(
      `| \`${e.important ? '!important ' : ''}${formatTuple(e.score.tuple)}\` | \`${e.label.replace(/\|/g, '\\|')}\` | ${
        e.score.tuple.a
      } | ${e.score.tuple.b} | ${e.score.tuple.c} |`
    );
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------

export const cssSpecificityTool: Tool<ToolState> = {
  id: toolConfig.id,
  name: toolConfig.name,
  version: toolConfig.version,
  config: toolConfig,
  initialState: { ...DEFAULT_STATE },
  serialize: (state) => JSON.stringify(state),
  deserialize: (data): DeserializeResult<ToolState> => {
    if (typeof data !== 'object' || data === null) {
      return {
        success: false,
        error: 'Invalid data format: expected { selectorsText: string, ... }',
      };
    }
    const v = data as Partial<ToolState>;
    const selectorsText =
      typeof v.selectorsText === 'string' ? v.selectorsText : DEFAULT_STATE.selectorsText;
    return {
      success: true,
      data: {
        selectorsText,
        inlineStyleActive:
          typeof v.inlineStyleActive === 'boolean'
            ? v.inlineStyleActive
            : DEFAULT_STATE.inlineStyleActive,
        inlineImportant:
          typeof v.inlineImportant === 'boolean'
            ? v.inlineImportant
            : DEFAULT_STATE.inlineImportant,
        compareMode: typeof v.compareMode === 'boolean' ? v.compareMode : DEFAULT_STATE.compareMode,
        compareA: typeof v.compareA === 'string' ? v.compareA : DEFAULT_STATE.compareA,
        compareB: typeof v.compareB === 'string' ? v.compareB : DEFAULT_STATE.compareB,
      },
    };
  },
  exporters: [
    { format: 'png', loader: () => import('./exporters/png') },
    { format: 'jpeg', loader: () => import('./exporters/jpeg') },
    { format: 'webp', loader: () => import('./exporters/webp') },
    { format: 'pdf', loader: () => import('./exporters/pdf') },
  ],
};
