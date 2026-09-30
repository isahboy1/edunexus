"use client";

import { useEffect } from "react";

/** Screen-only button that opens the browser print dialog. */
export function PrintReceiptButton() {
  return (
    <button type="button" className="btn-primary" onClick={() => window.print()}>
      Print receipt
    </button>
  );
}

/** Opens the print dialog shortly after mount (for ?autoprint=1). */
export function AutoPrintReceipt() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, []);
  return null;
}
