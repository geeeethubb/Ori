/** Mounts the discovery/evolution routers. Kept separate so server/index.ts stays stable. */
import type { Hono } from 'hono';
import { agentRoutes } from './agent.ts';
import { contextRoutes } from './context.ts';
import { mediaRoutes } from './media.ts';
import { recommendationRoutes } from './recommendations.ts';
import { revisionRoutes } from './revisions.ts';

export function mountExtraRoutes(app: Hono): void {
  app.route('/api/context', contextRoutes);
  app.route('/api/recommendations', recommendationRoutes);
  app.route('/api/agent', agentRoutes);
  app.route('/api/media', mediaRoutes);
  // Revision preview/suggestion/feedback share the /api/apps prefix with the core app routes.
  app.route('/api/apps', revisionRoutes);
}
