import { useEffect } from 'react';
import { useDocumentTitle } from '../../components/ui.tsx';

/**
 * Sets the document title for a storefront page. StoreLayout refreshes the storefront install
 * metadata (including the title) in its own effect, which runs after this page's effects on the
 * very first render; a microtask lets the page title win that race.
 */
export function usePageTitle(title: string): void {
  useDocumentTitle(title);
  useEffect(() => {
    queueMicrotask(() => {
      document.title = title;
    });
  }, [title]);
}
