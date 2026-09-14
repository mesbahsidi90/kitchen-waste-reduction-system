import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { claimDevice, clearDeviceToken, createWasteLog, getApiErrorMessage, getDeviceCatalog, getDeviceToken, isDeviceUnauthorized, isRetryableWasteLogError, type CatalogItem, type WasteLogInput } from "./api";
import { cacheDeviceCatalog, clearCachedDeviceCatalog, getCachedDeviceCatalog, getPendingWasteLogs, queueWasteLog, removePendingWasteLog } from "./offline-queue";
import { connectToScale, isSerialSupported, type ScaleConnection } from "./serial-scale";
import "./App.css";

const DEFAULT_SCALE_ID = import.meta.env.VITE_SCALE_ID ?? "SCALE_01";
const ENABLE_SIMULATOR = import.meta.env.DEV || import.meta.env.VITE_ENABLE_SCALE_SIMULATOR === "true";

type Message = { kind: "idle" | "pending" | "success" | "error"; text: string };
type ScaleState = "disconnected" | "connecting" | "connected" | "unsupported" | "error";

const scaleLabels: Record<ScaleState, string> = {
  disconnected: "الميزان غير متصل",
  connecting: "جاري الاتصال…",
  connected: "الميزان متصل",
  unsupported: "الاتصال غير مدعوم",
  error: "تعذر اتصال الميزان",
};

