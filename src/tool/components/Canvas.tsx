'use client';

import { useCallback, useMemo } from 'react';
import {
  compareSelectors,
  formatTuple,
  scoreSelectorList,
  tieBreakerNote,
} from '../tool-definition';
import type { ScoredEntry, ToolState } from '../types';

interface CanvasProps {
  state: ToolState;
  onChange: (state: ToolState) => void;
}

const COL_A = 'IDs (a)';
const COL_B = 'Classes / attrs / pseudo-classes (b)';
const COL_C = 'Elements / pseudo-elements (c)';

export const Canvas: React.FC<CanvasProps> = ({ state, onChange }) => {
  const entries = useMemo(
    () => scoreSelectorList(state.selectorsText, state.inlineStyleActive, state.inlineImportant),
    [state.selectorsText, state.inlineStyleActive, state.inlineImportant]
  );
  const winner = entries[0] ?? null;

  const comparison = useMemo(
    () => (state.compareMode ? compareSelectors(state.compareA, state.compareB) : null),
    [state.compareMode, state.compareA, state.compareB]
  );

  const update = (patch: Partial<ToolState>) => onChange({ ...state, ...patch });

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard unavailable */
    }
  }, []);

  const copyText = useCallback(
    () =>
      copy(
        entries
          .map(
            (e) => `${e.important ? '!important ' : ''}${e.label} → ${formatTuple(e.score.tuple)}`
          )
          .join('\n')
      ),
    [copy, entries]
  );

  const copyMarkdown = useCallback(
    () =>
      copy(
        [
          '| Specificity | Selector | a | b | c |',
          '| --- | --- | --- | --- | --- |',
          ...entries.map(
            (e) =>
              `| \`${e.important ? '!important ' : ''}${formatTuple(e.score.tuple)}\` | \`${e.label.replace(/\|/g, '\\|')}\` | ${e.score.tuple.a} | ${e.score.tuple.b} | ${e.score.tuple.c} |`
          ),
        ].join('\n')
      ),
    [copy, entries]
  );

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full" data-testid="specificity-canvas">
      <div className="flex flex-col gap-2">
        <label
          htmlFor="selectors-input"
          className="text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300"
        >
          Selectors (comma-separated, scored individually)
        </label>
        <textarea
          id="selectors-input"
          value={state.selectorsText}
          onChange={(e) => update({ selectorsText: e.target.value })}
          placeholder="#main .card:hover, ul li a.nav-link:focus-visible, …"
          rows={4}
          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 font-mono text-sm text-gray-900 dark:text-gray-100"
        />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-xs font-medium text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={state.inlineStyleActive}
            onChange={(e) => update({ inlineStyleActive: e.target.checked })}
          />
          Inline <code>style=&quot;…&quot;</code> participates
        </label>
        <label className="flex items-center gap-2 text-xs font-medium text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={state.inlineImportant}
            onChange={(e) => update({ inlineImportant: e.target.checked })}
            disabled={!state.inlineStyleActive}
          />
          Inline has <code>!important</code>
        </label>
        <label className="flex items-center gap-2 text-xs font-medium text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={state.compareMode}
            onChange={(e) => update({ compareMode: e.target.checked })}
          />
          Compare mode
        </label>
      </div>

      {/* Ranking table */}
      <div className="rounded-md border border-gray-200 dark:border-gray-800 overflow-x-auto">
        <table className="w-full text-sm" data-testid="ranking-table">
          <thead>
            <tr className="text-left text-xs text-gray-500 dark:text-gray-400">
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Selector</th>
              <th className="px-3 py-2">{COL_A}</th>
              <th className="px-3 py-2">{COL_B}</th>
              <th className="px-3 py-2">{COL_C}</th>
              <th className="px-3 py-2">Score</th>
              <th className="px-3 py-2">Why it wins</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td className="px-3 py-3 text-gray-500" colSpan={7}>
                  Enter one or more selectors above to compute specificity.
                </td>
              </tr>
            )}
            {entries.map((entry: ScoredEntry, index) => (
              <tr
                key={`${entry.label}-${index}`}
                className={`border-t border-gray-100 dark:border-gray-800 ${
                  winner === entry ? 'bg-emerald-50 dark:bg-emerald-900/30 font-medium' : ''
                }`}
              >
                <td className="px-3 py-2 text-gray-500">{index + 1}</td>
                <td className="px-3 py-2 font-mono break-all max-w-xs">
                  {entry.important && (
                    <span className="mr-1 text-red-600 dark:text-red-400">!important</span>
                  )}
                  {entry.label}
                  {entry.score.error && (
                    <span role="alert" className="ml-2 text-xs text-amber-600 dark:text-amber-400">
                      ⚠ {entry.score.error}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">{entry.score.tuple.a}</td>
                <td className="px-3 py-2">{entry.score.tuple.b}</td>
                <td className="px-3 py-2">{entry.score.tuple.c}</td>
                <td className="px-3 py-2 font-mono">{formatTuple(entry.score.tuple)}</td>
                <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-400">
                  {winner === entry
                    ? entry.important
                      ? '!important flag'
                      : 'Highest specificity'
                    : entry.important
                      ? '!important, but outranked'
                      : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copyText}
          className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          Copy as text
        </button>
        <button
          type="button"
          onClick={copyMarkdown}
          className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          Copy as markdown table
        </button>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400">{tieBreakerNote()}</p>

      {comparison && (
        <div className="space-y-2" data-testid="compare-section">
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Side-by-side comparison
          </h3>
          <input
            aria-label="Comparison selector A"
            value={state.compareA}
            onChange={(e) => update({ compareA: e.target.value })}
            placeholder="Selector A"
            className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 font-mono text-sm text-gray-900 dark:text-gray-100"
          />
          <input
            aria-label="Comparison selector B"
            value={state.compareB}
            onChange={(e) => update({ compareB: e.target.value })}
            placeholder="Selector B"
            className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 font-mono text-sm text-gray-900 dark:text-gray-100"
          />
          <div className="grid gap-2 sm:grid-cols-2">
            {(['a', 'b'] as const).map((which) => {
              const isWinner = comparison.winner === which;
              const score = which === 'a' ? comparison.scoreA : comparison.scoreB;
              return (
                <div
                  key={which}
                  className={`rounded-md border px-3 py-2 ${
                    isWinner
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30'
                      : 'border-gray-200 dark:border-gray-800'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase text-gray-500">
                      Selector {which.toUpperCase()}
                    </span>
                    {isWinner && (
                      <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                        ★ Winner
                      </span>
                    )}
                    {comparison.winner === 'tie' && (
                      <span className="text-xs text-gray-500">Tie — source order decides</span>
                    )}
                  </div>
                  <code className="block break-all font-mono text-xs text-gray-900 dark:text-gray-100">
                    {score.raw || '(empty)'}
                  </code>
                  <div className="mt-1 font-mono text-sm">
                    {formatTuple(score.tuple)} — total {score.total.toLocaleString()}
                  </div>
                  {score.error && (
                    <p role="alert" className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                      ⚠ {score.error}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
