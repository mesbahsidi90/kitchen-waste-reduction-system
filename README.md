# Kitzon — IoT Kitchen Waste Reduction System

نظام لتسجيل وتحليل هدر الطعام في المطابخ التجارية. يتكون المستودع من API مركزي، وتطبيق Kiosk للعامل، ولوحة تحليلات. يدعم التشغيل المحلي السريع عبر SQLite أو التشغيل متعدد المطاعم والفروع عبر Supabase.

## بيئة التجربة المنشورة

- لوحة التحكم: <https://kitzon-dashboard.pages.dev>
- تطبيق الكيوسك: <https://kitzon-kiosk.pages.dev>
- حالة API: <https://kitzon-api.onrender.com/health/ready>

## المتطلبات

- Node.js 22 أو أحدث
- npm 10 أو أحدث
- Docker Desktop عند تشغيل Supabase محلياً

## التشغيل المحلي

```bash
npm install
npm run dev:api
```

ثم شغّل، في نافذتين منفصلتين:

```bash
npm run dev:kiosk
npm run dev:dashboard
```

الإعدادات الافتراضية تستخدم SQLite ولا تتطلب تسجيل دخول. انسخ `.env.example` أو ملفات `.env.example` داخل التطبيقات عند الحاجة إلى تغيير عنوان API أو معرّف الميزان أو نطاقات CORS.

## تشغيل Supabase

1. شغّل البيئة المحلية وطبّق migrations:

```bash
npm run supabase:start
npm run supabase:reset
npm run supabase:test
```

2. انسخ القيم التي يعرضها `supabase start` إلى `.env`، واجعل `DATA_PROVIDER=supabase`. ضع عنوان المشروع والمفتاح القابل للنشر أيضاً في `dashboard/.env` مع `VITE_AUTH_MODE=supabase`. اضبط `AUTH_INVITE_REDIRECT_URL` على رابط لوحة التحكم متبوعاً بـ `/accept-invite`.

3. أنشئ مستخدماً في Supabase Auth، ثم هيّئ أول مطعم وفرع وجهاز باستخدام UUID ذلك المستخدم:

```bash
npm run supabase:bootstrap -- --user-id <auth-user-uuid> --organization-name "مطعمي" --organization-slug my-restaurant --branch-name "الفرع الرئيسي" --device-code SCALE_01
```

يعرض السكربت رمز جهاز للاختبارات القديمة. في التشغيل المعتاد ينشئ مالك المؤسسة أو مدير الفرع جهازًا من صفحة «الأجهزة والموازين»، ثم يُدخل رمز الاقتران المؤقت في الكيوسك عند أول تشغيل. لا تضع رمز جهاز في متغير `VITE_DEVICE_TOKEN` عند نشر التطبيق للعامة. المفتاح `SUPABASE_SECRET_KEY` خاص بالخادم فقط، ويُمنع وضعه في تطبيقات React أو في Git.

يحفظ الكيوسك عمليات الهدر محليًا عند انقطاع الإنترنت أو تعذر الوصول المؤقت إلى الخادم، ثم يرسلها تلقائيًا وبالترتيب عند عودة الاتصال. يعتمد الخادم على `client_event_id` لمنع تكرار العملية أثناء إعادة المحاولة، ويعرض الكيوسك دائمًا عدد العمليات التي ما زالت معلّقة.

للربط بمشروع Supabase مستضاف، استخدم `npx supabase login` ثم `npx supabase link --project-ref <project-ref>` وطبّق migrations عبر `npx supabase db push`.

### دعوات المستخدمين

يُرسل الخادم الدعوات من بيئة موثوقة باستخدام مفتاح Supabase السري، ويوجّه الرابط إلى صفحة `/accept-invite` في لوحة التحكم. بعد فتح الرابط يعيّن المستخدم كلمة مرور قوية، ثم يفعّل الخادم عضويته المعلّقة فقط. يجب إضافة قيمة `AUTH_INVITE_REDIRECT_URL` نفسها إلى قائمة **Authentication > URL Configuration > Redirect URLs** في مشروع Supabase. في الإنتاج استخدم رابط HTTPS دقيقاً، واضبط SMTP مخصصاً لإرسال الدعوات إلى العملاء خارج فريق مشروع Supabase.

### نقل بيانات SQLite الحالية

بعد تهيئة المطعم والجهاز، نفّذ:

```bash
npm run supabase:migrate-sqlite -- --organization-id <uuid> --branch-id <uuid> --device-id <uuid> --database ./backend/data/database.sqlite
```

العملية قابلة لإعادة التشغيل دون تكرار سجلات الهدر. ولحماية دقة البيانات، تتوقف إذا وجدت معرف ميزان قديم لا يطابق الجهاز المستهدف.

## التحقق

```bash
npm run check
```

يشغّل هذا الأمر فحص الكود والاختبارات وبناء التطبيقات الثلاثة.

تتطلب اختبارات عزل المستأجرين وقواعد RLS تشغيل Supabase المحلي:

```bash
npm run supabase:test
npm run supabase:lint
```

## نقاط API

- `GET /health/live`
- `GET /health/ready`
- `POST /api/v1/waste-logs`
- `GET /api/v1/waste-logs?limit=50&offset=0`
- `GET /api/v1/analytics/summary`
- `POST /api/v1/devices` (مالك المؤسسة أو مدير الفرع)
- `POST /api/v1/devices/claim` (اقتران الكيوسك لمرة واحدة)
- `PATCH /api/v1/devices/:deviceId/disable` (مالك المؤسسة أو مدير الفرع)

عند `DATA_PROVIDER=supabase` تتطلب عمليات القراءة Bearer token صالحاً من Supabase Auth، وتتطلب عمليات التسجيل من الكشك رمز جهاز مستقل بصيغة `Device <token>`. تطبّق قاعدة البيانات عزل المطاعم والفروع بواسطة RLS، ولا يُرسل المفتاح السري إلى المتصفح.

قاعدة SQLite المحلية محفوظة افتراضياً في `backend/data/database.sqlite`. عند اكتشاف جدول MVP القديم، ينقل التطبيق السجلات الصالحة تلقائياً إلى المخطط المحلي الذي يخزن الوزن بالجرام.

## نموذج Supabase

يتضمن المخطط Organizations وBranches وMemberships وأدوار `organization_owner` و`branch_manager` و`worker`، إضافة إلى الأجهزة، الأصناف، الأسباب، سجلات الهدر، حدود التنبيه، وسجل التدقيق. يحصل كل فرع جديد تلقائيًا على قائمة أولية من خمسة أسباب هدر، ويمكن لمالك المؤسسة أو مدير الفرع إدارة الأصناف والأسباب وحدود التنبيه من لوحة التحكم. تُحسب حالة الحدود وفق اليوم أو الأسبوع أو الشهر في المنطقة الزمنية للفرع، وتظهر التجاوزات في النظرة العامة. توجد اختبارات pgTAP تمنع وصول مستخدم إلى بيانات مستأجر آخر وتتحقق من عدم كشف بصمة اعتماد الجهاز.
