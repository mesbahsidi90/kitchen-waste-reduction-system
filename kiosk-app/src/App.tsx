import { useRef, useState, type CSSProperties } from "react";
import { createWasteLog } from "./api";
import "./App.css";

const SCALE_ID = import.meta.env.VITE_SCALE_ID ?? "SCALE_01";
const categories = [
  { name: "خضروات وفواكه", color: "#2e7d32" },
  { name: "لحوم ودواجن", color: "#c62828" },
  { name: "مخبوزات", color: "#f57c00" },
  { name: "وجبات مطبوخة", color: "#1565c0" },
] as const;
const reasons = [
  "تالف / منتهي الصلاحية",
  "بقايا تحضير (Trim)",
  "بقايا صحون الزبائن",
  "خطأ طهي",
] as const;

type Message = { kind: "idle" | "pending" | "success" | "error"; text: string };

export default function App() {
  const [weight, setWeight] = useState("1.2");
  const [category, setCategory] = useState<string>(categories[0].name);
  const [reason, setReason] = useState<string>(reasons[0]);
  const [message, setMessage] = useState<Message>({ kind: "idle", text: "" });
  const pendingEventId = useRef<string | null>(null);
  const isSubmitting = message.kind === "pending";

  async function handleSend() {
    const weightKg = Number(weight);
    if (!Number.isFinite(weightKg) || weightKg <= 0) {
      setMessage({ kind: "error", text: "أدخل وزناً صحيحاً أكبر من صفر" });
      return;
    }

    setMessage({ kind: "pending", text: "جاري التسجيل…" });
    pendingEventId.current ??= crypto.randomUUID();
    try {
      await createWasteLog({ client_event_id: pendingEventId.current, scale_id: SCALE_ID, weight_kg: weightKg, category, reason });
      pendingEventId.current = null;
      setMessage({ kind: "success", text: "تم تسجيل الهدر بنجاح" });
    } catch {
      setMessage({ kind: "error", text: "تعذر الاتصال بالخادم. حاول مرة أخرى." });
    }
  }

  return (
    <main className="kiosk-shell" dir="rtl">
      <section className="weight-panel" aria-labelledby="weight-title">
        <p id="weight-title">الوزن الملتقط من الميزان</p>
        <output className="weight-value">{weight} <small>كجم</small></output>
        <button className="simulate-button" type="button" onClick={() => setWeight((Math.random() * 3 + 0.2).toFixed(3))}>
          محاكاة تغيير الوزن
        </button>
      </section>

      <section aria-labelledby="category-title">
        <h2 id="category-title">1. اختر نوع الهدر</h2>
        <div className="option-grid category-grid">
          {categories.map((item) => (
            <button
              className="option-button category-button"
              key={item.name}
              type="button"
              aria-pressed={category === item.name}
              onClick={() => setCategory(item.name)}
              style={{ "--selected-color": item.color } as CSSProperties}
            >
              {item.name}
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="reason-title">
        <h2 id="reason-title">2. اختر السبب</h2>
        <div className="option-grid">
          {reasons.map((item) => (
            <button className="option-button reason-button" key={item} type="button" aria-pressed={reason === item} onClick={() => setReason(item)}>
              {item}
            </button>
          ))}
        </div>
      </section>

      <button className="submit-button" type="button" disabled={isSubmitting} onClick={() => void handleSend()}>
        {isSubmitting ? "جاري التسجيل…" : "تأكيد وتسجيل الهدر"}
      </button>

      {message.text && <p className={`status-message ${message.kind}`} role="status" aria-live="polite">{message.text}</p>}
    </main>
  );
}
