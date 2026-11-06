import { useEffect } from 'react';

// Sets the browser tab / history title for a screen ("Settings · Cyberlens"); screen readers announce it on navigation.
export function PageTitle({ children }) {
  useEffect(() => {
    document.title = `${children} · Cyberlens`;
    return () => { document.title = 'Cyberlens'; };
  }, [children]);
  return null;
}
