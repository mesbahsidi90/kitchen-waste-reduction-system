import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Language = "ar" | "fr" | "en";

const STORAGE_KEY = "kitzon-language";

const translations: Record<string, { fr: string; en: string }> = {
  "منصة إدارة الهدر": { fr: "Plateforme de gestion du gaspillage", en: "Waste management platform" },
  "مساحة العمل": { fr: "Espace de travail", en: "Workspace" },
  "القائمة الرئيسية": { fr: "Menu principal", en: "Main menu" },
  "التنقل الرئيسي": { fr: "Navigation principale", en: "Main navigation" },
  "نظرة عامة": { fr: "Vue d’ensemble", en: "Overview" },
  "نظرة المنصة": { fr: "Vue de la plateforme", en: "Platform overview" },
  "العملاء والاشتراكات": { fr: "Clients et abonnements", en: "Customers & subscriptions" },
  "طلبات الديمو": { fr: "Demandes de démo", en: "Demo requests" },
  "متابعة العملاء المحتملين القادمين من صفحة Kitzon": { fr: "Suivi des prospects provenant du site Kitzon", en: "Track leads coming from the Kitzon website" },
  "متابعة العملاء المحتملين": { fr: "Suivi des prospects", en: "Lead tracking" },
  "المبيعات": { fr: "Ventes", en: "Sales" },
  "طلب": { fr: "demande", en: "request" },
  "جديد": { fr: "Nouveau", en: "New" },
  "تم التواصل": { fr: "Contacté", en: "Contacted" },
  "مؤهل": { fr: "Qualifié", en: "Qualified" },
  "بحث بالمؤسسة أو المسؤول أو الهاتف…": { fr: "Rechercher par organisation, contact ou téléphone…", en: "Search by organization, contact or phone…" },
  "لا توجد طلبات ديمو": { fr: "Aucune demande de démo", en: "No demo requests" },
  "ستظهر هنا الطلبات المرسلة من صفحة Kitzon التعريفية.": { fr: "Les demandes envoyées depuis le site Kitzon apparaîtront ici.", en: "Requests submitted from the Kitzon website will appear here." },
  "التواصل": { fr: "Contact", en: "Contact" },
  "الاحتياج": { fr: "Besoin", en: "Need" },
  "اللغة": { fr: "Langue", en: "Language" },
  "تاريخ الطلب": { fr: "Date de demande", en: "Request date" },
  "سجل الهدر": { fr: "Registre du gaspillage", en: "Waste log" },
  "الفروع": { fr: "Établissements", en: "Branches" },
  "إدارة الفروع": { fr: "Gestion des établissements", en: "Branch management" },
  "الأجهزة والموازين": { fr: "Appareils et balances", en: "Devices & scales" },
  "الأصناف والأسباب": { fr: "Catégories et causes", en: "Categories & reasons" },
  "حدود التنبيه": { fr: "Seuils d’alerte", en: "Alert thresholds" },
  "مؤشرات الهدر وحالة التشغيل لحظة بلحظة": { fr: "Indicateurs de gaspillage et état opérationnel en temps réel", en: "Real-time waste metrics and operational status" },
  "جميع المؤسسات وحالة استخدامها واشتراكاتها": { fr: "Toutes les organisations, leur utilisation et leurs abonnements", en: "All organizations, usage and subscription status" },
  "عمليات الهدر المرئية ضمن نطاق صلاحيتك": { fr: "Événements de gaspillage visibles selon vos droits", en: "Waste events visible within your access scope" },
  "حالة فروع المؤسسة وتجهيزاتها التشغيلية": { fr: "État des établissements et de leurs équipements", en: "Branch and equipment operating status" },
  "مراقبة اتصال الموازين المسجلة وحالتها": { fr: "Suivi de la connexion et de l’état des balances", en: "Monitor registered scales and connectivity" },
  "القوائم المستخدمة عند تسجيل الهدر": { fr: "Listes utilisées lors de l’enregistrement du gaspillage", en: "Lists used when recording waste" },
  "القواعد النشطة لمراقبة تجاوز الهدر": { fr: "Règles actives de suivi des dépassements", en: "Active rules for monitoring waste limits" },
  "مسؤول المؤسسة": { fr: "Responsable de l’organisation", en: "Organization owner" },
  "مالك المؤسسة": { fr: "Propriétaire de l’organisation", en: "Organization owner" },
  "مدير المطبخ": { fr: "Responsable de cuisine", en: "Kitchen manager" },
  "مدير فرع": { fr: "Responsable d’établissement", en: "Branch manager" },
  "موظف المطبخ": { fr: "Employé de cuisine", en: "Kitchen worker" },
  "الأدمن الرئيسي": { fr: "Super administrateur", en: "Super admin" },
  "النظام يعمل": { fr: "Système opérationnel", en: "System operational" },
  "مزامنة تلقائية كل 15 ثانية": { fr: "Synchronisation toutes les 15 secondes", en: "Automatic sync every 15 seconds" },
  "كل المؤسسات": { fr: "Toutes les organisations", en: "All organizations" },
  "كل الفروع": { fr: "Tous les établissements", en: "All branches" },
  "نطاق الفرع": { fr: "Périmètre de l’établissement", en: "Branch scope" },
  "تحديث": { fr: "Actualiser", en: "Refresh" },
  "جارٍ التحديث": { fr: "Actualisation…", en: "Refreshing…" },
  "إعادة المحاولة": { fr: "Réessayer", en: "Try again" },
  "جاري تجهيز لوحة التحكم…": { fr: "Préparation du tableau de bord…", en: "Preparing dashboard…" },
  "تعذر فتح مساحة العمل.": { fr: "Impossible d’ouvrir l’espace de travail.", en: "Could not open the workspace." },
  "السجل التشغيلي": { fr: "Registre opérationnel", en: "Operational log" },
  "جميع العمليات": { fr: "Toutes les opérations", en: "All events" },
  "تصدير Excel": { fr: "Exporter vers Excel", en: "Export to Excel" },
  "طباعة / PDF": { fr: "Imprimer / PDF", en: "Print / PDF" },
  "مرحبًا بعودتك": { fr: "Bienvenue", en: "Welcome back" },
  "تسجيل الدخول إلى لوحة التحكم": { fr: "Connexion au tableau de bord", en: "Sign in to the dashboard" },
  "استخدم حساب المؤسسة للوصول إلى بيانات مطعمك وفروعك.": { fr: "Utilisez votre compte pour accéder aux données de vos établissements.", en: "Use your organization account to access your restaurant data." },
  "البريد الإلكتروني": { fr: "Adresse e-mail", en: "Email address" },
  "كلمة المرور": { fr: "Mot de passe", en: "Password" },
  "دخول": { fr: "Se connecter", en: "Sign in" },
  "جاري الدخول…": { fr: "Connexion…", en: "Signing in…" },
  "قبول الدعوة": { fr: "Accepter l’invitation", en: "Accept invitation" },
  "أنشئ كلمة المرور": { fr: "Créez votre mot de passe", en: "Create your password" },
  "أكمل تفعيل الحساب": { fr: "Finalisez l’activation du compte", en: "Complete account activation" },
  "كلمة المرور الجديدة": { fr: "Nouveau mot de passe", en: "New password" },
  "تأكيد كلمة المرور": { fr: "Confirmer le mot de passe", en: "Confirm password" },
  "تعيين كلمة المرور والدخول": { fr: "Définir le mot de passe et se connecter", en: "Set password and sign in" },
  "إكمال التفعيل": { fr: "Finaliser l’activation", en: "Complete activation" },
  "جارٍ التفعيل…": { fr: "Activation…", en: "Activating…" },
  "العودة إلى تسجيل الدخول": { fr: "Retour à la connexion", en: "Back to sign in" },
  "العودة إلى لوحة التحكم": { fr: "Retour au tableau de bord", en: "Back to dashboard" },
  "رابط الدعوة غير صالح": { fr: "Lien d’invitation invalide", en: "Invalid invitation link" },
  "لا توجد دعوة معلّقة": { fr: "Aucune invitation en attente", en: "No pending invitation" },
  "تعذر قبول الدعوة": { fr: "Impossible d’accepter l’invitation", en: "Could not accept invitation" },
  "جاري التحقق من الجلسة…": { fr: "Vérification de la session…", en: "Checking session…" },
  "جاري التحقق من الدعوة…": { fr: "Vérification de l’invitation…", en: "Checking invitation…" },
  "إجمالي الهدر": { fr: "Gaspillage total", en: "Total waste" },
  "عمليات التسجيل": { fr: "Enregistrements", en: "Recorded events" },
  "الفروع النشطة": { fr: "Établissements actifs", en: "Active branches" },
  "الأصناف النشطة": { fr: "Catégories actives", en: "Active categories" },
  "الأجهزة المتصلة": { fr: "Appareils connectés", en: "Connected devices" },
  "ضمن نطاق العرض الحالي": { fr: "Dans le périmètre actuel", en: "Within the current scope" },
  "عملية موثقة": { fr: "Événements enregistrés", en: "Recorded events" },
  "متاحة للتسجيل": { fr: "Disponibles à la saisie", en: "Available for recording" },
  "نشطة خلال آخر 10 دقائق": { fr: "Actifs durant les 10 dernières minutes", en: "Active in the last 10 minutes" },
  "الوزن": { fr: "Poids", en: "Weight" },
  "الصنف": { fr: "Catégorie", en: "Category" },
  "السبب": { fr: "Cause", en: "Reason" },
  "وقت التسجيل": { fr: "Date d’enregistrement", en: "Recorded at" },
  "الجهاز": { fr: "Appareil", en: "Device" },
  "لا توجد تسجيلات": { fr: "Aucun enregistrement", en: "No records" },
  "ستظهر عمليات الهدر هنا فور تسجيلها من جهاز المطبخ.": { fr: "Les événements apparaîtront ici dès leur saisie sur le kiosque.", en: "Waste events will appear here once recorded on the kiosk." },
  "نشط": { fr: "Actif", en: "Active" },
  "غير نشط": { fr: "Inactif", en: "Inactive" },
  "متصل": { fr: "Connecté", en: "Online" },
  "غير متصل": { fr: "Hors ligne", en: "Offline" },
  "لم يتصل بعد": { fr: "Jamais connecté", en: "Never connected" },
  "المؤسسات": { fr: "Organisations", en: "Organizations" },
  "إجمالي الفروع": { fr: "Total des établissements", en: "Total branches" },
  "الأجهزة المسجلة": { fr: "Appareils enregistrés", en: "Registered devices" },
  "اشتراكات تحتاج متابعة": { fr: "Abonnements à suivre", en: "Subscriptions requiring attention" },
  "اشتراكات متأخرة": { fr: "Abonnements en retard", en: "Past-due subscriptions" },
  "توجد حسابات تحتاج متابعة حالة الدفع.": { fr: "Certains comptes nécessitent un suivi de paiement.", en: "Some accounts require payment follow-up." },
  "أحدث المؤسسات": { fr: "Organisations récentes", en: "Newest organizations" },
  "ملخص البيانات": { fr: "Résumé des données", en: "Data summary" },
  "عمليات الهدر": { fr: "Événements de gaspillage", en: "Waste events" },
  "إجمالي وزن الهدر": { fr: "Poids total gaspillé", en: "Total waste weight" },
  "الاشتراكات النشطة": { fr: "Abonnements actifs", en: "Active subscriptions" },
  "الفترات التجريبية": { fr: "Essais", en: "Trials" },
  "إدارة العملاء": { fr: "Gestion des clients", en: "Customer management" },
  "المؤسسات والاشتراكات": { fr: "Organisations et abonnements", en: "Organizations & subscriptions" },
  "+ إضافة مؤسسة": { fr: "+ Ajouter une organisation", en: "+ Add organization" },
  "إضافة مؤسسة": { fr: "Ajouter une organisation", en: "Add organization" },
  "اسم المؤسسة": { fr: "Nom de l’organisation", en: "Organization name" },
  "المعرّف المختصر": { fr: "Identifiant court", en: "Short identifier" },
  "بريد مالك المؤسسة (اختياري)": { fr: "E-mail du propriétaire (facultatif)", en: "Owner email (optional)" },
  "اسم الفرع الأول": { fr: "Nom du premier établissement", en: "First branch name" },
  "المنطقة الزمنية": { fr: "Fuseau horaire", en: "Time zone" },
  "الخطة": { fr: "Offre", en: "Plan" },
  "إنشاء المؤسسة": { fr: "Créer l’organisation", en: "Create organization" },
  "إنشاء وإرسال الدعوة": { fr: "Créer et envoyer l’invitation", en: "Create and send invitation" },
  "جارٍ الإنشاء…": { fr: "Création…", en: "Creating…" },
  "إلغاء": { fr: "Annuler", en: "Cancel" },
  "كل الحالات": { fr: "Tous les statuts", en: "All statuses" },
  "لا توجد مؤسسات": { fr: "Aucune organisation", en: "No organizations" },
  "لا توجد نتائج": { fr: "Aucun résultat", en: "No results" },
  "أضف أول مؤسسة لبدء تشغيل المنصة.": { fr: "Ajoutez la première organisation pour démarrer.", en: "Add the first organization to get started." },
  "جرّب تغيير كلمات البحث أو حالة التصفية.": { fr: "Modifiez la recherche ou le filtre d’état.", en: "Try changing the search or status filter." },
  "حالة الاشتراك": { fr: "État de l’abonnement", en: "Subscription status" },
  "المستخدمون": { fr: "Utilisateurs", en: "Users" },
  "حالة المؤسسة": { fr: "État de l’organisation", en: "Organization status" },
  "الإجراء": { fr: "Action", en: "Action" },
  "إدارة": { fr: "Gérer", en: "Manage" },
  "حفظ": { fr: "Enregistrer", en: "Save" },
  "جارٍ الحفظ…": { fr: "Enregistrement…", en: "Saving…" },
  "تجريبي": { fr: "Essai", en: "Trial" },
  "أساسي": { fr: "Essentiel", en: "Starter" },
  "نمو": { fr: "Croissance", en: "Growth" },
  "فترة تجريبية": { fr: "Période d’essai", en: "Trialing" },
  "متأخر": { fr: "En retard", en: "Past due" },
  "ملغي": { fr: "Annulé", en: "Canceled" },
  "موقوف": { fr: "Suspendu", en: "Suspended" },
  "مغلق": { fr: "Fermé", en: "Closed" },
  "إضافة فرع": { fr: "Ajouter un établissement", en: "Add branch" },
  "+ إضافة فرع": { fr: "+ Ajouter un établissement", en: "+ Add branch" },
  "اسم الفرع": { fr: "Nom de l’établissement", en: "Branch name" },
  "إضافة": { fr: "Ajouter", en: "Add" },
  "دعوة مستخدم": { fr: "Inviter un utilisateur", en: "Invite user" },
  "+ دعوة مستخدم": { fr: "+ Inviter un utilisateur", en: "+ Invite user" },
  "الدور": { fr: "Rôle", en: "Role" },
  "اختر فرعًا": { fr: "Choisir un établissement", en: "Select a branch" },
  "إرسال الدعوة": { fr: "Envoyer l’invitation", en: "Send invitation" },
  "جارٍ الإرسال…": { fr: "Envoi…", en: "Sending…" },
  "بانتظار القبول": { fr: "En attente d’acceptation", en: "Pending acceptance" },
  "مفعّل": { fr: "Activé", en: "Activated" },
  "عودة": { fr: "Retour", en: "Back" },
  "الحالة": { fr: "État", en: "Status" },
  "الإجراءات": { fr: "Actions", en: "Actions" },
  "النطاق": { fr: "Périmètre", en: "Scope" },
  "الفترة": { fr: "Période", en: "Period" },
  "الاستهلاك / الحد": { fr: "Consommation / seuil", en: "Usage / limit" },
  "إجمالي الفرع": { fr: "Total de l’établissement", en: "Branch total" },
  "يومي": { fr: "Quotidien", en: "Daily" },
  "أسبوعي": { fr: "Hebdomadaire", en: "Weekly" },
  "شهري": { fr: "Mensuel", en: "Monthly" },
  "ضمن الحد": { fr: "Sous le seuil", en: "Within limit" },
  "تم التجاوز": { fr: "Seuil dépassé", en: "Exceeded" },
  "إضافة حد تنبيه": { fr: "Ajouter un seuil d’alerte", en: "Add alert threshold" },
  "إضافة الحد": { fr: "Ajouter le seuil", en: "Add threshold" },
  "حفظ التعديل": { fr: "Enregistrer les modifications", en: "Save changes" },
  "إلغاء التعديل": { fr: "Annuler la modification", en: "Cancel editing" },
  "لا توجد حدود تنبيه مفعّلة": { fr: "Aucun seuil d’alerte actif", en: "No active alert thresholds" },
  "أضف قواعد يومية أو أسبوعية لتتبّع التجاوزات مبكرًا.": { fr: "Ajoutez des règles quotidiennes ou hebdomadaires pour détecter les dépassements.", en: "Add daily or weekly rules to detect excess waste early." },
  "قواعد التنبيه": { fr: "Règles d’alerte", en: "Alert rules" },
  "قواعد التنبيه النشطة": { fr: "Règles d’alerte actives", en: "Active alert rules" },
  "أصناف الطعام": { fr: "Catégories alimentaires", en: "Food categories" },
  "أسباب الهدر": { fr: "Causes du gaspillage", en: "Waste reasons" },
  "اسم الصنف": { fr: "Nom de la catégorie", en: "Category name" },
  "اسم السبب": { fr: "Nom de la cause", en: "Reason name" },
  "اللون": { fr: "Couleur", en: "Color" },
  "لون الصنف": { fr: "Couleur de la catégorie", en: "Category color" },
  "إضافة الصنف": { fr: "Ajouter la catégorie", en: "Add category" },
  "إضافة السبب": { fr: "Ajouter la cause", en: "Add reason" },
  "تفعيل": { fr: "Activer", en: "Activate" },
  "إيقاف": { fr: "Désactiver", en: "Disable" },
  "معطّل": { fr: "Désactivé", en: "Disabled" },
  "متوقف": { fr: "Arrêté", en: "Stopped" },
  "لا توجد أصناف طعام": { fr: "Aucune catégorie alimentaire", en: "No food categories" },
  "لا توجد أسباب هدر": { fr: "Aucune cause de gaspillage", en: "No waste reasons" },
  "أضف أول صنف ليظهر في تطبيق الكيوسك.": { fr: "Ajoutez la première catégorie à afficher sur le kiosque.", en: "Add the first category to display on the kiosk." },
  "أضف أول سبب ليظهر في تطبيق الكيوسك.": { fr: "Ajoutez la première cause à afficher sur le kiosque.", en: "Add the first reason to display on the kiosk." },
  "الفروع المسجلة": { fr: "Établissements enregistrés", en: "Registered branches" },
  "لا توجد فروع": { fr: "Aucun établissement", en: "No branches" },
  "أنشئ أول فرع للمؤسسة لبدء ربط الأجهزة والقوائم.": { fr: "Créez le premier établissement pour connecter les appareils et les listes.", en: "Create the first branch to start connecting devices and lists." },
  "اسم الجهاز": { fr: "Nom de l’appareil", en: "Device name" },
  "إضافة جهاز كيوسك": { fr: "Ajouter un appareil kiosque", en: "Add kiosk device" },
  "إنشاء رمز الاقتران": { fr: "Créer le code d’association", en: "Create pairing code" },
  "تعطيل الجهاز": { fr: "Désactiver l’appareil", en: "Disable device" },
  "لا توجد أجهزة مسجلة": { fr: "Aucun appareil enregistré", en: "No registered devices" },
  "أنشئ جهازًا أعلاه ثم أدخل رمز التفعيل في الكيوسك.": { fr: "Créez un appareil puis saisissez le code d’activation sur le kiosque.", en: "Create a device above, then enter its activation code on the kiosk." },
  "رمز التفعيل لمرة واحدة": { fr: "Code d’activation à usage unique", en: "One-time activation code" },
  "آخر اتصال": { fr: "Dernière connexion", en: "Last seen" },
  "ملخص سريع": { fr: "Résumé rapide", en: "Quick summary" },
  "آخر النشاطات": { fr: "Activité récente", en: "Recent activity" },
  "أحدث عمليات الهدر": { fr: "Derniers événements de gaspillage", en: "Latest waste events" },
  "الهدر حسب الصنف": { fr: "Gaspillage par catégorie", en: "Waste by category" },
  "لا توجد بيانات كافية للرسم بعد": { fr: "Pas encore assez de données pour le graphique", en: "Not enough data to chart yet" },
  "كل البيانات": { fr: "Toutes les données", en: "All data" },
  "جاري تحميل البيانات": { fr: "Chargement des données", en: "Loading data" },
  "جاري تحميل الرسم…": { fr: "Chargement du graphique…", en: "Loading chart…" },
  "جاري تحميل تفاصيل المؤسسة…": { fr: "Chargement de l’organisation…", en: "Loading organization details…" },
  "ملف المؤسسة": { fr: "Fiche de l’organisation", en: "Organization profile" },
  "العودة إلى المؤسسات": { fr: "Retour aux organisations", en: "Back to organizations" },
  "تعذر فتح المؤسسة": { fr: "Impossible d’ouvrir l’organisation", en: "Could not open organization" },
  "التشغيل": { fr: "Exploitation", en: "Operations" },
  "الوصول": { fr: "Accès", en: "Access" },
  "لا يوجد مستخدمون": { fr: "Aucun utilisateur", en: "No users" },
  "ادعُ مالك المؤسسة أو مدير الفرع للبدء.": { fr: "Invitez le propriétaire ou un responsable d’établissement.", en: "Invite the organization owner or a branch manager to get started." },
  "مؤسسة": { fr: "organisation", en: "organization" },
  "مستخدمين نشطين": { fr: "utilisateurs actifs", en: "active users" },
  "اشتراكات نشطة": { fr: "abonnements actifs", en: "active subscriptions" },
  "في الفترة التجريبية": { fr: "en période d’essai", en: "in trial" },
  "التحليلات": { fr: "Analyses", en: "Analytics" },
  "الوجبات والتكلفة": { fr: "Repas et coûts", en: "Meals & costs" },
  "الوزن والتكلفة والهدر لكل وجبة ضمن نطاق زمني مرن": { fr: "Poids, coût et gaspillage par repas sur une période flexible", en: "Weight, cost and waste per meal over a flexible period" },
  "إدخال عدد الوجبات وتكاليف الأصناف للمؤشرات التشغيلية": { fr: "Saisie des repas et coûts pour les indicateurs opérationnels", en: "Enter meal counts and category costs for operational metrics" },
  "عدد الوجبات": { fr: "Nombre de repas", en: "Meal count" },
  "التشغيل اليومي": { fr: "Exploitation quotidienne", en: "Daily operations" },
  "القيمة المالية": { fr: "Valeur financière", en: "Financial value" },
  "تكلفة الأصناف": { fr: "Coût des catégories", en: "Category costs" },
  "التاريخ": { fr: "Date", en: "Date" },
  "الوجبات": { fr: "Repas", en: "Meals" },
  "حفظ العدد": { fr: "Enregistrer", en: "Save count" },
  "تحديث العدد": { fr: "Mettre à jour", en: "Update count" },
  "الفلاتر": { fr: "Filtres", en: "Filters" },
  "نطاق التحليل": { fr: "Périmètre d’analyse", en: "Analysis scope" },
  "من": { fr: "Du", en: "From" },
  "إلى": { fr: "Au", en: "To" },
  "كل الأصناف": { fr: "Toutes les catégories", en: "All categories" },
  "كل الأسباب": { fr: "Toutes les causes", en: "All reasons" },
  "تكلفة الهدر": { fr: "Coût du gaspillage", en: "Waste cost" },
  "الهدر لكل وجبة": { fr: "Gaspillage par repas", en: "Waste per meal" },
  "جودة بيانات الوجبات": { fr: "Qualité des données repas", en: "Meal data quality" },
  "المتوسط اليومي": { fr: "Moyenne quotidienne", en: "Daily average" },
  "المتوسط الأسبوعي": { fr: "Moyenne hebdomadaire", en: "Weekly average" },
  "التكلفة لكل وجبة": { fr: "Coût par repas", en: "Cost per meal" },
  "الأصناف الأكثر هدراً": { fr: "Catégories les plus gaspillées", en: "Most wasted categories" },
  "أسباب الهدر الأكثر تأثيراً": { fr: "Causes principales du gaspillage", en: "Top waste reasons" },
  "التطور اليومي": { fr: "Évolution quotidienne", en: "Daily trend" },
  "الهدر والتكلفة حسب اليوم": { fr: "Gaspillage et coût par jour", en: "Waste and cost by day" },
  "التكلفة المقدرة": { fr: "Coût estimé", en: "Estimated cost" },
  "جاري حساب المؤشرات…": { fr: "Calcul des indicateurs…", en: "Calculating metrics…" },
  "الإعدادات": { fr: "Paramètres", en: "Settings" },
  "تفضيلات العرض ومعلومات مساحة العمل والحساب": { fr: "Préférences d’affichage, espace de travail et compte", en: "Display preferences, workspace and account information" },
  "تفضيلات الواجهة": { fr: "Préférences d’interface", en: "Interface preferences" },
  "العرض واللغة": { fr: "Affichage et langue", en: "Display & language" },
  "لغة الواجهة": { fr: "Langue de l’interface", en: "Interface language" },
  "يمكن تغيير اللغة في أي وقت، وتحفظ على هذا الجهاز.": { fr: "La langue peut être modifiée à tout moment et est enregistrée sur cet appareil.", en: "The language can be changed at any time and is saved on this device." },
  "صيغة الأرقام": { fr: "Format des nombres", en: "Number format" },
  "تستخدم جميع الشاشات الأرقام الإنجليزية لتسهيل قراءة الأوزان والتكاليف.": { fr: "Tous les écrans utilisent les chiffres latins pour faciliter la lecture des poids et des coûts.", en: "All screens use English digits to make weights and costs easier to read." },
  "اتجاه الواجهة": { fr: "Direction de l’interface", en: "Interface direction" },
  "يتغير تلقائياً حسب اللغة المختارة.": { fr: "S’adapte automatiquement à la langue sélectionnée.", en: "Changes automatically based on the selected language." },
  "تلقائي": { fr: "Automatique", en: "Automatic" },
  "الحساب": { fr: "Compte", en: "Account" },
  "معلومات الوصول": { fr: "Informations d’accès", en: "Access information" },
  "نطاق البيانات": { fr: "Périmètre des données", en: "Data scope" },
  "جميع الفروع": { fr: "Tous les établissements", en: "All branches" },
  "الفرع المحدد": { fr: "Établissement attribué", en: "Assigned branch" },
  "حالة المزامنة": { fr: "État de synchronisation", en: "Sync status" },
  "تحديث لوحة التحكم": { fr: "Actualisation du tableau de bord", en: "Dashboard refresh" },
  "الأصناف في الكيوسك": { fr: "Catégories du kiosque", en: "Kiosk categories" },
  "السجلات دون إنترنت": { fr: "Enregistrements hors ligne", en: "Offline records" },
  "كل 15 ثانية": { fr: "Toutes les 15 secondes", en: "Every 15 seconds" },
  "تُرسل عند عودة الاتصال": { fr: "Envoyés au retour de la connexion", en: "Sent when connection returns" },
  "تُحفظ تفضيلات اللغة محلياً على الجهاز، بينما تبقى بيانات المؤسسة محمية ضمن صلاحيات الحساب.": { fr: "La langue est enregistrée localement sur l’appareil, tandis que les données de l’organisation restent protégées par les autorisations du compte.", en: "Language preferences are saved locally on the device, while organization data remains protected by account permissions." },
  "كجم": { fr: "kg", en: "kg" },
};

