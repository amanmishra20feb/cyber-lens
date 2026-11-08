import { useEffect } from 'react';

// sets the tab title, e.g. "Settings · Cyberlens"
export function PageTitle({ children }) {
  useEffect(() => {
    document.title = `${children} · Cyberlens`;
    return () => { document.title = 'Cyberlens'; };
  }, [children]);
  return null;
}
