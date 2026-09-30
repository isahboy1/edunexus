"use client";

/**
 * Print button for the registration forms page — triggers the browser print
 * dialog for the whole page (each form renders its own print-friendly block).
 */
export function PrintButton({
  label = "Print",
  disabled = false,
  className = "btn-primary btn-sm",
}: {
  label?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      onClick={() => window.print()}
    >
      {label}
    </button>
  );
}
