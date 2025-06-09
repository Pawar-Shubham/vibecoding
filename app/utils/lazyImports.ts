import { lazy } from 'react';

// Lazy load heavy components
export const CodeEditor = lazy(() => import('../components/CodeEditor'));
export const MarkdownViewer = lazy(() => import('../components/MarkdownViewer'));
export const ChartComponent = lazy(() => import('../components/ChartComponent'));
export const Terminal = lazy(() => import('../components/Terminal')); 