export default function App() {
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
  const pendingEventId = useRef<string | null>(null);
  const isSubmitting = message.kind === "pending";

  const syncPendingEvents = useCallback(async () => {
    if (!navigator.onLine || syncingRef.current || !provisioned) return;
    const pendingEvents = getPendingWasteLogs();
    if (pendingEvents.length === 0) return;

    syncingRef.current = true;
    setSyncing(true);
    setMessage({ kind: "pending", text: `جاري مزامنة ${pendingEvents.length.toLocaleString("ar-EG")} عمليات…` });
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
            setMessage({ kind: "error", text: "تعذرت المزامنة مؤقتًا. سيحاول الكيوسك مجددًا عند عودة الاتصال." });
            stopSync = true;
          } else {
            setMessage({ kind: "error", text: "توجد عملية معلّقة تحتاج مراجعة إعدادات الفرع." });
          }
          if (stopSync) break;
        }
      }
      const remaining = getPendingWasteLogs().length;
      setPendingCount(remaining);
      if (remaining === 0 && synced > 0) {
        setMessage({ kind: "success", text: "تمت مزامنة جميع العمليات المعلّقة." });
      }
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [provisioned]);

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
    // oxlint-disable-next-line react/set-state-in-effect
    if (isOnline && provisioned) void syncPendingEvents();
  }, [isOnline, provisioned, syncPendingEvents]);

  useEffect(() => {
    if (!provisioned) return;
    const interval = window.setInterval(() => {
      if (navigator.onLine && getPendingWasteLogs().length > 0) void syncPendingEvents();
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [provisioned, syncPendingEvents]);

  useEffect(() => {
    if (!provisioned) return;
    async function loadCatalog() {
      setCatalogLoading(true);
      try {
        const catalog = await getDeviceCatalog();
        cacheDeviceCatalog(catalog);
        setScaleId(catalog.scale_id);
        setCategories(catalog.categories);
        setReasons(catalog.reasons);
        setMessage({ kind: "idle", text: "" });
      } catch (error) {
        if (isDeviceUnauthorized(error) && !import.meta.env.DEV) {
          clearDeviceToken();
          clearCachedDeviceCatalog();
          setProvisioned(false);
        } else {
          const cachedCatalog = getCachedDeviceCatalog();
          if (cachedCatalog) {
            setScaleId(cachedCatalog.scale_id);
            setCategories(cachedCatalog.categories);
            setReasons(cachedCatalog.reasons);
            setMessage({ kind: "success", text: "تعذر تحديث القائمة؛ يستخدم الكيوسك آخر نسخة محفوظة." });
          } else {
            setMessage({ kind: "error", text: "تعذر تحميل أصناف الفرع. تحقق من إعداد الجهاز ثم أعد المحاولة." });
          }
        }
      } finally {
        setCatalogLoading(false);
      }
    }

    void loadCatalog();
  }, [provisioned]);

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
      setMessage({ kind: "error", text: "تعذر الاتصال بالميزان. تحقق من الكابل ثم حاول مجددًا." });
    }
  }

  async function handleSend() {
    if (weight <= 0) {
      setMessage({ kind: "error", text: "ضع الهدر على الميزان أولًا." });
      return;
    }
    if (!category || !reason) {
      setMessage({ kind: "error", text: "اختر الصنف والسبب قبل التسجيل." });
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
        setMessage({ kind: "success", text: "تم حفظ العملية على الجهاز وستُرسل عند عودة الاتصال." });
      } catch (error) {
        setMessage({ kind: "error", text: error instanceof Error ? error.message : "تعذر حفظ العملية على الجهاز." });
      }
      return;
    }

    setMessage({ kind: "pending", text: "جاري التسجيل…" });

    try {
      await createWasteLog(event);
      pendingEventId.current = null;
      setCategory(null);
      setReason(null);
      setMessage({ kind: "success", text: "تم تسجيل الهدر بنجاح" });
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
          setMessage({ kind: "success", text: "تعذر الوصول للخادم؛ حُفظت العملية وستُزامن تلقائيًا." });
        } catch (queueError) {
          setMessage({ kind: "error", text: queueError instanceof Error ? queueError.message : "تعذر حفظ العملية." });
        }
      } else {
        setMessage({ kind: "error", text: getApiErrorMessage(error, "تعذر تسجيل العملية. راجع إعدادات الفرع.") });
      }
    }
  }

  if (!provisioned) {
    return <PairingScreen onPaired={(deviceCode) => { clearCachedDeviceCatalog(); setScaleId(deviceCode); setCategories([]); setReasons([]); setProvisioned(true); }} />;
  }

  return (
    <main className="kiosk-shell" dir="rtl">
      <header className="app-header">
        <div>
          <strong>Kitzon</strong>
          <span>تسجيل الهدر</span>
        </div>
        <div className="status-strip" aria-label="حالة النظام">
          <span className={isOnline ? "online" : "offline"}>{isOnline ? "متصل" : "دون إنترنت"}</span>
          <span className={scaleState === "connected" ? "online" : "offline"}>{scaleLabels[scaleState]}</span>
          {pendingCount > 0 && <span className="queued">{pendingCount.toLocaleString("ar-EG")} معلّقة</span>}
        </div>
      </header>

      {pendingCount > 0 && <aside className="sync-banner"><div><strong>عمليات محفوظة على الجهاز</strong><p>ستُرسل تلقائيًا عند توفر الاتصال.</p></div><button type="button" disabled={!isOnline || syncing} onClick={() => void syncPendingEvents()}>{syncing ? "جاري الإرسال…" : "مزامنة الآن"}</button></aside>}

      <section className="weight-panel" aria-labelledby="weight-title">
        <p id="weight-title">الوزن</p>
        <output className="weight-value">{weight.toFixed(3)} <small>كجم</small></output>
        <button
          className="scale-button"
          type="button"
          disabled={scaleState === "connecting" || scaleState === "unsupported"}
          onClick={() => void handleScaleConnection()}
        >
          {scaleState === "connected" ? "فصل الميزان" : "توصيل الميزان"}
        </button>
        {ENABLE_SIMULATOR && scaleState !== "connected" && (
          <button className="simulate-button" type="button" onClick={() => setWeight(Number((Math.random() * 3 + 0.2).toFixed(3)))}>
            تجربة وزن عشوائي
          </button>
        )}
      </section>

      <section aria-labelledby="category-title">
        <h2 id="category-title"><span>1</span> اختر الصنف</h2>
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
          {!catalogLoading && categories.length === 0 && <p className="empty-options">لا توجد أصناف مفعّلة لهذا الفرع.</p>}
          {catalogLoading && <p className="empty-options">جاري تحميل الأصناف…</p>}
        </div>
      </section>

      <section aria-labelledby="reason-title">
        <h2 id="reason-title"><span>2</span> اختر السبب</h2>
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
          {!catalogLoading && reasons.length === 0 && <p className="empty-options">لا توجد أسباب هدر مفعّلة لهذا الفرع.</p>}
          {catalogLoading && <p className="empty-options">جاري تحميل الأسباب…</p>}
        </div>
      </section>

      <button className="submit-button" type="button" disabled={isSubmitting || syncing} onClick={() => void handleSend()}>
        {isSubmitting ? "جاري التسجيل…" : `تسجيل ${weight.toFixed(3)} كجم`}
      </button>

      {message.text && <p className={`status-message ${message.kind}`} role="status" aria-live="polite">{message.text}</p>}
    </main>
  );
}

function PairingScreen({ onPaired }: { onPaired: (deviceCode: string) => void }) {
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
      setError(getApiErrorMessage(caught, "تعذر تفعيل الجهاز. تحقق من الرمز والاتصال."));
    } finally {
      setSubmitting(false);
    }
  }

  return <main className="pairing-shell" dir="rtl">
    <section className="pairing-card">
      <div className="pairing-mark">K</div>
      <span className="pairing-kicker">Kitzon Kiosk</span>
      <h1>تفعيل جهاز المطبخ</h1>
      <p>اطلب رمز التفعيل من مدير المطبخ، ثم أدخله هنا لربط هذا الجهاز بالفرع.</p>
      <form onSubmit={(event) => void pair(event)}>
        <label htmlFor="pairing-code">رمز التفعيل</label>
        <input id="pairing-code" dir="ltr" autoComplete="one-time-code" autoCapitalize="characters" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="ABCD-EFGH" maxLength={12} required />
        <button type="submit" disabled={submitting || code.replace(/[\s-]/g, "").length !== 8}>{submitting ? "جاري التفعيل…" : "تفعيل الجهاز"}</button>
      </form>
      {error && <p className="pairing-error" role="alert">{error}</p>}
      <small>الرمز صالح لمدة 15 دقيقة ويُستخدم مرة واحدة.</small>
    </section>
  </main>;
}
