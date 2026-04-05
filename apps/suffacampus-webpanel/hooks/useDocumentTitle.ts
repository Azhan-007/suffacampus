import { useEffect } from 'react';

/**
 * Sets `document.title` for the current page.
 * Restores the base title on unmount so navigation back shows the app name.
 */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    const prev = document.title;
    document.title = `${title} Â· SuffaCampus`;
    return () => { document.title = prev; };
  }, [title]);
}