function englishNumberSymbols(value: string) {
  const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
  return value
    .replace(/[٠-٩]/g, (digit) => String(arabicDigits.indexOf(digit)))
    .replaceAll("٬", ",")
    .replaceAll("٫", ".")
    .replaceAll("٪", "%")
    .replaceAll("؜", "");
}

function initialLanguage(): Language {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === "fr" || saved === "en" || saved === "ar" ? saved : "ar";
}

function translateNodeText(value: string, language: Language) {
  if (language === "ar") return value;
  const trimmed = value.trim();
  const translated = translations[trimmed]?.[language];
  if (translated) return value.replace(trimmed, translated);
  return Object.entries(translations)
    .sort(([a], [b]) => b.length - a.length)
    .reduce((result, [ar, target]) => result.replaceAll(ar, target[language]), value);
}

const reverse = new Map<string, string>();
Object.entries(translations).forEach(([ar, values]) => {
  reverse.set(values.fr, ar);
  reverse.set(values.en, ar);
});

function sourceText(value: string) {
  const trimmed = value.trim();
  const ar = reverse.get(trimmed);
  if (ar) return value.replace(trimmed, ar);
  return [...reverse.entries()]
    .sort(([a], [b]) => b.length - a.length)
    .reduce((result, [translated, source]) => result.replaceAll(translated, source), value);
}

