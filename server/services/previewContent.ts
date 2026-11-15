/**
 * Example records for previewing an app before it exists. The module lives in shared/previewContent.ts
 * (pure, no server-only imports) so the Make page can read the same domain and labels without the
 * client importing from server/ (review finding 12). Server code keeps importing it from here.
 */
export * from '../../shared/previewContent.ts';
