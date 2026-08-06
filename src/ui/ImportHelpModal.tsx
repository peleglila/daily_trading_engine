import React, { useEffect, useId, useRef, useState } from 'react';
import { HelpCircle, X } from 'lucide-react';

export function ImportHelpModal() {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--line)] bg-white/80 text-[var(--ink-mute)] hover:border-[var(--copper)] hover:text-[var(--copper)]"
        title="How to import from IBKR"
        aria-label="How to import from IBKR"
      >
        <HelpCircle className="h-4 w-4" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-[var(--ink)]/35 p-4 pt-[12vh]"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="panel w-full max-w-md p-0 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
              <h2 id={titleId} className="font-display text-lg text-[var(--ink)]">
                Import from IBKR
              </h2>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-[var(--ink-mute)] hover:bg-[var(--paper-deep)] hover:text-[var(--ink)]"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="space-y-4 px-4 py-4 text-sm text-[var(--ink)] leading-relaxed">
              <section>
                <h3 className="font-display text-base mb-1">Best: Flex CSV</h3>
                <ol className="list-decimal pl-4 space-y-1 text-[13px] text-[var(--ink)]">
                  <li>
                    IBKR Account Management → <strong>Reports → Flex Queries</strong>
                  </li>
                  <li>
                    Create an <strong>Activity Flex Query</strong> with{' '}
                    <strong>Open Positions</strong>
                  </li>
                  <li>
                    Sections: <strong>Open Positions</strong> + optional{' '}
                    <strong>TotalRealizedPnl</strong>
                  </li>
                  <li>
                    Columns: <strong>Symbol, Quantity, CostBasisPrice, MarkPrice, FifoPnlUnrealized</strong>
                  </li>
                  <li>
                    Delivery format: <strong>CSV</strong> → run → download → upload here
                  </li>
                </ol>
                <p className="mt-2 text-[12px] text-[var(--ink-mute)]">
                  Your current Flex file works. Set <strong>Net Liq</strong>, <strong>Base</strong>, and{' '}
                  <strong>ATH</strong> in the app (not in Flex). Stops stay manual.
                </p>
              </section>

              <section>
                <h3 className="font-display text-base mb-1">Backup: OCR screenshot</h3>
                <ol className="list-decimal pl-4 space-y-1 text-[13px]">
                  <li>IBKR mobile → <strong>Portfolio</strong> (not Watchlist)</li>
                  <li>Show Net Liq + all open positions on one screen</li>
                  <li>Bright, sharp PNG/JPG — upload via the same button</li>
                </ol>
                <p className="mt-2 text-[12px] text-[var(--ink-mute)]">
                  Verify qty and Net Liq after OCR; it can miss tickers or minus signs.
                </p>
              </section>
            </div>

            <footer className="border-t border-[var(--line)] px-4 py-3">
              <button type="button" className="btn-primary w-full" onClick={() => setOpen(false)}>
                Got it
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
