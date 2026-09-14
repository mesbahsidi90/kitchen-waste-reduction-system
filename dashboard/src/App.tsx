import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getDashboardData,
  getPlatformOverview,
  isForbidden,
  type AnalyticsSummary,
  type PlatformOverview,
  type WasteLog,
} from "./api";
import AuthGate, { type DashboardAuth } from "./AuthGate";
import {
  BranchesPage,
  CatalogPage,
  DevicesPage,
  OverviewPage,
  PlatformOrganizationsPage,
  PlatformOverviewPage,
  ThresholdsPage,
  WasteTable,
} from "./DashboardPages";
import { getWorkspaceData, platformWorkspace, type WorkspaceData, type WorkspaceRole } from "./workspace";
import { LanguageSwitcher, useI18n } from "./i18n";
import "./App.css";

const emptySummary: AnalyticsSummary = { total_weight_kg: 0, total_count: 0, categories: [] };
const defaultCategoryColors: Record<string, string> = {
  "خضروات وفواكه": "#22c55e",
  "لحوم ودواجن": "#f97316",
  مخبوزات: "#eab308",
  "وجبات مطبوخة": "#38bdf8",
};

type PageKey = "overview" | "organizations" | "records" | "branches" | "devices" | "catalog" | "thresholds";
type NavigationItem = { key: PageKey; label: string; icon: string; ownerOnly?: boolean; staffOnly?: boolean };

const navigation: NavigationItem[] = [
  { key: "overview", label: "نظرة عامة", icon: "⌂" },
  { key: "records", label: "سجل الهدر", icon: "≡" },
  { key: "branches", label: "الفروع", icon: "◇", ownerOnly: true },
  { key: "devices", label: "الأجهزة والموازين", icon: "◉", staffOnly: true },
  { key: "catalog", label: "الأصناف والأسباب", icon: "▦", staffOnly: true },
  { key: "thresholds", label: "حدود التنبيه", icon: "⚑", staffOnly: true },
];

const platformNavigation: NavigationItem[] = [
  { key: "overview", label: "نظرة المنصة", icon: "⌂" },
  { key: "organizations", label: "العملاء والاشتراكات", icon: "◇" },
];

const pageTitles: Record<PageKey, { title: string; description: string }> = {
  overview: { title: "نظرة عامة", description: "مؤشرات الهدر وحالة التشغيل لحظة بلحظة" },
  organizations: { title: "العملاء والاشتراكات", description: "جميع المؤسسات وحالة استخدامها واشتراكاتها" },
  records: { title: "سجل الهدر", description: "عمليات الهدر المرئية ضمن نطاق صلاحيتك" },
  branches: { title: "إدارة الفروع", description: "حالة فروع المؤسسة وتجهيزاتها التشغيلية" },
  devices: { title: "الأجهزة والموازين", description: "مراقبة اتصال الموازين المسجلة وحالتها" },
  catalog: { title: "الأصناف والأسباب", description: "القوائم المستخدمة عند تسجيل الهدر" },
  thresholds: { title: "حدود التنبيه", description: "القواعد النشطة لمراقبة تجاوز الهدر" },
};

const roleLabels: Record<WorkspaceRole, string> = {
  organization_owner: "مسؤول المؤسسة",
  branch_manager: "مدير المطبخ",
  worker: "موظف المطبخ",
  platform_super_admin: "الأدمن الرئيسي",
};

