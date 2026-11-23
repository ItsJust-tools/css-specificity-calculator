'use client';

import { Canvas } from '../components/Canvas';
import type { ToolState } from '../types';

interface ToolSidebarProps {
  state?: ToolState;
  onStateChange?: (updater: (prev: ToolState) => ToolState) => void;
  fontSize?: number;
  onFontSizeChange?: (delta: number) => void;
}

export function ToolSidebar({ state, onStateChange, onFontSizeChange }: ToolSidebarProps) {
  if (!state) {
    return <div className="tool-sidebar" data-testid="tool-sidebar-empty" />;
  }
  return <Canvas state={state} onChange={(next: ToolState) => onStateChange?.(() => next)} />;
}
