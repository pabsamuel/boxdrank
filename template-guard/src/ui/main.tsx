import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'monday-ui-react-core/dist/main.css';
import { BoardView } from './BoardView.js';
import { DashboardWidget } from './DashboardWidget.js';

/**
 * One bundle, two surfaces. monday loads the same URL for both the board view
 * and the dashboard widget; `?surface=` picks which one mounts.
 */
const surface = new URLSearchParams(window.location.search).get('surface');
const root = document.getElementById('root');

if (root) {
  createRoot(root).render(
    <StrictMode>{surface === 'widget' ? <DashboardWidget /> : <BoardView />}</StrictMode>,
  );
}
