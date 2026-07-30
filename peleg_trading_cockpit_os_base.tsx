import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, CheckCircle, AlertTriangle, TrendingDown, 
  Activity, CheckSquare, Square, Calendar, BookOpen, 
  Save, AlertCircle, Unlock, ArrowUpCircle, Download, 
  Upload, Trash2, FileText, Target, Zap, Calculator, 
  Crosshair, Shield, Clock, Award, Ban, HelpCircle
} from 'lucide-react';
import { createWorker } from 'tesseract.js';
import { computeRiskProfile } from './src/engine/riskCalculator';
import { evaluateEventRisk } from './src/engine/eventRisk';
import { computePositionSize } from './src/engine/positionSizer';
import { validateTradePlan } from './src/engine/tradePlanValidator';
import { DEFAULT_SCHEDULE, getTradingGate } from './src/engine/tradingGate';
import { emptySnapshot, parseIbkrPortfolioText } from './src/engine/ibkrOcrParser';
import { computePortfolioRiskScore } from './src/engine/portfolioRiskScore';
import { computeDisciplinePenalty } from './src/engine/disciplinePenalty';
import { FieldHelp, HelpIcon } from './src/ui/FieldHelp';

const todayISO = () => new Date().toISOString().split('T')[0];

export default function App() {
  // --- STATE ---
  // Today flow: state=Snapshot · tools=Plan&lock · execute · archive=Close · blueprint
  const [activeTab, setActiveTab] = useState('state');
  const [nowTick, setNowTick] = useState(() => new Date());
  /** Planning: size & validate anytime. Live: enforce approved windows for execution. */
  const [workspaceMode, setWorkspaceMode] = useState('planning');
  const [watchlist, setWatchlist] = useState([]); // { id, ticker, note, setupGrade }
  const [watchNote, setWatchNote] = useState('');
  
  // Equity & Risk State
  const [peakEquity, setPeakEquity] = useState(189036); 
  const [currentEquity, setCurrentEquity] = useState(152301); 
  const [last3R, setLast3R] = useState(0);

  // Recovery Override State 
  const [manualRiskTier, setManualRiskTier] = useState('auto'); 

  // Market Regime
  const [qqqStatus, setQqqStatus] = useState('above21'); 
  const [spyStatus, setSpyStatus] = useState('above21');

  // Daily Realized P&L Tracker (For Q1 and Daily Limits)
  const [dailyRealizedPL, setDailyRealizedPL] = useState(0); // Input in dollars
  const [unrealizedOpenRisk, setUnrealizedOpenRisk] = useState(0); // For visualizing active open risk (in R)
  const [unrealizedPL, setUnrealizedPL] = useState(0);
  const [excessLiquidity, setExcessLiquidity] = useState(0);
  const [buyingPower, setBuyingPower] = useState(0);
  const [maintMargin, setMaintMargin] = useState(0);
  const [positions, setPositions] = useState([]); // { ticker, last, qty, pnl }
  const [snapshotImportedAt, setSnapshotImportedAt] = useState(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrError, setOcrError] = useState('');
  const [ocrDraft, setOcrDraft] = useState(null); // editable review snapshot

  // Mistake & Process Tracking State (SMB Capital 5 W's Model)
  const [executionType, setExecutionType] = useState('perfect'); // 'perfect' or 'mistake'
  const [mistakeCategory, setMistakeType] = useState('none'); // 'none', 'fomo', 'stop_down', 'oversized', 'chasing', 'early_exit'
  const [mistakeCostR, setMistakeCostR] = useState(0); 
  const [fiveWs, setFiveWs] = useState({ w1: '', w2: '', w3: '', w4: '', w5: '', solution: '' });

  // Daily Workflow & Notes
  const [dailyNotes, setDailyNotes] = useState('');
  const [journalDate, setJournalDate] = useState(new Date().toISOString().split('T')[0]); // Default to today (YYYY-MM-DD)
  const [routine, setRoutine] = useState({
    snapshotImported: false, // Start-of-day IBKR OCR
    journal: false, alerts: false, orders: false,
    handsOff: false,
    reviewPos: false, moveStops: false
  });

  // Trading schedule + pre-trade guardrails
  const [tradingSchedule, setTradingSchedule] = useState(DEFAULT_SCHEDULE);
  const [tradeTicker, setTradeTicker] = useState('');
  const [earningsChecked, setEarningsChecked] = useState(false);
  const [earningsTiming, setEarningsTiming] = useState('unknown');
  const [eventNotes, setEventNotes] = useState('');
  const [highImpactEventPending, setHighImpactEventPending] = useState(false);
  const [highImpactEventApproved, setHighImpactEventApproved] = useState(false);
  const [setupGrade, setSetupGrade] = useState('no_trade');
  const [entryPrice, setEntryPrice] = useState(0);
  const [stopPrice, setStopPrice] = useState(0);
  const [originalStop, setOriginalStop] = useState(0);
  const [tradeDirection, setTradeDirection] = useState('long');
  const [isAdd, setIsAdd] = useState(false);
  const [addType, setAddType] = useState('not_allowed');
  const [addPrePlanned, setAddPrePlanned] = useState(false);
  const [positionIsLosing, setPositionIsLosing] = useState(false);
  const [combinedRiskR, setCombinedRiskR] = useState(1);
  const [unrealizedGainPct, setUnrealizedGainPct] = useState(0);
  const [unrealizedR, setUnrealizedR] = useState(0);
  const [profitProtectionPlan, setProfitProtectionPlan] = useState('none');
  const [requestedShares, setRequestedShares] = useState(0);

  // Locked plan + session close / backup
  const [planCommitted, setPlanCommitted] = useState(false);
  const [committedPlan, setCommittedPlan] = useState(null);
  const [planThesis, setPlanThesis] = useState('');
  const [planInvalidation, setPlanInvalidation] = useState('');
  const [planEmotion, setPlanEmotion] = useState(3);
  const [planNotRevenge, setPlanNotRevenge] = useState(false);
  const [sessionTraded, setSessionTraded] = useState(false);
  const [sessionTradeDate, setSessionTradeDate] = useState(null);
  const [lastArchivedDate, setLastArchivedDate] = useState(null);
  const [lastBackupAt, setLastBackupAt] = useState(null);
  const [noTradeToday, setNoTradeToday] = useState(false);

  // Archive History
  const [history, setHistory] = useState([]);

  // --- PERSISTENCE (LOCAL STORAGE) ---
  useEffect(() => {
    const savedHistory = localStorage.getItem('pelegTradingHistory');
    const savedPeak = localStorage.getItem('pelegPeakEquity');
    const savedCurrent = localStorage.getItem('pelegCurrentEquity');
    const savedLast3R = localStorage.getItem('pelegLast3R');
    const savedManualTier = localStorage.getItem('pelegManualRiskTier');
    const savedQqq = localStorage.getItem('pelegQqqStatus');
    const savedSpy = localStorage.getItem('pelegSpyStatus');
    const savedGate = localStorage.getItem('pelegTradeGateConfig');

    if (savedHistory) {
      try { setHistory(JSON.parse(savedHistory)); } catch (e) { console.error('Failed to parse history'); }
    }
    if (savedPeak) setPeakEquity(Number(savedPeak));
    if (savedCurrent) setCurrentEquity(Number(savedCurrent));
    if (savedLast3R) setLast3R(Number(savedLast3R));
    if (savedManualTier) setManualRiskTier(savedManualTier);
    if (savedQqq) setQqqStatus(savedQqq);
    if (savedSpy) setSpyStatus(savedSpy);
    if (savedGate) {
      try {
        const g = JSON.parse(savedGate);
        if (g.tradingSchedule) setTradingSchedule(g.tradingSchedule);
        if (g.tradeTicker != null) setTradeTicker(g.tradeTicker);
        if (g.earningsChecked != null) setEarningsChecked(g.earningsChecked);
        if (g.earningsTiming) setEarningsTiming(g.earningsTiming);
        if (g.eventNotes != null) setEventNotes(g.eventNotes);
        if (g.highImpactEventPending != null) setHighImpactEventPending(g.highImpactEventPending);
        if (g.highImpactEventApproved != null) setHighImpactEventApproved(g.highImpactEventApproved);
        if (g.setupGrade) setSetupGrade(g.setupGrade);
        if (g.entryPrice != null) setEntryPrice(Number(g.entryPrice));
        if (g.stopPrice != null) setStopPrice(Number(g.stopPrice));
        if (g.originalStop != null) setOriginalStop(Number(g.originalStop));
        if (g.tradeDirection) setTradeDirection(g.tradeDirection);
        if (g.isAdd != null) setIsAdd(g.isAdd);
        if (g.addType) setAddType(g.addType);
        if (g.addPrePlanned != null) setAddPrePlanned(g.addPrePlanned);
        if (g.positionIsLosing != null) setPositionIsLosing(g.positionIsLosing);
        if (g.combinedRiskR != null) setCombinedRiskR(Number(g.combinedRiskR));
        if (g.unrealizedGainPct != null) setUnrealizedGainPct(Number(g.unrealizedGainPct));
        if (g.unrealizedR != null) setUnrealizedR(Number(g.unrealizedR));
        if (g.profitProtectionPlan) setProfitProtectionPlan(g.profitProtectionPlan);
        if (g.requestedShares != null) setRequestedShares(Number(g.requestedShares));
        if (g.workspaceMode) setWorkspaceMode(g.workspaceMode);
        if (Array.isArray(g.watchlist)) setWatchlist(g.watchlist);
        if (g.unrealizedPL != null) setUnrealizedPL(Number(g.unrealizedPL));
        if (g.excessLiquidity != null) setExcessLiquidity(Number(g.excessLiquidity));
        if (g.buyingPower != null) setBuyingPower(Number(g.buyingPower));
        if (g.maintMargin != null) setMaintMargin(Number(g.maintMargin));
        if (Array.isArray(g.positions)) setPositions(g.positions);
        if (g.snapshotImportedAt) setSnapshotImportedAt(g.snapshotImportedAt);
        if (g.routine) setRoutine((prev) => ({ ...prev, ...g.routine }));
        if (g.unrealizedOpenRisk != null) setUnrealizedOpenRisk(Number(g.unrealizedOpenRisk));
        if (g.dailyRealizedPL != null) setDailyRealizedPL(Number(g.dailyRealizedPL));
        if (g.planCommitted != null) setPlanCommitted(!!g.planCommitted);
        if (g.committedPlan) setCommittedPlan(g.committedPlan);
        if (g.planThesis != null) setPlanThesis(g.planThesis);
        if (g.planInvalidation != null) setPlanInvalidation(g.planInvalidation);
        if (g.planEmotion != null) setPlanEmotion(Number(g.planEmotion));
        if (g.planNotRevenge != null) setPlanNotRevenge(!!g.planNotRevenge);
        if (g.sessionTraded != null) setSessionTraded(!!g.sessionTraded);
        if (g.sessionTradeDate) setSessionTradeDate(g.sessionTradeDate);
        if (g.lastArchivedDate) setLastArchivedDate(g.lastArchivedDate);
        if (g.lastBackupAt) setLastBackupAt(g.lastBackupAt);
        if (g.noTradeToday != null) setNoTradeToday(!!g.noTradeToday);
      } catch (e) {
        console.error('Failed to parse trade gate config');
      }
    }
  }, []);

  // Save changes to localStorage
  const saveHistory = (newHistory) => {
    setHistory(newHistory);
    localStorage.setItem('pelegTradingHistory', JSON.stringify(newHistory));
  };

  useEffect(() => { localStorage.setItem('pelegPeakEquity', peakEquity.toString()); }, [peakEquity]);
  useEffect(() => { localStorage.setItem('pelegCurrentEquity', currentEquity.toString()); }, [currentEquity]);
  useEffect(() => { localStorage.setItem('pelegLast3R', last3R.toString()); }, [last3R]);
  useEffect(() => { localStorage.setItem('pelegManualRiskTier', manualRiskTier); }, [manualRiskTier]);
  useEffect(() => { localStorage.setItem('pelegQqqStatus', qqqStatus); }, [qqqStatus]);
  useEffect(() => { localStorage.setItem('pelegSpyStatus', spyStatus); }, [spyStatus]);

  useEffect(() => {
    const gateConfig = {
      tradingSchedule,
      tradeTicker,
      earningsChecked,
      earningsTiming,
      eventNotes,
      highImpactEventPending,
      highImpactEventApproved,
      setupGrade,
      entryPrice,
      stopPrice,
      originalStop,
      tradeDirection,
      isAdd,
      addType,
      addPrePlanned,
      positionIsLosing,
      combinedRiskR,
      unrealizedGainPct,
      unrealizedR,
      profitProtectionPlan,
      requestedShares,
      workspaceMode,
      watchlist,
      unrealizedPL,
      excessLiquidity,
      buyingPower,
      maintMargin,
      positions,
      snapshotImportedAt,
      routine,
      unrealizedOpenRisk,
      dailyRealizedPL,
      planCommitted,
      committedPlan,
      planThesis,
      planInvalidation,
      planEmotion,
      planNotRevenge,
      sessionTraded,
      sessionTradeDate,
      lastArchivedDate,
      lastBackupAt,
      noTradeToday,
    };
    localStorage.setItem('pelegTradeGateConfig', JSON.stringify(gateConfig));
  }, [
    tradingSchedule, tradeTicker, earningsChecked, earningsTiming, eventNotes,
    highImpactEventPending, highImpactEventApproved, setupGrade, entryPrice, stopPrice,
    originalStop, tradeDirection, isAdd, addType, addPrePlanned, positionIsLosing,
    combinedRiskR, unrealizedGainPct, unrealizedR, profitProtectionPlan, requestedShares,
    workspaceMode, watchlist, unrealizedPL, excessLiquidity, buyingPower, maintMargin,
    positions, snapshotImportedAt, routine, unrealizedOpenRisk, dailyRealizedPL,
    planCommitted, committedPlan, planThesis, planInvalidation, planEmotion, planNotRevenge,
    sessionTraded, sessionTradeDate, lastArchivedDate, lastBackupAt, noTradeToday,
  ]);

  // Refresh clock for live gate status
  useEffect(() => {
    const id = setInterval(() => setNowTick(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  // --- MATH ENGINE (extracted) ---
  const riskProfile = computeRiskProfile({
    peakEquity,
    currentEquity,
    manualRiskTier,
    dailyRealizedPL,
    qqqStatus,
    spyStatus,
    last3R,
  });
  const {
    drawdown,
    strictTier,
    activeTier,
    isRecoveryMode,
    riskPercent,
    riskStatus,
    oneRValue,
    dailyMaxLossR,
    dailyMaxLossDollar,
    isDailyMaxLossBreached,
    isDrawdown,
    breakerCActive,
    breakerBLocked,
    breakerBWarning,
  } = riskProfile;

  const eventRisk = evaluateEventRisk({
    ticker: tradeTicker,
    earningsChecked,
    earningsTiming,
    eventNotes,
    highImpactEventPending,
    highImpactEventApproved,
  });

  const tradePlan = validateTradePlan({
    setupGrade,
    originalStop: originalStop || stopPrice,
    proposedStop: stopPrice,
    entryPrice,
    direction: tradeDirection,
    isAdd,
    addType,
    addPrePlanned,
    positionIsLosing,
    combinedRiskR,
    maxCombinedRiskR: 1,
    unrealizedGainPct,
    unrealizedR,
    profitProtectionPlan,
  });

  const discipline = computeDisciplinePenalty(history, nowTick);
  const needsPriorClose = !!(
    sessionTraded &&
    sessionTradeDate &&
    lastArchivedDate !== sessionTradeDate
  );
  const dayClosedToday = lastArchivedDate === todayISO() || noTradeToday;

  const sitOnHandsPlan = !!(planCommitted && committedPlan?.sitOnHands);

  const gate = getTradingGate({
    now: nowTick,
    schedule: tradingSchedule,
    risk: riskProfile,
    eventRisk,
    tradePlan,
    setupGrade,
    routine,
    requireRoutine: true,
    workspaceMode,
    snapshotImportedAt,
    planCommitted,
    sitOnHands: sitOnHandsPlan,
    needsPriorClose,
    discipline,
  });

  const portfolioScore = computePortfolioRiskScore({
    peakEquity,
    currentEquity,
    dailyRealizedPL,
    unrealizedPL,
    oneRValue,
    dailyMaxLossDollar,
    excessLiquidity,
    buyingPower,
    maintMargin,
    positions,
  });

  // Keep open exposure in true R units (not raw unrealized $)
  useEffect(() => {
    setUnrealizedOpenRisk(portfolioScore.openRiskEstimateR);
  }, [portfolioScore.openRiskEstimateR]);

  const positionSize = computePositionSize({
    entryPrice,
    stopPrice,
    allowedRisk: gate.allowedRisk,
    direction: tradeDirection,
    requestedShares: requestedShares > 0 ? requestedShares : undefined,
  });

  const planOrLiveReady = workspaceMode === 'planning' ? gate.planningReady : gate.allowed;
  const sizeReady = planOrLiveReady && positionSize.withinLimits;
  const setupCapRank = { no_trade: 0, C: 1, B: 2, A: 3 };
  const effectiveSetupCap =
    setupCapRank[discipline.maxSetupCap] < setupCapRank[portfolioScore.suggestedSetupCap]
      ? discipline.maxSetupCap
      : portfolioScore.suggestedSetupCap;
  const setupCapBlocked =
    routine.snapshotImported &&
    (setupCapRank[setupGrade] ?? 0) > (setupCapRank[effectiveSetupCap] ?? 3);

  const step1Done = !!routine.snapshotImported && !gate.snapshotStale;
  const step2Done = planCommitted;
  const step3Done = gate.allowed || noTradeToday;
  const step4Done = dayClosedToday;

  const backupOverdue = !lastBackupAt || (Date.now() - Date.parse(lastBackupAt) > 7 * 24 * 60 * 60 * 1000);

  // --- DISCIPLINE ANALYTICS CALCULATIONS ---
  const totalLogs = history.length;
  const perfectExecutionLogs = history.filter(item => item.executionType === 'perfect').length;
  const disciplineScore = totalLogs > 0 ? (perfectExecutionLogs / totalLogs) * 100 : 100;
  
  const totalRLeaks = history.reduce((sum, item) => sum + (Number(item.mistakeCostR) || 0), 0);
  const totalDollarLeaks = history.reduce((sum, item) => sum + ((Number(item.mistakeCostR) || 0) * (Number(item.rValue) || 0)), 0);

  // --- ACTIONS ---
  const toggleRoutine = (key) => {
    if (key === 'journal') return; // journal only via Commit plan
    setRoutine((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (key === 'orders' && next.orders && gate.allowed) {
        setSessionTraded(true);
        setSessionTradeDate(todayISO());
      }
      return next;
    });
  };

  const commitTradePlan = (opts = {}) => {
    const sitOnHands = !!opts.sitOnHands;
    const thesis = planThesis.trim();
    const invalidation = planInvalidation.trim();

    if (thesis.length < 8) {
      alert(sitOnHands
        ? 'Write why you are sitting on your hands (at least a sentence).'
        : 'Write a short thesis (at least a sentence) before commit.');
      return;
    }
    if (!sitOnHands && invalidation.length < 8) {
      alert('Write invalidation before commit.');
      return;
    }
    // Revenge confirm is required for trade plans only — optional for sit-on-hands
    if (!sitOnHands && !planNotRevenge) {
      alert('Confirm this is not a revenge trade.');
      return;
    }

    if (sitOnHands) {
      const plan = {
        sitOnHands: true,
        ticker: '',
        direction: 'long',
        entry: 0,
        stop: 0,
        originalStop: 0,
        setupGrade: 'no_trade',
        thesis,
        invalidation: invalidation || 'No new risk — sit on hands.',
        notRevenge: !!planNotRevenge,
        emotion: planEmotion,
        committedAt: new Date().toISOString(),
      };
      setSetupGrade('no_trade');
      setCommittedPlan(plan);
      setPlanCommitted(true);
      setRoutine((prev) => ({ ...prev, journal: true }));
      setNoTradeToday(true);
      return;
    }

    if (!tradeTicker.trim()) {
      alert('Enter a ticker before committing — or use “Sit on hands”.');
      return;
    }
    if (!entryPrice || !stopPrice) {
      alert('Entry and stop are required to commit a trade plan.');
      return;
    }
    if (setupCapBlocked) {
      alert(`Setup grade exceeds cap (${effectiveSetupCap}). Lower the grade first.`);
      return;
    }
    const orig = stopPrice;
    setOriginalStop(orig);
    const plan = {
      sitOnHands: false,
      ticker: tradeTicker.toUpperCase(),
      direction: tradeDirection,
      entry: entryPrice,
      stop: stopPrice,
      originalStop: orig,
      setupGrade,
      thesis,
      invalidation,
      notRevenge: true,
      emotion: planEmotion,
      committedAt: new Date().toISOString(),
    };
    setCommittedPlan(plan);
    setPlanCommitted(true);
    setRoutine((prev) => ({ ...prev, journal: true }));
    setNoTradeToday(false);
  };

  const voidTradePlan = () => {
    if (!window.confirm('Void locked plan? Live size returns to 0 until you re-commit.')) return;
    setPlanCommitted(false);
    setCommittedPlan(null);
    setRoutine((prev) => ({ ...prev, journal: false }));
    setNoTradeToday(false);
  };

  const loadTickerIntoPlanner = (item) => {
    if (planCommitted) {
      alert('Void the locked plan before loading another ticker.');
      return;
    }
    setTradeTicker(item.ticker || '');
    if (item.setupGrade) setSetupGrade(item.setupGrade);
    if (item.note) setEventNotes(item.note);
    setActiveTab('tools');
  };

  const addToWatchlist = () => {
    const ticker = (tradeTicker || '').trim().toUpperCase();
    if (!ticker) return;
    setWatchlist((prev) => [
      { id: Date.now(), ticker, note: watchNote || eventNotes || '', setupGrade },
      ...prev.filter((w) => w.ticker !== ticker),
    ]);
    setWatchNote('');
  };

  const removeFromWatchlist = (id) => {
    setWatchlist((prev) => prev.filter((w) => w.id !== id));
  };

  const runOcrOnFile = async (file) => {
    if (!file) return;
    setOcrBusy(true);
    setOcrProgress(0);
    setOcrError('');
    try {
      const worker = await createWorker('eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text' && m.progress != null) {
            setOcrProgress(Math.round(m.progress * 100));
          }
        },
      });
      const ret = await worker.recognize(file);
      await worker.terminate();
      const data = ret.data;
      const parsed = parseIbkrPortfolioText(data.text || '');
      setOcrDraft({
        ...parsed,
        netLiq: parsed.netLiq ?? currentEquity,
        realizedPL: parsed.realizedPL ?? dailyRealizedPL,
        unrealizedPL: parsed.unrealizedPL ?? unrealizedPL,
        excessLiquidity: parsed.excessLiquidity ?? excessLiquidity,
        buyingPower: parsed.buyingPower ?? buyingPower,
        maintMargin: parsed.maintMargin ?? maintMargin,
        positions: parsed.positions.length ? parsed.positions : positions,
      });
    } catch (err) {
      console.error(err);
      setOcrError('OCR failed. Try a clearer screenshot or enter values manually.');
      setOcrDraft(emptySnapshot());
    } finally {
      setOcrBusy(false);
    }
  };

  const applyOcrDraft = () => {
    if (!ocrDraft) return;
    const net = Number(ocrDraft.netLiq) || 0;
    if (net > 0) {
      setCurrentEquity(net);
      if (net > peakEquity) setPeakEquity(net);
    }
    if (ocrDraft.realizedPL != null) setDailyRealizedPL(Number(ocrDraft.realizedPL) || 0);
    if (ocrDraft.unrealizedPL != null) setUnrealizedPL(Number(ocrDraft.unrealizedPL) || 0);
    if (ocrDraft.excessLiquidity != null) setExcessLiquidity(Number(ocrDraft.excessLiquidity) || 0);
    if (ocrDraft.buyingPower != null) setBuyingPower(Number(ocrDraft.buyingPower) || 0);
    if (ocrDraft.maintMargin != null) setMaintMargin(Number(ocrDraft.maintMargin) || 0);
    if (Array.isArray(ocrDraft.positions)) setPositions(ocrDraft.positions);

    const nextScore = computePortfolioRiskScore({
      peakEquity: Math.max(peakEquity, net),
      currentEquity: net || currentEquity,
      dailyRealizedPL: Number(ocrDraft.realizedPL) || 0,
      unrealizedPL: Number(ocrDraft.unrealizedPL) || 0,
      oneRValue: (net || currentEquity) * (riskPercent / 100),
      dailyMaxLossDollar: (net || currentEquity) * (riskPercent / 100) * dailyMaxLossR,
      excessLiquidity: Number(ocrDraft.excessLiquidity) || 0,
      buyingPower: Number(ocrDraft.buyingPower) || 0,
      maintMargin: Number(ocrDraft.maintMargin) || 0,
      positions: ocrDraft.positions || [],
    });
    setUnrealizedOpenRisk(nextScore.openRiskEstimateR);

    const nowIso = new Date().toISOString();
    setSnapshotImportedAt(nowIso);
    setRoutine((prev) => ({ ...prev, snapshotImported: true }));

    // Soft-cap setup grade suggestion
    const cap = nextScore.suggestedSetupCap;
    const rank = { no_trade: 0, C: 1, B: 2, A: 3 };
    if ((rank[setupGrade] ?? 0) > (rank[cap] ?? 3)) {
      setSetupGrade(cap);
    }

    // Seed watchlist from positions
    (ocrDraft.positions || []).forEach((p) => {
      if (!p.ticker) return;
      setWatchlist((prev) => {
        if (prev.some((w) => w.ticker === p.ticker)) return prev;
        return [{ id: Date.now() + Math.random(), ticker: p.ticker, note: `Pos ${p.qty}`, setupGrade: 'no_trade' }, ...prev];
      });
    });

    alert('IBKR snapshot applied. Portfolio state + risk score updated.');
  };
  
  const archiveDay = () => {
    const notesOk = dailyNotes.trim().length >= 20;
    if (executionType === 'mistake') {
      const wsOk = [fiveWs.w1, fiveWs.w2, fiveWs.w3, fiveWs.w4, fiveWs.w5, fiveWs.solution]
        .every((x) => String(x || '').trim().length >= 2);
      if (!wsOk || mistakeCategory === 'none') {
        alert('Mistake close requires category + all 5 W’s + solution.');
        return;
      }
    } else if (!notesOk) {
      alert('Close day requires session notes (at least ~20 characters).');
      return;
    }
    if (!executionType) {
      alert('Select execution type (perfect or mistake).');
      return;
    }
    if (!window.confirm("Archive today's data, download backup, and reset checklists?")) return;

    const [y, m, d] = journalDate.split('-');
    const displayDate = `${d}/${m}/${y}`;

    let compiledNotes = dailyNotes;
    if (executionType === 'mistake') {
      compiledNotes += `\n\n[SMB 5 W's Diagnosis]\nMistake: ${mistakeCategory}\n1. Why? ${fiveWs.w1}\n2. Why? ${fiveWs.w2}\n3. Why? ${fiveWs.w3}\n4. Why? ${fiveWs.w4}\n5. Why? ${fiveWs.w5}\nSolution: ${fiveWs.solution}`;
    }

    const newEntry = {
      id: Date.now(),
      date: displayDate,
      netLiq: currentEquity,
      peak: peakEquity,
      drawdown: drawdown.toFixed(2),
      notes: compiledNotes,
      regime: qqqStatus === 'above21' ? 'QQQ Bullish Trend' : qqqStatus === 'below21' ? 'QQQ Volatile/Warning' : 'QQQ Hostile Trend',
      riskTier: activeTier,
      riskPct: riskPercent,
      rValue: oneRValue,
      realizedPL: dailyRealizedPL,
      openRisk: unrealizedOpenRisk,
      executionType: executionType,
      mistakeCategory: executionType === 'mistake' ? mistakeCategory : 'none',
      mistakeCostR: executionType === 'mistake' ? mistakeCostR : 0,
      gateAllowed: gate.allowed,
      gateMode: gate.mode,
      gateReasons: gate.reasons,
      ticker: tradeTicker,
      setupGrade,
      earningsTiming,
      earningsChecked,
      allowedRisk: gate.allowedRisk,
      calculatedShares: positionSize.shares,
      committedPlan,
    };

    const nextHistory = [newEntry, ...history];
    saveHistory(nextHistory);
    setLastArchivedDate(journalDate);
    setSessionTraded(false);
    setSessionTradeDate(null);
    setNoTradeToday(false);

    // Reset daily fields
    setDailyNotes('');
    setDailyRealizedPL(0);
    setUnrealizedOpenRisk(0);
    setExecutionType('perfect');
    setMistakeType('none');
    setMistakeCostR(0);
    setFiveWs({ w1: '', w2: '', w3: '', w4: '', w5: '', solution: '' });
    setJournalDate(todayISO());
    setRoutine({
      snapshotImported: false,
      journal: false,
      alerts: false,
      orders: false,
      handsOff: false,
      reviewPos: false,
      moveStops: false,
    });
    setSnapshotImportedAt(null);
    setOcrDraft(null);
    setPlanCommitted(false);
    setCommittedPlan(null);
    setPlanThesis('');
    setPlanInvalidation('');
    setPlanNotRevenge(false);
    setPlanEmotion(3);
    setWorkspaceMode('planning');

    const backupAt = new Date().toISOString();
    setLastBackupAt(backupAt);
    exportDatabase({ historyOverride: nextHistory, lastBackupAtOverride: backupAt, lastArchivedDateOverride: journalDate });
    alert('Day archived. Backup JSON downloaded — move it to Drive/USB for your other PC.');
  };

  const deleteEntry = (id) => {
    if (window.confirm("Are you sure you want to permanently delete this record?")) {
      saveHistory(history.filter(item => item.id !== id));
    }
  };

  const handleLevelUp = () => {
    let nextTier = activeTier;
    if (activeTier === 3) nextTier = 2; 
    else if (activeTier === 2) nextTier = 1; 
    else if (activeTier === 1) nextTier = 0; 
    setManualRiskTier(String(nextTier));
    setLast3R(0); 
    alert(`Risk Upgraded! You secured your small wins. You are now operating under Level ${nextTier} parameters.`);
  };

  const exportDatabase = (overrides = {}) => {
    const hist = overrides.historyOverride ?? history;
    const backupAt = overrides.lastBackupAtOverride ?? new Date().toISOString();
    const archived = overrides.lastArchivedDateOverride ?? lastArchivedDate;
    if (!overrides.lastBackupAtOverride) setLastBackupAt(backupAt);
    const backupData = {
      history: hist,
      peakEquity,
      currentEquity,
      last3R,
      manualRiskTier,
      qqqStatus,
      spyStatus,
      lastBackupAt: backupAt,
      lastArchivedDate: archived,
      tradeGateConfig: {
        tradingSchedule,
        tradeTicker,
        earningsChecked,
        earningsTiming,
        eventNotes,
        highImpactEventPending,
        highImpactEventApproved,
        setupGrade,
        entryPrice,
        stopPrice,
        originalStop,
        tradeDirection,
        isAdd,
        addType,
        addPrePlanned,
        positionIsLosing,
        combinedRiskR,
        unrealizedGainPct,
        unrealizedR,
        profitProtectionPlan,
        requestedShares,
        workspaceMode,
        watchlist,
        unrealizedPL,
        excessLiquidity,
        buyingPower,
        maintMargin,
        positions,
        snapshotImportedAt,
        routine,
        unrealizedOpenRisk,
        dailyRealizedPL,
        planCommitted,
        committedPlan,
        planThesis,
        planInvalidation,
        planEmotion,
        planNotRevenge,
        sessionTraded,
        sessionTradeDate,
        lastArchivedDate: archived,
        lastBackupAt: backupAt,
        noTradeToday,
      },
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `peleg_trading_db_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const applyTradeGateConfig = (g) => {
    if (!g) return;
    if (g.tradingSchedule) setTradingSchedule(g.tradingSchedule);
    if (g.tradeTicker != null) setTradeTicker(g.tradeTicker);
    if (g.earningsChecked != null) setEarningsChecked(g.earningsChecked);
    if (g.earningsTiming) setEarningsTiming(g.earningsTiming);
    if (g.eventNotes != null) setEventNotes(g.eventNotes);
    if (g.highImpactEventPending != null) setHighImpactEventPending(g.highImpactEventPending);
    if (g.highImpactEventApproved != null) setHighImpactEventApproved(g.highImpactEventApproved);
    if (g.setupGrade) setSetupGrade(g.setupGrade);
    if (g.entryPrice != null) setEntryPrice(Number(g.entryPrice));
    if (g.stopPrice != null) setStopPrice(Number(g.stopPrice));
    if (g.originalStop != null) setOriginalStop(Number(g.originalStop));
    if (g.tradeDirection) setTradeDirection(g.tradeDirection);
    if (g.isAdd != null) setIsAdd(g.isAdd);
    if (g.addType) setAddType(g.addType);
    if (g.addPrePlanned != null) setAddPrePlanned(g.addPrePlanned);
    if (g.positionIsLosing != null) setPositionIsLosing(g.positionIsLosing);
    if (g.combinedRiskR != null) setCombinedRiskR(Number(g.combinedRiskR));
    if (g.unrealizedGainPct != null) setUnrealizedGainPct(Number(g.unrealizedGainPct));
    if (g.unrealizedR != null) setUnrealizedR(Number(g.unrealizedR));
    if (g.profitProtectionPlan) setProfitProtectionPlan(g.profitProtectionPlan);
    if (g.requestedShares != null) setRequestedShares(Number(g.requestedShares));
    if (g.workspaceMode) setWorkspaceMode(g.workspaceMode);
    if (Array.isArray(g.watchlist)) setWatchlist(g.watchlist);
    if (g.unrealizedPL != null) setUnrealizedPL(Number(g.unrealizedPL));
    if (g.excessLiquidity != null) setExcessLiquidity(Number(g.excessLiquidity));
    if (g.buyingPower != null) setBuyingPower(Number(g.buyingPower));
    if (g.maintMargin != null) setMaintMargin(Number(g.maintMargin));
    if (Array.isArray(g.positions)) setPositions(g.positions);
    if (g.snapshotImportedAt) setSnapshotImportedAt(g.snapshotImportedAt);
    if (g.routine) setRoutine((prev) => ({ ...prev, ...g.routine }));
    if (g.planCommitted != null) setPlanCommitted(!!g.planCommitted);
    if (g.committedPlan !== undefined) setCommittedPlan(g.committedPlan);
    if (g.planThesis != null) setPlanThesis(g.planThesis);
    if (g.planInvalidation != null) setPlanInvalidation(g.planInvalidation);
    if (g.planEmotion != null) setPlanEmotion(Number(g.planEmotion));
    if (g.planNotRevenge != null) setPlanNotRevenge(!!g.planNotRevenge);
    if (g.sessionTraded != null) setSessionTraded(!!g.sessionTraded);
    if (g.sessionTradeDate !== undefined) setSessionTradeDate(g.sessionTradeDate);
    if (g.lastArchivedDate !== undefined) setLastArchivedDate(g.lastArchivedDate);
    if (g.lastBackupAt !== undefined) setLastBackupAt(g.lastBackupAt);
    if (g.noTradeToday != null) setNoTradeToday(!!g.noTradeToday);
  };

  const importDatabase = (e) => {
    const fileReader = new FileReader();
    fileReader.readAsText(e.target.files[0], "UTF-8");
    fileReader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (parsed.history) saveHistory(parsed.history);
        if (parsed.lastBackupAt) setLastBackupAt(parsed.lastBackupAt);
        if (parsed.lastArchivedDate) setLastArchivedDate(parsed.lastArchivedDate);
        if (parsed.peakEquity) setPeakEquity(parsed.peakEquity);
        if (parsed.currentEquity) setCurrentEquity(parsed.currentEquity);
        if (parsed.last3R) setLast3R(parsed.last3R);
        if (parsed.manualRiskTier) setManualRiskTier(parsed.manualRiskTier);
        if (parsed.qqqStatus) setQqqStatus(parsed.qqqStatus);
        if (parsed.spyStatus) setSpyStatus(parsed.spyStatus);
        if (parsed.tradeGateConfig) applyTradeGateConfig(parsed.tradeGateConfig);
        alert("Database successfully restored from file!");
      } catch (err) {
        alert("Failed to parse database file. Make sure it is a valid backup JSON.");
      }
    };
  };

  const BlueprintSection = ({ icon: Icon, title, children }) => (
    <div className="bg-white p-6 md:p-8 rounded-xl shadow-sm border border-slate-200 mb-6">
      <h2 className="text-xl md:text-2xl font-bold mb-6 flex items-center gap-3 text-slate-800 border-b border-slate-100 pb-4">
        <div className="p-2 bg-slate-100 rounded-lg text-indigo-600">
          <Icon className="h-6 w-6" />
        </div>
        {title}
      </h2>
      <div className="space-y-4 text-slate-700 leading-relaxed">
        {children}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 pb-10">
      
      {/* --- TOP NAVIGATION --- */}
      <div className="bg-slate-900 text-white px-4 md:px-8 pt-6 pb-0 shadow-lg">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-4">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Activity className="text-blue-400" />
                Peleg Trading Engine OS
              </h1>
              <p className="text-slate-400 text-sm mt-1 flex items-center gap-1">
                Today flow <HelpIcon fieldId="todayFlow" /> · IDT {gate.israelTimeLabel}
              </p>
            </div>
            <div className="text-left md:text-right bg-slate-800 p-3 rounded-lg border border-slate-700">
              <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Current Net Liq</div>
              <div className="text-2xl font-mono font-bold text-emerald-400">${currentEquity.toLocaleString()}</div>
            </div>
          </div>

          {/* Sticky today-flow step strip */}
          <div className="mb-2 grid grid-cols-2 md:grid-cols-4 gap-1.5">
            {[
              { id: 'state', n: 1, label: 'Snapshot', done: step1Done },
              { id: 'tools', n: 2, label: 'Plan & lock', done: step2Done },
              { id: 'execute', n: 3, label: 'Execute', done: step3Done },
              { id: 'archive', n: 4, label: 'Close day', done: step4Done },
            ].map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveTab(s.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs font-semibold border transition-colors ${
                  activeTab === s.id
                    ? 'bg-white text-slate-900 border-white'
                    : s.done
                      ? 'bg-emerald-900/40 text-emerald-200 border-emerald-700'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                }`}
              >
                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black ${
                  s.done ? 'bg-emerald-500 text-white' : 'bg-slate-600 text-white'
                }`}>
                  {s.done ? '✓' : s.n}
                </span>
                {s.label}
              </button>
            ))}
          </div>
          
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            <button 
              onClick={() => setActiveTab('state')}
              className={`px-4 py-2.5 rounded-t-lg font-semibold text-sm transition-colors flex items-center gap-2 whitespace-nowrap ${activeTab === 'state' ? 'bg-slate-50 text-slate-900' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'}`}
            >
              <Activity className="h-4 w-4" />
              1 Snapshot
            </button>
            <button 
              onClick={() => setActiveTab('tools')}
              className={`px-4 py-2.5 rounded-t-lg font-semibold text-sm transition-colors flex items-center gap-2 whitespace-nowrap ${activeTab === 'tools' ? 'bg-slate-50 text-slate-900' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'}`}
            >
              <Calculator className="h-4 w-4" />
              2 Plan & lock
            </button>
            <button 
              onClick={() => setActiveTab('execute')}
              className={`px-4 py-2.5 rounded-t-lg font-semibold text-sm transition-colors flex items-center gap-2 whitespace-nowrap ${activeTab === 'execute' ? 'bg-slate-50 text-slate-900' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'}`}
            >
              <Zap className="h-4 w-4" />
              3 Execute
            </button>
            <button 
              onClick={() => setActiveTab('archive')}
              className={`px-4 py-2.5 rounded-t-lg font-semibold text-sm transition-colors flex items-center gap-2 whitespace-nowrap ${activeTab === 'archive' ? 'bg-slate-50 text-slate-900' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'}`}
            >
              <Calendar className="h-4 w-4" />
              4 Close ({history.length})
            </button>
            <button 
              onClick={() => setActiveTab('blueprint')}
              className={`px-4 py-2.5 rounded-t-lg font-semibold text-sm transition-colors flex items-center gap-2 whitespace-nowrap ${activeTab === 'blueprint' ? 'bg-slate-50 text-slate-900' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'}`}
            >
              <FileText className="h-4 w-4" />
              Blueprint
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-4 md:p-8">
        
        {/* --- TAB 1: PORTFOLIO & MARKET STATE --- */}
        {activeTab === 'state' && (
          <div className="space-y-4">
            <div className="bg-slate-900 text-white p-4 rounded-xl border border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1">
                  Step 1 — Snapshot <HelpIcon fieldId="snapshotImport" />
                </div>
                <p className="text-sm text-slate-300 mt-1">Import IBKR Portfolio, review numbers, Apply. Then go to Plan & lock.</p>
              </div>
              <button
                onClick={() => setActiveTab('tools')}
                disabled={!step1Done}
                className={`text-sm font-bold px-4 py-2 rounded-lg flex items-center gap-2 ${step1Done ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-slate-700 text-slate-400 cursor-not-allowed'}`}
              >
                Next: Plan & lock →
              </button>
            </div>

            {/* IBKR OCR IMPORT */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-indigo-200">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <h2 className="text-base font-bold flex items-center gap-2 text-indigo-900">
                    <Upload className="h-5 w-5" />
                    Start of day: Import IBKR Portfolio
                    <HelpIcon fieldId="snapshotImport" />
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">OCR via Tesseract — always review before Apply.</p>
                </div>
                {routine.snapshotImported && (
                  <span className="text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 px-2 py-1 rounded border border-emerald-200">
                    Imported {snapshotImportedAt ? new Date(snapshotImportedAt).toLocaleString() : ''}
                  </span>
                )}
              </div>
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-indigo-200 rounded-lg p-6 cursor-pointer hover:bg-indigo-50/50">
                <span className="text-sm font-semibold text-indigo-800">Drop or click to upload screenshot</span>
                <span className="text-[11px] text-slate-500 mt-1">IBKR mobile Portfolio tab</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => runOcrOnFile(e.target.files?.[0])}
                />
              </label>
              {ocrBusy && (
                <div className="mt-3 text-xs font-mono text-indigo-700">OCR progress: {ocrProgress}%</div>
              )}
              {ocrError && <div className="mt-2 text-xs text-red-700 font-semibold">{ocrError}</div>}

              {ocrDraft && (
                <div className="mt-4 border-t border-slate-100 pt-4 space-y-3">
                  <div className="flex items-center gap-1 text-xs font-bold text-slate-600 uppercase">
                    Review OCR fields <HelpIcon fieldId="ocrReview" />
                  </div>
                  {ocrDraft.parseNotes?.length > 0 && (
                    <ul className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded p-2 space-y-0.5">
                      {ocrDraft.parseNotes.map((n) => <li key={n}>• {n}</li>)}
                    </ul>
                  )}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {[
                      ['netLiq', 'Net Liq', 'currentEquity'],
                      ['realizedPL', 'Realized P&L', 'dailyRealizedPL'],
                      ['unrealizedPL', 'Unrealized P&L', 'unrealizedPL'],
                      ['excessLiquidity', 'Excess Liq', 'excessLiquidity'],
                      ['buyingPower', 'Buying Power', 'buyingPower'],
                      ['maintMargin', 'Maint Margin', 'maintMargin'],
                    ].map(([key, label, helpId]) => (
                      <div key={key}>
                        <FieldHelp fieldId={helpId} label={label} labelClassName="text-[10px] font-bold text-slate-400 uppercase" />
                        <input
                          type="number"
                          value={ocrDraft[key] ?? ''}
                          onChange={(e) => setOcrDraft({ ...ocrDraft, [key]: Number(e.target.value) })}
                          className="mt-1 w-full p-1.5 text-sm border rounded font-mono bg-slate-50"
                        />
                      </div>
                    ))}
                  </div>
                  <div>
                    <FieldHelp fieldId="positions" label="Positions" labelClassName="text-[10px] font-bold text-slate-400 uppercase" />
                    <div className="mt-2 hidden md:grid md:grid-cols-6 gap-1 text-[9px] font-bold text-slate-400 uppercase px-0.5">
                      <span className="flex items-center gap-0.5">Ticker <HelpIcon fieldId="posTicker" /></span>
                      <span className="flex items-center gap-0.5">Qty <HelpIcon fieldId="posQty" /></span>
                      <span className="flex items-center gap-0.5">Last <HelpIcon fieldId="posLast" /></span>
                      <span className="flex items-center gap-0.5">P&L <HelpIcon fieldId="posPnl" /></span>
                      <span className="flex items-center gap-0.5">Entry $ <HelpIcon fieldId="posEntryPrice" /></span>
                      <span className="flex items-center gap-0.5">Entry date <HelpIcon fieldId="posEntryDate" /></span>
                    </div>
                    <div className="mt-1 space-y-2">
                      {(ocrDraft.positions || []).map((p, idx) => (
                        <div key={`${p.ticker || 'row'}-${idx}`} className="grid grid-cols-2 md:grid-cols-6 gap-1 text-xs bg-slate-50 border border-slate-100 rounded p-1.5">
                          <div>
                            <span className="md:hidden text-[9px] text-slate-400 uppercase flex items-center gap-0.5">Ticker <HelpIcon fieldId="posTicker" /></span>
                            <input className="w-full border rounded p-1 font-mono" value={p.ticker} onChange={(e) => {
                              const positionsNext = [...ocrDraft.positions];
                              positionsNext[idx] = { ...p, ticker: e.target.value.toUpperCase() };
                              setOcrDraft({ ...ocrDraft, positions: positionsNext });
                            }} placeholder="TICKER" />
                          </div>
                          <div>
                            <span className="md:hidden text-[9px] text-slate-400 uppercase flex items-center gap-0.5">Qty <HelpIcon fieldId="posQty" /></span>
                            <input type="number" className="w-full border rounded p-1 font-mono" value={p.qty || ''} onChange={(e) => {
                              const positionsNext = [...ocrDraft.positions];
                              positionsNext[idx] = { ...p, qty: Number(e.target.value) };
                              setOcrDraft({ ...ocrDraft, positions: positionsNext });
                            }} placeholder="qty" />
                          </div>
                          <div>
                            <span className="md:hidden text-[9px] text-slate-400 uppercase flex items-center gap-0.5">Last <HelpIcon fieldId="posLast" /></span>
                            <input type="number" step="0.01" className="w-full border rounded p-1 font-mono" value={p.last ?? ''} onChange={(e) => {
                              const positionsNext = [...ocrDraft.positions];
                              positionsNext[idx] = { ...p, last: Number(e.target.value) };
                              setOcrDraft({ ...ocrDraft, positions: positionsNext });
                            }} placeholder="last" />
                          </div>
                          <div>
                            <span className="md:hidden text-[9px] text-slate-400 uppercase flex items-center gap-0.5">P&L <HelpIcon fieldId="posPnl" /></span>
                            <input type="number" className="w-full border rounded p-1 font-mono" value={p.pnl ?? ''} onChange={(e) => {
                              const positionsNext = [...ocrDraft.positions];
                              positionsNext[idx] = { ...p, pnl: Number(e.target.value) };
                              setOcrDraft({ ...ocrDraft, positions: positionsNext });
                            }} placeholder="pnl" />
                          </div>
                          <div>
                            <span className="md:hidden text-[9px] text-slate-400 uppercase flex items-center gap-0.5">Entry $ <HelpIcon fieldId="posEntryPrice" /></span>
                            <input type="number" step="0.01" className="w-full border rounded p-1 font-mono" value={p.entryPrice ?? ''} onChange={(e) => {
                              const positionsNext = [...ocrDraft.positions];
                              positionsNext[idx] = { ...p, entryPrice: Number(e.target.value) };
                              setOcrDraft({ ...ocrDraft, positions: positionsNext });
                            }} placeholder="avg entry" />
                          </div>
                          <div>
                            <span className="md:hidden text-[9px] text-slate-400 uppercase flex items-center gap-0.5">Entry date <HelpIcon fieldId="posEntryDate" /></span>
                            <input type="date" className="w-full border rounded p-1 font-mono" value={p.entryDate || ''} onChange={(e) => {
                              const positionsNext = [...ocrDraft.positions];
                              positionsNext[idx] = { ...p, entryDate: e.target.value };
                              setOcrDraft({ ...ocrDraft, positions: positionsNext });
                            }} />
                          </div>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="text-[11px] text-indigo-700 font-semibold"
                        onClick={() => setOcrDraft({
                          ...ocrDraft,
                          positions: [...(ocrDraft.positions || []), { ticker: '', qty: 0, entryPrice: undefined, entryDate: '' }],
                        })}
                      >
                        + Add position row
                      </button>
                    </div>
                  </div>
                  {ocrDraft.rawText && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-slate-500 font-semibold flex items-center gap-1">
                        Raw OCR text <HelpIcon fieldId="ocrRawText" />
                      </summary>
                      <pre className="mt-2 max-h-40 overflow-auto bg-slate-900 text-slate-200 p-2 rounded text-[10px] whitespace-pre-wrap">
                        {ocrDraft.rawText}
                      </pre>
                    </details>
                  )}
                  <button
                    onClick={applyOcrDraft}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-lg text-sm"
                  >
                    Apply to Portfolio State
                  </button>
                </div>
              )}
            </div>

            {/* RISK SCORE */}
            <div className={`p-5 rounded-xl border shadow-sm ${
              portfolioScore.grade === 'green' ? 'bg-emerald-50 border-emerald-200' :
              portfolioScore.grade === 'yellow' ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-base font-bold flex items-center gap-2">
                  Portfolio Risk Score <HelpIcon fieldId="portfolioRiskScore" />
                </h2>
                <div className="text-3xl font-black font-mono">{portfolioScore.score}</div>
              </div>
              <div className="text-xs font-bold uppercase tracking-wider mb-2">
                Grade {portfolioScore.grade} · Setup cap: {portfolioScore.suggestedSetupCap}
              </div>
              <ul className="space-y-1">
                {portfolioScore.reasons.map((r) => (
                  <li key={r} className="text-xs text-slate-700">• {r}</li>
                ))}
              </ul>
            </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-4">
              <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                <h2 className="text-base font-bold mb-4 flex items-center gap-2 text-slate-800">
                  <TrendingDown className="text-blue-500 h-5 w-5" />
                  Equity
                </h2>
                <div className="space-y-3">
                  <div>
                    <FieldHelp fieldId="peakEquity" label="Peak" />
                    <input type="number" value={peakEquity} onChange={(e) => setPeakEquity(Number(e.target.value))} className="mt-1 w-full p-2 border rounded-md font-mono bg-slate-50" />
                  </div>
                  <div>
                    <FieldHelp fieldId="currentEquity" label="Net Liq" />
                    <input type="number" value={currentEquity} onChange={(e) => setCurrentEquity(Number(e.target.value))} className="mt-1 w-full p-2 border rounded-md font-mono bg-slate-50" />
                  </div>
                  <div className={`p-3 rounded-lg border flex justify-between ${drawdown >= 15 ? 'bg-red-50 border-red-200 text-red-700' : drawdown > 0 ? 'bg-orange-50 border-orange-200 text-orange-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
                    <span className="font-semibold text-sm flex items-center gap-1">Drawdown <HelpIcon fieldId="drawdown" /></span>
                    <span className="font-mono font-bold">{drawdown.toFixed(2)}%</span>
                  </div>
                  <div className="flex justify-between text-sm border-t pt-2">
                    <span className="flex items-center gap-1">1R <HelpIcon fieldId="oneR" /></span>
                    <span className="font-mono font-bold">$${riskPercent > 0 ? oneRValue.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '0'}</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-800 p-5 rounded-xl text-white space-y-3">
                <h2 className="text-xs font-bold text-slate-400 uppercase">Daily P&L / margin</h2>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <FieldHelp fieldId="dailyRealizedPL" label="Realized" labelClassName="text-[10px] text-slate-400 uppercase" />
                    <input type="number" value={dailyRealizedPL} onChange={(e) => setDailyRealizedPL(Number(e.target.value))} className="mt-1 w-full p-1.5 border border-slate-700 bg-slate-900 rounded text-xs font-mono text-white" />
                  </div>
                  <div>
                    <FieldHelp fieldId="unrealizedPL" label="Unrealized" labelClassName="text-[10px] text-slate-400 uppercase" />
                    <input type="number" value={unrealizedPL} onChange={(e) => setUnrealizedPL(Number(e.target.value))} className="mt-1 w-full p-1.5 border border-slate-700 bg-slate-900 rounded text-xs font-mono text-white" />
                  </div>
                  <div>
                    <FieldHelp fieldId="excessLiquidity" label="Excess" labelClassName="text-[10px] text-slate-400 uppercase" />
                    <input type="number" value={excessLiquidity} onChange={(e) => setExcessLiquidity(Number(e.target.value))} className="mt-1 w-full p-1.5 border border-slate-700 bg-slate-900 rounded text-xs font-mono text-white" />
                  </div>
                  <div>
                    <FieldHelp fieldId="maintMargin" label="Maint" labelClassName="text-[10px] text-slate-400 uppercase" />
                    <input type="number" value={maintMargin} onChange={(e) => setMaintMargin(Number(e.target.value))} className="mt-1 w-full p-1.5 border border-slate-700 bg-slate-900 rounded text-xs font-mono text-white" />
                  </div>
                </div>
                {positions.length > 0 && (
                  <div>
                    <FieldHelp fieldId="positions" label="Positions" labelClassName="text-[10px] text-slate-400 uppercase" />
                    <ul className="mt-1 space-y-2 max-h-36 overflow-y-auto thin-scrollbar">
                      {positions.map((p) => (
                        <li key={p.ticker} className="text-[11px] font-mono text-slate-300 border border-slate-700 rounded p-1.5">
                          <div className="flex justify-between"><span>{p.ticker} × {p.qty}</span><span>{p.pnl != null ? p.pnl.toLocaleString() : '—'}</span></div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-white p-4 rounded-xl border border-slate-200">
                <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Session clock</div>
                <div className="flex justify-between text-sm font-mono font-bold">
                  <span>IDT {gate.israelTimeLabel}</span>
                  <span>ET {gate.etTimeLabel}</span>
                </div>
                <div className="text-xs text-slate-500 mt-1">Phase: {gate.phase} · {gate.activeWindowLabel || 'no window'}</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className={`text-[10px] font-bold px-2 py-1 rounded border ${step1Done ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>Snapshot {step1Done ? '✓' : '○'}</span>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded border ${planCommitted ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>Plan {planCommitted ? '✓' : '○'}</span>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded border ${discipline.factor < 1 ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                    Disc <HelpIcon fieldId="disciplineChip" /> {discipline.factor}×
                  </span>
                </div>
              </div>
              <div className="bg-white p-4 rounded-xl border border-slate-200">
                <h3 className="text-sm font-bold mb-2">Market regime</h3>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <FieldHelp fieldId="qqqStatus" label="QQQ" labelClassName="text-[10px] text-slate-400 uppercase" />
                    <select value={qqqStatus} onChange={(e) => setQqqStatus(e.target.value)} className="mt-1 w-full p-1.5 text-sm border rounded bg-slate-50">
                      <option value="above21">Above 21 EMA</option>
                      <option value="below21">Below 21 EMA</option>
                      <option value="below50">Below 50 SMA</option>
                    </select>
                  </div>
                  <div>
                    <FieldHelp fieldId="spyStatus" label="SPY" labelClassName="text-[10px] text-slate-400 uppercase" />
                    <select value={spyStatus} onChange={(e) => setSpyStatus(e.target.value)} className="mt-1 w-full p-1.5 text-sm border rounded bg-slate-50">
                      <option value="above21">Above 21 EMA</option>
                      <option value="below21">Below 21 EMA</option>
                    </select>
                  </div>
                </div>
              </div>
              <button type="button" onClick={() => setActiveTab('tools')} className="w-full bg-slate-900 text-white font-bold py-2.5 rounded-lg text-sm">Continue to Plan & lock →</button>
            </div>
          </div>
          </div>
        )}

        {/* --- TAB 2: PLAN & LOCK --- */}
        {activeTab === 'tools' && (
          <div className="space-y-4">
            <div className="bg-slate-900 text-white p-4 rounded-xl border border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-400 font-bold">Step 2 — Plan & lock</div>
                <p className="text-sm text-slate-300 mt-1">Size the trade, check events, then Commit. Planning mode is on until Execute.</p>
                {setupCapBlocked && (
                  <p className="text-[11px] text-amber-300 mt-1 font-semibold">Setup capped at {effectiveSetupCap} (portfolio / discipline).</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('execute')}
                disabled={!step2Done}
                className={`text-sm font-bold px-4 py-2 rounded-lg ${step2Done ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-slate-700 text-slate-400 cursor-not-allowed'}`}
              >
                Next: Execute →
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-4">
                <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                  <h2 className="text-base font-bold mb-3 flex items-center gap-2">
                    <Calculator className="text-blue-500 h-5 w-5" />
                    Position size
                  </h2>
                  <div className="text-xs text-slate-500 mb-3">
                    1R $${oneRValue.toLocaleString(undefined, { maximumFractionDigits: 0 })} · Setup {gate.setupFactor}x
                    {discipline.factor < 1 ? ` · Disc ${discipline.factor}x` : ''}
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div>
                      <FieldHelp fieldId="tradeTicker" label="Ticker" labelClassName="text-[10px] text-slate-400 uppercase font-bold" />
                      <input type="text" value={tradeTicker} disabled={planCommitted} onChange={(e) => setTradeTicker(e.target.value.toUpperCase())} className="mt-1 w-full p-1.5 text-sm border rounded font-mono bg-slate-50 uppercase disabled:opacity-60" />
                    </div>
                    <div>
                      <FieldHelp fieldId="tradeDirection" label="Direction" labelClassName="text-[10px] text-slate-400 uppercase font-bold" />
                      <select value={tradeDirection} disabled={planCommitted} onChange={(e) => setTradeDirection(e.target.value)} className="mt-1 w-full p-1.5 text-sm border rounded bg-slate-50 disabled:opacity-60">
                        <option value="long">Long</option>
                        <option value="short">Short</option>
                      </select>
                    </div>
                    <div>
                      <FieldHelp fieldId="entryPrice" label="Entry" labelClassName="text-[10px] text-slate-400 uppercase font-bold" />
                      <input type="number" step="0.01" value={entryPrice || ''} disabled={planCommitted} onChange={(e) => setEntryPrice(Number(e.target.value))} className="mt-1 w-full p-1.5 text-sm border rounded font-mono bg-slate-50 disabled:opacity-60" />
                    </div>
                    <div>
                      <FieldHelp fieldId="stopPrice" label="Stop" labelClassName="text-[10px] text-slate-400 uppercase font-bold" />
                      <input type="number" step="0.01" value={stopPrice || ''} onChange={(e) => {
                        const v = Number(e.target.value);
                        setStopPrice(v);
                        // Before commit, keep original in sync with stop (avoids freezing at first digit typed)
                        if (!planCommitted) setOriginalStop(v);
                      }} className="mt-1 w-full p-1.5 text-sm border rounded font-mono bg-slate-50" />
                    </div>
                    <div>
                      <FieldHelp fieldId="originalStop" label="Original stop" labelClassName="text-[10px] text-slate-400 uppercase font-bold" />
                      <input
                        type="number"
                        step="0.01"
                        value={planCommitted ? (originalStop || '') : (stopPrice || originalStop || '')}
                        disabled
                        readOnly
                        className="mt-1 w-full p-1.5 text-sm border rounded font-mono bg-slate-100 text-slate-600"
                      />
                      <p className="text-[10px] text-slate-400 mt-0.5">Frozen at Commit — used to block stop widening.</p>
                    </div>
                    <div>
                      <FieldHelp fieldId="setupGrade" label="Setup grade" labelClassName="text-[10px] text-slate-400 uppercase font-bold" />
                      <select value={setupGrade} disabled={planCommitted} onChange={(e) => setSetupGrade(e.target.value)} className="mt-1 w-full p-1.5 text-sm border rounded bg-slate-50 disabled:opacity-60">
                        <option value="A">A — full risk</option>
                        <option value="B">B — 0.5× risk</option>
                        <option value="C">C — no trade</option>
                        <option value="no_trade">No Trade</option>
                      </select>
                    </div>
                  </div>
                  <div className={`p-3 rounded-lg border text-sm ${positionSize.shares > 0 && gate.allowedRisk > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="flex justify-between font-bold"><span>Max shares (preview)</span><span className="font-mono">{positionSize.shares}</span></div>
                    <div className="flex justify-between text-xs mt-1"><span>Allowed risk</span><span className="font-mono">$${gate.allowedRisk.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
                  </div>
                  {tradePlan.reasons.map((r) => (
                    <div key={r} className="mt-2 text-[11px] text-red-700">• {r}</div>
                  ))}
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-2">
                  <h2 className="text-base font-bold flex items-center gap-2"><Shield className="text-amber-500 h-5 w-5" /> Earnings / event</h2>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={earningsChecked} disabled={planCommitted} onChange={(e) => setEarningsChecked(e.target.checked)} />
                    <span className="flex items-center gap-1">Earnings checked <HelpIcon fieldId="earningsChecked" /></span>
                  </label>
                  <select value={earningsTiming} disabled={planCommitted} onChange={(e) => setEarningsTiming(e.target.value)} className="w-full p-1.5 text-sm border rounded bg-slate-50 disabled:opacity-60">
                    <option value="none">None known</option>
                    <option value="today">Today — BLOCK</option>
                    <option value="tomorrow">Tomorrow — BLOCK</option>
                    <option value="this_week">This week</option>
                    <option value="unknown">Unknown — BLOCK</option>
                  </select>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={highImpactEventPending} disabled={planCommitted} onChange={(e) => setHighImpactEventPending(e.target.checked)} />
                    High-impact event pending
                  </label>
                  {highImpactEventPending && (
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={highImpactEventApproved} disabled={planCommitted} onChange={(e) => setHighImpactEventApproved(e.target.checked)} />
                      Explicitly approved in plan
                    </label>
                  )}
                  <details className="text-xs pt-2">
                    <summary className="cursor-pointer text-slate-500 font-semibold">Adds / profit protection (optional)</summary>
                    <div className="mt-2 space-y-2">
                      <label className="flex items-center gap-2"><input type="checkbox" checked={isAdd} disabled={planCommitted} onChange={(e) => setIsAdd(e.target.checked)} /> Add to position</label>
                      {isAdd && (
                        <>
                          <select value={addType} disabled={planCommitted} onChange={(e) => setAddType(e.target.value)} className="w-full p-1.5 border rounded bg-slate-50">
                            <option value="not_allowed">Not allowed</option>
                            <option value="winner_add">Winner add</option>
                            <option value="loser_add">Loser add (pre-planned)</option>
                          </select>
                          <label className="flex items-center gap-2"><input type="checkbox" checked={addPrePlanned} disabled={planCommitted} onChange={(e) => setAddPrePlanned(e.target.checked)} /> Pre-planned</label>
                        </>
                      )}
                      <select value={profitProtectionPlan} disabled={planCommitted} onChange={(e) => setProfitProtectionPlan(e.target.value)} className="w-full p-1.5 border rounded bg-slate-50">
                        <option value="none">Profit plan: None</option>
                        <option value="partial">Take partials</option>
                        <option value="move_stop">Move stop</option>
                        <option value="preplanned_full_risk">Pre-planned full risk</option>
                      </select>
                    </div>
                  </details>
                </div>
              </div>

              <div className="space-y-4">
                <div className="bg-indigo-50 border border-indigo-200 p-5 rounded-xl space-y-3">
                  <h2 className="text-base font-bold flex items-center gap-2 text-indigo-900">
                    Lock plan <HelpIcon fieldId="planCommit" />
                  </h2>
                  {!planCommitted ? (
                    <>
                      <div>
                        <FieldHelp fieldId="planThesis" label="Thesis" labelClassName="text-[10px] text-indigo-700 uppercase font-bold" />
                        <textarea value={planThesis} onChange={(e) => setPlanThesis(e.target.value)} rows={2} className="mt-1 w-full p-2 text-sm border rounded bg-white" placeholder="Why this trade? Or why sit on hands?" />
                      </div>
                      <div>
                        <FieldHelp fieldId="planInvalidation" label="Invalidation" labelClassName="text-[10px] text-indigo-700 uppercase font-bold" />
                        <textarea value={planInvalidation} onChange={(e) => setPlanInvalidation(e.target.value)} rows={2} className="mt-1 w-full p-2 text-sm border rounded bg-white" placeholder="What proves me wrong? (optional for sit-on-hands)" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <FieldHelp fieldId="planEmotion" label="Emotion 1–5" labelClassName="text-[10px] text-indigo-700 uppercase font-bold" />
                          <input type="range" min={1} max={5} value={planEmotion} onChange={(e) => setPlanEmotion(Number(e.target.value))} className="mt-2 w-full" />
                          <div className="text-center font-mono text-sm font-bold">{planEmotion}</div>
                        </div>
                        <label className="flex items-center gap-2 text-sm mt-4 cursor-pointer">
                          <input type="checkbox" checked={planNotRevenge} onChange={(e) => setPlanNotRevenge(e.target.checked)} />
                          <span className="flex items-center gap-1">Not revenge <HelpIcon fieldId="planNotRevenge" /></span>
                        </label>
                      </div>
                      <button type="button" onClick={() => commitTradePlan()} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-lg text-sm">
                        Commit trade plan
                      </button>
                      <button
                        type="button"
                        onClick={() => commitTradePlan({ sitOnHands: true })}
                        className="w-full border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-bold py-2.5 rounded-lg text-sm flex items-center justify-center gap-1"
                      >
                        Sit on hands — no trade <HelpIcon fieldId="sitOnHands" />
                      </button>
                      <p className="text-[10px] text-slate-500 text-center">Sit on hands needs thesis only — no ticker. Not-revenge is optional.</p>
                    </>
                  ) : (
                    <>
                      <div className="text-sm space-y-1 font-mono bg-white border border-indigo-100 rounded p-3">
                        {committedPlan?.sitOnHands ? (
                          <div className="font-bold text-indigo-900">SIT ON HANDS · no_trade</div>
                        ) : (
                          <>
                            <div className="font-bold text-indigo-900">{committedPlan?.ticker} · {committedPlan?.setupGrade} · {committedPlan?.direction}</div>
                            <div>Entry {committedPlan?.entry} / Stop {committedPlan?.originalStop}</div>
                          </>
                        )}
                        <div className="text-xs text-slate-600 whitespace-pre-wrap">{committedPlan?.thesis}</div>
                        {!committedPlan?.sitOnHands && (
                          <div className="text-xs text-slate-500 whitespace-pre-wrap">Invalidation: {committedPlan?.invalidation}</div>
                        )}
                        <div className="text-[10px] text-slate-400">Emotion {committedPlan?.emotion} · locked {committedPlan?.committedAt ? new Date(committedPlan.committedAt).toLocaleString() : ''}</div>
                      </div>
                      <p className="text-[11px] text-indigo-800">
                        {committedPlan?.sitOnHands
                          ? 'No new risk today. Void only if you change your mind and want a trade plan.'
                          : 'Stop may only tighten. Void to change ticker/entry/thesis.'}
                      </p>
                      <button type="button" onClick={voidTradePlan} className="w-full border border-red-300 text-red-700 font-bold py-2 rounded-lg text-sm hover:bg-red-50 flex items-center justify-center gap-1">
                        Void plan <HelpIcon fieldId="planVoid" />
                      </button>
                    </>
                  )}
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200">
                  <h3 className="text-sm font-bold mb-2 flex items-center gap-1">Watchlist <HelpIcon fieldId="watchlist" /></h3>
                  <div className="flex gap-2 mb-2">
                    <input type="text" value={watchNote} onChange={(e) => setWatchNote(e.target.value)} placeholder="Note" className="flex-1 p-1.5 text-xs border rounded bg-slate-50" />
                    <button type="button" onClick={addToWatchlist} className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded">Save</button>
                  </div>
                  <ul className="space-y-1 max-h-28 overflow-y-auto thin-scrollbar">
                    {watchlist.map((w) => (
                      <li key={w.id} className="flex justify-between text-xs border-b border-slate-100 py-1">
                        <button type="button" onClick={() => loadTickerIntoPlanner(w)} className="font-mono font-bold text-indigo-700">{w.ticker}</button>
                        <button type="button" onClick={() => removeFromWatchlist(w.id)} className="text-slate-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- TAB 3: EXECUTE --- */}
        {activeTab === 'execute' && (
          <div className="space-y-4">
            <div className="bg-slate-900 text-white p-4 rounded-xl border border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-400 font-bold">Step 3 — Execute</div>
                <p className="text-sm text-slate-300 mt-1">Switch to Live only in your windows. Alerts on. Size is from the locked plan.</p>
              </div>
              <button type="button" onClick={() => setActiveTab('archive')} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-4 py-2 rounded-lg">
                Close day →
              </button>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase text-slate-400 font-bold flex items-center gap-1">Workspace <HelpIcon fieldId="workspaceMode" /></div>
                <p className="text-sm text-slate-600 mt-0.5">
                  {workspaceMode === 'planning' ? 'Planning — hours ignored for sizing checks.' : 'Live — windows + process enforced.'}
                </p>
              </div>
              <div className="flex rounded-lg overflow-hidden border border-slate-300">
                <button type="button" onClick={() => setWorkspaceMode('planning')} className={`px-4 py-2 text-sm font-bold ${workspaceMode === 'planning' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600'}`}>Planning</button>
                <button type="button" onClick={() => setWorkspaceMode('live')} className={`px-4 py-2 text-sm font-bold ${workspaceMode === 'live' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600'}`}>Live</button>
              </div>
            </div>

            {discipline.reason && (
              <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-900 font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span className="flex items-center gap-1">{discipline.reason} <HelpIcon fieldId="disciplineChip" /></span>
              </div>
            )}

            <div className={`p-5 rounded-xl border ${planOrLiveReady ? 'bg-emerald-50 border-emerald-300' : 'bg-red-50 border-red-300'}`}>
              <h2 className="text-base font-bold mb-2 flex items-center gap-2">
                <Clock className={`h-5 w-5 ${planOrLiveReady ? 'text-emerald-700' : 'text-red-700'}`} />
                {workspaceMode === 'planning' ? 'Plan gate' : 'Live gate'}
                <HelpIcon fieldId="gateStatus" />
              </h2>
              <div className={`text-2xl font-black mb-2 ${planOrLiveReady ? 'text-emerald-700' : 'text-red-700'}`}>
                {workspaceMode === 'planning'
                  ? (gate.planningReady ? 'PLAN READY' : 'PLAN BLOCKED')
                  : (gate.allowed ? 'TRADING ALLOWED' : 'TRADING BLOCKED')}
              </div>
              <div className="text-xs font-semibold text-slate-600 mb-2">
                {workspaceMode} · {gate.phase} · IDT {gate.israelTimeLabel} · shares {planOrLiveReady ? positionSize.shares : 0} · risk $${gate.allowedRisk.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
              {gate.reasons.length > 0 && (
                <ul className="space-y-1">
                  {gate.reasons.map((reason) => (
                    <li key={reason} className="text-xs text-red-800 flex gap-1.5">
                      <Ban className="h-3.5 w-3.5 shrink-0 mt-0.5" />{reason}
                    </li>
                  ))}
                </ul>
              )}
              {gate.warnings?.map((w) => (
                <p key={w} className="text-[11px] text-amber-800 mt-1 font-semibold">{w}</p>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-3">
                <h3 className="text-sm font-bold">Prep checks</h3>
                <div className="text-sm text-slate-600">Plan locked: {planCommitted ? '✓' : '○ (step 2)'}</div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <div onClick={() => toggleRoutine('alerts')} className="text-blue-500">{routine.alerts ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4 text-slate-300" />}</div>
                  <span className="flex items-center gap-1">Alerts set <HelpIcon fieldId="routineAlerts" /></span>
                </label>
                <label className={`flex items-center gap-2 ${!gate.allowed ? 'opacity-50' : 'cursor-pointer'}`}>
                  <div onClick={() => { if (gate.allowed) toggleRoutine('orders'); }} className="text-orange-500">{routine.orders ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4 text-slate-300" />}</div>
                  <span>Brackets entered {gate.allowed ? '' : '(Live only)'}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer pt-2 border-t">
                  <input type="checkbox" checked={noTradeToday} onChange={(e) => setNoTradeToday(e.target.checked)} />
                  <span className="flex items-center gap-1 text-sm">No trade today <HelpIcon fieldId="noTradeToday" /></span>
                </label>
              </div>
              <div className="bg-white p-5 rounded-xl border border-slate-200">
                <h3 className="text-sm font-bold mb-2">Locked plan summary</h3>
                {!planCommitted ? (
                  <p className="text-xs text-slate-500">Commit a plan in step 2 first.</p>
                ) : committedPlan?.sitOnHands ? (
                  <div className="text-sm font-mono space-y-1">
                    <div className="font-bold text-slate-800">Sit on hands — no new risk</div>
                    <div className="text-xs text-slate-600">{committedPlan?.thesis}</div>
                  </div>
                ) : (
                  <div className="text-sm font-mono space-y-1">
                    <div className="font-bold">{committedPlan?.ticker} {committedPlan?.direction} grade {committedPlan?.setupGrade}</div>
                    <div>{committedPlan?.entry} → stop {committedPlan?.originalStop}</div>
                    <div className="text-xs text-slate-600">{committedPlan?.thesis}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* --- TAB 4: CLOSE DAY --- */}
        {activeTab === 'archive' && (
          <div className="space-y-6">
            <div className="bg-slate-900 text-white p-4 rounded-xl border border-slate-700">
              <div className="text-xs uppercase tracking-wider text-slate-400 font-bold">Step 4 — Close day</div>
              <p className="text-sm text-slate-300 mt-1">Write the truth, archive, auto-download backup for your other PC.</p>
            </div>

            {backupOverdue && (
              <div className="p-3 rounded-lg border border-amber-300 bg-amber-50 text-sm text-amber-900 font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span className="flex items-center gap-1">Backup overdue — Export or Archive to download JSON for your other PC. <HelpIcon fieldId="backupExport" /></span>
              </div>
            )}

            <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-3">
              <h2 className="text-base font-bold flex items-center gap-2"><Save className="h-5 w-5 text-slate-700" /> Close today</h2>
              <input type="date" value={journalDate} onChange={(e) => setJournalDate(e.target.value)} className="w-full p-1.5 text-sm border rounded bg-slate-50 font-mono" />
              <select value={executionType} onChange={(e) => setExecutionType(e.target.value)} className="w-full p-1.5 text-sm border rounded bg-slate-50">
                <option value="perfect">Perfect plan followed</option>
                <option value="mistake">Execution mistake</option>
              </select>
              {executionType === 'mistake' && (
                <div className="bg-red-50 p-3 rounded border border-red-200 space-y-2">
                  <select value={mistakeCategory} onChange={(e) => setMistakeType(e.target.value)} className="w-full p-1.5 text-sm border border-red-300 rounded">
                    <option value="none">Classification...</option>
                    <option value="fomo">FOMO</option>
                    <option value="chasing">Chasing / revenge</option>
                    <option value="stop_down">Moved SL</option>
                    <option value="oversized">Oversized</option>
                    <option value="early_exit">Early exit</option>
                  </select>
                  <input type="number" step="0.5" value={mistakeCostR} onChange={(e) => setMistakeCostR(Number(e.target.value))} placeholder="Cost in R" className="w-full p-1.5 text-sm border border-red-300 rounded font-mono" />
                  {['w1', 'w2', 'w3', 'w4', 'w5'].map((k, i) => (
                    <input key={k} type="text" placeholder={`${i + 1}. Why?`} value={fiveWs[k]} onChange={(e) => setFiveWs({ ...fiveWs, [k]: e.target.value })} className="w-full p-1.5 text-xs border border-red-200 rounded" />
                  ))}
                  <input type="text" placeholder="Solution" value={fiveWs.solution} onChange={(e) => setFiveWs({ ...fiveWs, solution: e.target.value })} className="w-full p-1.5 text-xs border border-emerald-300 bg-emerald-50 rounded" />
                </div>
              )}
              <textarea
                className="w-full h-24 p-2 text-sm border rounded bg-slate-50"
                placeholder="Session notes (min ~20 chars)..."
                value={dailyNotes}
                onChange={(e) => setDailyNotes(e.target.value)}
              />
              <button type="button" onClick={archiveDay} className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-2.5 rounded-lg text-sm flex justify-center items-center gap-2">
                <Save className="h-4 w-4" />
                Archive day + download backup
              </button>
            </div>

            <div className="bg-slate-800 text-white p-5 rounded-xl shadow-sm border border-slate-700">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-bold flex items-center gap-2">
                    <Download className="text-blue-400 h-5 w-5" />
                    File transfer backup
                    <HelpIcon fieldId="backupExport" />
                  </h3>
                  <p className="text-slate-400 text-xs mt-1">
                    Last backup: {lastBackupAt ? new Date(lastBackupAt).toLocaleString() : 'never'} · Import on work PC / home laptop.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => exportDatabase()}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs py-2.5 px-4 rounded-lg flex items-center gap-1.5"
                  >
                    <Download className="h-4 w-4" />
                    Export (.json)
                  </button>
                  <label className="cursor-pointer bg-slate-700 hover:bg-slate-600 text-white font-semibold text-xs py-2.5 px-4 rounded-lg flex items-center gap-1.5">
                    <Upload className="h-4 w-4" />
                    Import
                    <input type="file" accept=".json" onChange={importDatabase} className="hidden" />
                  </label>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                <div className="p-3 bg-emerald-50 rounded-lg text-emerald-600">
                  <Award className="h-8 w-8" />
                </div>
                <div>
                  <div className="text-xs text-slate-400 uppercase font-bold tracking-wider">Overall Execution Rating</div>
                  <div className="text-2xl font-black text-slate-800">{disciplineScore.toFixed(0)}%</div>
                  <div className="text-[10px] text-slate-500">Perfect Execution Ratio</div>
                </div>
              </div>
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                <div className="p-3 bg-red-50 rounded-lg text-red-600">
                  <Ban className="h-8 w-8" />
                </div>
                <div>
                  <div className="text-xs text-slate-400 uppercase font-bold tracking-wider">Total Leaked Capital</div>
                  <div className="text-2xl font-black text-red-700 font-mono">-${totalDollarLeaks.toLocaleString(undefined, {maximumFractionDigits: 0})}</div>
                  <div className="text-[10px] text-red-500">Lost to execution mistakes</div>
                </div>
              </div>
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                <div className="p-3 bg-indigo-50 rounded-lg text-indigo-600">
                  <Calendar className="h-8 w-8" />
                </div>
                <div>
                  <div className="text-xs text-slate-400 uppercase font-bold tracking-wider">Archived Sessions</div>
                  <div className="text-2xl font-black text-slate-800">{history.length} Days</div>
                  <div className="text-[10px] text-slate-500">Logged in Cockpit Database</div>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-slate-800 border-b pb-4">
                <BookOpen className="text-indigo-500 h-6 w-6" />
                Journal Archive
              </h2>
              
              {history.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Calendar className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p>No days archived yet. Save your daily routine from the dashboard.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {history.map((entry) => (
                    <div key={entry.id} className="p-4 border border-slate-200 rounded-lg hover:shadow-md transition-shadow bg-slate-50 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start mb-3 border-b border-slate-200 pb-2">
                          <div className="font-bold text-indigo-700 flex items-center gap-2">
                            <span>{entry.date}</span>
                            {entry.executionType === 'perfect' ? (
                              <span className="bg-green-100 text-green-800 text-[9px] font-bold px-1.5 py-0.5 rounded border border-green-200">PERFECT EXECUTION</span>
                            ) : (
                              <span className="bg-red-100 text-red-800 text-[9px] font-bold px-1.5 py-0.5 rounded border border-red-200 uppercase">
                                MISTAKE: {entry.mistakeCategory.replace('_', ' ')}
                              </span>
                            )}
                          </div>
                          <button onClick={() => deleteEntry(entry.id)} className="text-slate-400 hover:text-red-600 transition-colors p-1" title="Delete log">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        
                        <div className="grid grid-cols-3 gap-2 mb-4 text-xs">
                          <div className="bg-white p-2 rounded border">
                            <div className="text-[10px] text-slate-400 uppercase font-bold">Net Liq</div>
                            <div className="font-mono font-bold">${Number(entry.netLiq).toLocaleString()}</div>
                          </div>
                          <div className={`p-2 rounded border ${entry.drawdown > 0 ? 'bg-red-50 border-red-100 text-red-700' : 'bg-green-50 border-green-100 text-green-700'}`}>
                            <div className="text-[10px] uppercase font-bold opacity-70">Drawdown</div>
                            <div className="font-mono font-bold">{entry.drawdown}%</div>
                          </div>
                          <div className="bg-white p-2 rounded border">
                            <div className="text-[10px] text-slate-400 uppercase font-bold">Regime</div>
                            <div className="font-semibold text-[10px] leading-tight text-slate-600 truncate" title={entry.regime}>
                              {entry.regime}
                            </div>
                          </div>
                        </div>

                        {entry.executionType === 'mistake' && (
                          <div className="mb-3 p-2.5 bg-red-50 text-red-800 rounded border border-red-100 text-xs">
                            <strong>Mistake Cost:</strong> -{entry.mistakeCostR}R (${(entry.mistakeCostR * entry.rValue).toLocaleString(undefined, {maximumFractionDigits: 0})})
                          </div>
                        )}

                        {entry.gateAllowed != null && (
                          <div className={`mb-3 p-2 rounded border text-[11px] ${entry.gateAllowed ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-amber-50 border-amber-100 text-amber-900'}`}>
                            <strong>Gate:</strong> {entry.gateAllowed ? 'ALLOWED' : 'BLOCKED'}
                            {entry.ticker ? ` · ${entry.ticker}` : ''}
                            {entry.setupGrade ? ` · Grade ${entry.setupGrade}` : ''}
                            {entry.gateReasons?.length ? (
                              <div className="mt-1 opacity-80">{entry.gateReasons.slice(0, 3).join(' · ')}</div>
                            ) : null}
                          </div>
                        )}
                        
                        {entry.notes ? (
                          <div className="text-xs text-slate-600 bg-white p-3 rounded border border-slate-100 italic whitespace-pre-wrap leading-relaxed">
                            "{entry.notes}"
                          </div>
                        ) : (
                          <div className="text-xs text-slate-400 italic">No notes recorded.</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* --- TAB 3: THE ENGINE BLUEPRINT --- */}
        {activeTab === 'blueprint' && (
          <div className="max-w-4xl mx-auto">
            <div className="bg-slate-900 p-8 rounded-xl shadow-lg border border-slate-800 text-white mb-8">
              <h1 className="text-3xl font-black tracking-tight mb-2 flex items-center gap-3">
                <Target className="text-blue-500 h-8 w-8" />
                The Core Mission
              </h1>
              <p className="text-slate-300 text-lg border-l-4 border-blue-500 pl-4 mt-6 italic">
                "To build a highly optimized, repeatable engine that provides a sustainable income, allowing me to be my own boss and transition to full-time trading. The research, cognitive, and psychological chess match of the market sparks my intellectual curiosity."
              </p>
            </div>

            <BlueprintSection icon={Zap} title="Phase 1: Philosophy & The Whys">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">Why Momentum Growth?</h3>
                  <ul className="list-disc pl-5 space-y-2 text-sm">
                    <li><strong>Fast Feedback Loops:</strong> Holding periods of days/weeks provide rapid feedback, avoiding dead money.</li>
                    <li><strong>Asymmetrical Risk/Reward:</strong> Winners naturally dwarf losers when risk is managed, allowing for outperformance.</li>
                    <li><strong>Herd Footprint:</strong> Institutional buying leaves massive, visible footprints in volume and price expansion.</li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">Structural Beliefs</h3>
                  <ul className="list-disc pl-5 space-y-2 text-sm">
                    <li><strong>Breakouts:</strong> Stage 2 uptrends consolidating. Supply is systematically absorbed. Resistance breaks = supply vacuum.</li>
                    <li><strong>Episodic Pivots (EP):</strong> Massive fundamental re-pricing. Institutions accumulate over weeks, creating drift.</li>
                    <li><strong>Parabolic Shorts:</strong> Climax of buying pressure driven by retail euphoria and greed.</li>
                  </ul>
                </div>
              </div>
            </BlueprintSection>

            <BlueprintSection icon={Calculator} title="Phase 2: Risk Normalities">
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-6 font-mono text-xs md:text-sm text-center">
                <div className="font-bold text-slate-600 mb-2 uppercase tracking-widest">Drawdown Math Tree</div>
                <div className="mb-1">Is Net Liq at All-Time High / Normal?</div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className="border-t-2 border-green-400 pt-2 text-green-700">
                    <strong>YES (Constructive)</strong><br/>
                    Risk: 1.0% - 1.5%<br/>
                    Margin allowed
                  </div>
                  <div className="border-t-2 border-red-400 pt-2 text-red-700 text-left pl-4">
                    <strong>NO (Drawdown)</strong><br/>
                    <span className="text-yellow-600">-5% DD:</span> Drop to 0.75% (No Margin)<br/>
                    <span className="text-orange-600">-10% DD:</span> Drop to 0.5% (Max 2 pos)<br/>
                    <span className="text-red-600">-15% DD:</span> Hard Stop. 1 Wk Off + Paper
                  </div>
                </div>
              </div>
              <p className="text-sm">
                <strong>Expectancy Truth:</strong> A 35% win rate mathematically guarantees consecutive losing streaks of 5 to 7 trades. You must trust the math and allow the progressive brake to protect the portfolio.
              </p>
            </BlueprintSection>

            <BlueprintSection icon={Crosshair} title="Phase 3: The Mechanics (Breakouts)">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-bold text-slate-900 mb-3 border-b pb-2">The Setup Checklist</h3>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-emerald-500 shrink-0"/> Stage 2 Uptrend (Price &gt; 10,20,50,100,200 SMA)</li>
                    <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-emerald-500 shrink-0"/> Prior velocity of +50% move</li>
                    <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-emerald-500 shrink-0"/> Shallow digestion (depth &lt; 15-20%)</li>
                    <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-emerald-500 shrink-0"/> Vol Squeeze: 5-8 days higher lows, dry vol</li>
                    <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-emerald-500 shrink-0"/> High Beta: ADR &gt; 5%</li>
                    <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-emerald-500 shrink-0"/> Liquidity: Avg $ Vol &gt; $100M, Price &gt; $5</li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 mb-3 border-b pb-2">Trade Management</h3>
                  <ul className="space-y-3 text-sm">
                    <li><strong>Action Stop:</strong> If it stalls near SL for 2 days on higher vol, cut it before the hard stop hits.</li>
                    <li><strong>Offense (+3R):</strong> Sell 1/3 into immediate strength (3-4 days) to secure risk-free trade.</li>
                    <li><strong>Offense (Extension):</strong> Sell 1/5 if price stretches 7-10x the ATR.</li>
                    <li><strong>Defense (Trail):</strong> If ADR 5-8%, trail under 20 SMA. If ADR &gt;8%, trail under 10 SMA.</li>
                  </ul>
                </div>
              </div>
            </BlueprintSection>

            <BlueprintSection icon={Shield} title="Phase 4: Circuit Breakers">
              <div className="space-y-4">
                <div className="bg-orange-50 border-l-4 border-orange-500 p-4 rounded">
                  <h4 className="font-bold text-orange-900">Breaker A: Intraday Separation</h4>
                  <p className="text-sm text-orange-800 mt-1"><strong>Rule:</strong> Discretionary market orders executed during working hours are strictly prohibited. Entries must be pre-planned bracket orders. <br/><strong>Penalty:</strong> Suspended from execution for 2 days.</p>
                </div>
                <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
                  <h4 className="font-bold text-blue-900">Breaker B: Market Regime</h4>
                  <p className="text-sm text-blue-800 mt-1"><strong>Rule:</strong> If QQQ/SPY close below 21 EMA, breakouts are restricted. If QQQ closes below 50 SMA, 0% breakout allocation (lockdown).</p>
                </div>
                <div className="bg-emerald-50 border-l-4 border-emerald-500 p-4 rounded">
                  <h4 className="font-bold text-emerald-900">Breaker C: The Next Small Win (+2R)</h4>
                  <p className="text-sm text-emerald-800 mt-1"><strong>Rule:</strong> To step up from a drawdown risk tier, portfolio must generate +2R realized closed profit over the last 3 closed trades. Focus only on stacking the next small win, not the final P&L goal.</p>
                </div>
                <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
                  <h4 className="font-bold text-red-950 font-bold">Breaker D: Mental Stop-Loss Lock</h4>
                  <p className="text-sm text-red-800 mt-1"><strong>Rule:</strong> A physical stop-loss order can NEVER be adjusted downward. Any adjustment triggers immediate forced liquidation of the entire position.</p>
                </div>
                <div className="bg-violet-50 border-l-4 border-violet-500 p-4 rounded">
                  <h4 className="font-bold text-violet-900">Breaker E: Schedule + Earnings Gate</h4>
                  <p className="text-sm text-violet-800 mt-1"><strong>Rule:</strong> New trades only in approved IDT windows (17:00–18:00, 20:30–22:45) during US regular hours. Premarket/after-hours blocked. Earnings today/tomorrow/unknown blocks entry. Profit protection required at +15% or +2R.</p>
                </div>
              </div>
            </BlueprintSection>

            <BlueprintSection icon={Award} title="Phase 6: The 5 W's Mistake Diagnosis">
              <div className="space-y-4">
                <p className="text-sm text-slate-700">When an execution mistake occurs, do not simply try to "do better next time." Use the Toyota 5 W's method to find the root cause of the friction.</p>
                <div className="bg-slate-100 p-4 rounded-lg font-mono text-xs border border-slate-300">
                  <strong>Example Diagnosis:</strong><br/>
                  * Mistake: I cheated my stop loss.<br/>
                  * W1: Why? I thought it was a momentum burst so I oversized.<br/>
                  * W2: Why? I saw heavy tape buying.<br/>
                  * W3: Why did that matter? Because I've seen it work before.<br/>
                  * W4: Why did it work before? Because the market was highly constructive then.<br/>
                  * W5: Why did I do it today? I didn't check Breaker B (Market Regime) first.<br/>
                  <strong>Solution:</strong> The problem isn't the stop. The solution is strictly enforcing Breaker B.
                </div>
              </div>
            </BlueprintSection>
          </div>
        )}

      </div>
    </div>
  );
}