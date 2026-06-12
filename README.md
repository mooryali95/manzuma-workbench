### v4.8.0 ✅
- **شجرة متكيفة بثلاثة أطوار**: 🖥 مخطط هيكلي بموصلات SVG تُرسم ديناميكياً من المواضع الفعلية (لا تنكسر مع أي أبعاد) + تكبير/تصغير وملاءمة تلقائية · ▦ شبكة بطاقات للآيباد · ☰ أكورديون للجوال — التبديل تلقائي عبر ResizeObserver أو يدوي بأزرار محفوظة الحالة.
- **صفحات مخصصة لكل مستخدم**: `allowed_views` + RPC `wb_set_user_views` — المالك يحدد من نافذة المستخدمين ما يراه كل حساب (كل الصفحات / الشجرة فقط / الشجرة والمحافظ / المحافظ فقط / الورشة فقط)، الموجّه يحجب ويعيد التوجيه والروابط تُفلتر. (تحكم بالعرض والتنقل — أمان البيانات يبقى بالأدوار في RLS).

# منظومة · الورشة الاستراتيجية

### v4.7.0 ✅
- إعادة التسمية إلى «المجلس التنفيذي» + فوتر «Powered by» (فارغ، جاهز للتعبئة).
- العمود الجانبي في الورشة: زر طي/توسيع (الحالة محفوظة) + قسم جديد «المشاريع بلا تشكيل» قابل للسحب نحو التشكيلات.
- تحويل النوع منتج ⇄ مبادرة ⇄ مشروع من نافذة تعديل أي عنصر (دالة مركزية `convertItemKind` مع تسجيل في التدقيق؛ المراحل تبقى محفوظة).



> Strategic Workbench — تصنيف المحافظ، إدارة التشكيلات، Gantt احترافي بـ RTL  
> **طبقة مستقلة بالكامل عن ClickUp** — تسجيل مباشر في Supabase عبر جداول `wb_*` الخاصة بها، مع إمكانية ربط يدوي بمشاريع ClickUp لاحقاً عبر `linked_bot_entity_id`

---

## ⚡ نظرة سريعة

| | |
|---|---|
| **Backend** | Supabase (Manzuma Dashboard project) |
| **Hosting** | Cloudflare Pages (متوافق مع AWS Amplify أيضاً) |
| **Build step** | لا يوجد — ES Modules مباشرة |
| **Language** | JavaScript ES2022 vanilla |
| **Style** | Tajawal · RTL · Light theme |
| **API client** | `@supabase/supabase-js@2.45.4` من esm.sh CDN |

---

## 🗂 بنية المشروع

```
manzuma/
├── index.html                  ← الصفحة الرئيسية (Portfolios)
├── workbench.html              ← ورشة الهيكل
├── config.js                   ← مفاتيح Supabase + اختيار الـ backend
│
├── css/
│   ├── tokens.css              ← متغيرات التصميم (لون، خط، مسافات)
│   ├── base.css                ← reset + body + RTL + loading
│   ├── components.css          ← أزرار، بطاقات، modals، toasts
│   ├── views.css               ← أنماط Kanban + Portfolio Detail + Workbench
│   └── gantt.css               ← Gantt Chart
│
├── js/
│   ├── app.js                  ← Entry + Router (hash-based)
│   ├── store.js                ← State + actions + audit
│   ├── schema.js               ← Schema + offline migrations
│   ├── models.js               ← Domain helpers
│   │
│   ├── data/
│   │   ├── adapter.js          ← Interface المشترك
│   │   ├── local-adapter.js    ← localStorage (احتياطي)
│   │   ├── supabase-adapter.js ← Supabase (الافتراضي)
│   │   └── clickup-adapter.js  ← stub للتكامل المستقبلي
│   │
│   ├── components/
│   │   ├── modal.js            ← Form modal + confirm dialog
│   │   ├── toast.js            ← Toast notifications
│   │   ├── drag-drop.js        ← HTML5 DnD utilities
│   │   ├── gantt.js            ← Gantt Chart RTL
│   │   └── filter-bar.js       ← شريط فلترة موحد
│   │
│   └── views/
│       ├── portfolios.js       ← Kanban المحافظ
│       ├── portfolio.js        ← عرض محفظة واحدة (مع فلترة)
│       ├── project.js          ← عرض مشروع + Gantt
│       └── workbench.js        ← Formations + Pool
│
├── supabase/
│   └── schema.sql              ← Canonical schema reference
│
└── README.md
```

