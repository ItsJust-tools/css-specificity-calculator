import { describe, it, expect } from 'vitest';
import {
  cssSpecificityTool,
  scoreSelector,
  scoreSelectorList,
  compareSelectors,
  findWinner,
  formatTuple,
  splitTopLevel,
  copyEntriesAsText,
  copyEntriesAsMarkdown,
} from '../../src/tool/tool-definition';
import { DEFAULT_STATE, INLINE_STYLE_LABEL, type ToolState } from '../../src/tool/types';

const state = (patch: Partial<ToolState> = {}): ToolState => ({ ...DEFAULT_STATE, ...patch });

describe('scoreSelector', () => {
  it('scores basic selectors', () => {
    expect(scoreSelector('div').tuple).toEqual({ a: 0, b: 0, c: 1 });
    expect(scoreSelector('.card').tuple).toEqual({ a: 0, b: 1, c: 0 });
    expect(scoreSelector('#main').tuple).toEqual({ a: 1, b: 0, c: 0 });
    expect(scoreSelector('*').tuple).toEqual({ a: 0, b: 0, c: 0 });
  });

  it('scores !important and strips the flag from the selector body', () => {
    const s = scoreSelector('#app .list li::after!important');
    expect(s.important).toBe(true);
    expect(s.tuple).toEqual({ a: 1, b: 1, c: 2 });
    expect(s.raw).toContain('!important');
    const spaced = scoreSelector('div !important');
    expect(spaced.important).toBe(true);
    expect(spaced.tuple).toEqual({ a: 0, b: 0, c: 1 });
    const noFlag = scoreSelector('#a .b');
    expect(noFlag.important).toBe(false);
  });

  it('classifies pseudo-classes into the class column and pseudo-elements into the element column', () => {
    expect(scoreSelector('a:hover').tuple).toEqual({ a: 0, b: 1, c: 1 });
    expect(scoreSelector('li::marker').tuple).toEqual({ a: 0, b: 0, c: 2 });
    expect(scoreSelector('input:focus-visible').tuple).toEqual({ a: 0, b: 1, c: 1 });
  });

  it('treats attributes as class column', () => {
    expect(scoreSelector('a[href^="https"]').tuple).toEqual({ a: 0, b: 1, c: 1 });
    expect(scoreSelector('[hidden]').tuple).toEqual({ a: 0, b: 1, c: 0 });
  });

  it('scores combinators as zero contribution', () => {
    expect(scoreSelector('div > p + span ~ a').tuple).toEqual({ a: 0, b: 0, c: 4 });
  });

  it('handles :is()/:where()/:not()/:has() per spec', () => {
    expect(scoreSelector(':is(#a, .b)').tuple).toEqual({ a: 1, b: 0, c: 0 });
    expect(scoreSelector(':is(.one, .two.three)').tuple).toEqual({ a: 0, b: 2, c: 0 });
    expect(scoreSelector(':where(#a, .b)').tuple).toEqual({ a: 0, b: 0, c: 0 });
    expect(scoreSelector(':not(#x) div').tuple).toEqual({ a: 1, b: 0, c: 1 });
    expect(scoreSelector('a:has(> .card)').tuple).toEqual({ a: 0, b: 1, c: 1 }); // :has() yields its most specific argument; the leading combinator is free
    expect(scoreSelector('a:has(.card)').tuple).toEqual({ a: 0, b: 1, c: 1 });
    expect(scoreSelector('a:has(> *)').tuple).toEqual({ a: 0, b: 0, c: 0 }); // universal argument contributes zero
  });

  it('tolerates malformed selectors without throwing and flags the error', () => {
    const malformed = ['####', '.!', '[', '#', ':::', 'div >', '#a..b'];
    for (const m of malformed) {
      const s = scoreSelector(m);
      expect(() => s).not.toThrow();
    }
    expect(scoreSelector('####').error).not.toBeNull();
    expect(scoreSelector('[hidden').error).not.toBeNull();
    expect(scoreSelector('####').total).toBeGreaterThanOrEqual(0);
  });

  it('handles empty selector with an error and zero tuple', () => {
    const s = scoreSelector('   ');
    expect(s.error).not.toBeNull();
    expect(s.tuple).toEqual({ a: 0, b: 0, c: 0 });
  });
});

describe('splitTopLevel', () => {
  it('splits on top-level commas and respects brackets', () => {
    expect(splitTopLevel('#a, .b, div')).toEqual(['#a', '.b', 'div']);
    expect(splitTopLevel('a[href="x,y"], .b')).toEqual(['a[href="x,y"]', '.b']);
    expect(splitTopLevel(':is(a, b), .c')).toEqual([':is(a, b)', '.c']);
    expect(splitTopLevel('  single  ')).toEqual(['single']);
    expect(splitTopLevel('')).toEqual(['']);
  });
});