function Dashboard({ auth }: { auth: DashboardAuth }) {
  const { language } = useI18n();
  const [activePage, setActivePage] = useState<PageKey>("overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [platformOverview, setPlatformOverview] = useState<PlatformOverview | null>(null);
  const [logs, setLogs] = useState<WasteLog[]>([]);
  const [summary, setSummary] = useState(emptySummary);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAnalytics = useCallback(async () => {
    try {
      const data = await getDashboardData(auth.accessToken);
      setLogs(data.logs);
      setSummary(data.summary);
      setError("");
    } catch {
      setError("تعذر تحديث بيانات الهدر. تحقق من اتصال الخادم ثم حاول مجددًا.");
    } finally {
      setAnalyticsLoading(false);
    }
  }, [auth.accessToken]);

  const loadWorkspace = useCallback(async (): Promise<boolean> => {
    try {
      if (auth.accessToken) {
        try {
          const overview = await getPlatformOverview(auth.accessToken);
          setPlatformOverview(overview);
          setWorkspace(platformWorkspace);
          setError("");
          return true;
        } catch (caught) {
          if (!isForbidden(caught)) throw caught;
        }
      }
      setPlatformOverview(null);
      setWorkspace(await getWorkspaceData());
      return false;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحميل بيانات مساحة العمل.");
      return false;
    } finally {
      setWorkspaceLoading(false);
    }
  }, [auth.accessToken]);

  const refreshAll = useCallback(async () => {
    setAnalyticsLoading(true);
    const isPlatformAdmin = await loadWorkspace();
    if (isPlatformAdmin) {
      setAnalyticsLoading(false);
      return;
    }
    await loadAnalytics();
  }, [loadAnalytics, loadWorkspace]);

  useEffect(() => {
    // Remote dashboard and tenant data are the external state synchronized by this effect.
    // oxlint-disable-next-line react/set-state-in-effect
    void refreshAll();
    const interval = window.setInterval(() => void refreshAll(), 15_000);
    return () => window.clearInterval(interval);
  }, [refreshAll]);

  const visibleNavigation = useMemo(() => {
    if (!workspace) return navigation.slice(0, 2);
    if (workspace.role === "platform_super_admin") return platformNavigation;
    if (workspace.role === "organization_owner") return navigation;
    if (workspace.role === "branch_manager") return navigation.filter((item) => !item.ownerOnly);
    return navigation.filter((item) => !item.ownerOnly && !item.staffOnly);
  }, [workspace]);

  const categoryColors = useMemo(() => {
    const colors = { ...defaultCategoryColors };
    workspace?.categories.forEach((category) => {
      if (category.color) colors[category.name] = category.color;
    });
    return colors;
  }, [workspace]);

  const assignedBranch = workspace?.branches.find((branch) => branch.id === workspace.assignedBranchId);
  const page = pageTitles[activePage];

  function navigate(key: PageKey) {
    setActivePage(key);
    setMenuOpen(false);
  }

  function renderPage() {
    if (!workspace) return null;
    if (workspace.role === "platform_super_admin" && platformOverview) {
      return activePage === "organizations"
        ? <PlatformOrganizationsPage
            overview={platformOverview}
            accessToken={auth.accessToken!}
            onChanged={async () => { await loadWorkspace(); }}
          />
        : <PlatformOverviewPage overview={platformOverview} />;
    }
    switch (activePage) {
      case "records":
        return <section className="panel"><div className="panel-heading"><div><span className="section-kicker">السجل التشغيلي</span><h2>جميع العمليات</h2></div><span className="count-chip">{logs.length.toLocaleString("ar-EG")}</span></div><WasteTable logs={logs} loading={analyticsLoading} /></section>;
      case "branches":
        return <BranchesPage workspace={workspace} />;
      case "devices":
        return <DevicesPage workspace={workspace} accessToken={auth.accessToken} onChanged={async () => { await loadWorkspace(); }} />;
      case "catalog":
        return <CatalogPage workspace={workspace} onChanged={async () => { await loadWorkspace(); }} />;
      case "thresholds":
        return <ThresholdsPage workspace={workspace} onChanged={async () => { await loadWorkspace(); }} />;
      default:
        return <OverviewPage summary={summary} logs={logs} workspace={workspace} loading={analyticsLoading} colors={categoryColors} />;
    }
  }

  return (
    <main className="app-shell" dir={language === "ar" ? "rtl" : "ltr"}>
      <button className={`sidebar-overlay ${menuOpen ? "visible" : ""}`} aria-label="إغلاق القائمة" onClick={() => setMenuOpen(false)} />
      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <div className="brand"><span className="brand-mark">K</span><div><strong>Kitzon</strong><small>منصة إدارة الهدر</small></div></div>
        <div className="workspace-summary"><span>مساحة العمل</span><strong>{workspace?.organization.name ?? "جاري التحميل…"}</strong>{workspace && <small>{roleLabels[workspace.role]}</small>}</div>
        <nav aria-label="التنقل الرئيسي">
          <span className="nav-label">القائمة الرئيسية</span>
          {visibleNavigation.map((item) => <button key={item.key} type="button" className={activePage === item.key ? "active" : ""} aria-current={activePage === item.key ? "page" : undefined} onClick={() => navigate(item.key)}><span className="nav-icon">{item.icon}</span>{item.label}</button>)}
        </nav>
        <div className="sidebar-footer"><span className="system-dot" /><div><strong>النظام يعمل</strong><small>مزامنة تلقائية كل ١٥ ثانية</small></div></div>
      </aside>

      <section className="content-shell">
        <header className="topbar">
          <div className="title-group"><button type="button" className="menu-button" aria-label="فتح القائمة" onClick={() => setMenuOpen(true)}>☰</button><div><h1>{page.title}</h1><p>{page.description}</p></div></div>
          <div className="topbar-actions">
            <LanguageSwitcher compact />
            <span className="scope-chip"><i />{workspace?.role === "platform_super_admin" ? "كل المؤسسات" : workspace?.role === "organization_owner" ? "كل الفروع" : assignedBranch?.name ?? "نطاق الفرع"}</span>
            <button type="button" className="refresh-button" disabled={analyticsLoading} onClick={() => void refreshAll()}><span>↻</span>{analyticsLoading ? "جارٍ التحديث" : "تحديث"}</button>
            <div className="account-block"><span className="avatar">{(auth.email?.[0] ?? "م").toUpperCase()}</span><div><strong>{auth.email?.split("@")[0] ?? "حساب تجريبي"}</strong><small>{workspace ? roleLabels[workspace.role] : "مستخدم"}</small></div>{auth.signOut && <button type="button" onClick={() => void auth.signOut?.()} aria-label="تسجيل الخروج">←</button>}</div>
          </div>
        </header>

        <div className="content-area">
          {error && <div className="error-banner" role="alert"><span>!</span><p>{error}</p><button type="button" onClick={() => void refreshAll()}>إعادة المحاولة</button></div>}
          {workspaceLoading ? <div className="workspace-loader"><span /><p>جاري تجهيز لوحة التحكم…</p></div> : workspace ? renderPage() : <div className="workspace-loader"><p>تعذر فتح مساحة العمل.</p></div>}
        </div>
      </section>
    </main>
  );
}

export default function App() {
  return <AuthGate>{(auth) => <Dashboard auth={auth} />}</AuthGate>;
}