---

## 🧭 المسارات (Routes)

التطبيق single-page بـ hash-based routing:

| المسار | الصفحة |
|---|---|
| `#portfolios` | Kanban بـ 4 أعمدة (التأسيس · النمو · 0/1 · غير مصنف) |
| `#portfolio?pf=ID` | عرض تفصيلي لمحفظة واحدة مع كل مفاهيمها |
| `#project?id=ID` | تفاصيل مشروع/مبادرة مع Gantt و مراحل |
| `#workbench[?concept=ID]` | ورشة التشكيلات و الأفراد و الكيانات |

---

## 🚀 النشر على Cloudflare Pages

### الخطوات

```bash
# 1) أنشئ ريبو GitHub جديد
cd manzuma
git init
git add .
git commit -m "Initial workbench"
git remote add origin https://github.com/<USERNAME>/manzuma-workbench.git
git push -u origin main

# 2) في لوحة Cloudflare Pages:
#    - Connect to Git
#    - اختر الريبو
#    - Build command: (اتركه فارغاً)
#    - Build output directory: /
#    - حفظ
```

ستحصل على رابط مباشر مثل `https://manzuma-workbench.pages.dev`.

> 💡 **ملاحظة:** هذا الـ deploy ساكن (static) بالكامل — لا backend ولا build step. كل الـ logic في المتصفح، والـ DB هو Supabase مباشرة.

---

## 🔐 الأمان

### الحالة الحالية (تطوير)
- جميع الـ tables الجديدة (`wb_*`) لها RLS مفعّل
- السياسات الحالية permissive — يمكن للـ anon key الكتابة والقراءة
- مناسب للتطوير فقط

### قبل النشر للعموم (يجب)
```sql
-- مثال: قراءة فقط للـ anon، الكتابة محصورة بـ authenticated users
DROP POLICY "wb_portfolios_all" ON wb_portfolios;
CREATE POLICY "wb_portfolios_read"  ON wb_portfolios FOR SELECT USING (true);
CREATE POLICY "wb_portfolios_write" ON wb_portfolios FOR ALL USING (auth.role() = 'authenticated');
```

أو استخدم Supabase Auth + service role للـ admin panel.

---

## 🧩 طبقة البيانات (Adapter Pattern)

```
Views → Store → DataAdapter ← interface
                    │
        ┌───────────┼───────────┐
        │           │           │
   LocalAdapter  SupabaseAdapter ClickUpAdapter (stub)
   (offline)     (primary)      (future)
```

التبديل بين الـ backends بتغيير سطر واحد في `config.js`:

```js
export const BACKEND = 'supabase';  // أو 'local'
```

---

## 📊 الجداول في Supabase

تم إنشاؤها بواسطة migration `create_workbench_layer`.

| الجدول | الغرض | الصفوف (Seed) |
|---|---|---|
| `wb_portfolios` | المحافظ الـ 3 | 3 |
| `wb_concepts` | **المفاهيم — CRUD كامل** | 5 |
| `wb_items` | **منتج · مبادرة · مشروع (جدول واحد مُنوَّع)** | 28 |
| `wb_individuals` | الأفراد | 6 |
| `wb_entities` | الكيانات | 7 |
| `wb_formations` | التشكيلات | 6 |
| `wb_formation_members` | M:N أفراد↔تشكيل | 9 |
| `wb_formation_entities` | M:N كيانات↔تشكيل | 7 |
| `wb_project_phases` | مراحل المشاريع (Gantt) | 4 |
| `wb_audit_log` | سجل التغييرات | (تلقائي) |
| `wb_baselines` | نقاط Baseline | (يدوي) |

