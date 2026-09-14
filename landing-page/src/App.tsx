import { useEffect, useState, type FormEvent } from "react";

type Language = "ar" | "fr" | "en";
type Copy = typeof content.ar;

const content = {
  ar: {
    nav: ["الحل", "كيف يعمل", "الفوائد", "الأسئلة"], login: "تسجيل الدخول", demo: "اطلب عرضًا",
    eyebrow: "ذكاء تشغيلي للمطابخ التجارية", titleA: "اعرف أين يذهب", titleAccent: "طعامك.", titleB: "ثم أوقف الهدر.",
    lead: "Kitzon يربط ميزان المطبخ بلوحة تحكم بسيطة، لتسجيل الهدر لحظة حدوثه وتحويله إلى قرارات تقلل التكلفة.",
    primary: "احجز ديمو مجاني", secondary: "شاهد طريقة العمل", trust: ["إعداد سريع", "يعمل على التابلت", "مصمم للمطابخ"],
    live: "مباشر", today: "هدر اليوم", kg: "كجم", records: "عملية مسجلة", categories: "أعلى الأصناف", alert: "تنبيه مبكر", alertText: "اقترب الهدر من الحد اليومي", kiosk: "Kitzon Kiosk", recordWaste: "تسجيل الهدر", saved: "تم الحفظ",
    problemKicker: "الهدر غير المرئي مكلف", problemTitle: "ما لا تقيسه، لا يمكنك تقليله.", problemText: "دفاتر الورق والتقديرات لا تخبرك متى ولماذا يحدث الهدر. Kitzon يعطي فريقك طريقة سريعة للقياس، ومديرك صورة واضحة للتحسين.",
    benefits: [
      ["قياس في لحظته", "يسجل العامل الوزن والصنف والسبب من شاشة لمس واضحة خلال ثوانٍ."],
      ["رؤية لكل فرع", "تابع المؤشرات والأجهزة وحدود التنبيه من لوحة واحدة."],
      ["قرارات قابلة للتنفيذ", "اكتشف الأصناف والأوقات والأسباب الأكثر تسببًا في الخسارة."],
    ],
    howKicker: "من الميزان إلى القرار", howTitle: "ثلاث خطوات. بلا تعقيد.", steps: [
      ["01", "زن الهدر", "ضع الطعام على الميزان المتصل بالتابلت."],
      ["02", "حدد السبب", "اختر الصنف وسبب الهدر بلمستين."],
      ["03", "حسّن التشغيل", "راجع التقارير والتنبيهات واتخذ الإجراء المناسب."],
    ],
    valueKicker: "مبني للعمل الحقيقي", valueTitle: "خفيف على العامل، قوي للمدير.", valueText: "واجهة الكيوسك تركز على مهمة واحدة فقط. أما لوحة الإدارة فتجمع الفروع والأجهزة والقوائم والتنبيهات دون تشتيت.",
    valuePoints: ["يعمل حتى عند انقطاع الإنترنت ثم يزامن تلقائيًا", "صلاحيات منفصلة للمالك والمدير والعامل", "العربية والفرنسية والإنجليزية", "قابل للربط بموازين USB وRS232"],
    audienceKicker: "لمن صُمم؟", audienceTitle: "للمطابخ التي تريد ضبط التكلفة، لا إضافة عبء جديد.", audiences: ["المطاعم المستقلة", "سلاسل المطاعم", "الفنادق", "المطابخ المركزية"],
    formKicker: "ابدأ بتجربة في مطبخ واحد", formTitle: "اطلب ديمو Kitzon", formText: "اترك بياناتك وسنتواصل معك لفهم طريقة عمل مطبخك وترتيب عرض قصير للمنصة.",
    restaurant: "اسم المطعم أو المؤسسة", contact: "اسم المسؤول", phone: "رقم الهاتف", email: "البريد الإلكتروني (اختياري)", city: "الولاية / المدينة", branches: "عدد الفروع", message: "ما الذي تريد تحسينه؟ (اختياري)", send: "إرسال طلب الديمو", sending: "جارٍ الإرسال…", privacy: "لن نشارك بياناتك مع أي طرف آخر.", success: "وصل طلبك بنجاح. سنتواصل معك قريبًا.", error: "تعذر إرسال الطلب الآن. يرجى المحاولة مرة أخرى.",
    faqKicker: "أسئلة شائعة", faqTitle: "قبل أن نبدأ", faqs: [
      ["هل أحتاج إلى تغيير الميزان؟", "ليس بالضرورة. نتحقق أولًا من توافق الميزان الحالي عبر USB أو RS232."],
      ["هل يحتاج العامل إلى حساب؟", "لا. جهاز الكيوسك يرتبط بالفرع برمز آمن ويصبح جاهزًا للتسجيل."],
      ["ماذا يحدث عند انقطاع الإنترنت؟", "يحفظ الكيوسك العمليات محليًا ويرسلها تلقائيًا عند عودة الاتصال."],
      ["هل يمكن البدء بفرع واحد؟", "نعم، وهذا هو الأسلوب الذي نوصي به لتجربة النظام وقياس أثره."],
    ],
    footer: "منصة قياس وتقليل هدر الطعام للمطابخ التجارية.", rights: "جميع الحقوق محفوظة.",
  },
  fr: {
    nav: ["Solution", "Fonctionnement", "Bénéfices", "FAQ"], login: "Connexion", demo: "Demander une démo",
    eyebrow: "Intelligence opérationnelle pour cuisines professionnelles", titleA: "Comprenez où va", titleAccent: "votre nourriture.", titleB: "Puis réduisez le gaspillage.",
    lead: "Kitzon relie la balance de cuisine à un tableau de bord simple pour mesurer le gaspillage au moment où il se produit et réduire les coûts.",
    primary: "Réserver une démo", secondary: "Voir comment ça marche", trust: ["Mise en place rapide", "Compatible tablette", "Conçu pour la cuisine"],
    live: "En direct", today: "Gaspillage du jour", kg: "kg", records: "opérations enregistrées", categories: "Catégories principales", alert: "Alerte précoce", alertText: "Le seuil quotidien est presque atteint", kiosk: "Kitzon Kiosk", recordWaste: "Enregistrer le gaspillage", saved: "Enregistré",
    problemKicker: "Le gaspillage invisible coûte cher", problemTitle: "On ne réduit que ce que l’on mesure.", problemText: "Les cahiers et estimations n’expliquent ni quand ni pourquoi le gaspillage se produit. Kitzon simplifie la mesure pour l’équipe et donne au responsable une vision claire.",
    benefits: [["Mesure immédiate", "L’employé saisit le poids, la catégorie et la cause en quelques secondes."], ["Vue par établissement", "Suivez indicateurs, appareils et seuils depuis un seul tableau de bord."], ["Décisions concrètes", "Identifiez les produits, moments et causes qui génèrent le plus de pertes."]],
    howKicker: "De la balance à la décision", howTitle: "Trois étapes. Sans complexité.", steps: [["01", "Peser", "Placez les déchets sur la balance connectée."], ["02", "Préciser la cause", "Choisissez la catégorie et la cause en deux gestes."], ["03", "Améliorer", "Consultez les rapports et agissez sur les écarts."]],
    valueKicker: "Pensé pour le terrain", valueTitle: "Simple pour l’équipe, puissant pour le manager.", valueText: "Le kiosque se concentre sur une seule tâche. Le tableau de bord réunit établissements, appareils, listes et alertes sans surcharge.", valuePoints: ["Fonctionne hors ligne et se synchronise automatiquement", "Rôles distincts pour propriétaire, manager et employé", "Arabe, français et anglais", "Connexion possible aux balances USB et RS232"],
    audienceKicker: "Pour qui ?", audienceTitle: "Pour les cuisines qui veulent maîtriser leurs coûts sans alourdir le travail.", audiences: ["Restaurants indépendants", "Chaînes de restaurants", "Hôtels", "Cuisines centrales"],
    formKicker: "Commencez avec une cuisine", formTitle: "Demander une démo Kitzon", formText: "Laissez vos coordonnées. Nous étudierons votre fonctionnement et organiserons une courte présentation.", restaurant: "Restaurant ou organisation", contact: "Nom du responsable", phone: "Téléphone", email: "E-mail (facultatif)", city: "Wilaya / ville", branches: "Nombre d’établissements", message: "Que souhaitez-vous améliorer ? (facultatif)", send: "Envoyer la demande", sending: "Envoi…", privacy: "Vos données ne seront jamais partagées.", success: "Votre demande a bien été reçue. Nous vous contacterons bientôt.", error: "Impossible d’envoyer la demande. Veuillez réessayer.",
    faqKicker: "Questions fréquentes", faqTitle: "Avant de commencer", faqs: [["Faut-il remplacer la balance ?", "Pas nécessairement. Nous vérifions d’abord sa compatibilité USB ou RS232."], ["L’employé a-t-il besoin d’un compte ?", "Non. Le kiosque est associé à l’établissement avec un code sécurisé."], ["Et en cas de coupure Internet ?", "Le kiosque conserve les opérations et les synchronise au retour de la connexion."], ["Peut-on commencer avec un seul site ?", "Oui. C’est même l’approche recommandée pour mesurer les premiers résultats."]],
    footer: "La plateforme de mesure et réduction du gaspillage alimentaire.", rights: "Tous droits réservés.",
  },
  en: {
    nav: ["Solution", "How it works", "Benefits", "FAQ"], login: "Sign in", demo: "Request a demo",
    eyebrow: "Operational intelligence for commercial kitchens", titleA: "Know where your", titleAccent: "food goes.", titleB: "Then stop the waste.", lead: "Kitzon connects the kitchen scale to a simple dashboard, capturing waste as it happens and turning it into decisions that reduce cost.", primary: "Book a free demo", secondary: "See how it works", trust: ["Fast setup", "Works on tablets", "Built for kitchens"],
    live: "Live", today: "Waste today", kg: "kg", records: "recorded events", categories: "Top categories", alert: "Early alert", alertText: "Daily waste is nearing its limit", kiosk: "Kitzon Kiosk", recordWaste: "Record waste", saved: "Saved",
    problemKicker: "Invisible waste is expensive", problemTitle: "You cannot reduce what you do not measure.", problemText: "Paper logs and estimates cannot tell you when or why waste happens. Kitzon makes measurement quick for the team and improvement clear for managers.", benefits: [["Measure instantly", "Staff record weight, category and reason from a clear touch screen in seconds."], ["See every branch", "Monitor metrics, devices and alert thresholds from one dashboard."], ["Make useful decisions", "Find the products, times and reasons causing the greatest losses."]],
    howKicker: "From scale to decision", howTitle: "Three steps. No complexity.", steps: [["01", "Weigh the waste", "Place food waste on the connected scale."], ["02", "Choose a reason", "Select the category and reason in two taps."], ["03", "Improve operations", "Review reports and alerts, then take action."]],
    valueKicker: "Built for real operations", valueTitle: "Simple for staff, powerful for managers.", valueText: "The kiosk focuses on one job. The management dashboard brings branches, devices, catalogs and alerts together without clutter.", valuePoints: ["Works offline and syncs automatically", "Separate roles for owners, managers and staff", "Arabic, French and English", "Ready for USB and RS232 scales"],
    audienceKicker: "Who is it for?", audienceTitle: "For kitchens that want cost control without adding more work.", audiences: ["Independent restaurants", "Restaurant groups", "Hotels", "Central kitchens"],
    formKicker: "Start with one kitchen", formTitle: "Request a Kitzon demo", formText: "Leave your details and we will learn about your operation and arrange a short product walkthrough.", restaurant: "Restaurant or organization", contact: "Contact name", phone: "Phone number", email: "Email (optional)", city: "City / province", branches: "Number of branches", message: "What would you like to improve? (optional)", send: "Send demo request", sending: "Sending…", privacy: "We will never share your information.", success: "Your request was received. We will contact you soon.", error: "Could not send your request. Please try again.",
    faqKicker: "Common questions", faqTitle: "Before we start", faqs: [["Do I need a new scale?", "Not necessarily. We first check whether your existing scale supports USB or RS232."], ["Does every worker need an account?", "No. The kiosk is securely paired with its branch and is ready to record."], ["What if the internet goes down?", "The kiosk stores events locally and syncs them when connectivity returns."], ["Can we start with one branch?", "Yes. That is the recommended way to test the system and measure its impact."]],
    footer: "Food waste measurement and reduction for commercial kitchens.", rights: "All rights reserved.",
  },
} as const;

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5000").replace(/\/$/, "");

