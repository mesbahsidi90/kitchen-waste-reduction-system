import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { claimDevice, clearDeviceToken, createWasteLog, getApiErrorMessage, getDeviceCatalog, getDeviceToken, isDeviceUnauthorized, isRetryableWasteLogError, type CatalogItem, type WasteLogInput } from "./api";
import { cacheDeviceCatalog, clearCachedDeviceCatalog, getCachedDeviceCatalog, getPendingWasteLogs, queueWasteLog, removePendingWasteLog } from "./offline-queue";
import { connectToScale, isSerialSupported, type ScaleConnection } from "./serial-scale";
import { LanguageSwitcher, useI18n } from "./i18n";
import "./App.css";

const DEFAULT_SCALE_ID = import.meta.env.VITE_SCALE_ID ?? "SCALE_01";
const ENABLE_SIMULATOR = import.meta.env.DEV || import.meta.env.VITE_ENABLE_SCALE_SIMULATOR === "true";

type Message = { kind: "idle" | "pending" | "success" | "error"; text: string };
type ScaleState = "disconnected" | "connecting" | "connected" | "unsupported" | "error";

export default function App() {
  const { t, locale, dir } = useI18n();
  const scaleLabels: Record<ScaleState, string> = {
    disconnected: t("scaleDisconnected"), connecting: t("scaleConnecting"), connected: t("scaleConnected"),
    unsupported: t("scaleUnsupported"), error: t("scaleError"),
  };
  const [initialCatalog] = useState(() => getCachedDeviceCatalog());
  const [provisioned, setProvisioned] = useState(() => import.meta.env.DEV || Boolean(getDeviceToken()));
  const [scaleId, setScaleId] = useState(initialCatalog?.scale_id ?? DEFAULT_SCALE_ID);
  const [weight, setWeight] = useState(0);
  const [categories, setCategories] = useState<CatalogItem[]>(initialCatalog?.categories ?? []);
  const [reasons, setReasons] = useState<CatalogItem[]>(initialCatalog?.reasons ?? []);
  const [catalogLoading, setCatalogLoading] = useState(!initialCatalog);
  const [category, setCategory] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>({ kind: "idle", text: "" });
  const [scaleState, setScaleState] = useState<ScaleState>(() => isSerialSupported() ? "disconnected" : "unsupported");
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [pendingCount, setPendingCount] = useState(() => getPendingWasteLogs().length);
  const [syncing, setSyncing] = useState(false);
  const connectionRef = useRef<ScaleConnection | null>(null);
  const syncingRef = useRef(false);
  const catalogSyncingRef = useRef(false);
  const pendingEventId = useRef<string | null>(null);
  const isSubmitting = message.kind === "pending";

  const refreshCatalog = useCallback(async (showFeedback = false) => {
    if (!provisioned || !navigator.onLine || catalogSyncingRef.current) return;
    catalogSyncingRef.current = true;
    if (showFeedback) setCatalogLoading(true);
    try {
      const catalog = await getDeviceCatalog();
      cacheDeviceCatalog(catalog);
      setScaleId(catalog.scale_id);
      setCategories(catalog.categories);
      setReasons(catalog.reasons);
      setCategory((current) => current && catalog.categories.some((item) => item.name === current) ? current : null);
      setReason((current) => current && catalog.reasons.some((item) => item.name === current) ? current : null);
      if (showFeedback) setMessage({ kind: "idle", text: "" });
    } catch (error) {
      if (isDeviceUnauthorized(error) && !import.meta.env.DEV) {
        clearDeviceToken();
        clearCachedDeviceCatalog();
        setProvisioned(false);
      } else if (showFeedback) {
        const cachedCatalog = getCachedDeviceCatalog();
        if (cachedCatalog) {
          setScaleId(cachedCatalog.scale_id);
          setCategories(cachedCatalog.categories);
          setReasons(cachedCatalog.reasons);
          setMessage({ kind: "success", text: t("cachedCatalog") });
        } else {
          setMessage({ kind: "error", text: t("catalogError") });
        }
      }
    } finally {
      catalogSyncingRef.current = false;
      if (showFeedback) setCatalogLoading(false);
    }
  }, [provisioned, t]);

  const syncPendingEvents = useCallback(async () => {
    if (!navigator.onLine || syncingRef.current || !provisioned) return;
    const pendingEvents = getPendingWasteLogs();
    if (pendingEvents.length === 0) return;

    syncingRef.current = true;
    setSyncing(true);
    setMessage({ kind: "pending", text: `${t("syncingEvents")} (${pendingEvents.length.toLocaleString(locale)})` });
    let synced = 0;
    try {
      for (const event of pendingEvents) {
        try {
          await createWasteLog(event);
          setPendingCount(removePendingWasteLog(event.client_event_id));
          synced += 1;
        } catch (error) {
          let stopSync = false;
          if (isDeviceUnauthorized(error) && !import.meta.env.DEV) {
            clearDeviceToken();
            clearCachedDeviceCatalog();
            setProvisioned(false);
            stopSync = true;
          } else if (isRetryableWasteLogError(error)) {
            setMessage({ kind: "error", text: t("syncTemporaryError") });
            stopSync = true;
          } else {
            setMessage({ kind: "error", text: t("pendingReview") });
          }
          if (stopSync) break;
        }
      }
      const remaining = getPendingWasteLogs().length;
      setPendingCount(remaining);
      if (remaining === 0 && synced > 0) {
        setMessage({ kind: "success", text: t("syncComplete") });
      }
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [locale, provisioned, t]);

  useEffect(() => {
    const updateOnlineState = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", updateOnlineState);
    window.addEventListener("offline", updateOnlineState);

    return () => {
      window.removeEventListener("online", updateOnlineState);
      window.removeEventListener("offline", updateOnlineState);
      void connectionRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    // Pending events are external persisted state synchronized when connectivity changes.
    if (isOnline && provisioned) {
      // oxlint-disable-next-line react/set-state-in-effect
      void syncPendingEvents();
      // oxlint-disable-next-line react/set-state-in-effect
      void refreshCatalog();
    }
  }, [isOnline, provisioned, refreshCatalog, syncPendingEvents]);

  useEffect(() => {
    if (!provisioned) return;
    const interval = window.setInterval(() => {
      if (navigator.onLine && getPendingWasteLogs().length > 0) void syncPendingEvents();
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [provisioned, syncPendingEvents]);

  useEffect(() => {
    if (!provisioned) return;
    // The initial catalog is external device state fetched after pairing.
    // oxlint-disable-next-line react/set-state-in-effect
    void refreshCatalog(true);
  }, [provisioned, refreshCatalog]);

  useEffect(() => {
    if (!provisioned) return;
    const refreshVisibleCatalog = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void refreshCatalog();
    };
    const interval = window.setInterval(refreshVisibleCatalog, 15_000);
    window.addEventListener("focus", refreshVisibleCatalog);
    document.addEventListener("visibilitychange", refreshVisibleCatalog);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshVisibleCatalog);
      document.removeEventListener("visibilitychange", refreshVisibleCatalog);
    };
  }, [provisioned, refreshCatalog]);

  async function handleScaleConnection() {
    if (connectionRef.current) {
      await connectionRef.current.disconnect();
      connectionRef.current = null;
      setScaleState("disconnected");
      setWeight(0);
      return;
    }

    setScaleState("connecting");
    setMessage({ kind: "idle", text: "" });

    try {
      const connection = await connectToScale({
        baudRate: Number(import.meta.env.VITE_SCALE_BAUD_RATE ?? 9600),
        onWeight: setWeight,
        onDisconnect: () => {
          connectionRef.current = null;
          setScaleState("disconnected");
        },
      });
      connectionRef.current = connection;
      setScaleState("connected");
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotFoundError") {
        setScaleState("disconnected");
        return;
      }
      setScaleState("error");
      setMessage({ kind: "error", text: t("scaleConnectionError") });
    }
  }

  async function handleSend() {
    if (weight <= 0) {
      setMessage({ kind: "error", text: t("putWasteFirst") });
      return;
    }
    if (!category || !reason) {
      setMessage({ kind: "error", text: t("chooseBoth") });
      return;
    }
    pendingEventId.current ??= crypto.randomUUID();
    const event: WasteLogInput = {
      client_event_id: pendingEventId.current,
      scale_id: scaleId,
      weight_kg: weight,
      category,
      reason,
    };

    if (!isOnline) {
      try {
        setPendingCount(queueWasteLog(event));
        pendingEventId.current = null;
        setCategory(null);
        setReason(null);
        setMessage({ kind: "success", text: t("queuedOffline") });
      } catch (error) {
        setMessage({ kind: "error", text: error instanceof Error ? error.message : t("localSaveError") });
      }
      return;
    }

    setMessage({ kind: "pending", text: t("recording") });

    try {
      await createWasteLog(event);
      pendingEventId.current = null;
      setCategory(null);
      setReason(null);
      setMessage({ kind: "success", text: t("recorded") });
    } catch (error) {
      if (isDeviceUnauthorized(error) && !import.meta.env.DEV) {
        clearDeviceToken();
        clearCachedDeviceCatalog();
        setProvisioned(false);
        return;
      }
      if (isRetryableWasteLogError(error)) {
        try {
          setPendingCount(queueWasteLog(event));
          pendingEventId.current = null;
          setCategory(null);
          setReason(null);
          setMessage({ kind: "success", text: t("queuedServerError") });
        } catch (queueError) {
          setMessage({ kind: "error", text: queueError instanceof Error ? queueError.message : t("localSaveError") });
        }
      } else {
        setMessage({ kind: "error", text: getApiErrorMessage(error, t("recordError")) });
      }
    }
  }

  if (!provisioned) {
    return <PairingScreen onPaired={(deviceCode) => { clearCachedDeviceCatalog(); setScaleId(deviceCode); setCategories([]); setReasons([]); setProvisioned(true); }} />;
  }

  return (
    <main className="kiosk-shell" dir={dir}>
      <header className="app-header">
        <div>
          <strong>Kitzon</strong>
          <span>{t("wasteRecording")}</span>
        </div>
        <div className="status-strip" aria-label={t("systemStatus")}>
          <LanguageSwitcher />
          <span className={isOnline ? "online" : "offline"}>{isOnline ? t("online") : t("offline")}</span>
          <span className={scaleState === "connected" ? "online" : "offline"}>{scaleLabels[scaleState]}</span>
          {pendingCount > 0 && <span className="queued">{pendingCount.toLocaleString(locale)} {locale.startsWith("fr") ? "en attente" : locale.startsWith("en") ? "pending" : "معلّقة"}</span>}
        </div>
      </header>

      {pendingCount > 0 && <aside className="sync-banner"><div><strong>{t("savedEvents")}</strong><p>{t("autoSend")}</p></div><button type="button" disabled={!isOnline || syncing} onClick={() => void syncPendingEvents()}>{syncing ? t("syncing") : t("syncNow")}</button></aside>}

      <section className="weight-panel" aria-labelledby="weight-title">
        <p id="weight-title">{t("weight")}</p>
        <output className="weight-value">{weight.toFixed(3)} <small>{t("kg")}</small></output>
        <button
          className="scale-button"
          type="button"
          disabled={scaleState === "connecting" || scaleState === "unsupported"}
          onClick={() => void handleScaleConnection()}
        >
          {scaleState === "connected" ? t("disconnectScale") : t("connectScale")}
        </button>
        {ENABLE_SIMULATOR && scaleState !== "connected" && (
          <button className="simulate-button" type="button" onClick={() => setWeight(Number((Math.random() * 3 + 0.2).toFixed(3)))}>
            {t("simulate")}
          </button>
        )}
      </section>

      <section aria-labelledby="category-title">
        <h2 id="category-title"><span>1</span> {t("chooseCategory")}</h2>
        <div className="option-grid category-grid">
          {categories.map((item) => (
            <button
              className="option-button category-button"
              key={item.name}
              type="button"
              aria-pressed={category === item.name}
              onClick={() => { setCategory(item.name); setMessage({ kind: "idle", text: "" }); }}
              style={{ "--selected-color": item.color ?? "#16865b" } as CSSProperties}
            >
              {item.name}
            </button>
          ))}
          {!catalogLoading && categories.length === 0 && <p className="empty-options">{t("noCategories")}</p>}
          {catalogLoading && <p className="empty-options">{t("loadingCategories")}</p>}
        </div>
      </section>

      <section aria-labelledby="reason-title">
        <h2 id="reason-title"><span>2</span> {t("chooseReason")}</h2>
        <div className="option-grid">
          {reasons.map((item) => (
            <button
              className="option-button reason-button"
              key={item.id}
              type="button"
              aria-pressed={reason === item.name}
              onClick={() => { setReason(item.name); setMessage({ kind: "idle", text: "" }); }}
            >
              {item.name}
            </button>
          ))}
          {!catalogLoading && reasons.length === 0 && <p className="empty-options">{t("noReasons")}</p>}
          {catalogLoading && <p className="empty-options">{t("loadingReasons")}</p>}
        </div>
      </section>

      <button className="submit-button" type="button" disabled={isSubmitting || syncing} onClick={() => void handleSend()}>
        {isSubmitting ? t("recording") : `${t("record")} ${weight.toFixed(3)} ${t("kg")}`}
      </button>

      {message.text && <p className={`status-message ${message.kind}`} role="status" aria-live="polite">{message.text}</p>}
    </main>
  );
}

function PairingScreen({ onPaired }: { onPaired: (deviceCode: string) => void }) {
  const { t, dir } = useI18n();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function pair(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const claimed = await claimDevice(code);
      onPaired(claimed.device_code);
    } catch (caught) {
      setError(getApiErrorMessage(caught, t("pairingError")));
    } finally {
      setSubmitting(false);
    }
  }

  return <main className="pairing-shell" dir={dir}>
    <section className="pairing-card">
      <div className="pairing-language"><LanguageSwitcher /></div>
      <div className="pairing-mark">K</div>
      <span className="pairing-kicker">Kitzon Kiosk</span>
      <h1>{t("activateKitchen")}</h1>
      <p>{t("pairingHelp")}</p>
      <form onSubmit={(event) => void pair(event)}>
        <label htmlFor="pairing-code">{t("activationCode")}</label>
        <input id="pairing-code" dir="ltr" autoComplete="one-time-code" autoCapitalize="characters" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="ABCD-EFGH" maxLength={12} required />
        <button type="submit" disabled={submitting || code.replace(/[\s-]/g, "").length !== 8}>{submitting ? t("activating") : t("activate")}</button>
      </form>
      {error && <p className="pairing-error" role="alert">{error}</p>}
      <small>{t("codeExpiry")}</small>
    </section>
  </main>;
}