### v4.6.0 — الشجرة كمخطط هيكلي (Org Chart) ✅
أُعيد بناء تبويب 🌳 على نمط لوحة منظومة: عقدة جذر داكنة بالإجماليات، أعمدة المحافظ بألوانها الفعلية من قاعدة البيانات مع خطوط تفرع، بطاقات المفاهيم (نسبة كبيرة + شريط تقدم + عدّاد منجز/إجمالي + شارة متأخرة بحد أحمر + نقاط حالة لكل عنصر)، والنقر على البطاقة يفتح عناصرها للتنقل المباشر. بطاقة «↩ عناصر واردة» للمحفظة الفعلية، وبحث يفتح ويظلّل.

### المرحلة 5 — الشجرة والمحفظة الفعلية (v4.5.0) ✅
- **تبويب 🌳 الشجرة**: الصورة الكلية الهرمية (محفظة ← مفهوم ← عنصر ← مراحل) مع تجميع تصاعدي على كل عقدة (أعداد، تقدم، نقاط حالة، متأخرات)، بحث فوري يفتح ويظلّل، توسيع/طي الكل، ونقر للتنقل.
- **المحفظة الفعلية (النموذج ب)**: `wb_items.portfolio_override_id` — العنصر يبقى ابن مفهومه ويمكن نقله وحده لمرحلة نضج مختلفة. يظهر مرة واحدة في محفظته الفعلية (قسم «↩ عناصر واردة») وسطر شبحي في مفهومه الأم — بلا ازدواج في العدّ. شارة 📍 على بطاقته ونقله يُسجَّل في سجل التدقيق.

### المرحلة 4 — المصادقة والأدوار (v4.4.0) ✅
- **Supabase Auth**: شاشة دخول/تسجيل عربية، جلسة دائمة، وتسجيل خروج. أول مستخدم يسجّل يصبح **owner** تلقائياً (Trigger)، ومن بعده **pending** حتى التفعيل.
- **الأدوار**: owner (كل شيء + إدارة المستخدمين) · editor (قراءة/كتابة) · viewer (قراءة فقط) · pending.
- **RLS محكم**: أُسقطت السياسات المفتوحة — anon لا يرى شيئاً، القراءة للأدوار الفعّالة، الكتابة لـ owner/editor فقط، وسجل التدقيق إضافة-فقط (لا تعديل ولا حذف). دوال ClickUp أصبحت للمصادَقين فقط.
- **إدارة المستخدمين داخل التطبيق**: نافذة «👥 المستخدمون» للمالك (RPC: `wb_list_users` / `wb_set_user_role`) مع حماية «آخر مالك» وتسجيل تغيير الأدوار في سجل التدقيق.
- **واجهة واعية بالدور**: شريحة المستخدم في الترويسة، إخفاء أدوات الكتابة للمشاهد، حارس مركزي في Store، و actor السجل = بريد المستخدم الفعلي.
- ⚠️ **ملاحظة تشغيلية**: إن كان «Confirm email» مفعّلاً في إعدادات Supabase Auth فسيصل رابط تأكيد قبل أول دخول — يمكن تعطيله من Dashboard ← Authentication ← Providers ← Email.

### المرحلة 3 — v4.3.0 ✅
- **مزامنة حية (Realtime)**: أي تعديل من جهاز آخر ينعكس تلقائياً مع إشعار «تم تحديث البيانات» — مع قمع صدى التعديلات المحلية (نافذة 2.5 ثانية).
- **تبعيات المراحل**: حقل «تعتمد على» في نافذة المرحلة (مع منع الحلقات تلقائياً)، أسهم متقطعة في Gantt تراعي اتجاه RTL، تنبيه عند تعارض التواريخ، وعرض «⛓ بعد: …» في قائمة المراحل.
- **نسخ احتياطي JSON**: زر تصدير يحفظ الحالة كاملة كملف، وزر استيراد مع معاينة الأعداد قبل الدمج (Upsert بالمعرّف — لا حذف).