describe('scoreSelectorList and inline styles', () => {
  it('scores each selector in a comma list individually', () => {
    const entries = scoreSelectorList('#a, .b .c, div', false, false);
    expect(entries).toHaveLength(3);
    expect(entries[0]?.score.tuple).toEqual({ a: 1, b: 0, c: 0 });
    expect(entries[1]?.score.tuple).toEqual({ a: 0, b: 2, c: 0 });
    expect(entries[2]?.score.tuple).toEqual({ a: 0, b: 0, c: 1 });
    expect(entries.every((e) => e.kind === 'selector')).toBe(true);
  });

  it('adds the inline style entry when active, scored as (1,0,0)', () => {
    const entries = scoreSelectorList('#a, .b', true, false);
    expect(entries.some((e) => e.kind === 'inline')).toBe(true);
    const inline = entries.find((e) => e.kind === 'inline');
    expect(inline?.score.tuple).toEqual({ a: 1, b: 0, c: 0 });
    expect(inline?.label).toBe(INLINE_STYLE_LABEL);
  });

  it('ranks inline styles above normal selectors of lower specificity', () => {
    const entries = scoreSelectorList('div span a', true, false);
    expect(entries[0]?.kind).toBe('inline');
    const without = scoreSelectorList('#huge #ids .and .classes', true, false);
    expect(without[0]?.kind).toBe('selector');
  });

  it('handles !important: important author rules beat non-important inline', () => {
    const entries = scoreSelectorList('div!important', true, false);
    expect(entries[0]?.kind).toBe('selector');
    expect(entries[0]?.important).toBe(true);
  });

  it('important inline beats important stylesheet declarations', () => {
    const entries = scoreSelectorList('div!important', true, true);
    expect(entries[0]?.kind).toBe('inline');
    expect(entries[0]?.important).toBe(true);
  });

  it('ignores empty list items but keeps malformed selectors with errors', () => {
    const entries = scoreSelectorList('#a,, .b, ,', false, false);
    expect(entries).toHaveLength(2);
  });
});

describe('findWinner', () => {
  it('returns null for an empty list', () => {
    expect(findWinner([])).toBeNull();
  });
  it('returns the top-ranked entry', () => {
    const entries = scoreSelectorList('#a, .b', false, false);
    expect(findWinner(entries)?.label).toBe('#a');
  });
});

describe('compareSelectors', () => {
  it('flags the winning selector correctly', () => {
    expect(compareSelectors('#a', '.b').winner).toBe('a');
    expect(compareSelectors('.b', '#a').winner).toBe('b');
    expect(compareSelectors('.a.b.c', 'div p span').winner).toBe('a');
  });

  it('returns tie for equal specificity', () => {
    expect(compareSelectors('.a', '.b').winner).toBe('tie');
    expect(compareSelectors('div', 'span').winner).toBe('tie');
  });

  it('important beats non-important regardless of specificity', () => {
    expect(compareSelectors('div!important', '#a #b #c').winner).toBe('a');
    expect(compareSelectors('#a #b #c', 'div!important').winner).toBe('b');
  });

  it('survives malformed inputs without throwing', () => {
    const result = compareSelectors('####', '**(((');
    expect(result.winner).toBeDefined();
  });
});

describe('formatTuple and copy helpers', () => {
  it('formats tuples', () => {
    expect(formatTuple({ a: 1, b: 2, c: 3 })).toBe('(1, 2, 3)');
    expect(formatTuple({ a: 0, b: 0, c: 0 })).toBe('(0, 0, 0)');
  });

  it('copy helpers produce readable output with all entries', () => {
    const entries = scoreSelectorList('#a, .b!important', true, true);
    const text = copyEntriesAsText(entries);
    expect(text).toContain('#a');
    expect(text).toContain('!important');
    const md = copyEntriesAsMarkdown(entries);
    expect(md.startsWith('| Specificity |')).toBe(true);
    expect(md).toContain('| `!important (0, 1, 0)` |');
    expect(md).toContain('| `(1, 0, 0)` |');
  });
});

describe('cssSpecificityTool serialize/deserialize', () => {
  it('round-trips state through serialize/deserialize', () => {
    const s = state({ selectorsText: '#x, .y', compareMode: true, compareA: '#x', compareB: '.y' });
    const json = cssSpecificityTool.serialize(s);
    const back = cssSpecificityTool.deserialize(JSON.parse(json));
    expect(back.success).toBe(true);
    if (back.success) {
      expect(back.data).toEqual(s);
    }
  });

  it('deserializes valid partial data with defaults', () => {
    const result = cssSpecificityTool.deserialize({ selectorsText: '.only' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.selectorsText).toBe('.only');
      expect(result.data.inlineStyleActive).toBe(false);
      expect(result.data.compareMode).toBe(false);
    }
  });

  it('rejects non-object data', () => {
    expect(cssSpecificityTool.deserialize(null as unknown as object).success).toBe(false);
    expect(cssSpecificityTool.deserialize('x' as unknown as object).success).toBe(false);
    expect(cssSpecificityTool.deserialize(42 as unknown as object).success).toBe(false);
  });

  it('falls back to defaults for wrong-typed fields instead of crashing', () => {
    const result = cssSpecificityTool.deserialize({
      selectorsText: 7,
      inlineStyleActive: 'yes',
      compareA: null,
    } as unknown);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.selectorsText).toBe(DEFAULT_STATE.selectorsText);
      expect(result.data.inlineStyleActive).toBe(false);
      expect(result.data.compareA).toBe(DEFAULT_STATE.compareA);
    }
  });

  it('has the expected id and exporters', () => {
    expect(cssSpecificityTool.id).toBe('1795239399');
    expect((cssSpecificityTool.exporters ?? []).map((e) => e.format)).toEqual([
      'png',
      'jpeg',
      'webp',
      'pdf',
    ]);
  });
});
