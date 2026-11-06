'use client';

import { useEffect } from 'react';

/** Opens the browser print dialog when the receipt is loaded with ?print=1. */
export function AutoPrint() {
  useEffect(() => {
    const timer = setTimeout(() => window.print(), 350);
    return () => clearTimeout(timer);
  }, []);
  return null;
}