function translateTree(root: Node, language: Language) {
  if (root.nodeType === Node.TEXT_NODE) {
    const original = sourceText(root.nodeValue ?? "");
    const next = englishNumberSymbols(language === "ar" ? original : translateNodeText(original, language));
    if (root.nodeValue !== next) root.nodeValue = next;
    return;
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node.parentElement?.closest("script, style")) continue;
    const original = sourceText(node.nodeValue ?? "");
    const next = englishNumberSymbols(language === "ar" ? original : translateNodeText(original, language));
    if (node.nodeValue !== next) node.nodeValue = next;
  }
  if (root instanceof Element) {
    [root, ...root.querySelectorAll("[placeholder], [aria-label], [title]")].forEach((element) => {
      ["placeholder", "aria-label", "title"].forEach((attribute) => {
        const value = element.getAttribute(attribute);
        if (!value) return;
        const original = sourceText(value);
        element.setAttribute(attribute, englishNumberSymbols(language === "ar" ? original : translateNodeText(original, language)));
      });
    });
  }
}

type I18nValue = { language: Language; setLanguage: (language: Language) => void };
const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(initialLanguage);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
    translateTree(document.body, language);
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "characterData") translateTree(mutation.target, language);
        mutation.addedNodes.forEach((node) => translateTree(node, language));
      });
    });
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, [language]);

  const value = useMemo(() => ({ language, setLanguage }), [language]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// oxlint-disable-next-line react/only-export-components -- context hook belongs with its provider.
export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { language, setLanguage } = useI18n();
  return <label className={`language-switcher ${compact ? "compact" : ""}`}>
    <span>{language === "ar" ? "اللغة" : language === "fr" ? "Langue" : "Language"}</span>
    <select value={language} onChange={(event) => setLanguage(event.target.value as Language)} aria-label="Language">
      <option value="ar">العربية</option>
      <option value="fr">Français</option>
      <option value="en">English</option>
    </select>
  </label>;
}
