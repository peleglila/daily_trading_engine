import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, CheckCircle, AlertTriangle, TrendingDown, 
  Activity, CheckSquare, Square, Calendar, BookOpen, 
  Save, AlertCircle, Unlock, ArrowUpCircle, Download, 
  Upload, Trash2, FileText, Target, Zap, Calculator, 
  Crosshair, Shield, Clock, Award, Ban, HelpCircle
} from 'lucide-react';

export default function App() {
  // --- STATE ---
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard', 'archive', 'blueprint'
  
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

  // Mistake & Process Tracking State (SMB Capital 5 W's Model)
  const [executionType, setExecutionType] = useState('perfect'); // 'perfect' or 'mistake'
  const [mistakeCategory, setMistakeType] = useState('none'); // 'none', 'fomo', 'stop_down', 'oversized', 'chasing', 'early_exit'
  const [mistakeCostR, setMistakeCostR] = useState(0); 
  const [fiveWs, setFiveWs] = useState({ w1: '', w2: '', w3: '', w4: '', w5: '', solution: '' });

  // Daily Workflow & Notes
  const [dailyNotes, setDailyNotes] = useState('');
  const [journalDate, setJournalDate] = useState(new Date().toISOString().split('T')[0]); // Default to today (YYYY-MM-DD)
  const [routine, setRoutine] = useState({
    journal: false, alerts: false, orders: false, // 5:00 AM Prep
    handsOff: false, // 4:30 PM Market Hours
    reviewPos: false, moveStops: false // 11:00 PM Close
  });

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

    if (savedHistory) {
      try { setHistory(JSON.parse(savedHistory)); } catch (e) { console.error('Failed to parse history'); }
    }
    if (savedPeak) setPeakEquity(Number(savedPeak));
    if (savedCurrent) setCurrentEquity(Number(savedCurrent));
    if (savedLast3R) setLast3R(Number(savedLast3R));
    if (savedManualTier) setManualRiskTier(savedManualTier);
    if (savedQqq) setQqqStatus(savedQqq);
    if (savedSpy) setSpyStatus(savedSpy);
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

  // --- MATH ENGINE ---
  const drawdown = peakEquity > 0 ? ((peakEquity - currentEquity) / peakEquity) * 100 : 0;
  
  let strictTier = 0; 
  if (drawdown >= 15) strictTier = 3;
  else if (drawdown >= 10) strictTier = 2;
  else if (drawdown >= 5) strictTier = 1;

  let activeTier = strictTier;
  let isRecoveryMode = false;
  if (manualRiskTier !== 'auto') {
    activeTier = Number(manualRiskTier);
    isRecoveryMode = true;
  }

  let riskPercent = 1.0;
  let riskStatus = { level: 0, risk: '1.0% - 1.5%', margin: true, maxPos: 'Portfolio Size', color: 'bg-green-100 text-green-800 border-green-300' };
  
  if (activeTier === 3) {
    riskPercent = 0;
    riskStatus = { level: 3, risk: '0%', margin: false, maxPos: '0', color: 'bg-red-100 text-red-800 border-red-300', msg: 'HARD STOP. 1 Week Off + Paper Trade' };
  } else if (activeTier === 2) {
    riskPercent = 0.5;
    riskStatus = { level: 2, risk: '0.5%', margin: false, maxPos: 'Max 2', color: 'bg-orange-100 text-orange-800 border-orange-300', msg: 'Level 2 Drawdown' };
  } else if (activeTier === 1) {
    riskPercent = 0.75;
    riskStatus = { level: 1, risk: '0.75%', margin: false, maxPos: 'Normal', color: 'bg-yellow-100 text-yellow-800 border-yellow-300', msg: 'Level 1 Drawdown (No Margin)' };
  }

  const oneRValue = currentEquity * (riskPercent / 100);
  const dailyMaxLossR = 2; 
  const dailyMaxLossDollar = oneRValue * dailyMaxLossR;

  // Max Loss Circuit Breaker Trigger (Realized only)
  const isDailyMaxLossBreached = dailyRealizedPL <= -dailyMaxLossDollar && dailyMaxLossDollar > 0;

  const isDrawdown = drawdown >= 5;
  const breakerCActive = isDrawdown && last3R < 2;
  const breakerBLocked = qqqStatus === 'below50';
  const breakerBWarning = qqqStatus === 'below21' || spyStatus === 'below21';

  // --- DISCIPLINE ANALYTICS CALCULATIONS ---
  const totalLogs = history.length;
  const perfectExecutionLogs = history.filter(item => item.executionType === 'perfect').length;
  const disciplineScore = totalLogs > 0 ? (perfectExecutionLogs / totalLogs) * 100 : 100;
  
  const totalRLeaks = history.reduce((sum, item) => sum + (Number(item.mistakeCostR) || 0), 0);
  const totalDollarLeaks = history.reduce((sum, item) => sum + ((Number(item.mistakeCostR) || 0) * (Number(item.rValue) || 0)), 0);

  // --- ACTIONS ---
  const toggleRoutine = (key) => setRoutine(prev => ({ ...prev, [key]: !prev[key] }));
  
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
      mistakeCostR: executionType === 'mistake' ? mistakeCostR : 0
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
    setRoutine({ journal: false, alerts: false, orders: false, handsOff: false, reviewPos: false, moveStops: false });
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
    const backupData = { history, peakEquity, currentEquity, last3R, manualRiskTier, qqqStatus, spyStatus };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `peleg_trading_db_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
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
              <p className="text-slate-400 text-sm mt-1">Swing Trading Foundation • IDT Timezone</p>
            </div>
            <div className="text-left md:text-right bg-slate-800 p-3 rounded-lg border border-slate-700">
              <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Current Net Liq</div>
              <div className="text-2xl font-mono font-bold text-emerald-400">${currentEquity.toLocaleString()}</div>
            </div>
          </div>
          
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={`px-5 py-3 rounded-t-lg font-semibold text-sm transition-colors whitespace-nowrap ${activeTab === 'dashboard' ? 'bg-slate-50 text-slate-900' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'}`}
            >
              Dashboard & Execution
            </button>
            <button 
              onClick={() => setActiveTab('archive')}
              className={`px-5 py-3 rounded-t-lg font-semibold text-sm transition-colors flex items-center gap-2 whitespace-nowrap ${activeTab === 'archive' ? 'bg-slate-50 text-slate-900' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'}`}
            >
              <Calendar className="h-4 w-4" />
              Journal Archive ({history.length})
            </button>
            <button 
              onClick={() => setActiveTab('blueprint')}
              className={`px-5 py-3 rounded-t-lg font-semibold text-sm transition-colors flex items-center gap-2 whitespace-nowrap ${activeTab === 'blueprint' ? 'bg-slate-50 text-slate-900' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'}`}
            >
              <FileText className="h-4 w-4" />
              Engine Blueprint
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-4 md:p-8">
        
        {/* --- TAB 1: DASHBOARD --- */}
        {activeTab === 'dashboard' && (
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
                    <label className="block text-xs font-bold text-slate-500 uppercase">High-Water Mark (Peak)</label>
                    <input type="number" value={peakEquity} onChange={(e) => setPeakEquity(Number(e.target.value))} className="mt-1 w-full p-2 border border-slate-300 rounded-md font-mono focus:ring-blue-500 bg-slate-50" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase">Current Net Liq</label>
                    <input type="number" value={currentEquity} onChange={(e) => setCurrentEquity(Number(e.target.value))} className="mt-1 w-full p-2 border border-slate-300 rounded-md font-mono focus:ring-blue-500 bg-slate-50" />
                  </div>
                  
                  <div className={`p-3 rounded-lg border flex justify-between items-center ${drawdown >= 15 ? 'bg-red-50 border-red-200 text-red-700' : drawdown > 0 ? 'bg-orange-50 border-orange-200 text-orange-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
                    <span className="font-semibold text-sm">Drawdown:</span>
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
                <h2 className="text-xs font-bold uppercase tracking-wider mb-1 opacity-80">Allowed Risk Per Trade</h2>
                <div className="text-3xl font-black mb-1">{riskStatus.risk}</div>
                {riskStatus.msg && <div className="font-bold text-xs mb-3">{riskStatus.msg}</div>}
              </div>

              <div className="bg-slate-800 p-5 rounded-xl shadow-sm text-white">
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Risk Parameters</h2>
                <div className="space-y-3">
                  <div className="flex justify-between items-center border-b border-slate-700 pb-2">
                    <span className="text-sm font-medium">1R Base Value:</span>
                    <span className="font-mono font-bold text-blue-400">
                      ${riskPercent > 0 ? oneRValue.toLocaleString(undefined, {maximumFractionDigits: 0}) : '0'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center border-b border-slate-700 pb-2">
                    <span className="text-sm font-medium flex items-center gap-1 text-red-400" title="Only applies to realized, closed positions intraday">
                      <AlertCircle className="h-4 w-4" /> Realized Max Daily Loss:
                    </span>
                    <div className="text-right">
                      <div className="font-mono font-bold text-red-400">-{dailyMaxLossR}R</div>
                      <div className="text-xs text-slate-400">
                        (${riskPercent > 0 ? dailyMaxLossDollar.toLocaleString(undefined, {maximumFractionDigits: 0}) : '0'})
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-1">Today's Realized Session P&L ($)</label>
                    <input 
                      type="number" 
                      value={dailyRealizedPL} 
                      onChange={(e) => setDailyRealizedPL(Number(e.target.value))} 
                      placeholder="e.g. -1200"
                      className="w-full p-2 border border-slate-700 bg-slate-900 rounded-md text-sm font-mono text-white focus:ring-blue-500" 
                    />
                  </div>
                  {isDailyMaxLossBreached && (
                    <div className="p-2 bg-red-900 border border-red-700 rounded text-xs font-bold text-red-100 flex items-center gap-1">
                      <Ban className="h-4 w-4 shrink-0" />
                      REALIZED MAX LOSS BREACHED! Stop trading.
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* COLUMN 2: Rules & Breakers (Middle - 4 cols) */}
            <div className="md:col-span-4 space-y-6">
              
              <div className="bg-orange-50 p-5 rounded-xl shadow-sm border border-orange-200">
                <h2 className="text-base font-bold mb-3 flex items-center gap-2 text-orange-800">
                  <ShieldAlert className="h-5 w-5" />
                  Rules of Engagement
                </h2>
                <div className="text-xs text-orange-700 font-semibold mb-3 uppercase tracking-wider">Active: 4:30 PM - 11:00 PM IDT</div>
                <ul className="space-y-3">
                  <li className="flex gap-2 text-sm text-slate-800 font-medium">
                    <span className="text-orange-500 font-bold">1.</span> 
                    No discretionary intraday trades. Use pre-set bracket orders only.
                  </li>
                  <li className="flex gap-2 text-sm text-slate-800 font-medium">
                    <span className="text-orange-500 font-bold">2.</span> 
                    A physical stop-loss order can NEVER be adjusted downward.
                  </li>
                  <li className="flex gap-2 text-sm text-slate-800 font-medium">
                    <span className="text-orange-500 font-bold">3.</span> 
                    If a trade stalls near SL for 2 days on heavy volume -{'>'} Action Stop.
                  </li>
                  <li className="flex gap-2 text-sm text-slate-800 font-medium">
                    <span className="text-orange-500 font-bold">4.</span> 
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
                      <label className="text-[10px] text-slate-400 uppercase font-bold">QQQ</label>
                      <select value={qqqStatus} onChange={(e) => setQqqStatus(e.target.value)} className="w-full p-1.5 text-sm border rounded focus:ring-indigo-500 bg-slate-50">
                        <option value="above21">Above 21 EMA</option>
                        <option value="below21">Below 21 EMA</option>
                        <option value="below50">Below 50 SMA</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 uppercase font-bold">SPY</label>
                      <select value={spyStatus} onChange={(e) => setSpyStatus(e.target.value)} className="w-full p-1.5 text-sm border rounded focus:ring-indigo-500 bg-slate-50">
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
                        <span>Closed R-Multiple:</span>
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
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Active Risk Tier Override</label>
                        <select 
                          value={manualRiskTier} 
                          onChange={(e) => setManualRiskTier(e.target.value)}
                          className={`w-full p-1.5 text-sm border rounded font-medium ${breakerCActive && manualRiskTier !== 'auto' ? 'border-red-300 bg-red-50 text-red-700' : 'bg-white focus:ring-indigo-500'}`}
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

            {/* COLUMN 3: Routine & Archiving (Right - 4 cols) */}
            <div className="md:col-span-4 space-y-6">
              
              <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex flex-col h-full">
                <h2 className="text-base font-bold mb-4 flex items-center gap-2 text-slate-800">
                  <CheckCircle className="text-emerald-500 h-5 w-5" />
                  Daily Routine & Notes
                </h2>

                <div className="space-y-4 flex-grow">
                  {/* Morning */}
                  <div className="border-b border-slate-100 pb-3">
                    <h3 className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-2">5:00 AM - Deep Work</h3>
                    <label className="flex items-center gap-2 cursor-pointer mb-2">
                      <div onClick={() => toggleRoutine('journal')} className="text-blue-500">{routine.journal ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4 text-slate-300"/>}</div>
                      <span className={`text-sm ${routine.journal ? 'line-through text-slate-400' : 'text-slate-700'}`}>10-Min Tradervue Tagging</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer mb-2">
                      <div onClick={() => toggleRoutine('alerts')} className="text-blue-500">{routine.alerts ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4 text-slate-300"/>}</div>
                      <span className={`text-sm ${routine.alerts ? 'line-through text-slate-400' : 'text-slate-700'}`}>Set TradingView Alerts</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <div onClick={() => toggleRoutine('orders')} className="text-blue-500">{routine.orders ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4 text-slate-300"/>}</div>
                      <span className={`text-sm ${routine.orders ? 'line-through text-slate-400' : 'text-slate-700'}`}>Enter Broker Bracket Orders</span>
                    </label>
                  </div>

                  {/* Market Hours */}
                  <div className="border-b border-slate-100 pb-3">
                    <h3 className="text-xs font-bold text-orange-600 uppercase tracking-wider mb-2">4:30 PM - Market Open</h3>
                    <label className="flex items-center gap-2 cursor-pointer mb-2">
                      <div onClick={() => toggleRoutine('handsOff')} className="text-orange-500">{routine.handsOff ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4 text-slate-300"/>}</div>
                      <span className={`text-sm ${routine.handsOff ? 'line-through text-slate-400' : 'text-slate-700'}`}>Hands-off rule maintained</span>
                    </label>
                    <div>
                      <label className="block text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-1" title="Visual check only. Does not impact realized daily max loss">Open Position Exposure (Floating R)</label>
                      <input 
                        type="number" 
                        step="0.1"
                        value={unrealizedOpenRisk} 
                        onChange={(e) => setUnrealizedOpenRisk(Number(e.target.value))} 
                        placeholder="e.g. -2.5"
                        className="w-full p-1.5 border border-slate-300 bg-slate-50 rounded text-xs font-mono focus:ring-blue-500" 
                      />
                    </div>
                  </div>

                  {/* After Hours */}
                  <div className="border-b border-slate-100 pb-3">
                    <h3 className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-2">11:00 PM - Post Close</h3>
                    <label className="flex items-center gap-2 cursor-pointer mb-2">
                      <div onClick={() => toggleRoutine('reviewPos')} className="text-indigo-500">{routine.reviewPos ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4 text-slate-300"/>}</div>
                      <span className={`text-sm ${routine.reviewPos ? 'line-through text-slate-400' : 'text-slate-700'}`}>Review open positions logic</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <div onClick={() => toggleRoutine('moveStops')} className="text-indigo-500">{routine.moveStops ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4 text-slate-300"/>}</div>
                      <span className={`text-sm ${routine.moveStops ? 'line-through text-slate-400' : 'text-slate-700'}`}>Trail stops mathematically (10/20 SMA)</span>
                    </label>
                  </div>
                  
                  {/* Daily Notes Field & 5W Mistake Register */}
                  <div className="pt-2">
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Entry Date</label>
                        <input 
                          type="date" 
                          value={journalDate}
                          onChange={(e) => setJournalDate(e.target.value)}
                          className="w-full p-1.5 text-xs border border-slate-300 rounded focus:ring-emerald-500 bg-slate-50 font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Execution Quality</label>
                        <select 
                          value={executionType} 
                          onChange={(e) => setExecutionType(e.target.value)}
                          className="w-full p-1.5 text-xs border border-slate-300 rounded focus:ring-emerald-500 bg-slate-50 font-medium"
                        >
                          <option value="perfect">Perfect Plan Followed</option>
                          <option value="mistake">Execution Mistake Made</option>
                        </select>
                      </div>
                    </div>

                    {executionType === 'mistake' && (
                      <div className="bg-red-50 p-3 rounded border border-red-200 mb-3 space-y-3">
                        <div className="flex gap-2">
                          <div className="w-2/3">
                            <label className="text-[10px] font-bold text-red-700 uppercase block">Mistake Classification</label>
                            <select 
                              value={mistakeCategory} 
                              onChange={(e) => setMistakeType(e.target.value)}
                              className="w-full mt-1 p-1 text-[11px] border border-red-300 rounded bg-white font-medium text-red-800"
                            >
                              <option value="none">Choose classification...</option>
                              <option value="fomo">FOMO / Impulsive Entry</option>
                              <option value="chasing">Chasing Stock Past Breakout</option>
                              <option value="stop_down">Moved Stop Loss Downward</option>
                              <option value="oversized">Violated Allowed Sizing Tier</option>
                              <option value="early_exit">Choked Off Runner (Early Exit)</option>
                            </select>
                          </div>
                          <div className="w-1/3">
                            <label className="text-[10px] font-bold text-red-700 uppercase block">Cost (R)</label>
                            <input 
                              type="number" 
                              step="0.5"
                              placeholder="e.g. 1.5"
                              value={mistakeCostR} 
                              onChange={(e) => setMistakeCostR(Number(e.target.value))}
                              className="w-full mt-1 p-1 text-[11px] border border-red-300 rounded bg-white text-right font-mono"
                            />
                          </div>
                        </div>

                        {/* SMB Capital 5 W's Framework */}
                        <div className="border-t border-red-200 pt-2">
                          <label className="text-[10px] font-bold text-red-800 uppercase flex items-center gap-1 mb-2">
                            <HelpCircle className="w-3 h-3" /> SMB 5 W's Diagnosis Model
                          </label>
                          <div className="space-y-1">
                            <input type="text" placeholder="1. Why did I do it?" value={fiveWs.w1} onChange={e => setFiveWs({...fiveWs, w1: e.target.value})} className="w-full p-1 text-[10px] border border-red-200 rounded animate-pulse" />
                            <input type="text" placeholder="2. Why is that?" value={fiveWs.w2} onChange={e => setFiveWs({...fiveWs, w2: e.target.value})} className="w-full p-1 text-[10px] border border-red-200 rounded" />
                            <input type="text" placeholder="3. Why is THAT?" value={fiveWs.w3} onChange={e => setFiveWs({...fiveWs, w3: e.target.value})} className="w-full p-1 text-[10px] border border-red-200 rounded" />
                            <input type="text" placeholder="4. Why?" value={fiveWs.w4} onChange={e => setFiveWs({...fiveWs, w4: e.target.value})} className="w-full p-1 text-[10px] border border-red-200 rounded" />
                            <input type="text" placeholder="5. Ultimate Root Cause?" value={fiveWs.w5} onChange={e => setFiveWs({...fiveWs, w5: e.target.value})} className="w-full p-1 text-[10px] border border-red-200 rounded bg-red-100 font-medium" />
                            <input type="text" placeholder="Actionable Solution for Next Time" value={fiveWs.solution} onChange={e => setFiveWs({...fiveWs, solution: e.target.value})} className="w-full p-1.5 mt-2 text-[10px] border border-emerald-300 bg-emerald-50 rounded text-emerald-900 font-bold" />
                          </div>
                        </div>
                      </div>
                    )}
                     
                     <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Daily Journal Notes</label>
                     <textarea 
                        className="w-full h-20 p-2 text-xs border border-slate-300 rounded focus:ring-emerald-500 bg-slate-50" 
                        placeholder="What did I do well? Market climate? Setup thoughts?"
                        value={dailyNotes}
                        onChange={(e) => setDailyNotes(e.target.value)}
                     />
                  </div>
                </div>

                <button 
                  onClick={archiveDay}
                  className="mt-4 w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 rounded-lg shadow transition-colors flex justify-center items-center gap-2"
                >
                  <Save className="h-4 w-4" />
                  Save Day & Reset
                </button>
              </div>

            </div>

          </div>
        )}

        {/* --- TAB 2: ARCHIVE & BACKUP --- */}
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