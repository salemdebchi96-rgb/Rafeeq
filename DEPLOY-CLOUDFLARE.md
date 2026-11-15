# النشر على workers.dev (Cloudflare) من الهاتف

## 1) ارفع الملفات إلى GitHub
- فُكّ ضغط الملف، ثم أنشئ مستودعًا **Private** باسم `rafeeq`، وارفع **كل الملفات** دفعة واحدة (Add file → Upload files).

## 2) أنشئ قاعدة البيانات
1. ادخل إلى dash.cloudflare.com وأنشئ حسابًا مجانيًا.
2. من القائمة: **Storage & databases → D1 → Create database**، واكتب الاسم `rafeeq`.
3. انسخ **Database ID**.
4. في GitHub افتح الملف `wrangler.toml` واضغط أيقونة القلم، ثم:
   - ضع الـ ID مكان `PUT-YOUR-D1-DATABASE-ID-HERE`
   - غيّر `ADMIN_EMAIL` إلى بريدك
   - ثم اضغط **Commit changes**.

## 3) انشر الموقع
1. في Cloudflare: **Workers & Pages → Create → Import a repository** واختر `rafeeq`.
2. اترك الإعدادات كما هي (أمر النشر `npx wrangler deploy`) واضغط **Deploy**.
3. ينتهي بعنوان مثل `https://rafeeq.اسمك.workers.dev`. افتحه وجرّب `/healthz` فتجد كلمة ok.

## 4) أضف المفاتيح السرية
في Worker → **Settings → Variables and Secrets → Add** (النوع Secret):
- `JWT_SECRET`: أي نص طويل عشوائي (٤٠ حرفًا فأكثر)
- `ANTHROPIC_API_KEY`: من console.anthropic.com
- `RESEND_API_KEY`: من resend.com (للبريد). لإرسال الرسائل لأي مستخدم عليك توثيق نطاق باسمك وتغيير `MAIL_FROM`.
- `LS_API_KEY` و`LS_WEBHOOK_SECRET`: من Lemon Squeezy

ثم أعد النشر (Deployments → Retry) ليأخذ التعديلات.

## 5) الدفع (Lemon Squeezy)
- أنشئ منتج اشتراك بخطتين (٩٫٩٩$ شهريًا و٧٩$ سنويًا).
- ضع `LS_STORE_ID` و`LS_VARIANT_MONTHLY` و`LS_VARIANT_YEARLY` في `wrangler.toml`.
- Webhooks: العنوان `https://موقعك.workers.dev/api/billing/webhook` والأحداث: `subscription_created` و`subscription_updated` و`subscription_resumed` و`subscription_expired`، وسرّ التوقيع هو نفسه `LS_WEBHOOK_SECRET`.
- جرّب في **Test mode** أولًا.

## تنبيهات مهمة
- **الخطة المجانية:** حد المعالج فيها ١٠ ملّي ثانية للطلب، وتشفير كلمة المرور قد يتجاوزه أحيانًا فيظهر خطأ عند التسجيل أو الدخول. الحل المضمون هو **Workers Paid** (حوالي ٥ دولارات شهريًا). جرّب المجانية أولًا.
- **حماية الدخول:** فعّل قاعدة **Rate limiting** من Cloudflare على المسارين `/api/login` و`/api/register` لمنع تخمين كلمات المرور.
- لا تنشر مفاتيحك في GitHub ولا تعطها لأحد.
