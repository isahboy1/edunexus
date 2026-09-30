"use client";

import { useEffect } from "react";

/** Screen-only button that opens the browser print dialog. */
export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button type="button" className="btn-primary btn-sm" onClick={() => window.print()}>
      {label}
    </button>
  );
}

/** Opens the print dialog shortly after mount (for ?autoprint=1). */
export function AutoPrint() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, []);
  return null;
}
