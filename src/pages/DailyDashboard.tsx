import React, { useMemo, useRef, useState } from 'react';
import { RefreshCw, Save, Upload, Camera } from 'lucide-react';
import { HeatRail } from '../ui/HeatRail';
import { PositionsTable } from '../ui/PositionsTable';
import { SoftPreFlight } from '../ui/SoftPreFlight';
import { WatchlistPanel } from '../ui/WatchlistPanel';
import { TvChartPanel } from '../ui/TvChartPanel';
import { PnLChart } from '../ui/PnLChart';
import { ImportHelpModal } from '../ui/ImportHelpModal';
import { parseFlexOrCsv } from '../engine/flexCsvParser';
import { fetchQuotes } from '../engine/quoteService';
import { computeDayMetrics, raisePeakIfNeeded, recomputeBook } from '../engine/bookMetrics';
import { DraftNumberInput } from '../ui/DraftNumberInput';
import { parseIbkrPortfolioText } from '../engine/ibkrOcrParser';
import { createWorker } from 'tesseract.js';
import type { BookPosition, DailyBook, DayPlan, WatchlistItem } from '../types/dayBook';

type Props = {
  date: string;
  book: DailyBook;
  plan: DayPlan;
  equitySeries: { date: string; equity: number }[];
  cloudEnabled: boolean;
  saving: boolean;
  onBookChange: (book: DailyBook) => void;
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
  const [ocrBusy, setOcrBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const metrics = useMemo(() => computeDayMetrics(book), [book]);
  const dayPL = (Number(book.realizedPL) || 0) + (Number(book.unrealizedPL) || 0);

  const setPositions = (positions: BookPosition[]) => {
    onBookChange(recomputeBook({ ...book, positions }));
  };

  const applyParsedBook = (partial: Partial<DailyBook>, notes: string[]) => {
    const merged = raisePeakIfNeeded(
      recomputeBook({
        ...book,
        ...partial,
        positions: partial.positions || book.positions,
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

  const refreshMarks = async () => {
    const tickers = [
      ...book.positions.map((p) => p.ticker),
      ...plan.watchlist.map((w) => w.ticker),
    ];
    setStatus('Refreshing live marks…');
    const quotes = await fetchQuotes(tickers);
    const positions = book.positions.map((p) => {
      const q = quotes[p.ticker];
      if (!q) return p;
      return { ...p, lastMark: q.price, markSource: 'live' as const, markAt: q.at };
    });
    onBookChange(recomputeBook({ ...book, positions, asOf: new Date().toISOString() }));
    const n = Object.keys(quotes).length;
    setStatus(n ? `Updated ${n} live marks.` : 'No live quotes returned — edit marks manually.');
  };

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
            <button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={() => fileRef.current?.click()} disabled={ocrBusy}>
              <Upload className="h-4 w-4" /> Import Flex / CSV / OCR
            </button>
            <ImportHelpModal />
          </div>
          <button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={refreshMarks}>
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
          <h2 className="font-display text-xl">Open positions</h2>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PnLChart
          series={equitySeries}
          baseEquity={book.baseEquity}
          peakEquity={book.peakEquity}
        />
        <section className="panel p-4">
          <h3 className="font-display text-lg mb-2">Game plan</h3>
          <textarea
            className="input min-h-[180px] resize-y"
            placeholder="What matters today? Bias, levels, no-trade conditions…"
            value={plan.gamePlan}
            onChange={(e) => onPlanChange({ ...plan, gamePlan: e.target.value })}
          />
        </section>
      </div>

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

      <div className="space-y-4">
        <div className="max-w-xl">
          <SoftPreFlight
            equity={book.netLiq}
            onAdd={addWatch}
            onSelectTicker={setChartTicker}
          />
        </div>
        <WatchlistPanel
          items={plan.watchlist}
          onChange={(watchlist) => onPlanChange({ ...plan, watchlist })}
          onOpenChart={setChartTicker}
        />
      </div>

      <TvChartPanel
        symbol={chartTicker}
        title={`${chartTicker} · daily`}
        height={420}
        onCapture={(blob) => onUploadSnapshot(chartTicker, blob)}
      />
    </div>
  );
}
