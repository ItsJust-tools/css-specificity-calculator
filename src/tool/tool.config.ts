import type { ToolConfig } from '@itsjust/core';

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
  theme: {
    accent: '#6366f1',
    accentHover: '#4f46e5',
    accentSubtle: 'rgba(99, 102, 241, 0.08)',
    brand: 'CSS Specificity Calculator',
    icon: '\u{1F3AF}',
  },
};

export default toolConfig;
