'use client';

import React from 'react';
import type { ToolState } from '../types';

interface SidebarProps {
  state: ToolState;
  onChange: (state: ToolState) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ state, onChange }) => {
  const update = (patch: Partial<ToolState>) => onChange({ ...state, ...patch });

  return (
    <div className="p-4 space-y-6 text-sm overflow-y-auto h-full" data-testid="specificity-sidebar">
      <div>
        <h3 className="mb-2 font-medium text-gray-900 dark:text-gray-100">
          Inline style attribute
        </h3>
        <label className="flex items-center justify-between gap-2 text-xs">
          <span className="font-medium text-gray-700 dark:text-gray-300">
            Inline <code>style=&quot;…&quot;</code> participates
          </span>
          <input
            type="checkbox"
            checked={state.inlineStyleActive}
            onChange={(e) => update({ inlineStyleActive: e.target.checked })}
          />
        </label>
        <label className="mt-2 flex items-center justify-between gap-2 text-xs">
          <span className="font-medium text-gray-700 dark:text-gray-300">
            Inline has <code>!important</code>
          </span>
          <input
            type="checkbox"
            checked={state.inlineImportant}
            onChange={(e) => update({ inlineImportant: e.target.checked })}
            disabled={!state.inlineStyleActive}
          />
        </label>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Inline styles score as (1, 0, 0) and beat any normal author rule, but
          <code className="mx-1">!important</code> author declarations beat non-important inline
          declarations; important inline beats important stylesheet rules.
        </p>
      </div>

      <div>
        <h3 className="mb-2 font-medium text-gray-900 dark:text-gray-100">Comparison mode</h3>
        <label className="flex items-center justify-between gap-2 text-xs">
          <span className="font-medium text-gray-700 dark:text-gray-300">
            Two selectors side by side
          </span>
          <input
            type="checkbox"
            checked={state.compareMode}
            onChange={(e) => update({ compareMode: e.target.checked })}
          />
        </label>
      </div>

      <div>
        <h3 className="mb-2 font-medium text-gray-900 dark:text-gray-100">How scoring works</h3>
        <ul className="list-disc space-y-1 pl-4 text-xs text-gray-600 dark:text-gray-400">
          <li>
            (a) IDs — <code>#id</code>
          </li>
          <li>
            (b) Classes, attributes, pseudo-classes — <code>.cls</code>, <code>[attr]</code>,{' '}
            <code>:hover</code>
          </li>
          <li>
            (c) Elements and pseudo-elements — <code>div</code>, <code>::before</code>
          </li>
          <li>
            Universal <code>*</code>, combinators and <code>:where()</code> count zero.
          </li>
          <li>
            <code>:is()</code>, <code>:not()</code> and <code>:has()</code> take the specificity of
            their most specific argument.
          </li>
        </ul>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        Malformed selectors are flagged inline rather than breaking the tool.
      </p>
    </div>
  );
};
