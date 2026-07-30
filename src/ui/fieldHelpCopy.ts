/** Central hover-help copy keyed by field id. */
export const FIELD_HELP: Record<string, string> = {
  peakEquity:
    'Highest net liquidation used for drawdown math. OCR import never lowers this automatically.',
  currentEquity:
    'Current Net Liq from IBKR. Drive risk % and 1R. Update via screenshot import at start of day.',
  drawdown:
    'Percent below peak equity. Controls risk tier: 5%→0.75%, 10%→0.5%, 15%→hard stop.',
  oneR:
    'One risk unit in dollars = equity × allowed risk %. All position sizing is measured in R.',
  dailyMaxLoss:
    'Realized session stop: −2R. When hit, live trading is locked for the day.',
  dailyRealizedPL:
    'Closed P&L for today from IBKR. Hits the −2R daily lock when too negative.',
  unrealizedPL:
    'Open mark-to-market P&L. Large negative open P&L lowers the portfolio risk score.',
  unrealizedOpenRisk:
    'Open exposure in R = |unrealized P&L| ÷ 1R. Separate from the dollar unrealized figure. Auto from snapshot when 1R > 0.',
  excessLiquidity:
    'IBKR buffer above margin requirements. Thin buffer raises the portfolio risk score penalty.',
  buyingPower:
    'IBKR buying power. High BP with high maint margin signals leverage stress.',
  maintMargin:
    'Maintenance margin required by IBKR. High vs equity = less room for error.',
  qqqStatus:
    'QQQ regime for Breaker B. Below 50 SMA locks breakout allocation.',
  spyStatus:
    'SPY regime for Breaker B warning when below 21 EMA.',
  last3R:
    'Closed R from recent recovery trades. Need +2R realized to step risk tier up.',
  manualRiskTier:
    'Override auto drawdown tier only after earning the next small win (+2R).',
  workspaceMode:
    'Planning ignores market hours so you can size anytime. Live enforces approved windows for execution.',
  entryPrice: 'Planned entry price. Used with stop to compute share size from allowed risk.',
  stopPrice: 'Hard stop price. Dollar risk per share = |entry − stop|.',
  originalStop:
    'Stop level frozen when you Commit. While drafting it mirrors Stop; after commit it cannot widen (Breaker D).',
  sitOnHands:
    'Deliberate no-trade plan. No ticker needed. Completes Plan step and blocks new risk for the day.',
  tradeDirection: 'Long or short. Determines which way a stop move reduces risk.',
  requestedShares:
    'Optional size check. Cannot exceed calculator max for allowed risk.',
  tradeTicker: 'Symbol you are planning. Required for earnings / event-risk gate.',
  earningsChecked: 'You must verify earnings before any new trade is allowed.',
  earningsTiming:
    'Today / tomorrow / unknown blocks new trades. None known or this week can proceed if checked.',
  highImpactEvent:
    'News, FDA, offering, etc. Pending events need explicit plan approval.',
  setupGrade:
    'A = full risk, B = half risk, C / No Trade = size 0. Portfolio score may cap this.',
  isAdd: 'Adding to an existing position. Loser adds must be pre-planned.',
  addType: 'Winner adds only when thesis confirmed. Loser adds are blocked unless pre-planned.',
  profitProtection:
    'At +15% or +2R you must take partials or move stop. After +20% do not let winners become losers.',
  gateStatus:
    'Composite permission: schedule + risk + earnings + plan. Planning can be ready while Live stays blocked.',
  watchlist: 'Parking lot for tickers you plan. Click to load into the calculator.',
  snapshotImport:
    'Start-of-day step: OCR your IBKR Portfolio screenshot, review numbers, then Apply.',
  portfolioRiskScore:
    '0–100 health from drawdown, P&L, concentration, and margin. Caps setup grade when stressed.',
  positions:
    'Open stock positions from IBKR. Used for concentration and open-risk estimates. Add missing tickers if OCR dropped them.',
  posTicker: 'Symbol from IBKR Positions. OCR can miss rows — add manually if needed.',
  posQty: 'Share quantity. Must match your broker position size.',
  posLast: 'Last traded price from the screenshot (optional if OCR missed it).',
  posPnl: 'Open P&L for this position from IBKR (mark-to-market).',
  posEntryPrice:
    'Your average entry / cost basis. Not on the IBKR Portfolio screenshot — enter manually for planning.',
  posEntryDate:
    'Date you opened or last added to this position. Manual — used for journal/planning context.',
  ocrRawText:
    'Raw text Tesseract read. If a ticker is missing here, OCR never saw it — add the row manually.',
  routineSnapshot:
    'Required first. Completes only after you Apply a reviewed IBKR snapshot.',
  routineJournal: 'Quick Tradervue / journal tagging before live execution.',
  routineAlerts: 'Levels and alerts set in TradingView before the window opens.',
  routineOrders: 'Broker brackets only when Live gate allows (approved window).',
  ocrReview:
    'Always confirm OCR values. Screenshots misread K/M and minus signs — you are the final check.',
  planCommit:
    'Locks thesis, invalidation, entry, and original stop. Required before Live. Stop can only tighten after commit.',
  planVoid:
    'Clears the locked plan. Live size returns to 0 until you commit again.',
  planThesis: 'One or two lines: why this trade exists. Required to commit.',
  planInvalidation: 'What proves you wrong — exit condition. Required to commit.',
  planEmotion: '1 calm … 5 tilted. Be honest. High emotion is a reason to skip.',
  planNotRevenge: 'Confirm this is not a revenge trade after a loss or missed move.',
  disciplineChip: 'Recent mistakes cut allowed risk. Fix process to restore full size.',
  backupExport:
    'Download JSON for your other PC (Drive/USB). Archive also auto-exports.',
  noTradeToday: 'Mark when you intentionally skip trading — completes Execute/Close steps without a Live entry.',
  todayFlow: 'One path: Snapshot → Plan & lock → Execute → Close day. Blueprint is reference only.',
};
