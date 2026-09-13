import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { acceptInvitation, getApiErrorMessage, getPendingInvitation, type PlatformMember } from "./api";
import { isSupabaseAuthEnabled, supabase } from "./supabase";

type AuthGateProps = {
  children: (auth: DashboardAuth) => ReactNode;
};

export type DashboardAuth = {
  accessToken?: string;
  email?: string;
  signOut?: () => Promise<void>;
};

const invitePath = "/accept-invite";

function invitationLinkError() {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const description = query.get("error_description") ?? hash.get("error_description");
  return description ?? "";
}

function passwordValidationError(password: string, confirmation: string) {
  if (password.length < 10) return "استخدم 10 أحرف على الأقل";
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return "يجب أن تحتوي كلمة المرور على حرف كبير وحرف صغير ورقم";
  }
  if (password !== confirmation) return "كلمتا المرور غير متطابقتين";
  return "";
}

function Brand() {
  return <div className="login-brand"><span className="brand-mark">KW</span><div><strong>Kitchen Waste</strong><small>منصة إدارة الهدر</small></div></div>;
}

type InvitationDetails = { organization_name: string; role: PlatformMember["role"] };

const invitationRoleLabels: Record<PlatformMember["role"], string> = {
  organization_owner: "مالك المؤسسة",
  branch_manager: "مدير فرع",
  worker: "موظف مطبخ",
};

function InvitePasswordForm({ session, invitation }: { session: Session; invitation: InvitationDetails }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [passwordUpdated, setPasswordUpdated] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function finishInvitation(event: FormEvent) {
    event.preventDefault();
    setError("");
    let passwordWasUpdated = passwordUpdated;
    if (!passwordUpdated) {
      const validationError = passwordValidationError(password, confirmation);
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    setSubmitting(true);
    try {
      if (!passwordUpdated) {
        const updateResult = await supabase!.auth.updateUser({ password });
        if (updateResult.error) throw updateResult.error;
        setPasswordUpdated(true);
        passwordWasUpdated = true;
      }
      await acceptInvitation(session.access_token);
      window.location.replace("/");
    } catch (caught) {
      setError(getApiErrorMessage(
        caught,
        passwordWasUpdated
          ? "تعذر تفعيل العضوية. حاول إكمال التفعيل مرة أخرى."
          : "تعذر تعيين كلمة المرور. قد يكون رابط الدعوة منتهي الصلاحية.",
      ));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-shell" dir="rtl">
      <form className="login-card" onSubmit={(event) => void finishInvitation(event)}>
        <Brand />
        <p className="eyebrow">قبول الدعوة</p>
        <h1>{passwordUpdated ? "أكمل تفعيل الحساب" : "أنشئ كلمة المرور"}</h1>
        <p className="login-hint">دعوة للانضمام إلى <strong>{invitation.organization_name}</strong> بصلاحية {invitationRoleLabels[invitation.role]}، باستخدام <strong dir="ltr">{session.user.email}</strong>.</p>
        {!passwordUpdated && <>
          <label>كلمة المرور الجديدة<input type="password" autoComplete="new-password" required minLength={10} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <label>تأكيد كلمة المرور<input type="password" autoComplete="new-password" required minLength={10} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
          <ul className="password-rules"><li>10 أحرف على الأقل</li><li>حرف كبير وحرف صغير</li><li>رقم واحد على الأقل</li></ul>
        </>}
        {passwordUpdated && <p className="success-banner">تم حفظ كلمة المرور بنجاح. بقي تفعيل عضويتك في المؤسسة.</p>}
        {error && <p className="error-banner" role="alert">{error}</p>}
        <button type="submit" disabled={submitting}>{submitting ? "جارٍ التفعيل…" : passwordUpdated ? "إكمال التفعيل" : "تعيين كلمة المرور والدخول"}</button>
      </form>
    </main>
  );
}

function InviteRoute({ session }: { session: Session }) {
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void getPendingInvitation(session.access_token)
      .then(setInvitation)
      .catch((caught) => setError(getApiErrorMessage(caught, "لا توجد دعوة معلّقة لهذا الحساب، أو أن الخادم غير متاح.")))
      .finally(() => setLoading(false));
  }, [session.access_token]);

  if (loading) return <main className="auth-shell" dir="rtl"><div className="auth-loader" /><p>جاري التحقق من الدعوة…</p></main>;
  if (invitation) return <InvitePasswordForm session={session} invitation={invitation} />;
  return <main className="auth-shell" dir="rtl"><section className="login-card invite-error"><Brand /><p className="eyebrow">تعذر قبول الدعوة</p><h1>لا توجد دعوة معلّقة</h1><p>{error}</p><button type="button" onClick={() => window.location.replace("/")}>العودة إلى لوحة التحكم</button></section></main>;
}

export default function AuthGate({ children }: AuthGateProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseAuthEnabled);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isInviteRoute = window.location.pathname.replace(/\/+$/, "") === invitePath;
  const linkError = invitationLinkError();

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
  if (isInviteRoute) {
    if (session) return <InviteRoute session={session} />;
    return <main className="auth-shell" dir="rtl"><section className="login-card invite-error"><Brand /><p className="eyebrow">تعذر قبول الدعوة</p><h1>رابط الدعوة غير صالح</h1><p>{linkError || "ربما انتهت صلاحية الرابط أو سبق استخدامه. اطلب من مسؤول المنصة إرسال دعوة جديدة."}</p><button type="button" onClick={() => window.location.replace("/")}>العودة إلى تسجيل الدخول</button></section></main>;
  }
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
        <Brand />
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
