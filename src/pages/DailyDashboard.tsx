import React, { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { RefreshCw, Save, Upload, Camera, Download } from 'lucide-react';
import { HeatRail } from '../ui/HeatRail';
import { PositionsTable } from '../ui/PositionsTable';
import { SoftPreFlight } from '../ui/SoftPreFlight';
import { WatchlistPanel } from '../ui/WatchlistPanel';
import { RichTextEditor } from '../ui/RichTextEditor';
import { TvChartPanel } from '../ui/TvChartPanel';
import { PnLChart } from '../ui/PnLChart';
import { ImportHelpModal } from '../ui/ImportHelpModal';
import { parseFlexOrCsv } from '../engine/flexCsvParser';
import { fetchQuotes } from '../engine/quoteService';
import { fetchFlexStatement } from '../api/client';
import { computeDayMetrics, raisePeakIfNeeded, recomputeBook } from '../engine/bookMetrics';
import { DraftNumberInput } from '../ui/DraftNumberInput';
import { parseIbkrPortfolioText } from '../engine/ibkrOcrParser';
import { createWorker } from 'tesseract.js';
import type { BookPosition, DailyBook, DayPlan, WatchlistItem } from '../types/dayBook';

const MARK_POLL_MS = 5 * 60 * 1000;

type Props = {
  date: string;
  book: DailyBook;
  plan: DayPlan;
  equitySeries: { date: string; equity: number }[];
  cloudEnabled: boolean;
  saving: boolean;
  /** Bumps when the day is loaded so marks refresh on entry and reload. */
  reloadTick: number;
  onBookChange: Dispatch<SetStateAction<DailyBook>>;
  onPlanChange: (plan: DayPlan) => void;
  onSaveDay: () => void;
  onUploadSnapshot: (context: string, blob: Blob) => Promise<void>;
};

export function DailyDashboard({
  date,
  book,
  plan,
  equitySeries,
  cloudEnabled,
  saving,
  reloadTick,
  onBookChange,
  onPlanChange,
  onSaveDay,
  onUploadSnapshot,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [chartTicker, setChartTicker] = useState('SPY');
  /** equal | spy | qqq — expand one market chart, shrink the other */
  const [marketFocus, setMarketFocus] = useState<'equal' | 'spy' | 'qqq'>('equal');
  const [status, setStatus] = useState('');
  const [marksNote, setMarksNote] = useState('');
  const [ocrBusy, setOcrBusy] = useState(false);
  const [flexBusy, setFlexBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const bookRef = useRef(book);
  bookRef.current = book;

  const metrics = useMemo(() => computeDayMetrics(book), [book]);
  const dayPL = (Number(book.realizedPL) || 0) + (Number(book.unrealizedPL) || 0);

  const setPositions = (positions: BookPosition[]) => {
    onBookChange(recomputeBook({ ...book, positions }));
  };

  const applyParsedBook = (partial: Partial<DailyBook>, notes: string[]) => {
    const incoming = partial.positions || [];
    const positions = incoming.length
      ? incoming.map((next) => {
          const prev = book.positions.find((p) => p.ticker.toUpperCase() === next.ticker.toUpperCase());
          if (prev?.manualStop == null) return next;
          return { ...next, manualStop: prev.manualStop };
        })
      : book.positions;
    const merged = raisePeakIfNeeded(
      recomputeBook({
        ...book,
        ...partial,
        positions,
        netLiq: partial.netLiq ?? book.netLiq,
        realizedPL: partial.realizedPL ?? book.realizedPL,
        unrealizedPL: partial.unrealizedPL ?? book.unrealizedPL,
        baseEquity: book.baseEquity,
        peakEquity: book.peakEquity,
        importSource: partial.importSource || book.importSource,
        asOf: partial.asOf || new Date().toISOString(),
      })
    );
    onBookChange(merged);
    setStatus(notes.join(' '));
  };

  const pullFlex = async () => {
    setFlexBusy(true);
    setStatus('Pulling open positions from IBKR…');
    try {
      const text = await fetchFlexStatement();
      const { book: partial, notes } = parseFlexOrCsv(text);
      applyParsedBook(partial, notes.length ? notes : ['IBKR Flex imported.']);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'IBKR pull failed.');
    } finally {
      setFlexBusy(false);
    }
  };

  const onImportFile = async (file: File) => {
    const name = file.name.toLowerCase();
    if (file.type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(name)) {
      setOcrBusy(true);
      setStatus('Running OCR…');
      try {
        const worker = await createWorker('eng');
        const ret = await worker.recognize(file);
        await worker.terminate();
        const parsed = parseIbkrPortfolioText(ret.data.text || '');
        const positions: BookPosition[] = (parsed.positions || []).map((p) => ({
          ticker: p.ticker,
          direction: 'long',
          qty: Math.abs(Number(p.qty) || 0),
          entry: Number(p.entryPrice) || Number(p.last) || 0,
          lastMark: Number(p.last) || Number(p.entryPrice) || 0,
          markSource: 'import',
          markAt: new Date().toISOString(),
          manualStop: null,
          unrealized: Number(p.pnl) || 0,
          pnl: Number(p.pnl) || 0,
        }));
        applyParsedBook(
          {
            netLiq: parsed.netLiq ?? book.netLiq,
            realizedPL: parsed.realizedPL ?? book.realizedPL,
            unrealizedPL: parsed.unrealizedPL ?? book.unrealizedPL,
            positions: positions.length ? positions : book.positions,
            importSource: 'ocr',
            asOf: new Date().toISOString(),
          },
          parsed.parseNotes.length ? parsed.parseNotes : [`OCR imported ${positions.length} positions`]
        );
      } catch (e) {
        setStatus('OCR failed — try CSV/Flex or clearer screenshot.');
      } finally {
        setOcrBusy(false);
      }
      return;
    }

    const text = await file.text();
    const { book: partial, notes } = parseFlexOrCsv(text);
    applyParsedBook(partial, notes);
  };

  const refreshMarks = useCallback(async (quiet = false) => {
    const tickers = bookRef.current.positions.map((p) => p.ticker);
    if (!tickers.some((t) => t.trim())) {
      if (!quiet) setStatus('No open positions to mark.');
      return;
    }
    if (!quiet) setStatus('Refreshing live marks…');
    const quotes = await fetchQuotes(tickers);
    const at = new Date().toISOString();
    onBookChange((prev) => {
      const positions = prev.positions.map((p) => {
        const q = quotes[p.ticker.trim().toUpperCase()];
        if (!q) return p;
        return { ...p, lastMark: q.price, markSource: 'live' as const, markAt: q.at };
      });
      return recomputeBook({ ...prev, positions, asOf: at });
    });
    const n = Object.keys(quotes).length;
    const clock = new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    setMarksNote(n ? `Live marks ${clock}` : `No live quotes ${clock}`);
    if (!quiet) {
      setStatus(n ? `Updated ${n} live marks.` : 'No live quotes returned — edit marks manually.');
    }
  }, [onBookChange]);

  const tickerKey = useMemo(
    () =>
      [...new Set(book.positions.map((p) => p.ticker.trim().toUpperCase()).filter(Boolean))]
        .sort()
        .join(','),
    [book.positions]
  );

  useEffect(() => {
    if (!tickerKey) return;
    let cancelled = false;
    let kickTimer = 0;
    let interval = 0;

    const run = () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      void refreshMarks(true);
    };

    const arm = () => {
      window.clearInterval(interval);
      if (document.visibilityState !== 'visible') return;
      interval = window.setInterval(run, MARK_POLL_MS);
    };

    kickTimer = window.setTimeout(run, 400);
    arm();

    const onVis = () => {
      if (document.visibilityState === 'visible') {
        run();
        arm();
      } else {
        window.clearInterval(interval);
      }
    };

    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      window.clearTimeout(kickTimer);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [reloadTick, tickerKey, refreshMarks]);

  const addWatch = (item: WatchlistItem) => {
    setChartTicker(item.ticker);
    onPlanChange({
      ...plan,
      watchlist: [item, ...plan.watchlist.filter((w) => w.ticker !== item.ticker)],
    });
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Daily book</p>
          <h1 className="font-display text-3xl md:text-4xl text-[var(--ink)] tracking-tight">
            {new Date(date + 'T12:00:00').toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="inline-flex items-center gap-1.5">
            <button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={() => void pullFlex()} disabled={flexBusy || ocrBusy}>
              <Download className="h-4 w-4" /> {flexBusy ? 'Pulling…' : 'Pull from IBKR'}
            </button>
            <button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={() => fileRef.current?.click()} disabled={ocrBusy || flexBusy}>
              <Upload className="h-4 w-4" /> Import Flex / CSV / OCR
            </button>
            <ImportHelpModal />
          </div>
          <button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={() => void refreshMarks(false)}>
            <RefreshCw className="h-4 w-4" /> Refresh marks
          </button>
          <button type="button" className="btn-primary inline-flex items-center gap-2" onClick={onSaveDay} disabled={saving}>
            <Save className="h-4 w-4" /> {saving ? 'Saving…' : cloudEnabled ? 'Save Day' : 'Save Day (local)'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt,.xml,image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImportFile(f);
              e.target.value = '';
            }}
          />
        </div>
      </header>

      <HeatRail
        heatPercent={metrics.portfolioHeatPercent}
        netLiq={book.netLiq}
        realizedPL={book.realizedPL}
        unrealizedPL={book.unrealizedPL}
        dayPL={dayPL}
        openRiskDollars={metrics.openRiskDollars}
        securedPL={metrics.securedPL}
        baseEquity={book.baseEquity}
        peakEquity={book.peakEquity}
        asOf={book.asOf}
        source={book.importSource}
      />

      {status && <p className="text-xs font-data text-[var(--ink-mute)]">{status}</p>}

      <div
        className={`panel p-4 border-dashed ${dragActive ? 'border-[var(--copper)] bg-[var(--copper)]/5' : ''}`}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onImportFile(f);
        }}
      >
        <div className="text-sm text-[var(--ink-mute)] flex items-center gap-2">
          <Camera className="h-4 w-4" />
          Drop IBKR Flex CSV / statement, or Portfolio screenshot for OCR. Stops stay manual.
          {metrics.missingStopCount > 0 && (
            <span className="text-[var(--copper)] font-semibold">
              · {metrics.missingStopCount} positions missing stops
            </span>
          )}
        </div>
      </div>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="flex items-baseline gap-3">
            <h2 className="font-display text-xl">Open positions</h2>
            <span className="text-[11px] font-data text-[var(--ink-mute)]">
              {marksNote || 'Marks refresh every 5 min while this tab is visible'}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="field-inline">
              <span className="text-[11px] text-[var(--ink-mute)]">Base</span>
              <DraftNumberInput
                className="input-compact w-28 font-data"
                title="Starting account size (curve anchor)"
                value={book.baseEquity || 0}
                onCommit={(n) => onBookChange({ ...book, baseEquity: Math.max(0, n) })}
              />
            </label>
            <label className="field-inline">
              <span className="text-[11px] text-[var(--ink-mute)]">ATH</span>
              <DraftNumberInput
                className="input-compact w-28 font-data"
                title="Peak / all-time-high account size"
                value={book.peakEquity || 0}
                onCommit={(n) => onBookChange({ ...book, peakEquity: Math.max(0, n) })}
              />
            </label>
            <label className="field-inline">
              <span className="text-[11px] text-[var(--ink-mute)]">Net Liq</span>
              <DraftNumberInput
                className="input-compact w-36 font-data"
                value={book.netLiq || 0}
                onCommit={(n) =>
                  onBookChange(
                    raisePeakIfNeeded(recomputeBook({ ...book, netLiq: Math.max(0, n) }))
                  )
                }
              />
            </label>
          </div>
        </div>
        <PositionsTable
          positions={book.positions}
          netLiq={book.netLiq}
          onChange={setPositions}
          onOpenChart={setChartTicker}
        />
      </section>

      <PnLChart
        series={equitySeries}
        baseEquity={book.baseEquity}
        peakEquity={book.peakEquity}
      />

      {marketFocus === 'equal' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <TvChartPanel
            symbol="SPY"
            title="SPY · market awareness"
            height={360}
            onToggleExpand={() => setMarketFocus('spy')}
            onCapture={(blob) => onUploadSnapshot('SPY', blob)}
          />
          <TvChartPanel
            symbol="QQQ"
            title="QQQ · market awareness"
            height={360}
            onToggleExpand={() => setMarketFocus('qqq')}
            onCapture={(blob) => onUploadSnapshot('QQQ', blob)}
          />
        </div>
      ) : (
        <TvChartPanel
          symbol={marketFocus === 'spy' ? 'SPY' : 'QQQ'}
          title={`${marketFocus === 'spy' ? 'SPY' : 'QQQ'} · market awareness`}
          height={720}
          expanded
          onToggleExpand={() => setMarketFocus('equal')}
          onCapture={(blob) =>
            onUploadSnapshot(marketFocus === 'spy' ? 'SPY' : 'QQQ', blob)
          }
          headerAddon={
            <button
              type="button"
              onClick={() => setMarketFocus(marketFocus === 'spy' ? 'qqq' : 'spy')}
              className="shrink-0 rounded-lg border border-[var(--line)] bg-[var(--ink)] px-2.5 py-1.5 text-[11px] font-bold font-data text-[var(--paper)] hover:bg-[var(--copper)]"
              title={`Show ${marketFocus === 'spy' ? 'QQQ' : 'SPY'} full width`}
            >
              {marketFocus === 'spy' ? '→ QQQ' : '← SPY'}
            </button>
          }
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SoftPreFlight
          equity={book.netLiq}
          onAdd={addWatch}
          onSelectTicker={setChartTicker}
        />
        <section className="panel p-4 flex flex-col">
          <h3 className="font-display text-lg mb-2">Game plan</h3>
          <RichTextEditor
            value={plan.gamePlan}
            placeholder="What matters today? Bias, levels, no-trade conditions…"
            onChange={(gamePlan) => onPlanChange({ ...plan, gamePlan })}
          />
        </section>
      </div>

      <WatchlistPanel
        items={plan.watchlist}
        equity={book.netLiq}
        onChange={(watchlist) => onPlanChange({ ...plan, watchlist })}
        onOpenChart={setChartTicker}
      />

      <TvChartPanel
        symbol={chartTicker}
        title={`${chartTicker} · daily`}
        height={420}
        onCapture={(blob) => onUploadSnapshot(chartTicker, blob)}
      />
    </div>
  );
}