function Brand() { return <a className="brand" href="#top" aria-label="Kitzon"><span>K</span><strong>Kitzon</strong></a>; }
function Kicker({ children }: { children: React.ReactNode }) { return <p className="kicker"><i />{children}</p>; }

export default function App() {
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem("kitzon-language") as Language) || "ar");
  const c: Copy = content[language] as Copy;
  const dir = language === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    localStorage.setItem("kitzon-language", language);
    document.documentElement.lang = language;
    document.documentElement.dir = dir;
  }, [dir, language]);

  return <div className="site" dir={dir}>
    <header className="nav-wrap" id="top"><nav><Brand /><div className="nav-links"><a href="#solution">{c.nav[0]}</a><a href="#how">{c.nav[1]}</a><a href="#benefits">{c.nav[2]}</a><a href="#faq">{c.nav[3]}</a></div><div className="nav-actions"><select value={language} onChange={(event) => setLanguage(event.target.value as Language)} aria-label="Language"><option value="ar">العربية</option><option value="fr">FR</option><option value="en">EN</option></select><a className="login" href="https://kitzon-dashboard.pages.dev/">{c.login}</a><a className="button small" href="#demo">{c.demo}</a></div></nav></header>

    <main>
      <section className="hero section"><div className="hero-copy"><Kicker>{c.eyebrow}</Kicker><h1>{c.titleA} <em>{c.titleAccent}</em><br />{c.titleB}</h1><p className="lead">{c.lead}</p><div className="hero-actions"><a className="button" href="#demo">{c.primary}<span>↗</span></a><a className="text-link" href="#how">{c.secondary}<span>↓</span></a></div><ul className="trust">{c.trust.map((item) => <li key={item}>✓ {item}</li>)}</ul></div><ProductPreview c={c} /></section>

      <section className="problem section" id="solution"><div><Kicker>{c.problemKicker}</Kicker><h2>{c.problemTitle}</h2></div><p>{c.problemText}</p></section>
      <section className="benefit-grid section" id="benefits">{c.benefits.map(([title, text], index) => <article key={title}><span>0{index + 1}</span><div className="feature-icon">{["◎", "⌁", "↗"][index]}</div><h3>{title}</h3><p>{text}</p></article>)}</section>

      <section className="how section" id="how"><div className="section-heading"><Kicker>{c.howKicker}</Kicker><h2>{c.howTitle}</h2></div><div className="steps">{c.steps.map(([number, title, text]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{text}</p></article>)}</div></section>

      <section className="value section"><div className="value-visual"><div className="scale"><small>WEIGHT</small><strong>1.240</strong><span>kg</span></div><div className="tap-card"><span>✓</span><p>{c.saved}</p></div></div><div><Kicker>{c.valueKicker}</Kicker><h2>{c.valueTitle}</h2><p className="body-copy">{c.valueText}</p><ul className="check-list">{c.valuePoints.map((item) => <li key={item}><span>✓</span>{item}</li>)}</ul></div></section>

      <section className="audience section"><Kicker>{c.audienceKicker}</Kicker><h2>{c.audienceTitle}</h2><div>{c.audiences.map((item, index) => <span key={item}><b>{["R", "G", "H", "C"][index]}</b>{item}</span>)}</div></section>

      <section className="demo section" id="demo"><div className="demo-copy"><Kicker>{c.formKicker}</Kicker><h2>{c.formTitle}</h2><p>{c.formText}</p><div className="contact-note"><span>30</span><div><strong>min</strong><small>Découverte + démo</small></div></div></div><DemoForm c={c} language={language} /></section>

      <section className="faq section" id="faq"><div className="section-heading"><Kicker>{c.faqKicker}</Kicker><h2>{c.faqTitle}</h2></div><div>{c.faqs.map(([question, answer]) => <details key={question}><summary>{question}<span>+</span></summary><p>{answer}</p></details>)}</div></section>
    </main>
    <footer><div><Brand /><p>{c.footer}</p></div><span>© {new Date().getFullYear()} Kitzon. {c.rights}</span></footer>
  </div>;
}

