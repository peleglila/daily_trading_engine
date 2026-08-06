import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Auth0Provider, useAuth0 } from '@auth0/auth0-react';
import { DailyDashboard } from './pages/DailyDashboard';
import { CalendarArchive } from './pages/CalendarArchive';
import {
  emptyAccountSettings,
  emptyBook,
  emptyPlan,
  todayISO,
  type AccountSettings,
  type DailyBook,
  type DayDocument,
  type DayPlan,
} from './types/dayBook';
import { computeDayMetrics, recomputeBook } from './engine/bookMetrics';
import {
  fetchDay,
  isCloudConfigured,
  listDays,
  saveDay,
  uploadSnapshot,
} from './api/client';

const LOCAL_KEY = 'pelegDailyDraft';
const LOCAL_DAYS_KEY = 'pelegSavedDays';
const LOCAL_ACCOUNT_KEY = 'pelegAccountSettings';

function loadAccountSettings(): AccountSettings {
  try {
    const raw = localStorage.getItem(LOCAL_ACCOUNT_KEY);
    if (!raw) return emptyAccountSettings();
    const parsed = JSON.parse(raw);
    return {
      baseEquity: Math.max(0, Number(parsed.baseEquity) || 0),
      peakEquity: Math.max(0, Number(parsed.peakEquity) || 0),
    };
  } catch {
    return emptyAccountSettings();
  }
}

function withAccountSettings(book: DailyBook, account = loadAccountSettings()): DailyBook {
  const baseEquity = Number(book.baseEquity) > 0 ? Number(book.baseEquity) : account.baseEquity;
  const peakEquity = Number(book.peakEquity) > 0 ? Number(book.peakEquity) : account.peakEquity;
  return recomputeBook({
    ...book,
    baseEquity,
    peakEquity,
  });
}

function loadLocalDraft(date: string): { book: DailyBook; plan: DayPlan } {
  const account = loadAccountSettings();
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return { book: withAccountSettings(emptyBook(), account), plan: emptyPlan() };
    const parsed = JSON.parse(raw);
    if (parsed.date === date) {
      return {
        book: withAccountSettings(
          recomputeBook({ ...emptyBook(), ...(parsed.book || {}) }),
          account
        ),
        plan: { ...emptyPlan(), ...(parsed.plan || {}) },
      };
    }
  } catch {
    /* ignore */
  }
  return { book: withAccountSettings(emptyBook(), account), plan: emptyPlan() };
}

