import type { ToolConfig, ToolTheme } from '@itsjust/core';

const toolTheme: ToolTheme = {
  brand: 'CSS Specificity Calculator',
  accent: '#6366f1',
};

export const toolConfig: ToolConfig = {
  id: '1795239399',
  name: 'CSS Specificity Calculator',
  description:
    'Calculate CSS selector specificity scores across comma-separated selectors, visualize which rule wins the cascade, and compare two selectors side by side.',
  version: '1.0.0',
  exportFormats: ['png', 'jpeg', 'webp', 'pdf'],
  features: {
    export: true,
    autoSave: true,
    undoRedo: true,
    sidebar: true,
    statusBar: true,
    darkMode: true,
  },
  theme: toolTheme,
};

export default toolConfig;
