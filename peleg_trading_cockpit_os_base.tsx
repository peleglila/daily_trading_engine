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
import { FieldHelp, HelpIcon } from './src/ui/FieldHelp';

export default function App() {
  // --- STATE ---
  // state = portfolio/market snapshot · tools = plan/size/actions · archive · blueprint
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
    };
    localStorage.setItem('pelegTradeGateConfig', JSON.stringify(gateConfig));
  }, [
    tradingSchedule, tradeTicker, earningsChecked, earningsTiming, eventNotes,
    highImpactEventPending, highImpactEventApproved, setupGrade, entryPrice, stopPrice,
    originalStop, tradeDirection, isAdd, addType, addPrePlanned, positionIsLosing,
    combinedRiskR, unrealizedGainPct, unrealizedR, profitProtectionPlan, requestedShares,
    workspaceMode, watchlist, unrealizedPL, excessLiquidity, buyingPower, maintMargin,
    positions, snapshotImportedAt, routine, unrealizedOpenRisk, dailyRealizedPL,
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
  const setupCapBlocked =
    routine.snapshotImported &&
    ({ no_trade: 0, C: 1, B: 2, A: 3 }[setupGrade] ?? 0) >
      ({ no_trade: 0, C: 1, B: 2, A: 3 }[portfolioScore.suggestedSetupCap] ?? 3);

  // --- DISCIPLINE ANALYTICS CALCULATIONS ---
  const totalLogs = history.length;
  const perfectExecutionLogs = history.filter(item => item.executionType === 'perfect').length;
  const disciplineScore = totalLogs > 0 ? (perfectExecutionLogs / totalLogs) * 100 : 100;
  
  const totalRLeaks = history.reduce((sum, item) => sum + (Number(item.mistakeCostR) || 0), 0);
  const totalDollarLeaks = history.reduce((sum, item) => sum + ((Number(item.mistakeCostR) || 0) * (Number(item.rValue) || 0)), 0);

  // --- ACTIONS ---
  const toggleRoutine = (key) => setRoutine(prev => ({ ...prev, [key]: !prev[key] }));

  const loadTickerIntoPlanner = (item) => {
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
    if (!window.confirm("Archive today's data and reset checklists?")) return;

    // Handle manual date setting and convert to Israeli DD/MM/YYYY formatting
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
      notes: compiledNotes || 'No notes entered for this session.',
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
    };
    
    saveHistory([newEntry, ...history]);
    
    // Reset daily fields
    setDailyNotes('');
    setDailyRealizedPL(0);
    setUnrealizedOpenRisk(0);
    setExecutionType('perfect');
    setMistakeType('none');
    setMistakeCostR(0);
    setFiveWs({ w1: '', w2: '', w3: '', w4: '', w5: '', solution: '' });
    setJournalDate(new Date().toISOString().split('T')[0]); // Reset date picker to current local date
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
    alert("Day archived successfully! Focus on the next small win.");
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

  const exportDatabase = () => {
    const backupData = {
      history,
      peakEquity,
      currentEquity,
      last3R,
      manualRiskTier,
      qqqStatus,
      spyStatus,
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
  };

  const importDatabase = (e) => {
    const fileReader = new FileReader();
    fileReader.readAsText(e.target.files[0], "UTF-8");
    fileReader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (parsed.history) saveHistory(parsed.history);
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
              <p className="text-slate-400 text-sm mt-1">State · Plan & Size · Journal • IDT</p>
            </div>
            <div className="text-left md:text-right bg-slate-800 p-3 rounded-lg border border-slate-700">
              <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Current Net Liq</div>
              <div className="text-2xl font-mono font-bold text-emerald-400">${currentEquity.toLocaleString()}</div>
            </div>
          </div>
          
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            <button 
              onClick={() => setActiveTab('state')}
              className={`px-5 py-3 rounded-t-lg font-semibold text-sm transition-colors flex items-center gap-2 whitespace-nowrap ${activeTab === 'state' ? 'bg-slate-50 text-slate-900' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'}`}
            >
              <Activity className="h-4 w-4" />
              Portfolio & Market
            </button>
            <button 
              onClick={() => setActiveTab('tools')}
              className={`px-5 py-3 rounded-t-lg font-semibold text-sm transition-colors flex items-center gap-2 whitespace-nowrap ${activeTab === 'tools' ? 'bg-slate-50 text-slate-900' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'}`}
            >
              <Calculator className="h-4 w-4" />
              Plan & Size
            </button>
            <button 
              onClick={() => setActiveTab('archive')}
              className={`px-5 py-3 rounded-t-lg font-semibold text-sm transition-colors flex items-center gap-2 whitespace-nowrap ${activeTab === 'archive' ? 'bg-slate-50 text-slate-900' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'}`}
            >
              <Calendar className="h-4 w-4" />
              Journal ({history.length})
            </button>
            <button 
              onClick={() => setActiveTab('blueprint')}
              className={`px-5 py-3 rounded-t-lg font-semibold text-sm transition-colors flex items-center gap-2 whitespace-nowrap ${activeTab === 'blueprint' ? 'bg-slate-50 text-slate-900' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'}`}
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
                  Portfolio & Market State <HelpIcon fieldId="snapshotImport" />
                </div>
                <p className="text-sm text-slate-300 mt-1">Start of day: import IBKR Portfolio screenshot, then review risk score.</p>
              </div>
              <button
                onClick={() => setActiveTab('tools')}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-4 py-2 rounded-lg flex items-center gap-2"
              >
                <Calculator className="h-4 w-4" />
                Open Plan & Size
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

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            
            {/* COLUMN 1: Math & Limits (Left - 4 cols) */}
            <div className="md:col-span-4 space-y-6">
              
              <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                <h2 className="text-base font-bold mb-4 flex items-center gap-2 text-slate-800">
                  <TrendingDown className="text-blue-500 h-5 w-5" />
                  Equity Engine
                </h2>
                <div className="space-y-4">
                  <div>
                    <FieldHelp fieldId="peakEquity" label="High-Water Mark (Peak)" />
                    <input type="number" value={peakEquity} onChange={(e) => setPeakEquity(Number(e.target.value))} className="mt-1 w-full p-2 border border-slate-300 rounded-md font-mono focus:ring-blue-500 bg-slate-50" />
                  </div>
                  <div>
                    <FieldHelp fieldId="currentEquity" label="Current Net Liq" />
                    <input type="number" value={currentEquity} onChange={(e) => setCurrentEquity(Number(e.target.value))} className="mt-1 w-full p-2 border border-slate-300 rounded-md font-mono focus:ring-blue-500 bg-slate-50" />
                  </div>
                  
                  <div className={`p-3 rounded-lg border flex justify-between items-center ${drawdown >= 15 ? 'bg-red-50 border-red-200 text-red-700' : drawdown > 0 ? 'bg-orange-50 border-orange-200 text-orange-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
                    <span className="font-semibold text-sm flex items-center gap-1">Drawdown <HelpIcon fieldId="drawdown" /></span>
                    <span className="font-mono font-bold text-lg">{drawdown.toFixed(2)}%</span>
                  </div>
                </div>
              </div>

              <div className={`p-5 rounded-xl shadow-sm border relative ${riskStatus.color}`}>
                {isRecoveryMode && (
                  <div className="absolute -top-3 -right-2 bg-indigo-600 text-white text-[10px] font-bold px-2 py-1 rounded shadow-sm border border-indigo-400 uppercase tracking-wide animate-pulse">
                    Recovery Override
                  </div>
                )}
                <h2 className="text-xs font-bold uppercase tracking-wider mb-1 opacity-80 flex items-center gap-1">Allowed Risk Per Trade <HelpIcon fieldId="oneR" /></h2>
                <div className="text-3xl font-black mb-1">{riskStatus.risk}</div>
                {riskStatus.msg && <div className="font-bold text-xs mb-3">{riskStatus.msg}</div>}
              </div>

              <div className="bg-slate-800 p-5 rounded-xl shadow-sm text-white">
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Risk Parameters</h2>
                <div className="space-y-3">
                  <div className="flex justify-between items-center border-b border-slate-700 pb-2">
                    <span className="text-sm font-medium flex items-center gap-1">1R Base Value <HelpIcon fieldId="oneR" /></span>
                    <span className="font-mono font-bold text-blue-400">
                      ${riskPercent > 0 ? oneRValue.toLocaleString(undefined, {maximumFractionDigits: 0}) : '0'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center border-b border-slate-700 pb-2">
                    <span className="text-sm font-medium flex items-center gap-1 text-red-400">
                      <AlertCircle className="h-4 w-4" /> Max Daily Loss <HelpIcon fieldId="dailyMaxLoss" />
                    </span>
                    <div className="text-right">
                      <div className="font-mono font-bold text-red-400">-{dailyMaxLossR}R</div>
                      <div className="text-xs text-slate-400">
                        (${riskPercent > 0 ? dailyMaxLossDollar.toLocaleString(undefined, {maximumFractionDigits: 0}) : '0'})
                      </div>
                    </div>
                  </div>
                  <div>
                    <FieldHelp fieldId="dailyRealizedPL" label="Today's Realized Session P&L ($)" labelClassName="text-[10px] text-slate-400 uppercase tracking-wider font-semibold" />
                    <input 
                      type="number" 
                      value={dailyRealizedPL} 
                      onChange={(e) => setDailyRealizedPL(Number(e.target.value))} 
                      placeholder="e.g. -1200"
                      className="mt-1 w-full p-2 border border-slate-700 bg-slate-900 rounded-md text-sm font-mono text-white focus:ring-blue-500" 
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <FieldHelp fieldId="unrealizedPL" label="Unrealized P&L" labelClassName="text-[10px] text-slate-400 uppercase font-semibold" />
                      <input type="number" value={unrealizedPL} onChange={(e) => setUnrealizedPL(Number(e.target.value))} className="mt-1 w-full p-1.5 border border-slate-700 bg-slate-900 rounded text-xs font-mono text-white" />
                    </div>
                    <div>
                      <FieldHelp fieldId="excessLiquidity" label="Excess Liq" labelClassName="text-[10px] text-slate-400 uppercase font-semibold" />
                      <input type="number" value={excessLiquidity} onChange={(e) => setExcessLiquidity(Number(e.target.value))} className="mt-1 w-full p-1.5 border border-slate-700 bg-slate-900 rounded text-xs font-mono text-white" />
                    </div>
                    <div>
                      <FieldHelp fieldId="buyingPower" label="Buying Power" labelClassName="text-[10px] text-slate-400 uppercase font-semibold" />
                      <input type="number" value={buyingPower} onChange={(e) => setBuyingPower(Number(e.target.value))} className="mt-1 w-full p-1.5 border border-slate-700 bg-slate-900 rounded text-xs font-mono text-white" />
                    </div>
                    <div>
                      <FieldHelp fieldId="maintMargin" label="Maint Margin" labelClassName="text-[10px] text-slate-400 uppercase font-semibold" />
                      <input type="number" value={maintMargin} onChange={(e) => setMaintMargin(Number(e.target.value))} className="mt-1 w-full p-1.5 border border-slate-700 bg-slate-900 rounded text-xs font-mono text-white" />
                    </div>
                  </div>
                  {positions.length > 0 && (
                    <div>
                      <FieldHelp fieldId="positions" label="Open Positions" labelClassName="text-[10px] text-slate-400 uppercase font-semibold" />
                      <ul className="mt-1 space-y-2 max-h-40 overflow-y-auto overflow-x-hidden thin-scrollbar pr-0.5">
                        {positions.map((p) => (
                          <li key={p.ticker} className="text-[11px] font-mono text-slate-300 border border-slate-700 rounded p-1.5 space-y-1 min-w-0">
                            <div className="flex justify-between gap-2">
                              <span className="truncate">{p.ticker} × {p.qty}</span>
                              <span className="shrink-0">{p.pnl != null ? p.pnl.toLocaleString() : '—'}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-1 min-w-0">
                              <div className="min-w-0">
                                <span className="text-[9px] text-slate-500 uppercase flex items-center gap-0.5">Entry $ <HelpIcon fieldId="posEntryPrice" /></span>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={p.entryPrice ?? ''}
                                  onChange={(e) => {
                                    const next = positions.map((row) =>
                                      row.ticker === p.ticker ? { ...row, entryPrice: Number(e.target.value) } : row
                                    );
                                    setPositions(next);
                                  }}
                                  className="w-full min-w-0 p-1 border border-slate-700 bg-slate-900 rounded text-[10px] font-mono text-white"
                                  placeholder="avg"
                                />
                              </div>
                              <div className="min-w-0">
                                <span className="text-[9px] text-slate-500 uppercase flex items-center gap-0.5">Entry date <HelpIcon fieldId="posEntryDate" /></span>
                                <input
                                  type="date"
                                  value={p.entryDate || ''}
                                  onChange={(e) => {
                                    const next = positions.map((row) =>
                                      row.ticker === p.ticker ? { ...row, entryDate: e.target.value } : row
                                    );
                                    setPositions(next);
                                  }}
                                  className="w-full min-w-0 p-1 border border-slate-700 bg-slate-900 rounded text-[10px] font-mono text-white"
                                />
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {isDailyMaxLossBreached && (
                    <div className="p-2 bg-red-900 border border-red-700 rounded text-xs font-bold text-red-100 flex items-center gap-1">
                      <Ban className="h-4 w-4 shrink-0" />
                      REALIZED MAX LOSS BREACHED! Stop trading.
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200">
                <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Session clock</div>
                <div className="flex justify-between text-sm font-mono font-bold">
                  <span>IDT {gate.israelTimeLabel}</span>
                  <span>ET {gate.etTimeLabel}</span>
                </div>
                <div className="text-xs text-slate-500 mt-1">Phase: {gate.phase} · Window: {gate.activeWindowLabel || 'none'}</div>
                <div className="mt-2 space-y-1.5 text-xs text-slate-600">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1">Unrealized P&L <HelpIcon fieldId="unrealizedPL" /></span>
                    <span className={`font-mono font-bold ${unrealizedPL < 0 ? 'text-red-600' : unrealizedPL > 0 ? 'text-emerald-600' : ''}`}>
                      {unrealizedPL < 0 ? '-' : ''}${Math.abs(unrealizedPL).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1">Open exposure <HelpIcon fieldId="unrealizedOpenRisk" /></span>
                    <span className="font-mono font-bold">
                      {oneRValue > 0 ? `${unrealizedOpenRisk}R` : '— (1R is $0)'}
                    </span>
                  </div>
                </div>
                {oneRValue > 0 && (
                  <input
                    type="number"
                    step="0.1"
                    value={unrealizedOpenRisk}
                    onChange={(e) => setUnrealizedOpenRisk(Number(e.target.value))}
                    className="mt-2 w-full p-1.5 border rounded text-xs font-mono bg-slate-50"
                    placeholder="Open exposure (R)"
                  />
                )}
              </div>

            </div>

            {/* COLUMN 2: Rules & Breakers (Middle - 4 cols) */}
            <div className="md:col-span-4 space-y-6">

              <div className="bg-orange-50 p-5 rounded-xl shadow-sm border border-orange-200">
                <h2 className="text-base font-bold mb-3 flex items-center gap-2 text-orange-800">
                  <ShieldAlert className="h-5 w-5" />
                  Rules of Engagement
                </h2>
                <div className="text-xs text-orange-700 font-semibold mb-3 uppercase tracking-wider">
                  Approved windows: 17:00–18:00 · 20:30–22:45 IDT · Regular hours only
                </div>
                <ul className="space-y-3">
                  <li className="flex gap-2 text-sm text-slate-800 font-medium">
                    <span className="text-orange-500 font-bold">1.</span> 
                    No premarket / after-hours new trades. Planned day trades in approved windows only.
                  </li>
                  <li className="flex gap-2 text-sm text-slate-800 font-medium">
                    <span className="text-orange-500 font-bold">2.</span> 
                    Earnings checked before entry. Today / tomorrow / unknown = blocked.
                  </li>
                  <li className="flex gap-2 text-sm text-slate-800 font-medium">
                    <span className="text-orange-500 font-bold">3.</span> 
                    A physical stop-loss order can NEVER be adjusted downward / wider.
                  </li>
                  <li className="flex gap-2 text-sm text-slate-800 font-medium">
                    <span className="text-orange-500 font-bold">4.</span> 
                    No add-to-losers unless pre-planned. Size from calculator only.
                  </li>
                  <li className="flex gap-2 text-sm text-slate-800 font-medium">
                    <span className="text-orange-500 font-bold">5.</span> 
                    At +15% or +2R protect profits. After +20% do not let winners become losers.
                  </li>
                  <li className="flex gap-2 text-sm text-slate-800 font-medium">
                    <span className="text-orange-500 font-bold">6.</span> 
                    Respect the daily -{dailyMaxLossR}R loss limit. Stop trading if hit.
                  </li>
                </ul>
              </div>

              {/* DISCIPLINE MISTAKE REGISTRY ANALYTICS */}
              <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                <h2 className="text-base font-bold mb-4 flex items-center gap-2 text-indigo-800">
                  <Award className="h-5 w-5" />
                  Process & Discipline Analytics
                </h2>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-slate-50 p-3 rounded border text-center">
                    <div className="text-[10px] text-slate-400 uppercase font-bold">Discipline Score</div>
                    <div className="text-2xl font-black text-slate-800">{disciplineScore.toFixed(0)}%</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Perfect Executions</div>
                  </div>
                  <div className="bg-red-50 p-3 rounded border text-center border-red-100">
                    <div className="text-[10px] text-red-500 uppercase font-bold">Cost of Mistakes</div>
                    <div className="text-2xl font-black text-red-700 font-mono">-${totalDollarLeaks.toLocaleString(undefined, {maximumFractionDigits: 0})}</div>
                    <div className="text-[10px] text-red-500 mt-0.5">-{totalRLeaks.toFixed(1)}R leaked</div>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 leading-tight">
                  By cataloging unwanted behaviors, the system exposes the exact dollar and R-multiple leaks drained from your portfolio.
                </p>
              </div>

              <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                <h2 className="text-base font-bold mb-4 flex items-center gap-2 text-slate-800">
                  <Activity className="text-indigo-500 h-5 w-5" />
                  Circuit Breakers
                </h2>

                {/* Breaker B */}
                <div className="mb-5 border-b pb-4">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Breaker B: Market Regime</h3>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div>
                      <FieldHelp fieldId="qqqStatus" label="QQQ" labelClassName="text-[10px] text-slate-400 uppercase font-bold" />
                      <select value={qqqStatus} onChange={(e) => setQqqStatus(e.target.value)} className="mt-1 w-full p-1.5 text-sm border rounded focus:ring-indigo-500 bg-slate-50">
                        <option value="above21">Above 21 EMA</option>
                        <option value="below21">Below 21 EMA</option>
                        <option value="below50">Below 50 SMA</option>
                      </select>
                    </div>
                    <div>
                      <FieldHelp fieldId="spyStatus" label="SPY" labelClassName="text-[10px] text-slate-400 uppercase font-bold" />
                      <select value={spyStatus} onChange={(e) => setSpyStatus(e.target.value)} className="mt-1 w-full p-1.5 text-sm border rounded focus:ring-indigo-500 bg-slate-50">
                        <option value="above21">Above 21 EMA</option>
                        <option value="below21">Below 21 EMA</option>
                        <option value="below50">Below 50 SMA</option>
                      </select>
                    </div>
                  </div>
                  {breakerBLocked && <div className="p-2 bg-red-100 text-red-800 rounded text-xs font-bold border border-red-200">LOCKED: QQQ below 50. Breakouts halted.</div>}
                  {!breakerBLocked && breakerBWarning && <div className="p-2 bg-yellow-100 text-yellow-800 rounded text-xs font-bold border border-yellow-200">WARNING: Below 21 EMA. High selectivity.</div>}
                </div>

                {/* Breaker C - The Next Small Win */}
                <div className={`p-4 rounded-lg border ${isDrawdown ? 'bg-indigo-50/50 border-indigo-100' : 'bg-slate-50/50 border-slate-100 opacity-60'}`}>
                  <h3 className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider mb-2 flex items-center justify-between">
                    Breaker C: The Next Small Win (+2R)
                    {isRecoveryMode && <Unlock className="h-3 w-3 text-indigo-500" />}
                  </h3>
                  
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[11px] text-slate-500 font-medium flex flex-col">
                        <span className="flex items-center gap-1">Closed R-Multiple <HelpIcon fieldId="last3R" /></span>
                        <span className="text-[9px] text-amber-600 font-semibold">(Realized only)</span>
                      </div>
                      <input 
                        type="number" 
                        step="0.1" 
                        value={last3R} 
                        onChange={(e) => setLast3R(Number(e.target.value))} 
                        disabled={!isDrawdown} 
                        className="w-20 p-1.5 text-sm border rounded font-mono text-right bg-white" 
                      />
                    </div>

                    {/* DYNAMIC LEVEL UP SYSTEM TRIGGER */}
                    {isDrawdown && last3R >= 2 && activeTier > 0 && (
                      <div className="pt-1">
                        <button
                          onClick={handleLevelUp}
                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-3 rounded text-xs flex items-center justify-center gap-1.5 shadow-md animate-pulse"
                        >
                          <ArrowUpCircle className="h-4 w-4" />
                          LEVEL UP: STEP RISK TO LEVEL {activeTier === 3 ? '2' : activeTier === 2 ? '1' : '0'}!
                        </button>
                      </div>
                    )}
                    
                    {isDrawdown && (
                      <div className="pt-2 border-t border-indigo-100">
                        <FieldHelp fieldId="manualRiskTier" label="Active Risk Tier Override" labelClassName="text-[10px] font-bold text-slate-500 uppercase" />
                        <select 
                          value={manualRiskTier} 
                          onChange={(e) => setManualRiskTier(e.target.value)}
                          className={`mt-1 w-full p-1.5 text-sm border rounded font-medium ${breakerCActive && manualRiskTier !== 'auto' ? 'border-red-300 bg-red-50 text-red-700' : 'bg-white focus:ring-indigo-500'}`}
                        >
                          <option value="auto">Auto (Math: Lvl {strictTier})</option>
                          <option value="2">Force Lvl 2 (0.5% - Max 2 Pos)</option>
                          <option value="1">Force Lvl 1 (0.75% - Normal Pos)</option>
                          <option value="0">Force Normal (1.0% - Margin OK)</option>
                        </select>
                        
                        {breakerCActive && manualRiskTier !== 'auto' && (
                          <div className="text-[10px] text-red-600 mt-1 font-bold leading-tight">
                            Warning: Overriding tier before hitting +2R violates the foundation.
                          </div>
                        )}
                        {!breakerCActive && manualRiskTier !== 'auto' && (
                          <div className="text-[10px] text-indigo-600 mt-1 font-bold leading-tight">
                            Recovery active. Goal: +2R to step up again. Focus on the small win.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

            </div>

            {/* COLUMN 3: State summary */}
            <div className="md:col-span-4 space-y-6">
              <div className={`p-5 rounded-xl border ${gate.allowed ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-2">Live execution status</h2>
                <div className={`text-xl font-black ${gate.allowed ? 'text-emerald-700' : 'text-slate-700'}`}>
                  {gate.allowed ? 'WINDOW OPEN' : 'WINDOW CLOSED / BLOCKED'}
                </div>
                <p className="text-xs text-slate-600 mt-2">
                  Planning and sizing happen in <strong>Plan & Size</strong> (works before/after hours). Live mode only allows broker entries in approved windows.
                </p>
                <button
                  onClick={() => setActiveTab('tools')}
                  className="mt-3 w-full bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold py-2.5 rounded-lg flex items-center justify-center gap-2"
                >
                  <Calculator className="h-4 w-4" />
                  Go to Plan & Size
                </button>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200">
                <h2 className="text-base font-bold mb-3 flex items-center gap-2">
                  <Target className="h-5 w-5 text-indigo-500" />
                  Watchlist snapshot
                </h2>
                {watchlist.length === 0 ? (
                  <p className="text-xs text-slate-400">No tickers yet. Add them from Plan & Size.</p>
                ) : (
                  <ul className="space-y-2">
                    {watchlist.slice(0, 6).map((w) => (
                      <li key={w.id} className="flex justify-between items-center text-sm border-b border-slate-100 pb-1">
                        <button onClick={() => loadTickerIntoPlanner(w)} className="font-mono font-bold text-indigo-700 hover:underline">{w.ticker}</button>
                        <span className="text-[10px] uppercase text-slate-400">Grade {w.setupGrade}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200">
                <h2 className="text-sm font-bold text-slate-700 mb-2">Prep checklist status</h2>
                <div className="text-xs space-y-1 text-slate-600">
                  <div>1. IBKR snapshot: {routine.snapshotImported ? '✓' : '○'}</div>
                  <div>2. Journal: {routine.journal ? '✓' : '○'}</div>
                  <div>3. Alerts: {routine.alerts ? '✓' : '○'}</div>
                  <div>4. Brackets: {routine.orders ? '✓' : '○'}</div>
                </div>
                <p className="text-[11px] text-slate-400 mt-2">Snapshot is step 1 — Apply OCR above. Other toggles in Plan & Size.</p>
              </div>
            </div>

          </div>
          </div>
        )}

        {/* --- TAB 2: PLAN & SIZE (TOOLS) --- */}
        {activeTab === 'tools' && (
          <div className="space-y-4">
            {/* Mode toggle */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1">
                  Workspace mode <HelpIcon fieldId="workspaceMode" />
                </div>
                <p className="text-sm text-slate-600 mt-0.5">
                  {workspaceMode === 'planning'
                    ? 'Planning: ignore market hours — size and validate setups anytime.'
                    : 'Live: enforce approved windows before execution is allowed.'}
                </p>
                {gate.warnings?.map((w) => (
                  <p key={w} className="text-[11px] text-amber-700 mt-1 font-semibold">{w}</p>
                ))}
                {setupCapBlocked && (
                  <p className="text-[11px] text-red-700 mt-1 font-semibold">
                    Portfolio score caps setup at {portfolioScore.suggestedSetupCap} (score {portfolioScore.score}).
                  </p>
                )}
              </div>
              <div className="flex rounded-lg overflow-hidden border border-slate-300">
                <button
                  onClick={() => setWorkspaceMode('planning')}
                  className={`px-4 py-2 text-sm font-bold ${workspaceMode === 'planning' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600'}`}
                >
                  Planning
                </button>
                <button
                  onClick={() => setWorkspaceMode('live')}
                  className={`px-4 py-2 text-sm font-bold ${workspaceMode === 'live' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600'}`}
                >
                  Live
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              {/* Left: Calculator + earnings + plan */}
              <div className="md:col-span-5 space-y-6">
                <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                  <h2 className="text-base font-bold mb-3 flex items-center gap-2 text-slate-800">
                    <Calculator className="text-blue-500 h-5 w-5" />
                    Position Size Calculator
                  </h2>
                  <div className="text-xs text-slate-500 mb-3">
                    1R base from Portfolio state: <span className="font-mono font-bold text-slate-800">${oneRValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                    {' · '}Setup factor: {gate.setupFactor}x
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div>
                      <FieldHelp fieldId="entryPrice" label="Entry" labelClassName="text-[10px] text-slate-400 uppercase font-bold" />
                      <input type="number" step="0.01" value={entryPrice || ''} onChange={(e) => setEntryPrice(Number(e.target.value))} className="mt-1 w-full p-1.5 text-sm border rounded font-mono bg-slate-50" />
                    </div>
                    <div>
                      <FieldHelp fieldId="stopPrice" label="Stop" labelClassName="text-[10px] text-slate-400 uppercase font-bold" />
                      <input type="number" step="0.01" value={stopPrice || ''} onChange={(e) => {
                        const v = Number(e.target.value);
                        setStopPrice(v);
                        if (!originalStop) setOriginalStop(v);
                      }} className="mt-1 w-full p-1.5 text-sm border rounded font-mono bg-slate-50" />
                    </div>
                    <div>
                      <FieldHelp fieldId="originalStop" label="Original Stop" labelClassName="text-[10px] text-slate-400 uppercase font-bold" />
                      <input type="number" step="0.01" value={originalStop || ''} onChange={(e) => setOriginalStop(Number(e.target.value))} className="mt-1 w-full p-1.5 text-sm border rounded font-mono bg-slate-50" />
                    </div>
                    <div>
                      <FieldHelp fieldId="tradeDirection" label="Direction" labelClassName="text-[10px] text-slate-400 uppercase font-bold" />
                      <select value={tradeDirection} onChange={(e) => setTradeDirection(e.target.value)} className="mt-1 w-full p-1.5 text-sm border rounded bg-slate-50">
                        <option value="long">Long</option>
                        <option value="short">Short</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                      <FieldHelp fieldId="requestedShares" label="Requested shares (optional)" labelClassName="text-[10px] text-slate-400 uppercase font-bold" />
                      <input type="number" value={requestedShares || ''} onChange={(e) => setRequestedShares(Number(e.target.value))} placeholder="0 = use max" className="mt-1 w-full p-1.5 text-sm border rounded font-mono bg-slate-50" />
                    </div>
                  </div>
                  <div className={`p-3 rounded-lg border text-sm ${!sizeReady ? 'bg-red-50 border-red-200 text-red-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
                    <div className="flex justify-between font-bold mb-1">
                      <span>Max shares</span>
                      <span className="font-mono">{planOrLiveReady ? positionSize.shares : 0}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span>Allowed risk</span>
                      <span className="font-mono">${gate.allowedRisk.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                    </div>
                    <div className="flex justify-between text-xs mt-1">
                      <span>Dollar risk @ size</span>
                      <span className="font-mono">${(planOrLiveReady ? positionSize.dollarRisk : 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                    </div>
                  </div>
                  {positionSize.blockReasons.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {positionSize.blockReasons.map((r) => (
                        <li key={r} className="text-[11px] text-red-700">• {r}</li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                  <h2 className="text-base font-bold mb-3 flex items-center gap-2 text-slate-800">
                    <Shield className="text-amber-500 h-5 w-5" />
                    Earnings / Event Risk
                  </h2>
                  <div className="space-y-2">
                    <div>
                      <FieldHelp fieldId="tradeTicker" label="Ticker" labelClassName="text-[10px] text-slate-400 uppercase font-bold" />
                      <input type="text" value={tradeTicker} onChange={(e) => setTradeTicker(e.target.value.toUpperCase())} placeholder="e.g. NVDA" className="mt-1 w-full p-1.5 text-sm border rounded font-mono bg-slate-50 uppercase" />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer text-sm">
                      <input type="checkbox" checked={earningsChecked} onChange={(e) => setEarningsChecked(e.target.checked)} />
                      <span className="flex items-center gap-1">Earnings checked <HelpIcon fieldId="earningsChecked" /></span>
                    </label>
                    <div>
                      <FieldHelp fieldId="earningsTiming" label="Earnings timing" labelClassName="text-[10px] text-slate-400 uppercase font-bold" />
                      <select value={earningsTiming} onChange={(e) => setEarningsTiming(e.target.value)} className="mt-1 w-full p-1.5 text-sm border rounded bg-slate-50">
                        <option value="none">None known</option>
                        <option value="today">Today — BLOCK</option>
                        <option value="tomorrow">Tomorrow — BLOCK</option>
                        <option value="this_week">This week</option>
                        <option value="unknown">Unknown — BLOCK</option>
                      </select>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer text-sm">
                      <input type="checkbox" checked={highImpactEventPending} onChange={(e) => setHighImpactEventPending(e.target.checked)} />
                      High-impact event pending
                    </label>
                    {highImpactEventPending && (
                      <label className="flex items-center gap-2 cursor-pointer text-sm">
                        <input type="checkbox" checked={highImpactEventApproved} onChange={(e) => setHighImpactEventApproved(e.target.checked)} />
                        Explicitly approved in trade plan
                      </label>
                    )}
                    <div>
                      <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Event notes</label>
                      <input type="text" value={eventNotes} onChange={(e) => setEventNotes(e.target.value)} className="w-full p-1.5 text-sm border rounded bg-slate-50" />
                    </div>
                  </div>

                  <h3 className="text-xs font-bold text-indigo-700 uppercase tracking-wider mb-2 border-t pt-3 mt-4">Trade Plan Guardrails</h3>
                  <div className="space-y-2">
                    <div>
                      <FieldHelp fieldId="setupGrade" label="Setup grade" labelClassName="text-[10px] text-slate-400 uppercase font-bold" />
                      <select value={setupGrade} onChange={(e) => setSetupGrade(e.target.value)} className="mt-1 w-full p-1.5 text-sm border rounded bg-slate-50">
                        <option value="A">A — full risk</option>
                        <option value="B">B — 0.5× risk</option>
                        <option value="C">C — no trade</option>
                        <option value="no_trade">No Trade</option>
                      </select>
                      {routine.snapshotImported && (
                        <p className="text-[10px] text-slate-500 mt-1">Portfolio suggests max: {portfolioScore.suggestedSetupCap}</p>
                      )}
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer text-sm">
                      <input type="checkbox" checked={isAdd} onChange={(e) => setIsAdd(e.target.checked)} />
                      Add to existing position
                    </label>
                    {isAdd && (
                      <>
                        <select value={addType} onChange={(e) => setAddType(e.target.value)} className="w-full p-1.5 text-sm border rounded bg-slate-50">
                          <option value="not_allowed">Not allowed</option>
                          <option value="winner_add">Winner add</option>
                          <option value="loser_add">Loser add (pre-planned)</option>
                        </select>
                        <label className="flex items-center gap-2 cursor-pointer text-sm">
                          <input type="checkbox" checked={addPrePlanned} onChange={(e) => setAddPrePlanned(e.target.checked)} />
                          Add pre-planned before entry
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer text-sm">
                          <input type="checkbox" checked={positionIsLosing} onChange={(e) => setPositionIsLosing(e.target.checked)} />
                          Position currently losing
                        </label>
                        <input type="number" step="0.1" value={combinedRiskR} onChange={(e) => setCombinedRiskR(Number(e.target.value))} className="w-full p-1.5 text-sm border rounded font-mono bg-slate-50" placeholder="Combined risk R" />
                      </>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <input type="number" step="0.1" value={unrealizedGainPct} onChange={(e) => setUnrealizedGainPct(Number(e.target.value))} className="w-full p-1.5 text-sm border rounded font-mono bg-slate-50" placeholder="Unrealized %" />
                      <input type="number" step="0.1" value={unrealizedR} onChange={(e) => setUnrealizedR(Number(e.target.value))} className="w-full p-1.5 text-sm border rounded font-mono bg-slate-50" placeholder="Unrealized R" />
                    </div>
                    <select value={profitProtectionPlan} onChange={(e) => setProfitProtectionPlan(e.target.value)} className="w-full p-1.5 text-sm border rounded bg-slate-50">
                      <option value="none">Profit plan: None</option>
                      <option value="partial">Take partial profits</option>
                      <option value="move_stop">Move stop to protection</option>
                      <option value="preplanned_full_risk">Pre-planned full risk hold</option>
                    </select>
                    {tradePlan.profitProtectionRequired && (
                      <div className="p-2 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-900 font-semibold">
                        Profit protection required (+15% or +2R).
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Middle: Gate + watchlist */}
              <div className="md:col-span-4 space-y-6">
                <div className={`p-5 rounded-xl shadow-sm border ${planOrLiveReady ? 'bg-emerald-50 border-emerald-300' : 'bg-red-50 border-red-300'}`}>
                  <h2 className="text-base font-bold mb-2 flex items-center gap-2">
                    <Clock className={`h-5 w-5 ${planOrLiveReady ? 'text-emerald-700' : 'text-red-700'}`} />
                    <span className={planOrLiveReady ? 'text-emerald-900' : 'text-red-900'}>
                      {workspaceMode === 'planning' ? 'Plan Gate' : 'Live Gate'}
                    </span>
                    <HelpIcon fieldId="gateStatus" />
                  </h2>
                  <div className={`text-2xl font-black mb-2 ${planOrLiveReady ? 'text-emerald-700' : 'text-red-700'}`}>
                    {workspaceMode === 'planning'
                      ? (gate.planningReady ? 'PLAN READY' : 'PLAN BLOCKED')
                      : (gate.allowed ? 'TRADING ALLOWED' : 'TRADING BLOCKED')}
                  </div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2">
                    {workspaceMode} · {gate.phase} · IDT {gate.israelTimeLabel} / ET {gate.etTimeLabel}
                  </div>
                  {workspaceMode === 'planning' && gate.scheduleReasons.length > 0 && (
                    <div className="mb-2 p-2 bg-indigo-50 border border-indigo-100 rounded text-[11px] text-indigo-800">
                      Schedule note (ignored in planning): {gate.scheduleReasons[0]}
                    </div>
                  )}
                  {gate.reasons.length > 0 && (
                    <ul className="space-y-1 max-h-40 overflow-y-auto">
                      {gate.reasons.map((reason) => (
                        <li key={reason} className="text-xs text-red-800 flex gap-1.5">
                          <Ban className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <span>{reason}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {tradePlan.warnings.map((w) => (
                    <div key={w} className="mt-2 text-xs text-amber-800 flex gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />{w}
                    </div>
                  ))}
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                  <h2 className="text-base font-bold mb-3 flex items-center gap-2">
                    <Target className="h-5 w-5 text-indigo-500" />
                    Watchlist
                  </h2>
                  <div className="flex gap-2 mb-3">
                    <input
                      type="text"
                      value={watchNote}
                      onChange={(e) => setWatchNote(e.target.value)}
                      placeholder="Note for current ticker"
                      className="flex-1 p-1.5 text-xs border rounded bg-slate-50"
                    />
                    <button onClick={addToWatchlist} className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded hover:bg-indigo-700">
                      Save
                    </button>
                  </div>
                  {watchlist.length === 0 ? (
                    <p className="text-xs text-slate-400">Set ticker above, then Save to watchlist.</p>
                  ) : (
                    <ul className="space-y-2">
                      {watchlist.map((w) => (
                        <li key={w.id} className="flex items-center justify-between gap-2 text-sm border border-slate-100 rounded p-2">
                          <button onClick={() => loadTickerIntoPlanner(w)} className="text-left">
                            <div className="font-mono font-bold text-indigo-700">{w.ticker}</div>
                            <div className="text-[10px] text-slate-500">{w.note || '—'} · Grade {w.setupGrade}</div>
                          </button>
                          <button onClick={() => removeFromWatchlist(w.id)} className="text-slate-400 hover:text-red-600">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Right: Actions / routine / journal */}
              <div className="md:col-span-3 space-y-6">
                <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                  <h2 className="text-base font-bold mb-4 flex items-center gap-2 text-slate-800">
                    <CheckCircle className="text-emerald-500 h-5 w-5" />
                    Actions & Checklist
                  </h2>
                  <div className="space-y-3">
                    <div>
                      <h3 className="text-xs font-bold text-indigo-700 uppercase mb-2 flex items-center gap-1">
                        1. IBKR Snapshot <HelpIcon fieldId="routineSnapshot" />
                      </h3>
                      <label className="flex items-center gap-2 mb-2 opacity-90">
                        <div className="text-indigo-600">{routine.snapshotImported ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4 text-slate-300"/>}</div>
                        <span className="text-sm">
                          {routine.snapshotImported ? 'Snapshot applied' : 'Import on Portfolio & Market tab'}
                        </span>
                      </label>
                      {!routine.snapshotImported && (
                        <button
                          type="button"
                          onClick={() => setActiveTab('state')}
                          className="mb-2 text-[11px] font-bold text-indigo-700 underline"
                        >
                          Go to OCR import →
                        </button>
                      )}
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-blue-600 uppercase mb-2">2. Prep</h3>
                      <label className="flex items-center gap-2 cursor-pointer mb-2">
                        <div onClick={() => toggleRoutine('journal')} className="text-blue-500">{routine.journal ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4 text-slate-300"/>}</div>
                        <span className="text-sm flex items-center gap-1">Tradervue tagging <HelpIcon fieldId="routineJournal" /></span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer mb-2">
                        <div onClick={() => toggleRoutine('alerts')} className="text-blue-500">{routine.alerts ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4 text-slate-300"/>}</div>
                        <span className="text-sm flex items-center gap-1">Set alerts <HelpIcon fieldId="routineAlerts" /></span>
                      </label>
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-orange-600 uppercase mb-2">Execution window</h3>
                      <label className="flex items-center gap-2 cursor-pointer mb-2">
                        <div onClick={() => toggleRoutine('handsOff')} className="text-orange-500">{routine.handsOff ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4 text-slate-300"/>}</div>
                        <span className="text-sm">Stayed in windows</span>
                      </label>
                      <label className={`flex items-center gap-2 mb-2 ${!gate.allowed ? 'opacity-50' : 'cursor-pointer'}`}>
                        <div onClick={() => { if (gate.allowed) toggleRoutine('orders'); }} className="text-orange-500">{routine.orders ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4 text-slate-300"/>}</div>
                        <span className="text-sm">Enter brackets {gate.allowed ? '' : '(live only)'}</span>
                      </label>
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-indigo-600 uppercase mb-2">Post close</h3>
                      <label className="flex items-center gap-2 cursor-pointer mb-2">
                        <div onClick={() => toggleRoutine('reviewPos')} className="text-indigo-500">{routine.reviewPos ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4 text-slate-300"/>}</div>
                        <span className="text-sm">Review positions</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <div onClick={() => toggleRoutine('moveStops')} className="text-indigo-500">{routine.moveStops ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4 text-slate-300"/>}</div>
                        <span className="text-sm">Trail stops</span>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                  <h2 className="text-sm font-bold mb-3">Daily journal</h2>
                  <input type="date" value={journalDate} onChange={(e) => setJournalDate(e.target.value)} className="w-full mb-2 p-1.5 text-xs border rounded bg-slate-50 font-mono" />
                  <select value={executionType} onChange={(e) => setExecutionType(e.target.value)} className="w-full mb-2 p-1.5 text-xs border rounded bg-slate-50">
                    <option value="perfect">Perfect Plan Followed</option>
                    <option value="mistake">Execution Mistake Made</option>
                  </select>
                  {executionType === 'mistake' && (
                    <div className="bg-red-50 p-2 rounded border border-red-200 mb-2 space-y-1">
                      <select value={mistakeCategory} onChange={(e) => setMistakeType(e.target.value)} className="w-full p-1 text-[11px] border border-red-300 rounded">
                        <option value="none">Classification...</option>
                        <option value="fomo">FOMO</option>
                        <option value="chasing">Chasing</option>
                        <option value="stop_down">Moved SL down</option>
                        <option value="oversized">Oversized</option>
                        <option value="early_exit">Early exit</option>
                      </select>
                      <input type="number" step="0.5" value={mistakeCostR} onChange={(e) => setMistakeCostR(Number(e.target.value))} placeholder="Cost R" className="w-full p-1 text-[11px] border border-red-300 rounded font-mono" />
                      <input type="text" placeholder="1. Why?" value={fiveWs.w1} onChange={e => setFiveWs({...fiveWs, w1: e.target.value})} className="w-full p-1 text-[10px] border border-red-200 rounded" />
                      <input type="text" placeholder="Solution" value={fiveWs.solution} onChange={e => setFiveWs({...fiveWs, solution: e.target.value})} className="w-full p-1 text-[10px] border border-emerald-300 bg-emerald-50 rounded" />
                    </div>
                  )}
                  <textarea
                    className="w-full h-20 p-2 text-xs border rounded bg-slate-50"
                    placeholder="Session notes..."
                    value={dailyNotes}
                    onChange={(e) => setDailyNotes(e.target.value)}
                  />
                  <button onClick={archiveDay} className="mt-3 w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-2.5 rounded-lg text-sm flex justify-center items-center gap-2">
                    <Save className="h-4 w-4" />
                    Save Day & Reset
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- TAB 3: ARCHIVE & BACKUP --- */}
        {activeTab === 'archive' && (
          <div className="space-y-6">
            
            <div className="bg-slate-800 text-white p-6 rounded-xl shadow-sm border border-slate-700">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <Save className="text-blue-400 h-5 w-5" />
                    Database Local Backup Utility
                  </h3>
                  <p className="text-slate-400 text-xs mt-1">
                    Your entire journal is saved automatically in your browser's memory. Export regular backups to prevent loss.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button 
                    onClick={exportDatabase}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs py-2.5 px-4 rounded-lg flex items-center gap-1.5 shadow transition-colors"
                  >
                    <Download className="h-4 w-4" />
                    Export Backup (.json)
                  </button>
                  <label className="cursor-pointer bg-slate-700 hover:bg-slate-600 text-white font-semibold text-xs py-2.5 px-4 rounded-lg flex items-center gap-1.5 shadow transition-colors">
                    <Upload className="h-4 w-4" />
                    Restore Backup
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