function ProductPreview({ c }: { c: Copy }) {
  return <div className="preview"><div className="preview-glow" /><div className="dashboard-card"><div className="mini-top"><div><i /><i /><i /></div><span>Kitzon · Dashboard</span><b>{c.live}</b></div><div className="mini-body"><aside><strong>K</strong><i /><i /><i /><i /></aside><section><p>{c.today}</p><div className="metric"><strong>12.8</strong><span>{c.kg}<small>↘ 8%</small></span></div><div className="micro-grid"><article><small>{c.records}</small><b>47</b></article><article><small>{c.categories}</small><b>03</b></article></div><div className="chart"><i style={{ height: "38%" }} /><i style={{ height: "62%" }} /><i style={{ height: "48%" }} /><i style={{ height: "82%" }} /><i style={{ height: "55%" }} /><i style={{ height: "72%" }} /><i style={{ height: "43%" }} /></div></section></div></div><div className="alert-card"><span>!</span><div><strong>{c.alert}</strong><small>{c.alertText}</small></div></div><div className="kiosk-card"><header><b>{c.kiosk}</b><i /></header><small>{c.recordWaste}</small><strong>1.240 <em>{c.kg}</em></strong><div><i /><i className="selected" /><i /></div><button>{c.saved} ✓</button></div></div>;
}

