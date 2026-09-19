import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  createPlatformBranch,
  createPlatformOrganization,
  createTenantDevice,
  disableTenantDevice,
  getApiErrorMessage,
  getPlatformDemoRequests,
  getPlatformOrganization,
  invitePlatformMember,
  updateOrganizationStatus,
  updatePlatformDemoRequestStatus,
  updateSubscription,
  type AnalyticsSummary,
  type CreatePlatformOrganizationInput,
  type PlatformMember,
  type PlatformDemoRequest,
  type PlatformOrganization,
  type PlatformOrganizationDetails,
  type PlatformOverview,
  type WasteLog,
} from "./api";
import {
  createCategory,
  createThresholdRule,
  createWasteReason,
  getOperationalAnalytics,
  saveDailyMealCount,
  setCategoryActive,
  setCategoryCost,
  setThresholdRuleActive,
  setWasteReasonActive,
  updateThresholdRule,
  type AnalyticsFilters,
  type CatalogItem,
  type OperationalAnalytics,
  type WorkspaceData,
} from "./workspace";

const WasteChart = lazy(() => import("./WasteChart"));

const periodLabels = { day: "يومي", week: "أسبوعي", month: "شهري" } as const;
const planLabels = { trial: "تجريبي", starter: "أساسي", growth: "نمو", enterprise: "مؤسسات" } as const;
const subscriptionLabels = { trialing: "فترة تجريبية", active: "نشط", past_due: "متأخر", canceled: "ملغي" } as const;
const organizationStatusLabels = { trial: "تجريبي", active: "نشط", suspended: "موقوف", closed: "مغلق" } as const;
const demoRequestStatusLabels = { new: "جديد", contacted: "تم التواصل", qualified: "مؤهل", closed: "مغلق" } as const;

function isRecentlyOnline(lastSeen: string | null) {
  return Boolean(lastSeen) && Date.now() - new Date(lastSeen!).getTime() < 10 * 60 * 1_000;
}

function formatDate(value: string | null) {
  if (!value) return "لم يتصل بعد";
  return new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function localDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="empty-state"><span>◇</span><strong>{title}</strong><p>{description}</p></div>;
}

function StatusBadge({ active, activeText = "نشط", inactiveText = "غير نشط" }: {
  active: boolean;
  activeText?: string;
  inactiveText?: string;
}) {
  return <span className={`status-badge ${active ? "is-active" : "is-inactive"}`}><i />{active ? activeText : inactiveText}</span>;
}

