import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { claimDevice, clearDeviceToken, createWasteLog, getApiErrorMessage, getDeviceCatalog, getDeviceToken, isDeviceUnauthorized, type CatalogItem } from "./api";
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
  const [provisioned, setProvisioned] = useState(() => import.meta.env.DEV || Boolean(getDeviceToken()));
  const [scaleId, setScaleId] = useState(DEFAULT_SCALE_ID);
  const [weight, setWeight] = useState(0);
  const [categories, setCategories] = useState<CatalogItem[]>([]);
  const [reasons, setReasons] = useState<CatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [category, setCategory] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>({ kind: "idle", text: "" });
  const [scaleState, setScaleState] = useState<ScaleState>(() => isSerialSupported() ? "disconnected" : "unsupported");
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const connectionRef = useRef<ScaleConnection | null>(null);
  const pendingEventId = useRef<string | null>(null);
  const isSubmitting = message.kind === "pending";

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
    if (!provisioned) return;
    async function loadCatalog() {
      setCatalogLoading(true);
      try {
        const catalog = await getDeviceCatalog();
        setScaleId(catalog.scale_id);
        setCategories(catalog.categories);
        setReasons(catalog.reasons);
        setMessage({ kind: "idle", text: "" });
      } catch (error) {
        if (isDeviceUnauthorized(error) && !import.meta.env.DEV) {
          clearDeviceToken();
          setProvisioned(false);
        }
        setMessage({ kind: "error", text: "تعذر تحميل أصناف الفرع. تحقق من إعداد الجهاز ثم أعد المحاولة." });
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
    if (!isOnline) {
      setMessage({ kind: "error", text: "لا يوجد اتصال بالإنترنت. أعد المحاولة بعد عودة الاتصال." });
      return;
    }

    setMessage({ kind: "pending", text: "جاري التسجيل…" });
    pendingEventId.current ??= crypto.randomUUID();

    try {
      await createWasteLog({
        client_event_id: pendingEventId.current,
        scale_id: scaleId,
        weight_kg: weight,
        category,
        reason,
      });
      pendingEventId.current = null;
      setCategory(null);
      setReason(null);
      setMessage({ kind: "success", text: "تم تسجيل الهدر بنجاح" });
    } catch (error) {
      if (isDeviceUnauthorized(error) && !import.meta.env.DEV) {
        clearDeviceToken();
        setProvisioned(false);
        return;
      }
      setMessage({ kind: "error", text: "تعذر الاتصال بالخادم. اضغط تسجيل للمحاولة مجددًا." });
    }
  }

  if (!provisioned) {
    return <PairingScreen onPaired={(deviceCode) => { setScaleId(deviceCode); setProvisioned(true); }} />;
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
        </div>
      </header>

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

      <button className="submit-button" type="button" disabled={isSubmitting} onClick={() => void handleSend()}>
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