### المرحلة 2 — جسر ClickUp (v4.2.0) ✅
- **الربط اليدوي**: من نافذة تعديل أي مفهوم/منتج/مبادرة/مشروع — قائمة اختيار تعرض كل كيانات ClickUp النشطة وتحفظ في `linked_bot_entity_id` (مع تسجيل `clickup_link` / `clickup_unlink` في سجل التغييرات).
- **بيانات حية**: صفحة المشروع تعرض لوحة إحصاءات (إجمالي · مفتوحة · جارية · متأخرة · مغلقة) من آخر `pm_snapshot` — قراءة فقط.
- **مؤشرات**: شارة 🔗 على البطاقات والمفاهيم المرتبطة + فلتر «مرتبط / غير مرتبط» داخل المحفظة.
- **الأمان**: `bot_entities` و `pm_snapshots` يبقيان مقفلين بـ RLS بالكامل — الوصول حصراً عبر دالتي `SECURITY DEFINER`:
  `wb_list_clickup_entities()` و `wb_clickup_list_stats()` (EXECUTE فقط لـ anon). لا كتابة على طبقة ClickUp إطلاقاً.

### الفصل الكامل عن ClickUp
- جداول طبقة ClickUp (`bot_entities`, `pm_snapshots`, `pm_lists_config`, `task_activity`, `maturity_history`, وجداول البوت) **لا تُقرأ ولا تُكتب** من الورشة — أُزيلت كل الأعمدة المضافة سابقاً وعادت لأصلها.
- نقطة الاتصال الوحيدة المستقبلية: `linked_bot_entity_id` (عمود اختياري في `wb_concepts` و `wb_items`) لربط عنصر من الورشة بمشروع ClickUp **يدوياً عبر قائمة اختيار** — المرحلة الثانية.

---

## 🧠 المفاهيم الأساسية

### Project vs Initiative
- **Initiative (مبادرة):** فكرة لم تبدأ — بدون مراحل ولا Gantt
- **Project (مشروع):** بدأ التنفيذ — مراحل + جدول زمني + Gantt

التحويل ↔ بزر واحد. عند العودة لمبادرة، المراحل **تُحفظ في DB** ولا تُحذف.

### Phase Statuses
- `not_started` — لم تبدأ (رمادي، حدود متقطعة)
- `in_progress` — قيد التنفيذ (ذهبي، مع progress bar)
- `completed` — مكتمل (أخضر)
- `blocked` — متعثر (أحمر)

### Gantt Chart RTL
المحور الزمني يقرأ **يميناً → يساراً**:
- يناير على اليمين
- ديسمبر على اليسار
- شريط «اليوم» عمودي يعبر كل المراحل
- progress fill داخل الـ bar للمراحل الجارية

---

## 🛣 خارطة الطريق

### تم بناؤه ✅
- Kanban المحافظ بـ drag-and-drop
- Portfolio detail بـ filtering
- Project detail + Gantt احترافي
- Workbench: Formations + Pool
- Baseline + Audit Log
- Initiative ↔ Project toggle
- Supabase adapter كامل
- Local adapter كاحتياطي

### مرحلة 2 (قريباً) 🔄
- Supabase realtime subscriptions (تحديث تلقائي بين أكثر من جهاز)
- Auth & multi-user
- Phase dependencies (تسلسل المراحل)
- استيراد/تصدير JSON

### مرحلة 3 (لاحقاً) 📅
- ClickUp adapter كامل (الـ stub موجود الآن)
- Webhooks: ClickUp → Cloudflare Worker → Supabase
- Phase ↔ ClickUp Task auto-sync
- Custom statuses mapping

---

## 🐛 استكشاف الأخطاء

### «فشل الاتصال بـ Supabase»
- تأكد من الإنترنت
- افحص `config.js` — `SUPABASE.url` و `SUPABASE.anon`
- التطبيق سيتحول تلقائياً للوضع المحلي (`localStorage`)

### الـ Gantt لا يظهر
- المشروع يجب أن يكون من نوع «مشروع» (وليس «مبادرة»)
- يجب أن يكون له مرحلة واحدة على الأقل بتواريخ صحيحة

### تغييرات لا تُحفظ في DB
- افحص الـ console — رسائل خطأ من Supabase
- تأكد أن RLS policies مفعّلة وتسمح بالـ write

---

## 🤝 المساهمة

هذا الريبو لمنظومة — Baseerh الورشة الاستراتيجية.  
أي تطوير لاحق يتم على branch منفصل ثم merge للـ main.

---

**صُنع بـ ❤️ لـ منظومة · بصيرة · 2026**