function loadLocalDays(): DayDocument[] {
  try {
    const raw = localStorage.getItem(LOCAL_DAYS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

type AuthBridge = {
  cloud: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  email?: string;
  login: () => void;
  logout: () => void;
  getToken: () => Promise<string | null>;
};

function Desk({ auth }: { auth: AuthBridge }) {
  const [view, setView] = useState<'daily' | 'calendar'>('daily');
  const [date, setDate] = useState(todayISO());
  const [book, setBook] = useState<DailyBook>(() => loadLocalDraft(todayISO()).book);
  const [plan, setPlan] = useState<DayPlan>(() => loadLocalDraft(todayISO()).plan);
  const [days, setDays] = useState<DayDocument[]>(() => loadLocalDays());
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState('');

  useEffect(() => {
    const d = loadLocalDraft(date);
    setBook(d.book);
    setPlan(d.plan);
  }, [date]);

  useEffect(() => {
    localStorage.setItem(LOCAL_KEY, JSON.stringify({ date, book, plan }));
    localStorage.setItem(
      LOCAL_ACCOUNT_KEY,
      JSON.stringify({
        baseEquity: book.baseEquity || 0,
        peakEquity: book.peakEquity || 0,
      })
    );
  }, [date, book, plan]);

  useEffect(() => {
    if (!auth.cloud || !auth.isAuthenticated) return;
    (async () => {
      try {
        const token = await auth.getToken();
        if (!token) return;
        const remoteDays = await listDays(token);
        setDays(remoteDays);
        const today = await fetchDay(date, token);
        if (today?.book) {
          setBook(withAccountSettings(recomputeBook({ ...emptyBook(), ...today.book })));
          setPlan({ ...emptyPlan(), ...(today.plan || {}) });
        } else {
          setBook((prev) => withAccountSettings(prev));
        }
      } catch {
        setBanner('Cloud sync unavailable — working from local draft.');
      }
    })();
  }, [auth.cloud, auth.isAuthenticated, auth.getToken, date]);

  const equitySeries = useMemo(() => {
    const points = [...days]
      .filter((d) => d.book?.netLiq)
      .map((d) => ({ date: d.date.slice(5), equity: Number(d.book.netLiq) || 0 }))
      .sort((a, b) => a.date.localeCompare(b.date));
    if (book.netLiq > 0) {
      const todayLabel = date.slice(5);
      const idx = points.findIndex((p) => p.date === todayLabel);
      if (idx >= 0) points[idx] = { date: todayLabel, equity: book.netLiq };
      else points.push({ date: todayLabel, equity: book.netLiq });
    }
    return points;
  }, [days, book.netLiq, date]);

  const saveLocal = (doc: DayDocument) => {
    setDays((prev) => {
      const next = [doc, ...prev.filter((d) => d.date !== date)];
      localStorage.setItem(LOCAL_DAYS_KEY, JSON.stringify(next));
      return next;
    });
  };

  const handleSaveDay = async () => {
    setSaving(true);
    setBanner('');
    const metrics = computeDayMetrics(book);
    const doc: DayDocument = {
      date,
      book,
      plan,
      metrics,
      saved: true,
      updatedAt: new Date().toISOString(),
    };
    try {
      const token = await auth.getToken();
      if (auth.cloud && token) {
        try {
          const saved = await saveDay(date, doc, token);
          setDays((prev) => [saved, ...prev.filter((d) => d.date !== date)]);
          setBanner('Day saved to Atlas.');
        } catch (cloudErr) {
          // API down / Mongo unreachable — keep working offline
          saveLocal(doc);
          setBanner(
            `Cloud unreachable — saved locally. (${cloudErr instanceof Error ? cloudErr.message : 'API error'})`
          );
        }
      } else {
        saveLocal(doc);
        setBanner('Day saved locally. Add Auth0 + API keys to sync across devices.');
      }
    } catch (e) {
      saveLocal(doc);
      setBanner(`Saved locally after error: ${e instanceof Error ? e.message : 'unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleUploadSnapshot = async (context: string, blob: Blob) => {
    const token = await auth.getToken();
    if (!auth.cloud || !token) {
      setBanner('Snapshot upload needs Auth0 + API. Keys can be added later.');
      return;
    }
    await uploadSnapshot(date, context, blob, token);
    setBanner(`Snapshot saved for ${context}.`);
  };

  if (auth.cloud && auth.isLoading) {
    return (
      <div className="min-h-screen grid place-items-center bg-[var(--paper)] text-[var(--ink)]">
        <p className="font-display text-xl">Opening the desk…</p>
      </div>
    );
  }

  if (auth.cloud && !auth.isAuthenticated) {
    return (
      <div className="min-h-screen grid place-items-center bg-[var(--paper)] px-4">
        <div className="panel max-w-md w-full p-8 text-center space-y-4">
          <p className="eyebrow">Peleg Trading Desk</p>
          <h1 className="font-display text-3xl text-[var(--ink)]">Daily portfolio book</h1>
          <p className="text-sm text-[var(--ink-mute)]">
            Sign in with Auth0 to sync days, stops, and chart snapshots across devices.
          </p>
          <button type="button" className="btn-primary w-full" onClick={auth.login}>
            Sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--paper)] text-[var(--ink)]">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 space-y-5">
        <nav className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button type="button" className={view === 'daily' ? 'btn-primary' : 'btn-ghost'} onClick={() => setView('daily')}>
              Daily
            </button>
            <button type="button" className={view === 'calendar' ? 'btn-primary' : 'btn-ghost'} onClick={() => setView('calendar')}>
              Calendar
            </button>
          </div>
          <div className="flex items-center gap-3 text-xs font-data text-[var(--ink-mute)]">
            {!auth.cloud && <span className="badge">Local mode · add Auth0/Atlas later</span>}
            {auth.email && <span>{auth.email}</span>}
            {auth.cloud && auth.isAuthenticated && (
              <button type="button" className="btn-ghost text-xs" onClick={auth.logout}>
                Sign out
              </button>
            )}
          </div>
        </nav>

        {banner && (
          <div className="rounded-xl border border-[var(--line)] bg-white/70 px-3 py-2 text-xs font-data">{banner}</div>
        )}

        {view === 'daily' ? (
          <DailyDashboard
            date={date}
            book={book}
            plan={plan}
            equitySeries={equitySeries}
            cloudEnabled={auth.cloud && auth.isAuthenticated}
            saving={saving}
            onBookChange={setBook}
            onPlanChange={setPlan}
            onSaveDay={handleSaveDay}
            onUploadSnapshot={handleUploadSnapshot}
          />
        ) : (
          <CalendarArchive
            days={days}
            onOpenDay={(d) => {
              setDate(d);
              setView('daily');
            }}
          />
        )}
      </div>
    </div>
  );
}

function CloudDesk() {
  const { isAuthenticated, isLoading, loginWithRedirect, logout, getAccessTokenSilently, user } = useAuth0();
  const getToken = useCallback(async () => {
    try {
      return await getAccessTokenSilently();
    } catch {
      return null;
    }
  }, [getAccessTokenSilently]);

  const auth: AuthBridge = {
    cloud: true,
    isAuthenticated,
    isLoading,
    email: user?.email,
    login: () => {
      void loginWithRedirect();
    },
    logout: () => logout({ logoutParams: { returnTo: window.location.origin } }),
    getToken,
  };

  return <Desk auth={auth} />;
}

function LocalDesk() {
  const auth: AuthBridge = {
    cloud: false,
    isAuthenticated: true,
    isLoading: false,
    login: () => {},
    logout: () => {},
    getToken: async () => null,
  };
  return <Desk auth={auth} />;
}

export default function App() {
  const cloud = isCloudConfigured();
  if (!cloud) return <LocalDesk />;

  return (
    <Auth0Provider
      domain={import.meta.env.VITE_AUTH0_DOMAIN}
      clientId={import.meta.env.VITE_AUTH0_CLIENT_ID}
      authorizationParams={{
        redirect_uri: window.location.origin,
        audience: import.meta.env.VITE_AUTH0_AUDIENCE,
      }}
      cacheLocation="localstorage"
    >
      <CloudDesk />
    </Auth0Provider>
  );
}