function DemoForm({ c, language }: { c: Copy; language: Language }) {
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setStatus("sending");
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/demo-requests`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, branchCount: Number(body.branchCount), preferredLanguage: language }) });
      if (!response.ok) throw new Error("request failed");
      event.currentTarget.reset(); setStatus("success");
    } catch { setStatus("error"); }
  }
  return <form className="demo-form" onSubmit={(event) => void submit(event)}><label>{c.restaurant}<input name="restaurantName" required minLength={2} maxLength={120} /></label><label>{c.contact}<input name="contactName" required minLength={2} maxLength={120} /></label><div className="form-row"><label>{c.phone}<input name="phone" type="tel" dir="ltr" required minLength={8} maxLength={24} placeholder="+213" /></label><label>{c.email}<input name="email" type="email" dir="ltr" maxLength={254} /></label></div><div className="form-row"><label>{c.city}<input name="city" required minLength={2} maxLength={100} /></label><label>{c.branches}<input name="branchCount" type="number" min="1" max="1000" defaultValue="1" required /></label></div><label>{c.message}<textarea name="message" maxLength={1000} rows={3} /></label><label className="honeypot" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label><button className="button" disabled={status === "sending"}>{status === "sending" ? c.sending : c.send}<span>↗</span></button><small className="privacy">⌁ {c.privacy}</small>{status === "success" && <p className="form-status success" role="status">✓ {c.success}</p>}{status === "error" && <p className="form-status error" role="alert">{c.error}</p>}</form>;
}