export function WasteTable({ logs, loading }: { logs: WasteLog[]; loading: boolean }) {
  if (loading) return <div className="table-skeleton" aria-label="جاري تحميل البيانات"><i /><i /><i /><i /></div>;
  if (logs.length === 0) return <EmptyState title="لا توجد تسجيلات" description="ستظهر عمليات الهدر هنا فور تسجيلها من جهاز المطبخ." />;

  return (
    <div className="table-wrapper">
      <table>
        <thead><tr><th>الجهاز</th><th>الوزن</th><th>الصنف</th><th>السبب</th><th>وقت التسجيل</th></tr></thead>
        <tbody>{logs.map((log) => (
          <tr key={log.id}>
            <td><span className="device-cell"><i />{log.scale_id}</span></td>
            <td className="weight-cell">{log.weight_kg.toLocaleString("ar-EG")} كجم</td>
            <td><span className="category-pill">{log.category}</span></td>
            <td>{log.reason}</td>
            <td className="muted"><time dateTime={log.created_at}>{formatDate(log.created_at)}</time></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export function OverviewPage({ summary, logs, workspace, loading, colors }: {
  summary: AnalyticsSummary;
  logs: WasteLog[];
  workspace: WorkspaceData;
  loading: boolean;
  colors: Record<string, string>;
}) {
  const onlineDevices = workspace.devices.filter((device) => device.status === "active" && isRecentlyOnline(device.last_seen_at)).length;
  const activeBranches = workspace.branches.filter((branch) => branch.status === "active").length;
  const isOwner = workspace.role === "organization_owner";
  const exceededThresholds = workspace.thresholds.filter(
    (rule) => rule.is_active && rule.current_grams >= rule.limit_grams,
  );

  return (
    <>
      <section className="kpi-grid" aria-label="ملخص الأداء">
        <article className="kpi-card kpi-primary"><div className="kpi-icon">↘</div><div><span>إجمالي الهدر</span><strong>{summary.total_weight_kg.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} <small>كجم</small></strong><p>ضمن نطاق العرض الحالي</p></div></article>
        <article className="kpi-card"><div className="kpi-icon blue">≡</div><div><span>عمليات التسجيل</span><strong>{summary.total_count.toLocaleString("ar-EG")}</strong><p>عملية موثقة</p></div></article>
        <article className="kpi-card"><div className="kpi-icon violet">{isOwner ? "◇" : "▦"}</div><div><span>{isOwner ? "الفروع النشطة" : "الأصناف النشطة"}</span><strong>{(isOwner ? activeBranches : workspace.categories.filter((item) => item.is_active).length).toLocaleString("ar-EG")}</strong><p>{isOwner ? `من ${workspace.branches.length.toLocaleString("ar-EG")} فروع` : "متاحة للتسجيل"}</p></div></article>
        <article className="kpi-card"><div className="kpi-icon amber">◉</div><div><span>الأجهزة المتصلة</span><strong>{onlineDevices.toLocaleString("ar-EG")} <small>/ {workspace.devices.length.toLocaleString("ar-EG")}</small></strong><p>نشطة خلال آخر ١٠ دقائق</p></div></article>
      </section>

      {exceededThresholds.length > 0 ? (
        <aside className="notice-card danger-notice"><span>!</span><div><strong>تم تجاوز {exceededThresholds.length.toLocaleString("ar-EG")} من حدود الهدر</strong><p>راجع صفحة حدود التنبيه لمعرفة الفرع أو الصنف المتجاوز.</p></div></aside>
      ) : workspace.thresholds.length === 0 && (
        <aside className="notice-card"><span>⚑</span><div><strong>لا توجد حدود تنبيه مفعّلة</strong><p>أضف قواعد يومية أو أسبوعية لتتبّع التجاوزات مبكرًا.</p></div></aside>
      )}

      <section className="overview-grid">
        <article className="panel chart-panel">
          <div className="panel-heading"><div><span className="section-kicker">التحليل</span><h2>الهدر حسب الصنف</h2></div><span className="period-chip">كل البيانات</span></div>
          <Suspense fallback={<div className="chart-container chart-loading">جاري تحميل الرسم…</div>}>
            <WasteChart data={summary.categories} colors={colors} />
          </Suspense>
        </article>

        <article className="panel pulse-panel">
          <div className="panel-heading"><div><span className="section-kicker">حالة التشغيل</span><h2>ملخص سريع</h2></div><span className="live-indicator"><i /> مباشر</span></div>
          <div className="pulse-list">
            <div><span>الموازين المتصلة</span><strong>{onlineDevices.toLocaleString("ar-EG")}</strong></div>
            <div><span>قواعد التنبيه النشطة</span><strong>{workspace.thresholds.filter((rule) => rule.is_active).length.toLocaleString("ar-EG")}</strong></div>
            <div><span>الأصناف المتاحة</span><strong>{workspace.categories.filter((item) => item.is_active).length.toLocaleString("ar-EG")}</strong></div>
            <div><span>أسباب الهدر</span><strong>{workspace.reasons.filter((item) => item.is_active).length.toLocaleString("ar-EG")}</strong></div>
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="panel-heading"><div><span className="section-kicker">آخر النشاطات</span><h2>أحدث عمليات الهدر</h2></div></div>
        <WasteTable logs={logs.slice(0, 8)} loading={loading} />
      </section>
    </>
  );
}

export function BranchesPage({ workspace }: { workspace: WorkspaceData }) {
  if (workspace.branches.length === 0) return <section className="panel"><EmptyState title="لا توجد فروع" description="أنشئ أول فرع للمؤسسة لبدء ربط الأجهزة والقوائم." /></section>;
  return (
    <section className="panel">
      <div className="panel-heading"><div><span className="section-kicker">المؤسسة</span><h2>الفروع المسجلة</h2></div><span className="count-chip">{workspace.branches.length.toLocaleString("ar-EG")} فروع</span></div>
      <div className="table-wrapper"><table><thead><tr><th>الفرع</th><th>الحالة</th><th>المنطقة الزمنية</th><th>الأجهزة</th><th>الأصناف</th></tr></thead><tbody>
        {workspace.branches.map((branch) => <tr key={branch.id}><td><strong>{branch.name}</strong></td><td><StatusBadge active={branch.status === "active"} /></td><td className="muted">{branch.timezone}</td><td>{workspace.devices.filter((device) => device.branch_id === branch.id).length.toLocaleString("ar-EG")}</td><td>{workspace.categories.filter((item) => item.branch_id === branch.id).length.toLocaleString("ar-EG")}</td></tr>)}
      </tbody></table></div>
    </section>
  );
}

export function DevicesPage({ workspace, accessToken, onChanged }: {
  workspace: WorkspaceData;
  accessToken?: string;
  onChanged: () => Promise<void>;
}) {
  const availableBranches = workspace.branches.filter((branch) => branch.status === "active");
  const [branchId, setBranchId] = useState(workspace.assignedBranchId ?? availableBranches[0]?.id ?? "");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [pairing, setPairing] = useState<{ code: string; expiresAt: string } | null>(null);
  const branchNames = new Map(workspace.branches.map((branch) => [branch.id, branch.name]));

  async function addDevice(event: FormEvent) {
    event.preventDefault();
    if (!accessToken) return;
    setSaving(true);
    setError("");
    setPairing(null);
    try {
      const result = await createTenantDevice(accessToken, { branchId, name });
      setName("");
      setPairing({ code: result.pairing_code, expiresAt: result.expires_at });
      await onChanged();
    } catch (caught) {
      setError(getApiErrorMessage(caught, "تعذر إنشاء الجهاز"));
    } finally {
      setSaving(false);
    }
  }

  async function disable(deviceId: string) {
    if (!accessToken || !window.confirm("هل تريد تعطيل هذا الجهاز؟ سيتوقف عن إرسال البيانات فورًا.")) return;
    setSaving(true);
    setError("");
    try {
      await disableTenantDevice(accessToken, deviceId);
      await onChanged();
    } catch (caught) {
      setError(getApiErrorMessage(caught, "تعذر تعطيل الجهاز"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section className="panel onboarding-panel">
        <div className="panel-heading"><div><span className="section-kicker">تهيئة آمنة</span><h2>إضافة جهاز كيوسك</h2></div></div>
        {availableBranches.length > 0 ? <form className="device-form" onSubmit={(event) => void addDevice(event)}>
          <label>اسم الجهاز<input required minLength={2} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="مثال: كيوسك منطقة التحضير" /></label>
          {workspace.role === "organization_owner" && <label>الفرع<select required value={branchId} onChange={(event) => setBranchId(event.target.value)}>{availableBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>}
          <button className="primary-action" type="submit" disabled={saving || !name.trim() || !branchId || !accessToken}>{saving ? "جاري الإنشاء…" : "إنشاء رمز الاقتران"}</button>
        </form> : <EmptyState title="لا يوجد فرع نشط" description="يجب تفعيل فرع قبل إضافة جهاز إليه." />}
        {error && <p className="form-error" role="alert">{error}</p>}
        {pairing && <div className="pairing-banner" role="status"><div><span>رمز التفعيل لمرة واحدة</span><strong dir="ltr">{pairing.code}</strong></div><p>أدخل هذا الرمز في تطبيق الكيوسك خلال 15 دقيقة. لن يظهر الرمز مرة أخرى بعد مغادرة الصفحة.</p></div>}
      </section>

      {workspace.devices.length === 0
        ? <section className="panel"><EmptyState title="لا توجد أجهزة مسجلة" description="أنشئ جهازًا أعلاه ثم أدخل رمز التفعيل في الكيوسك." /></section>
        : <section className="card-grid">
          {workspace.devices.map((device) => {
            const online = device.status === "active" && isRecentlyOnline(device.last_seen_at);
            const inactiveText = device.status === "disabled" ? "معطّل" : device.status === "pending" ? "بانتظار التفعيل" : "غير متصل";
            return <article className="device-card" key={device.id}><div className="device-card-head"><div className="device-illustration">◉</div><StatusBadge active={online} activeText="متصل" inactiveText={inactiveText} /></div><h2>{device.name}</h2><code>{device.code}</code><dl><div><dt>الفرع</dt><dd>{branchNames.get(device.branch_id) ?? "—"}</dd></div><div><dt>آخر اتصال</dt><dd>{formatDate(device.last_seen_at)}</dd></div></dl>{device.status !== "disabled" && <button type="button" className="secondary-action device-disable" disabled={saving} onClick={() => void disable(device.id)}>تعطيل الجهاز</button>}</article>;
          })}
        </section>}
    </>
  );
}

export function CatalogPage({ workspace, onChanged }: { workspace: WorkspaceData; onChanged: () => Promise<void> }) {
  const availableBranches = workspace.branches.filter((branch) => branch.status === "active");
  const [branchId, setBranchId] = useState(workspace.assignedBranchId ?? availableBranches[0]?.id ?? "");
  const [name, setName] = useState("");
  const [color, setColor] = useState("#16865b");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [reasonBranchId, setReasonBranchId] = useState(workspace.assignedBranchId ?? availableBranches[0]?.id ?? "");
  const [reasonName, setReasonName] = useState("");
  const [reasonSaving, setReasonSaving] = useState(false);
  const [reasonError, setReasonError] = useState("");
  const [reasonSuccess, setReasonSuccess] = useState("");
  const branchNames = new Map(workspace.branches.map((branch) => [branch.id, branch.name]));

  async function add(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await createCategory(workspace, { branchId, name, color });
      setName("");
      setSuccess("تمت إضافة الصنف وسيظهر على جهاز الفرع.");
      await onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر إضافة الصنف");
    } finally {
      setSaving(false);
    }
  }

  async function toggleCategory(categoryId: string, active: boolean) {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await setCategoryActive(workspace, categoryId, active);
      setSuccess(active ? "تم تفعيل الصنف." : "تم إيقاف الصنف ولن يظهر على الكيوسك.");
      await onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحديث الصنف");
    } finally {
      setSaving(false);
    }
  }

  async function addReason(event: FormEvent) {
    event.preventDefault();
    setReasonSaving(true);
    setReasonError("");
    setReasonSuccess("");
    try {
      await createWasteReason(workspace, { branchId: reasonBranchId, name: reasonName });
      setReasonName("");
      setReasonSuccess("تمت إضافة سبب الهدر وسيظهر على جهاز الفرع.");
      await onChanged();
    } catch (caught) {
      setReasonError(caught instanceof Error ? caught.message : "تعذر إضافة سبب الهدر");
    } finally {
      setReasonSaving(false);
    }
  }

  async function toggleReason(reasonId: string, active: boolean) {
    setReasonSaving(true);
    setReasonError("");
    setReasonSuccess("");
    try {
      await setWasteReasonActive(workspace, reasonId, active);
      setReasonSuccess(active ? "تم تفعيل سبب الهدر." : "تم إيقاف السبب ولن يظهر على الكيوسك.");
      await onChanged();
    } catch (caught) {
      setReasonError(caught instanceof Error ? caught.message : "تعذر تحديث سبب الهدر");
    } finally {
      setReasonSaving(false);
    }
  }

  return <section className="catalog-grid">
    <article className="panel">
      <div className="panel-heading"><div><span className="section-kicker">يديرها مدير المطبخ</span><h2>أصناف الطعام</h2></div><span className="count-chip">{workspace.categories.length.toLocaleString("ar-EG")}</span></div>
      {availableBranches.length > 0 && <form className="catalog-form" onSubmit={(event) => void add(event)}>
        <label>اسم الصنف<input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required placeholder="مثال: منتجات الألبان" /></label>
        {workspace.role === "organization_owner" && <label>الفرع<select value={branchId} onChange={(event) => setBranchId(event.target.value)} required>{availableBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>}
        <label className="color-field">اللون<input type="color" value={color} onChange={(event) => setColor(event.target.value)} aria-label="لون الصنف" /></label>
        <button className="primary-action" type="submit" disabled={saving || !name.trim() || !branchId}>{saving ? "جاري الحفظ…" : "إضافة الصنف"}</button>
      </form>}
      {error && <p className="form-error">{error}</p>}
      {success && <p className="success-banner">{success}</p>}
      {workspace.categories.length === 0 ? <EmptyState title="لا توجد أصناف طعام" description="أضف أول صنف ليظهر في تطبيق الكيوسك." /> : <ul className="catalog-list">{workspace.categories.map((item) => <li key={item.id}><span className="catalog-name"><i style={{ backgroundColor: item.color ?? "#64748b" }} /><span>{item.name}<small>{branchNames.get(item.branch_id) ?? "—"}</small></span></span><div className="catalog-actions"><StatusBadge active={item.is_active} /><button type="button" className="secondary-action compact-action" disabled={saving} onClick={() => void toggleCategory(item.id, !item.is_active)}>{item.is_active ? "إيقاف" : "تفعيل"}</button></div></li>)}</ul>}
    </article>

    <article className="panel">
      <div className="panel-heading"><div><span className="section-kicker">يديرها مدير المطبخ</span><h2>أسباب الهدر</h2></div><span className="count-chip">{workspace.reasons.length.toLocaleString("ar-EG")}</span></div>
      {availableBranches.length > 0 && <form className="catalog-form reason-form" onSubmit={(event) => void addReason(event)}>
        <label>اسم السبب<input value={reasonName} onChange={(event) => setReasonName(event.target.value)} maxLength={100} required placeholder="مثال: إلغاء طلب" /></label>
        {workspace.role === "organization_owner" && <label>الفرع<select value={reasonBranchId} onChange={(event) => setReasonBranchId(event.target.value)} required>{availableBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>}
        <button className="primary-action" type="submit" disabled={reasonSaving || !reasonName.trim() || !reasonBranchId}>{reasonSaving ? "جاري الحفظ…" : "إضافة السبب"}</button>
      </form>}
      {reasonError && <p className="form-error">{reasonError}</p>}
      {reasonSuccess && <p className="success-banner">{reasonSuccess}</p>}
      {workspace.reasons.length === 0 ? <EmptyState title="لا توجد أسباب هدر" description="أضف أول سبب ليظهر في تطبيق الكيوسك." /> : <ul className="catalog-list">{workspace.reasons.map((item) => <li key={item.id}><span className="catalog-name"><span>{item.name}<small>{branchNames.get(item.branch_id) ?? "—"}</small></span></span><div className="catalog-actions"><StatusBadge active={item.is_active} /><button type="button" className="secondary-action compact-action" disabled={reasonSaving} onClick={() => void toggleReason(item.id, !item.is_active)}>{item.is_active ? "إيقاف" : "تفعيل"}</button></div></li>)}</ul>}
    </article>
  </section>;
}

function CategoryCostEditor({ category, workspace, disabled, onSaved }: {
  category: CatalogItem;
  workspace: WorkspaceData;
  disabled: boolean;
  onSaved: () => Promise<void>;
}) {
  const [value, setValue] = useState(category.cost_per_kg_dzd?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    try {
      await setCategoryCost(workspace, category.id, value === "" ? null : Number(value));
      await onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر حفظ التكلفة");
    } finally {
      setSaving(false);
    }
  }

  return <div className="cost-editor">
    <label><span>دج / كجم</span><input type="number" min="0" max="1000000000" step="0.01" value={value} onChange={(event) => setValue(event.target.value)} placeholder="غير محدد" /></label>
    <button type="button" className="secondary-action compact-action" disabled={disabled || saving || value === (category.cost_per_kg_dzd?.toString() ?? "")} onClick={() => void save()}>{saving ? "…" : "حفظ"}</button>
    {error && <small className="field-error">{error}</small>}
  </div>;
}

export function OperationsPage({ workspace, onChanged }: { workspace: WorkspaceData; onChanged: () => Promise<void> }) {
  const availableBranches = workspace.branches.filter((branch) => branch.status === "active");
  const today = localDateValue();
  const [branchId, setBranchId] = useState(workspace.assignedBranchId ?? availableBranches[0]?.id ?? "");
  const [serviceDate, setServiceDate] = useState(today);
  const existing = workspace.serviceMetrics.find((item) => item.branch_id === branchId && item.service_date === serviceDate);
  const [mealCount, setMealCount] = useState(existing?.meal_count.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const branchNames = new Map(workspace.branches.map((branch) => [branch.id, branch.name]));
  const visibleCategories = workspace.categories.filter((category) => !branchId || category.branch_id === branchId);
  const recentMetrics = workspace.serviceMetrics
    .filter((metric) => !branchId || metric.branch_id === branchId)
    .slice(0, 14);

  function selectMetric(nextBranchId: string, nextDate: string) {
    const metric = workspace.serviceMetrics.find((item) => item.branch_id === nextBranchId && item.service_date === nextDate);
    setBranchId(nextBranchId);
    setServiceDate(nextDate);
    setMealCount(metric?.meal_count.toString() ?? "");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await saveDailyMealCount(workspace, { branchId, serviceDate, mealCount: Number(mealCount) });
      setSuccess("تم حفظ عدد الوجبات وسيظهر في مؤشرات الهدر لكل وجبة.");
      await onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر حفظ عدد الوجبات");
    } finally {
      setSaving(false);
    }
  }

  return <>
    <section className="operations-grid">
      <article className="panel">
        <div className="panel-heading"><div><span className="section-kicker">التشغيل اليومي</span><h2>عدد الوجبات</h2></div></div>
        <p className="panel-intro">أدخل عدد الوجبات أو الضيوف يومياً لحساب الهدر والتكلفة لكل وجبة.</p>
        {availableBranches.length > 0 ? <form className="meal-form" onSubmit={(event) => void submit(event)}>
          {workspace.role === "organization_owner" && <label>الفرع<select required value={branchId} onChange={(event) => selectMetric(event.target.value, serviceDate)}>{availableBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>}
          <label>التاريخ<input required type="date" max={today} value={serviceDate} onChange={(event) => selectMetric(branchId, event.target.value)} /></label>
          <label>عدد الوجبات<input required type="number" min="0" max="10000000" step="1" value={mealCount} onChange={(event) => setMealCount(event.target.value)} placeholder="مثال: 250" /></label>
          <button className="primary-action" type="submit" disabled={saving || !branchId || mealCount === ""}>{saving ? "جاري الحفظ…" : existing ? "تحديث العدد" : "حفظ العدد"}</button>
        </form> : <EmptyState title="لا يوجد فرع نشط" description="يجب تفعيل فرع قبل تسجيل عدد الوجبات." />}
        {error && <p className="form-error" role="alert">{error}</p>}
        {success && <p className="success-banner" role="status">{success}</p>}
        {recentMetrics.length > 0 && <div className="table-wrapper compact-table"><table><thead><tr><th>التاريخ</th><th>الفرع</th><th>الوجبات</th></tr></thead><tbody>{recentMetrics.map((metric) => <tr key={metric.id}><td>{metric.service_date}</td><td>{branchNames.get(metric.branch_id) ?? "—"}</td><td>{metric.meal_count.toLocaleString("ar-EG")}</td></tr>)}</tbody></table></div>}
      </article>

      <article className="panel">
        <div className="panel-heading"><div><span className="section-kicker">القيمة المالية</span><h2>تكلفة الأصناف</h2></div><span className="count-chip">دج / كجم</span></div>
        <p className="panel-intro">تكلفة تقريبية للكيلوغرام. اتركها فارغة إذا لم تكن متوفرة.</p>
        {workspace.role === "organization_owner" && <label className="inline-filter">الفرع<select value={branchId} onChange={(event) => selectMetric(event.target.value, serviceDate)}>{availableBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>}
        {visibleCategories.length === 0 ? <EmptyState title="لا توجد أصناف" description="أضف الأصناف أولاً ثم حدد تكلفتها." /> : <ul className="cost-list">{visibleCategories.map((category) => <li key={category.id}><div className="cost-category"><i style={{ backgroundColor: category.color ?? "#64748b" }} /><div><strong>{category.name}</strong><small>{branchNames.get(category.branch_id) ?? "—"}</small></div></div><CategoryCostEditor category={category} workspace={workspace} disabled={saving} onSaved={onChanged} /></li>)}</ul>}
      </article>
    </section>
  </>;
}

function AnalyticsRanking({ title, items, valueLabel }: {
  title: string;
  items: Array<{ id: string; name: string; weight_kg: number; percentage: number }>;
  valueLabel?: (item: { weight_kg: number; percentage: number }) => string;
}) {
  return <article className="panel ranking-panel"><div className="panel-heading"><div><span className="section-kicker">الترتيب</span><h2>{title}</h2></div></div>{items.length === 0 ? <EmptyState title="لا توجد بيانات" description="غيّر الفترة أو الفلاتر لعرض النتائج." /> : <ol className="analytics-ranking">{items.slice(0, 8).map((item) => <li key={item.id}><div className="ranking-label"><strong>{item.name}</strong><span>{valueLabel ? valueLabel(item) : `${item.weight_kg.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} كجم`}</span></div><div className="ranking-track"><i style={{ width: `${Math.max(item.percentage, 2)}%` }} /></div><small>{item.percentage.toLocaleString("ar-EG", { maximumFractionDigits: 1 })}٪ من الهدر</small></li>)}</ol>}</article>;
}

export function AnalyticsPage({ workspace }: { workspace: WorkspaceData }) {
  const today = localDateValue();
  const start = new Date();
  start.setDate(start.getDate() - 29);
  const initialBranch = workspace.assignedBranchId;
  const [filters, setFilters] = useState<AnalyticsFilters>({ fromDate: localDateValue(start), toDate: today, branchId: initialBranch, categoryId: null, reasonId: null });
  const [analytics, setAnalytics] = useState<OperationalAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const categories = workspace.categories.filter((item) => !filters.branchId || item.branch_id === filters.branchId);
  const reasons = workspace.reasons.filter((item) => !filters.branchId || item.branch_id === filters.branchId);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setAnalytics(await getOperationalAnalytics(filters));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحميل التحليلات");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    // Filtered analytics are remote state synchronized by this effect.
    // oxlint-disable-next-line react/set-state-in-effect
    void load();
  }, [load]);

  function changeBranch(branchId: string) {
    setFilters((current) => ({ ...current, branchId: branchId || null, categoryId: null, reasonId: null }));
  }

  const dailyAverage = analytics ? analytics.total_weight_kg / Math.max(analytics.period_days, 1) : 0;
  const weeklyAverage = dailyAverage * 7;

  return <>
    <section className="panel analytics-filters">
      <div className="panel-heading"><div><span className="section-kicker">نطاق التحليل</span><h2>الفلاتر</h2></div><button type="button" className="secondary-action" disabled={loading} onClick={() => void load()}>تحديث</button></div>
      <div className="filter-grid">
        <label>من<input type="date" max={filters.toDate} value={filters.fromDate} onChange={(event) => setFilters({ ...filters, fromDate: event.target.value })} /></label>
        <label>إلى<input type="date" min={filters.fromDate} max={today} value={filters.toDate} onChange={(event) => setFilters({ ...filters, toDate: event.target.value })} /></label>
        {workspace.role === "organization_owner" && <label>الفرع<select value={filters.branchId ?? ""} onChange={(event) => changeBranch(event.target.value)}><option value="">كل الفروع</option>{workspace.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>}
        <label>الصنف<select value={filters.categoryId ?? ""} onChange={(event) => setFilters({ ...filters, categoryId: event.target.value || null })}><option value="">كل الأصناف</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <label>السبب<select value={filters.reasonId ?? ""} onChange={(event) => setFilters({ ...filters, reasonId: event.target.value || null })}><option value="">كل الأسباب</option>{reasons.map((reason) => <option key={reason.id} value={reason.id}>{reason.name}</option>)}</select></label>
      </div>
    </section>
    {error && <div className="error-banner" role="alert"><span>!</span><p>{error}</p><button type="button" onClick={() => void load()}>إعادة المحاولة</button></div>}
    {loading || !analytics ? <div className="workspace-loader"><span /><p>جاري حساب المؤشرات…</p></div> : <>
      <section className="kpi-grid analytics-kpis">
        <article className="kpi-card kpi-primary"><div className="kpi-icon">↘</div><div><span>إجمالي الهدر</span><strong>{analytics.total_weight_kg.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} <small>كجم</small></strong><p>{analytics.total_count.toLocaleString("ar-EG")} عملية تسجيل</p></div></article>
        <article className="kpi-card"><div className="kpi-icon amber">دج</div><div><span>تكلفة الهدر</span><strong>{analytics.total_cost_dzd.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} <small>دج</small></strong><p>تغطية أسعار {analytics.cost_coverage_percent.toLocaleString("ar-EG")}٪</p></div></article>
        <article className="kpi-card"><div className="kpi-icon violet">◌</div><div><span>الهدر لكل وجبة</span><strong>{analytics.waste_grams_per_meal.toLocaleString("ar-EG", { maximumFractionDigits: 1 })} <small>غ</small></strong><p>{analytics.meal_count.toLocaleString("ar-EG")} وجبة مسجلة</p></div></article>
        <article className="kpi-card"><div className="kpi-icon blue">✓</div><div><span>جودة بيانات الوجبات</span><strong>{Math.min(analytics.registration_quality_percent, 100).toLocaleString("ar-EG", { maximumFractionDigits: 1 })} <small>٪</small></strong><p>{analytics.meal_days_recorded.toLocaleString("ar-EG")} من {analytics.period_days.toLocaleString("ar-EG")} أيام</p></div></article>
      </section>
      <section className="analytics-secondary-kpis"><article><span>المتوسط اليومي</span><strong>{dailyAverage.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} كجم</strong></article><article><span>المتوسط الأسبوعي</span><strong>{weeklyAverage.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} كجم</strong></article><article><span>التكلفة لكل وجبة</span><strong>{analytics.cost_dzd_per_meal.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} دج</strong></article></section>
      <section className="analytics-rankings"><AnalyticsRanking title="الأصناف الأكثر هدراً" items={analytics.categories} valueLabel={(item) => `${item.weight_kg.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} كجم`} /><AnalyticsRanking title="أسباب الهدر الأكثر تأثيراً" items={analytics.reasons} /></section>
      <section className="panel"><div className="panel-heading"><div><span className="section-kicker">التطور اليومي</span><h2>الهدر والتكلفة حسب اليوم</h2></div></div>{analytics.daily.length === 0 ? <EmptyState title="لا توجد بيانات" description="ستظهر القيم اليومية بعد تسجيل الهدر." /> : <div className="table-wrapper"><table><thead><tr><th>التاريخ</th><th>الوزن</th><th>التكلفة المقدرة</th></tr></thead><tbody>{analytics.daily.map((day) => <tr key={day.date}><td>{day.date}</td><td className="weight-cell">{day.weight_kg.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} كجم</td><td>{day.cost_dzd.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} دج</td></tr>)}</tbody></table></div>}</section>
    </>}
  </>;
}

export function ThresholdsPage({ workspace, onChanged }: { workspace: WorkspaceData; onChanged: () => Promise<void> }) {
  const availableBranches = workspace.branches.filter((branch) => branch.status === "active");
  const [branchId, setBranchId] = useState(workspace.assignedBranchId ?? availableBranches[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState("");
  const [period, setPeriod] = useState<"day" | "week" | "month">("day");
  const [limitKg, setLimitKg] = useState("");
  const [cooldownMinutes, setCooldownMinutes] = useState(60);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const branchNames = new Map(workspace.branches.map((branch) => [branch.id, branch.name]));
  const categoryNames = new Map(workspace.categories.map((category) => [category.id, category.name]));

  const availableCategories = workspace.categories.filter(
    (category) => category.branch_id === branchId && category.is_active,
  );

  function resetForm() {
    setEditingRuleId(null);
    setCategoryId("");
    setPeriod("day");
    setLimitKg("");
    setCooldownMinutes(60);
  }

  function editRule(ruleId: string) {
    const rule = workspace.thresholds.find((item) => item.id === ruleId);
    if (!rule) return;
    setEditingRuleId(rule.id);
    setBranchId(rule.branch_id);
    setCategoryId(rule.category_id ?? "");
    setPeriod(rule.period);
    setLimitKg(String(rule.limit_grams / 1_000));
    setCooldownMinutes(rule.cooldown_minutes);
    setError("");
    setSuccess("");
  }

  async function saveRule(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    const input = {
      branchId,
      categoryId: categoryId || null,
      period,
      limitKg: Number(limitKg),
      cooldownMinutes,
    };
    try {
      if (editingRuleId) {
        await updateThresholdRule(workspace, editingRuleId, input);
        setSuccess("تم تحديث حد التنبيه.");
      } else {
        await createThresholdRule(workspace, input);
        setSuccess("تمت إضافة حد التنبيه.");
      }
      resetForm();
      await onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر حفظ حد التنبيه");
    } finally {
      setSaving(false);
    }
  }

  async function toggleRule(ruleId: string, active: boolean) {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await setThresholdRuleActive(workspace, ruleId, active);
      setSuccess(active ? "تم تفعيل حد التنبيه." : "تم إيقاف حد التنبيه.");
      await onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحديث حد التنبيه");
    } finally {
      setSaving(false);
    }
  }

  return <>
    <section className="panel onboarding-panel">
      <div className="panel-heading"><div><span className="section-kicker">المراقبة</span><h2>{editingRuleId ? "تعديل حد التنبيه" : "إضافة حد تنبيه"}</h2></div>{editingRuleId && <button type="button" className="secondary-action" onClick={resetForm}>إلغاء التعديل</button>}</div>
      {availableBranches.length > 0 ? <form className="threshold-form" onSubmit={(event) => void saveRule(event)}>
        {workspace.role === "organization_owner" && <label>الفرع<select required disabled={Boolean(editingRuleId)} value={branchId} onChange={(event) => { setBranchId(event.target.value); setCategoryId(""); }}>{availableBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>}
        <label>النطاق<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">إجمالي الفرع</option>{availableCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <label>الفترة<select value={period} onChange={(event) => setPeriod(event.target.value as typeof period)}>{Object.entries(periodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>الحد (كجم)<input type="number" min="0.001" max="1000000" step="0.001" required value={limitKg} onChange={(event) => setLimitKg(event.target.value)} placeholder="مثال: 10" /></label>
        <button className="primary-action" type="submit" disabled={saving || !branchId || !limitKg}>{saving ? "جاري الحفظ…" : editingRuleId ? "حفظ التعديل" : "إضافة الحد"}</button>
      </form> : <EmptyState title="لا يوجد فرع نشط" description="يجب تفعيل فرع قبل إضافة حدود التنبيه." />}
      {error && <p className="form-error" role="alert">{error}</p>}
      {success && <p className="success-banner" role="status">{success}</p>}
    </section>

    <section className="panel">
      <div className="panel-heading"><div><span className="section-kicker">الحالة الحالية</span><h2>قواعد التنبيه</h2></div><span className="count-chip">{workspace.thresholds.length.toLocaleString("ar-EG")} قواعد</span></div>
      {workspace.thresholds.length === 0 ? <EmptyState title="لا توجد حدود تنبيه" description="أضف أول قاعدة لمراقبة الهدر." /> : <div className="table-wrapper"><table><thead><tr><th>النطاق</th><th>الفترة</th><th>الاستهلاك / الحد</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody>{workspace.thresholds.map((rule) => {
        const exceeded = rule.is_active && rule.current_grams >= rule.limit_grams;
        const progress = Math.min(100, (rule.current_grams / rule.limit_grams) * 100);
        return <tr key={rule.id} className={exceeded ? "threshold-exceeded" : undefined}><td><strong>{categoryNames.get(rule.category_id ?? "") ?? "إجمالي الفرع"}</strong><small className="table-subtitle">{branchNames.get(rule.branch_id) ?? "—"}</small></td><td>{periodLabels[rule.period]}</td><td><div className={`threshold-usage ${exceeded ? "is-exceeded" : ""}`}><strong>{(rule.current_grams / 1_000).toLocaleString("ar-EG", { maximumFractionDigits: 3 })} / {(rule.limit_grams / 1_000).toLocaleString("ar-EG", { maximumFractionDigits: 3 })} كجم</strong><span><i style={{ width: `${progress}%` }} /></span></div></td><td>{rule.is_active ? <StatusBadge active={!exceeded} activeText="ضمن الحد" inactiveText="تم التجاوز" /> : <StatusBadge active={false} inactiveText="متوقف" />}</td><td><div className="row-actions"><button type="button" className="secondary-action compact-action" disabled={saving} onClick={() => editRule(rule.id)}>تعديل</button><button type="button" className="secondary-action compact-action" disabled={saving} onClick={() => void toggleRule(rule.id, !rule.is_active)}>{rule.is_active ? "إيقاف" : "تفعيل"}</button></div></td></tr>;
      })}</tbody></table></div>}
    </section>
  </>;
}

function PlatformOrganizationsTable({ organizations, compact = false }: { organizations: PlatformOrganization[]; compact?: boolean }) {
  if (organizations.length === 0) return <EmptyState title="لا توجد مؤسسات" description="ستظهر المؤسسات الجديدة هنا بعد تهيئة أول عميل." />;
  return <div className="table-wrapper"><table><thead><tr><th>المؤسسة</th><th>الاشتراك</th><th>الفروع</th><th>الأجهزة</th>{!compact && <th>المستخدمون</th>}<th>حجم الهدر</th><th>الحالة</th></tr></thead><tbody>{organizations.map((organization) => <tr key={organization.id}><td><strong>{organization.name}</strong><small className="table-subtitle">{organization.slug}</small></td><td><span className={`plan-badge plan-${organization.subscription_plan}`}>{planLabels[organization.subscription_plan]}</span><small className="table-subtitle">{subscriptionLabels[organization.subscription_status]}</small></td><td>{organization.branch_count.toLocaleString("ar-EG")}</td><td>{organization.device_count.toLocaleString("ar-EG")}</td>{!compact && <td>{organization.member_count.toLocaleString("ar-EG")}</td>}<td className="weight-cell">{(organization.waste_weight_grams / 1_000).toLocaleString("ar-EG")} كجم</td><td><StatusBadge active={organization.status === "active" || organization.status === "trial"} activeText={organization.status === "trial" ? "تجريبي" : "نشط"} inactiveText={organization.status === "suspended" ? "موقوف" : "مغلق"} /></td></tr>)}</tbody></table></div>;
}

function ManagedOrganizationRow({ organization, accessToken, onChanged, onSelect }: {
  organization: PlatformOrganization;
  accessToken: string;
  onChanged: () => Promise<void>;
  onSelect: () => void;
}) {
  const [status, setStatus] = useState(organization.status);
  const [plan, setPlan] = useState(organization.subscription_plan);
  const [subscriptionStatus, setSubscriptionStatus] = useState(organization.subscription_status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const changed = status !== organization.status
    || plan !== organization.subscription_plan
    || subscriptionStatus !== organization.subscription_status;

  async function save() {
    if (!changed) return;
    setSaving(true);
    setError("");
    try {
      const operations: Promise<void>[] = [];
      if (status !== organization.status) {
        operations.push(updateOrganizationStatus(accessToken, organization.id, status));
      }
      if (plan !== organization.subscription_plan || subscriptionStatus !== organization.subscription_status) {
        operations.push(updateSubscription(accessToken, organization.id, {
          subscription_plan: plan,
          subscription_status: subscriptionStatus,
        }));
      }
      await Promise.all(operations);
      await onChanged();
    } catch (caught) {
      setError(getApiErrorMessage(caught, "تعذر حفظ التغييرات"));
    } finally {
      setSaving(false);
    }
  }

  return <>
    <tr>
      <td><strong>{organization.name}</strong><small className="table-subtitle">{organization.slug}</small><small className="table-subtitle">{organization.contact_email ?? "—"}</small></td>
      <td><select value={plan} onChange={(event) => setPlan(event.target.value as typeof plan)} aria-label={`خطة ${organization.name}`}>{Object.entries(planLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
      <td><select value={subscriptionStatus} onChange={(event) => setSubscriptionStatus(event.target.value as typeof subscriptionStatus)} aria-label={`حالة اشتراك ${organization.name}`}>{Object.entries(subscriptionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
      <td>{organization.branch_count.toLocaleString("ar-EG")} <small className="limit-note">/ {organization.branch_limit.toLocaleString("ar-EG")}</small></td>
      <td>{organization.device_count.toLocaleString("ar-EG")} <small className="limit-note">/ {organization.device_limit.toLocaleString("ar-EG")}</small></td>
      <td>{organization.member_count.toLocaleString("ar-EG")}</td>
      <td><select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} aria-label={`حالة ${organization.name}`}>{Object.entries(organizationStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
      <td><div className="row-actions"><button type="button" className="secondary-action compact-action" onClick={onSelect}>إدارة</button><button type="button" className="save-row-button" disabled={!changed || saving} onClick={() => void save()}>{saving ? "جارٍ الحفظ…" : "حفظ"}</button></div></td>
    </tr>
    {error && <tr className="row-error"><td colSpan={8}>{error}</td></tr>}
  </>;
}

export function PlatformOverviewPage({ overview }: { overview: PlatformOverview }) {
  const { metrics } = overview;
  return <>
    <section className="kpi-grid" aria-label="ملخص المنصة">
      <article className="kpi-card kpi-primary"><div className="kpi-icon">◇</div><div><span>المؤسسات</span><strong>{metrics.organization_count.toLocaleString("ar-EG")}</strong><p>{metrics.active_subscription_count.toLocaleString("ar-EG")} اشتراكات نشطة</p></div></article>
      <article className="kpi-card"><div className="kpi-icon blue">⌂</div><div><span>إجمالي الفروع</span><strong>{metrics.branch_count.toLocaleString("ar-EG")}</strong><p>عبر جميع العملاء</p></div></article>
      <article className="kpi-card"><div className="kpi-icon violet">◉</div><div><span>الأجهزة المسجلة</span><strong>{metrics.device_count.toLocaleString("ar-EG")}</strong><p>{metrics.active_member_count.toLocaleString("ar-EG")} مستخدمين نشطين</p></div></article>
      <article className="kpi-card"><div className="kpi-icon amber">⚑</div><div><span>اشتراكات تحتاج متابعة</span><strong>{metrics.past_due_subscription_count.toLocaleString("ar-EG")}</strong><p>{metrics.trial_subscription_count.toLocaleString("ar-EG")} في الفترة التجريبية</p></div></article>
    </section>
    {metrics.past_due_subscription_count > 0 && <aside className="notice-card danger-notice"><span>!</span><div><strong>اشتراكات متأخرة</strong><p>توجد حسابات تحتاج متابعة حالة الدفع.</p></div></aside>}
    <section className="overview-grid platform-overview-grid">
      <article className="panel"><div className="panel-heading"><div><span className="section-kicker">نمو المنصة</span><h2>أحدث المؤسسات</h2></div><span className="count-chip">{overview.organizations.length.toLocaleString("ar-EG")}</span></div><PlatformOrganizationsTable organizations={overview.organizations.slice(0, 8)} compact /></article>
      <article className="panel pulse-panel"><div className="panel-heading"><div><span className="section-kicker">الاستخدام</span><h2>ملخص البيانات</h2></div></div><div className="pulse-list"><div><span>عمليات الهدر</span><strong>{metrics.waste_event_count.toLocaleString("ar-EG")}</strong></div><div><span>إجمالي وزن الهدر</span><strong>{(metrics.waste_weight_grams / 1_000).toLocaleString("ar-EG")} كجم</strong></div><div><span>الاشتراكات النشطة</span><strong>{metrics.active_subscription_count.toLocaleString("ar-EG")}</strong></div><div><span>الفترات التجريبية</span><strong>{metrics.trial_subscription_count.toLocaleString("ar-EG")}</strong></div></div></article>
    </section>
  </>;
}

const initialOrganizationForm: CreatePlatformOrganizationInput = {
  name: "",
  slug: "",
  ownerEmail: "",
  branchName: "الفرع الرئيسي",
  timezone: "Europe/Istanbul",
  plan: "trial",
};

const memberRoleLabels = {
  organization_owner: "مالك المؤسسة",
  branch_manager: "مدير فرع",
  worker: "موظف مطبخ",
} as const;

function OrganizationDetailsPanel({ organizationId, accessToken, onBack, onPlatformChanged }: {
  organizationId: string;
  accessToken: string;
  onBack: () => void;
  onPlatformChanged: () => Promise<void>;
}) {
  const [details, setDetails] = useState<PlatformOrganizationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showBranchForm, setShowBranchForm] = useState(false);
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [branchForm, setBranchForm] = useState({ name: "", timezone: "Europe/Istanbul" });
  const [memberForm, setMemberForm] = useState<{ email: string; role: PlatformMember["role"]; branchId: string | null }>({ email: "", role: "organization_owner", branchId: null });

  useEffect(() => {
    let active = true;
    void getPlatformOrganization(accessToken, organizationId)
      .then((result) => { if (active) { setDetails(result); setError(""); } })
      .catch((caught) => { if (active) setError(getApiErrorMessage(caught, "تعذر تحميل تفاصيل المؤسسة")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [accessToken, organizationId, refreshVersion]);

  async function refreshDetails() {
    setRefreshVersion((value) => value + 1);
    await onPlatformChanged();
  }

  async function submitBranch(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await createPlatformBranch(accessToken, organizationId, branchForm);
      setBranchForm({ name: "", timezone: branchForm.timezone });
      setShowBranchForm(false);
      await refreshDetails();
    } catch (caught) {
      setError(getApiErrorMessage(caught, "تعذر إنشاء الفرع"));
    } finally {
      setSubmitting(false);
    }
  }

  async function submitMember(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await invitePlatformMember(accessToken, organizationId, memberForm);
      setMemberForm({ email: "", role: "organization_owner", branchId: null });
      setShowMemberForm(false);
      await refreshDetails();
    } catch (caught) {
      setError(getApiErrorMessage(caught, "تعذر دعوة المستخدم"));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <section className="panel"><div className="workspace-loader"><span /><p>جاري تحميل تفاصيل المؤسسة…</p></div></section>;
  if (!details) return <section className="panel"><div className="panel-heading"><h2>تعذر فتح المؤسسة</h2><button type="button" className="secondary-action" onClick={onBack}>عودة</button></div>{error && <div className="error-banner">{error}</div>}</section>;

  const branchNames = new Map(details.branches.map((branch) => [branch.id, branch.name]));
  const branchLimitReached = details.branches.length >= details.organization.branch_limit;

  return <>
    <section className="details-hero panel">
      <div><button type="button" className="back-link" onClick={onBack}>← العودة إلى المؤسسات</button><span className="section-kicker">ملف المؤسسة</span><h2>{details.organization.name}</h2><p>{details.organization.contact_email ?? "لم يُحدد بريد تواصل"} · {details.organization.slug}</p></div>
      <div className="details-badges"><span className={`plan-badge plan-${details.organization.subscription_plan}`}>{planLabels[details.organization.subscription_plan]}</span><StatusBadge active={details.organization.status === "active" || details.organization.status === "trial"} activeText={organizationStatusLabels[details.organization.status]} inactiveText={organizationStatusLabels[details.organization.status]} /></div>
    </section>
    {error && <div className="error-banner" role="alert"><span>!</span><p>{error}</p></div>}
    <section className="detail-kpis">
      <article><span>الفروع</span><strong>{details.branches.length.toLocaleString("ar-EG")} / {details.organization.branch_limit.toLocaleString("ar-EG")}</strong></article>
      <article><span>المستخدمون</span><strong>{details.members.length.toLocaleString("ar-EG")}</strong></article>
      <article><span>الأجهزة</span><strong>{details.organization.device_count.toLocaleString("ar-EG")} / {details.organization.device_limit.toLocaleString("ar-EG")}</strong></article>
      <article><span>حالة الاشتراك</span><strong>{subscriptionLabels[details.organization.subscription_status]}</strong></article>
    </section>
    <section className="details-grid">
      <article className="panel">
        <div className="panel-heading"><div><span className="section-kicker">التشغيل</span><h2>الفروع</h2></div><button type="button" className="primary-action" disabled={branchLimitReached} onClick={() => setShowBranchForm((value) => !value)}>+ إضافة فرع</button></div>
        {branchLimitReached && <p className="inline-note">تم بلوغ حد الفروع في الخطة الحالية.</p>}
        {showBranchForm && <form className="compact-form" onSubmit={(event) => void submitBranch(event)}><label>اسم الفرع<input required minLength={2} value={branchForm.name} onChange={(event) => setBranchForm({ ...branchForm, name: event.target.value })} /></label><label>المنطقة الزمنية<select value={branchForm.timezone} onChange={(event) => setBranchForm({ ...branchForm, timezone: event.target.value })}><option value="Europe/Istanbul">إسطنبول</option><option value="Asia/Riyadh">الرياض</option><option value="Asia/Dubai">دبي</option><option value="Africa/Cairo">القاهرة</option><option value="UTC">UTC</option></select></label><button type="submit" className="save-row-button" disabled={submitting}>{submitting ? "جارٍ الإضافة…" : "إضافة"}</button></form>}
        {details.branches.length === 0 ? <EmptyState title="لا توجد فروع" description="أضف أول فرع تشغيلي." /> : <ul className="detail-list">{details.branches.map((branch) => <li key={branch.id}><div><strong>{branch.name}</strong><small>{branch.timezone}</small></div><StatusBadge active={branch.status === "active"} /></li>)}</ul>}
      </article>
      <article className="panel">
        <div className="panel-heading"><div><span className="section-kicker">الوصول</span><h2>المستخدمون</h2></div><button type="button" className="primary-action" onClick={() => setShowMemberForm((value) => !value)}>+ دعوة مستخدم</button></div>
        {showMemberForm && <form className="compact-form member-form" onSubmit={(event) => void submitMember(event)}><label>البريد الإلكتروني<input required type="email" dir="ltr" value={memberForm.email} onChange={(event) => setMemberForm({ ...memberForm, email: event.target.value })} /></label><label>الدور<select value={memberForm.role} onChange={(event) => { const role = event.target.value as PlatformMember["role"]; setMemberForm({ ...memberForm, role, branchId: role === "organization_owner" ? null : details.branches[0]?.id ?? null }); }}>{Object.entries(memberRoleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{memberForm.role !== "organization_owner" && <label>الفرع<select required value={memberForm.branchId ?? ""} onChange={(event) => setMemberForm({ ...memberForm, branchId: event.target.value || null })}><option value="">اختر فرعًا</option>{details.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>}<button type="submit" className="save-row-button" disabled={submitting}>{submitting ? "جارٍ الإرسال…" : "إرسال الدعوة"}</button><small className="smtp-note">يتطلب إرسال الدعوات إلى عناوين خارج فريق المشروع إعداد SMTP مخصصًا.</small></form>}
        {details.members.length === 0 ? <EmptyState title="لا يوجد مستخدمون" description="ادعُ مالك المؤسسة أو مدير الفرع للبدء." /> : <ul className="detail-list">{details.members.map((member) => <li key={member.id}><div><strong>{member.email ?? member.user_id}</strong><small>{memberRoleLabels[member.role]}{member.branch_id ? ` · ${branchNames.get(member.branch_id) ?? "فرع غير معروف"}` : ""}</small></div><StatusBadge active={member.email_confirmed} activeText="مفعّل" inactiveText="بانتظار القبول" /></li>)}</ul>}
      </article>
    </section>
  </>;
}

export function PlatformOrganizationsPage({ overview, accessToken, onChanged }: {
  overview: PlatformOverview;
  accessToken: string;
  onChanged: () => Promise<void>;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [form, setForm] = useState(initialOrganizationForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(null);

  const organizations = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return overview.organizations.filter((organization) => {
      const matchesQuery = !normalizedQuery
        || organization.name.toLowerCase().includes(normalizedQuery)
        || organization.slug.toLowerCase().includes(normalizedQuery)
        || organization.contact_email?.toLowerCase().includes(normalizedQuery);
      const matchesStatus = statusFilter === "all" || organization.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [overview.organizations, query, statusFilter]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFormError("");
    setSuccess("");
    try {
      const result = await createPlatformOrganization(accessToken, form);
      setForm(initialOrganizationForm);
      setShowCreate(false);
      setSuccess(result.owner_invited ? "تم إنشاء المؤسسة وإرسال دعوة إلى مالكها." : "تم إنشاء المؤسسة ويمكن إضافة مالكها لاحقًا.");
      await onChanged();
    } catch (caught) {
      setFormError(getApiErrorMessage(caught, "تعذر إنشاء المؤسسة"));
    } finally {
      setSubmitting(false);
    }
  }

  if (selectedOrganizationId) {
    return <OrganizationDetailsPanel organizationId={selectedOrganizationId} accessToken={accessToken} onBack={() => setSelectedOrganizationId(null)} onPlatformChanged={onChanged} />;
  }

  return <>
    {showCreate && <section className="panel onboarding-panel">
      <div className="panel-heading"><div><span className="section-kicker">تهيئة عميل جديد</span><h2>إضافة مؤسسة</h2></div><button type="button" className="secondary-action" onClick={() => setShowCreate(false)}>إلغاء</button></div>
      <form className="organization-form" onSubmit={(event) => void submit(event)}>
        <label>اسم المؤسسة<input required minLength={2} maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="مثال: مطاعم النور" /></label>
        <label>المعرّف المختصر<input required dir="ltr" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value.toLowerCase().trim() })} placeholder="al-noor" /><small>أحرف إنجليزية صغيرة وأرقام وشرطات فقط</small></label>
        <label>بريد مالك المؤسسة (اختياري)<input type="email" dir="ltr" value={form.ownerEmail ?? ""} onChange={(event) => setForm({ ...form, ownerEmail: event.target.value })} placeholder="owner@restaurant.com" /><small>تُرسل دعوة فور الإنشاء إذا كان البريد متاحًا للإرسال</small></label>
        <label>اسم الفرع الأول<input required minLength={2} value={form.branchName} onChange={(event) => setForm({ ...form, branchName: event.target.value })} /></label>
        <label>المنطقة الزمنية<select value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })}><option value="Europe/Istanbul">إسطنبول</option><option value="Asia/Riyadh">الرياض</option><option value="Asia/Dubai">دبي</option><option value="Africa/Cairo">القاهرة</option><option value="UTC">UTC</option></select></label>
        <label>الخطة<select value={form.plan} onChange={(event) => setForm({ ...form, plan: event.target.value as CreatePlatformOrganizationInput["plan"] })}>{Object.entries(planLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {formError && <p className="form-error" role="alert">{formError}</p>}
        <div className="form-actions"><button type="button" className="secondary-action" onClick={() => setShowCreate(false)}>إلغاء</button><button type="submit" className="primary-action" disabled={submitting}>{submitting ? "جارٍ الإنشاء…" : form.ownerEmail ? "إنشاء وإرسال الدعوة" : "إنشاء المؤسسة"}</button></div>
      </form>
    </section>}

    <section className="panel">
      <div className="panel-heading platform-heading"><div><span className="section-kicker">إدارة العملاء</span><h2>المؤسسات والاشتراكات</h2></div><div className="heading-actions"><span className="count-chip">{overview.organizations.length.toLocaleString("ar-EG")} مؤسسة</span><button type="button" className="primary-action" onClick={() => { setShowCreate(true); setSuccess(""); }}>+ إضافة مؤسسة</button></div></div>
      {success && <div className="success-banner" role="status">{success}</div>}
      <div className="platform-filters"><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="بحث بالاسم أو المعرّف أو البريد…" /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">كل الحالات</option>{Object.entries(organizationStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      {organizations.length === 0
        ? <EmptyState title={overview.organizations.length === 0 ? "لا توجد مؤسسات" : "لا توجد نتائج"} description={overview.organizations.length === 0 ? "أضف أول مؤسسة لبدء تشغيل المنصة." : "جرّب تغيير كلمات البحث أو حالة التصفية."} />
        : <div className="table-wrapper"><table><thead><tr><th>المؤسسة</th><th>الخطة</th><th>حالة الاشتراك</th><th>الفروع</th><th>الأجهزة</th><th>المستخدمون</th><th>حالة المؤسسة</th><th>الإجراء</th></tr></thead><tbody>{organizations.map((organization) => <ManagedOrganizationRow key={organization.id} organization={organization} accessToken={accessToken} onChanged={onChanged} onSelect={() => setSelectedOrganizationId(organization.id)} />)}</tbody></table></div>}
    </section>
  </>;
}

function DemoRequestRow({ request, accessToken, onChanged }: {
  request: PlatformDemoRequest;
  accessToken: string;
  onChanged: () => Promise<void>;
}) {
  const [status, setStatus] = useState(request.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    try {
      await updatePlatformDemoRequestStatus(accessToken, request.id, status);
      await onChanged();
    } catch (caught) {
      setError(getApiErrorMessage(caught, "تعذر تحديث حالة الطلب"));
    } finally {
      setSaving(false);
    }
  }

  return <>
    <tr>
      <td><strong>{request.restaurant_name}</strong><small className="table-subtitle">{request.city} · {request.branch_count.toLocaleString("ar-EG")} فرع</small></td>
      <td><strong>{request.contact_name}</strong><a className="contact-link" href={`tel:${request.phone}`}>{request.phone}</a>{request.email && <a className="contact-link" href={`mailto:${request.email}`}>{request.email}</a>}</td>
      <td>{request.message ? <span className="request-message" title={request.message}>{request.message}</span> : <span className="muted">—</span>}</td>
      <td>{request.preferred_language.toUpperCase()}</td>
      <td>{formatDate(request.created_at)}</td>
      <td><select value={status} onChange={(event) => setStatus(event.target.value as PlatformDemoRequest["status"])} aria-label={`حالة طلب ${request.restaurant_name}`}>{Object.entries(demoRequestStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
      <td><button type="button" className="save-row-button" disabled={saving || status === request.status} onClick={() => void save()}>{saving ? "جارٍ الحفظ…" : "حفظ"}</button></td>
    </tr>
    {error && <tr className="row-error"><td colSpan={7}>{error}</td></tr>}
  </>;
}

export function PlatformDemoRequestsPage({ accessToken }: { accessToken: string }) {
  const [requests, setRequests] = useState<PlatformDemoRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | PlatformDemoRequest["status"]>("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRequests(await getPlatformDemoRequests(accessToken, statusFilter === "all" ? undefined : statusFilter));
      setError("");
    } catch (caught) {
      setError(getApiErrorMessage(caught, "تعذر تحميل طلبات الديمو"));
    } finally {
      setLoading(false);
    }
  }, [accessToken, statusFilter]);

  useEffect(() => {
    // Remote lead data is the external state synchronized by this effect.
    // oxlint-disable-next-line react/set-state-in-effect
    void load();
  }, [load]);

  const visibleRequests = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return requests;
    return requests.filter((request) => [request.restaurant_name, request.contact_name, request.phone, request.email, request.city]
      .some((value) => value?.toLowerCase().includes(normalized)));
  }, [query, requests]);

  return <section className="panel">
    <div className="panel-heading platform-heading"><div><span className="section-kicker">المبيعات</span><h2>طلبات الديمو</h2></div><span className="count-chip">{visibleRequests.length.toLocaleString("ar-EG")} طلب</span></div>
    {error && <div className="error-banner" role="alert"><span>!</span><p>{error}</p><button type="button" onClick={() => void load()}>إعادة المحاولة</button></div>}
    <div className="platform-filters"><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="بحث بالمؤسسة أو المسؤول أو الهاتف…" /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}><option value="all">كل الحالات</option>{Object.entries(demoRequestStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
    {loading ? <div className="table-skeleton"><i /><i /><i /></div> : visibleRequests.length === 0
      ? <EmptyState title="لا توجد طلبات ديمو" description="ستظهر هنا الطلبات المرسلة من صفحة Kitzon التعريفية." />
      : <div className="table-wrapper"><table><thead><tr><th>المؤسسة</th><th>التواصل</th><th>الاحتياج</th><th>اللغة</th><th>تاريخ الطلب</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody>{visibleRequests.map((request) => <DemoRequestRow key={request.id} request={request} accessToken={accessToken} onChanged={load} />)}</tbody></table></div>}
  </section>;
}
