/** CSS specificity tuple: a = IDs, b = classes/attributes/pseudo-classes, c = elements/pseudo-elements. */
export interface SpecificityTuple {
  a: number;
  b: number;
  c: number;
}

/** Result of scoring one selector string; malformed selectors carry an error but never throw. */
export interface SelectorScore {
  /** The selector exactly as entered. */
  raw: string;
  error: string | null;
  tuple: SpecificityTuple;
  /** Single comparable number: a * 10000 + b * 100 + c. */
  total: number;
  /** True when the input contained an explicit `!important` flag. */
  important: boolean;
  breakdown: {
    ids: string[];
    classes: string[];
    elements: string[];
  };
}

export type EntryKind = 'selector' | 'inline';

/** A cascade candidate: either a scored selector or the inline style attribute. */
export interface ScoredEntry {
  kind: EntryKind;
  label: string;
  important: boolean;
  score: SelectorScore;
}

export interface ToolState {
  /** Comma-separated selector list; each selector is scored individually. */
  selectorsText: string;
  /** Whether an inline `style="…"` attribute participates in the cascade. */
  inlineStyleActive: boolean;
  /** Whether the inline style carries `!important` declarations. */
  inlineImportant: boolean;
  /** Side-by-side comparison mode for exactly two selectors. */
  compareMode: boolean;
  /** First selector in comparison mode. */
  compareA: string;
  /** Second selector in comparison mode. */
  compareB: string;
}

export const DEFAULT_STATE: ToolState = {
  selectorsText:
    '#main .card:hover, ul li a.nav-link:focus-visible, header[role="banner"] h1::first-line, section :is(#a .b, .c .d .e), .x > * + .y::before!important',
  inlineStyleActive: false,
  inlineImportant: false,
  compareMode: false,
  compareA: '#header .nav-item.active',
  compareB: 'div#header ul li a.nav-item:hover::after',
};

export const INLINE_STYLE_LABEL = 'style="…" (inline)';
