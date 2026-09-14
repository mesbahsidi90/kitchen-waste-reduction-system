import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Language = "ar" | "fr" | "en";
const STORAGE_KEY = "kitzon-language";

const copy = {
  wasteRecording: { ar: "تسجيل الهدر", fr: "Saisie du gaspillage", en: "Waste recording" },
  systemStatus: { ar: "حالة النظام", fr: "État du système", en: "System status" },
  online: { ar: "متصل", fr: "En ligne", en: "Online" },
  offline: { ar: "دون إنترنت", fr: "Hors ligne", en: "Offline" },
  scaleDisconnected: { ar: "الميزان غير متصل", fr: "Balance déconnectée", en: "Scale disconnected" },
  scaleConnecting: { ar: "جاري الاتصال…", fr: "Connexion…", en: "Connecting…" },
  scaleConnected: { ar: "الميزان متصل", fr: "Balance connectée", en: "Scale connected" },
  scaleUnsupported: { ar: "الاتصال غير مدعوم", fr: "Connexion non prise en charge", en: "Connection unsupported" },
  scaleError: { ar: "تعذر اتصال الميزان", fr: "Échec de connexion à la balance", en: "Scale connection failed" },
  savedEvents: { ar: "عمليات محفوظة على الجهاز", fr: "Opérations enregistrées sur l’appareil", en: "Events saved on this device" },
  autoSend: { ar: "ستُرسل تلقائيًا عند توفر الاتصال.", fr: "Elles seront envoyées automatiquement dès le retour de la connexion.", en: "They will be sent automatically when the connection returns." },
  syncing: { ar: "جاري الإرسال…", fr: "Envoi…", en: "Sending…" },
  syncNow: { ar: "مزامنة الآن", fr: "Synchroniser", en: "Sync now" },
  weight: { ar: "الوزن", fr: "Poids", en: "Weight" },
  kg: { ar: "كجم", fr: "kg", en: "kg" },
  disconnectScale: { ar: "فصل الميزان", fr: "Déconnecter la balance", en: "Disconnect scale" },
  connectScale: { ar: "توصيل الميزان", fr: "Connecter la balance", en: "Connect scale" },
  simulate: { ar: "تجربة وزن عشوائي", fr: "Simuler un poids", en: "Simulate weight" },
  chooseCategory: { ar: "اختر الصنف", fr: "Choisir la catégorie", en: "Choose category" },
  chooseReason: { ar: "اختر السبب", fr: "Choisir la cause", en: "Choose reason" },
  noCategories: { ar: "لا توجد أصناف مفعّلة لهذا الفرع.", fr: "Aucune catégorie active pour cet établissement.", en: "No active categories for this branch." },
  loadingCategories: { ar: "جاري تحميل الأصناف…", fr: "Chargement des catégories…", en: "Loading categories…" },
  noReasons: { ar: "لا توجد أسباب هدر مفعّلة لهذا الفرع.", fr: "Aucune cause active pour cet établissement.", en: "No active waste reasons for this branch." },
  loadingReasons: { ar: "جاري تحميل الأسباب…", fr: "Chargement des causes…", en: "Loading reasons…" },
  recording: { ar: "جاري التسجيل…", fr: "Enregistrement…", en: "Recording…" },
  record: { ar: "تسجيل", fr: "Enregistrer", en: "Record" },
  activateKitchen: { ar: "تفعيل جهاز المطبخ", fr: "Activer l’appareil de cuisine", en: "Activate kitchen device" },
  pairingHelp: { ar: "اطلب رمز التفعيل من مدير المطبخ، ثم أدخله هنا لربط هذا الجهاز بالفرع.", fr: "Demandez le code au responsable de cuisine, puis saisissez-le pour associer cet appareil à l’établissement.", en: "Ask the kitchen manager for the activation code, then enter it to link this device to the branch." },
  activationCode: { ar: "رمز التفعيل", fr: "Code d’activation", en: "Activation code" },
  activating: { ar: "جاري التفعيل…", fr: "Activation…", en: "Activating…" },
  activate: { ar: "تفعيل الجهاز", fr: "Activer l’appareil", en: "Activate device" },
  codeExpiry: { ar: "الرمز صالح لمدة 15 دقيقة ويُستخدم مرة واحدة.", fr: "Le code est valable 15 minutes et ne peut être utilisé qu’une fois.", en: "The code is valid for 15 minutes and can only be used once." },
  syncingEvents: { ar: "جاري مزامنة العمليات…", fr: "Synchronisation des opérations…", en: "Syncing events…" },
  syncTemporaryError: { ar: "تعذرت المزامنة مؤقتًا. سيحاول الكيوسك مجددًا عند عودة الاتصال.", fr: "Synchronisation temporairement impossible. Le kiosque réessaiera au retour de la connexion.", en: "Sync is temporarily unavailable. The kiosk will retry when the connection returns." },
  pendingReview: { ar: "توجد عملية معلّقة تحتاج مراجعة إعدادات الفرع.", fr: "Une opération en attente nécessite de vérifier les paramètres de l’établissement.", en: "A pending event requires a review of the branch settings." },
  syncComplete: { ar: "تمت مزامنة جميع العمليات المعلّقة.", fr: "Toutes les opérations en attente ont été synchronisées.", en: "All pending events have been synced." },
  cachedCatalog: { ar: "تعذر تحديث القائمة؛ يستخدم الكيوسك آخر نسخة محفوظة.", fr: "Mise à jour impossible ; le kiosque utilise la dernière liste enregistrée.", en: "Could not update the catalog; the kiosk is using the last saved version." },
  catalogError: { ar: "تعذر تحميل أصناف الفرع. تحقق من إعداد الجهاز ثم أعد المحاولة.", fr: "Impossible de charger les catégories. Vérifiez la configuration de l’appareil.", en: "Could not load branch categories. Check the device configuration." },
  scaleConnectionError: { ar: "تعذر الاتصال بالميزان. تحقق من الكابل ثم حاول مجددًا.", fr: "Impossible de se connecter à la balance. Vérifiez le câble et réessayez.", en: "Could not connect to the scale. Check the cable and try again." },
  putWasteFirst: { ar: "ضع الهدر على الميزان أولًا.", fr: "Placez d’abord les déchets sur la balance.", en: "Place the waste on the scale first." },
  chooseBoth: { ar: "اختر الصنف والسبب قبل التسجيل.", fr: "Choisissez la catégorie et la cause avant l’enregistrement.", en: "Choose a category and reason before recording." },
  queuedOffline: { ar: "تم حفظ العملية على الجهاز وستُرسل عند عودة الاتصال.", fr: "L’opération est enregistrée sur l’appareil et sera envoyée au retour de la connexion.", en: "The event was saved on this device and will be sent when the connection returns." },
  localSaveError: { ar: "تعذر حفظ العملية على الجهاز.", fr: "Impossible d’enregistrer l’opération sur l’appareil.", en: "Could not save the event on this device." },
  recorded: { ar: "تم تسجيل الهدر بنجاح", fr: "Gaspillage enregistré", en: "Waste recorded successfully" },
  queuedServerError: { ar: "تعذر الوصول للخادم؛ حُفظت العملية وستُزامن تلقائيًا.", fr: "Serveur inaccessible ; l’opération a été enregistrée et sera synchronisée automatiquement.", en: "Server unavailable; the event was saved and will sync automatically." },
  recordError: { ar: "تعذر تسجيل العملية. راجع إعدادات الفرع.", fr: "Impossible d’enregistrer l’opération. Vérifiez les paramètres de l’établissement.", en: "Could not record the event. Check the branch settings." },
  pairingError: { ar: "تعذر تفعيل الجهاز. تحقق من الرمز والاتصال.", fr: "Impossible d’activer l’appareil. Vérifiez le code et la connexion.", en: "Could not activate the device. Check the code and connection." },
} as const;

type CopyKey = keyof typeof copy;
type I18nValue = { language: Language; setLanguage: (language: Language) => void; t: (key: CopyKey) => string; locale: string; dir: "rtl" | "ltr" };
const I18nContext = createContext<I18nValue | null>(null);

function initialLanguage(): Language {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === "fr" || saved === "en" || saved === "ar" ? saved : "ar";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(initialLanguage);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  }, [language]);
  const value = useMemo<I18nValue>(() => ({
    language,
    setLanguage,
    t: (key) => copy[key][language],
    locale: language === "ar" ? "ar-DZ" : language === "fr" ? "fr-DZ" : "en-US",
    dir: language === "ar" ? "rtl" : "ltr",
  }), [language]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// oxlint-disable-next-line react/only-export-components -- context hook belongs with its provider.
export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}

export function LanguageSwitcher() {
  const { language, setLanguage } = useI18n();
  return <select className="language-switcher" value={language} onChange={(event) => setLanguage(event.target.value as Language)} aria-label="Language">
    <option value="ar">العربية</option><option value="fr">Français</option><option value="en">English</option>
  </select>;
}
