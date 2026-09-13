import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { isSupabaseAuthEnabled, supabase } from "./supabase";

type AuthGateProps = {
  children: (auth: DashboardAuth) => ReactNode;
};

export type DashboardAuth = {
  accessToken?: string;
  email?: string;
  signOut?: () => Promise<void>;
};

export default function AuthGate({ children }: AuthGateProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseAuthEnabled);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isSupabaseAuthEnabled || !supabase) return;
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (!isSupabaseAuthEnabled) return children({});
  if (loading) return <main className="auth-shell" dir="rtl"><div className="auth-loader" /><p>جاري التحقق من الجلسة…</p></main>;
  if (session) {
    return children({
      accessToken: session.access_token,
      email: session.user.email,
      signOut: async () => {
        await supabase!.auth.signOut();
      },
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const result = await supabase!.auth.signInWithPassword({ email, password });
    if (result.error) setError("بيانات الدخول غير صحيحة أو أن الحساب غير مفعّل");
    setSubmitting(false);
  }

  return (
    <main className="auth-shell" dir="rtl">
      <form className="login-card" onSubmit={(event) => void handleSubmit(event)}>
        <div className="login-brand"><span className="brand-mark">KW</span><div><strong>Kitchen Waste</strong><small>منصة إدارة الهدر</small></div></div>
        <p className="eyebrow">مرحبًا بعودتك</p>
        <h1>تسجيل الدخول إلى لوحة التحكم</h1>
        <p className="login-hint">استخدم حساب المؤسسة للوصول إلى بيانات مطعمك وفروعك.</p>
        <label>البريد الإلكتروني<input type="email" autoComplete="email" required placeholder="name@restaurant.com" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>كلمة المرور<input type="password" autoComplete="current-password" required minLength={10} placeholder="••••••••••" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {error && <p className="error-banner" role="alert">{error}</p>}
        <button type="submit" disabled={submitting}>{submitting ? "جاري الدخول…" : "دخول"}</button>
      </form>
    </main>
  );
}
