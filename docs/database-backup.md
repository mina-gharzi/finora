# راهنمای پشتیبان‌گیری و بازیابی PostgreSQL (Finora)

این راهنما بر پایه تنظیمات فعلی پروژه نوشته شده است:

- سرویس `db` با تصویر `postgres:16-alpine`
- نام کانتینر: `finora-postgres`
- پورت: `127.0.0.1:15432:5432` (فقط روی loopback)
- حجم داده: حجم خارجی `finora_pgdata` (`external=true`)
- مقادیر حساس از `apps/web/.env` خوانده می‌شوند (کامیت نمی‌شود)

> **توجه:** هیچ‌گاه حجم یا کانتینر موجود را حذف یا بازنویسی نکنید. بازیابی باید
> در محیطی جداگانه آزمایش شود و هرگز مستقیماً روی دیتابیس در حال اجرا اعمال نشود.
> همچنین این راهنما برای **محیط توسعه محلی** نوشته شده است؛ برای محیط تولید به
> بخش «پشتیبان‌گیری پیش از مهاجرت» در
> [production-deployment.md](./production-deployment.md) مراجعه کنید.

## پیش‌نیازها

1. Docker Desktop در حال اجرا باشد.
2. فایل `apps/web/.env` شامل `POSTGRES_USER`، `POSTGRES_PASSWORD` و
   `POSTGRES_DB` مقداردهی شده باشد.
3. کانتینر `finora-postgres` در حال اجرا باشد.
4. مقصد پشتیبان‌گیری قابل نوشتن باشد (ترجیحاً خارج از پوشه پروژه).

بررسی وضعیت کانتینر:

```powershell
docker compose --env-file apps/web/.env ps
```

> **ابزار خط فرمان:** در این پروژه `pg_dump` / `pg_restore` روی میزبان (host)
> نصب نیستند؛ فقط داخل کانتینر `finora-postgres` در دسترس‌اند. بنابراین همه
> دستورهای پشتیبان‌گیری، تأیید و بازیابی باید از طریق `docker exec` روی همان
> کانتینر اجرا شوند (نسخه سرور و مشتری هر دو PostgreSQL 16.15 و سازگارند).

## پشتیبان‌گیری با pg_dump

اسکریپت زیر یک dump با فرمت custom می‌سازد، آن را از کانتینر بیرون می‌کشد و
فایل موقت داخل کانتینر را پاک می‌کند:

```powershell
cd D:\Project\finora
$backup = "C:\Users\Mgh\finora-backup-$(Get-Date -Format 'yyyyMMdd-HHmmss').dump"
docker exec finora-postgres pg_dump -U finora -Fc -f /tmp/finora.dump finora
docker cp finora-postgres:/tmp/finora.dump $backup
docker exec finora-postgres rm /tmp/finora.dump
Write-Host "Backup saved to: $backup"
```

نکته: نام کاربر و دیتابیس (`finora`) باید با `POSTGRES_USER` و `POSTGRES_DB`
در `apps/web/.env` هم‌خوان باشد.

## تأیید صحت پشتیبان

پیش از هر بازیابی، از سالم و خوانا بودن فایل پشتیبان مطمئن شوید. چون ابزار
`pg_restore` روی میزبان نصب نیست، فایل را داخل کانتینر کپی و همان‌جا بررسی کنید:

```powershell
$backup = "C:\Users\Mgh\finora-backup-YYYYMMDD-HHMMSS.dump"
docker cp $backup finora-postgres:/tmp/verify.dump
docker exec finora-postgres pg_restore --list /tmp/verify.dump
docker exec finora-postgres rm /tmp/verify.dump
```

اگر این دستور فهرست اشیای پشتیبان را بدون خطا (کد خروج صفر) چاپ کرد، فایل قابل
استفاده است. فهرست باید شامل جدول‌های `public` و همچنین جدول
`drizzle.__drizzle_migrations` (**شامل داده آن**) باشد؛ وجود `TABLE DATA` برای
هر جدول یعنی داده‌ها هم در پشتیبان هستند.

> نسخه ابزارهای `pg_dump` / `pg_restore` باید با نسخه سرور (PostgreSQL 16)
> سازگار باشد؛ برای dump با فرمت custom در محیط تولید همین نسخه یا جدیدتر را
> به کار ببرید.

## بازیابی (فقط در محیط جداگانه)

هرگز روی کانتینر، دیتابیس `finora` یا حجم `finora_pgdata` موجود بازیابی نکنید.
بازیابی باید در محیطی کاملاً جداگانه انجام شود.

### روش تأییدشده محلی: دیتابیس موقت جداگانه

این روش بدون دست‌زدن به دیتابیس `finora` و بدون ساخت کانتینر دوم، صحت پشتیبان
را اثبات می‌کند (در همین پروژه اجرا و تأیید شده است):

```powershell
$db = "finora_restore_verify_$(Get-Date -Format 'yyyyMMddHHmmss')"
$backup = "C:\Users\Mgh\finora-backup-YYYYMMDD-HHMMSS.dump"

# 1) دیتابیس موقت با نام متمایز بسازید (به finora دست نمی‌زند)
docker exec finora-postgres psql -U finora -d postgres -c "CREATE DATABASE $db;"

# 2) پشتیبان را داخل کانتینر کپی و در دیتابیس موقت بازیابی کنید
docker cp $backup finora-postgres:/tmp/restore.dump
docker exec finora-postgres pg_restore --no-owner --no-privileges -U finora -d $db /tmp/restore.dump
docker exec finora-postgres rm /tmp/restore.dump

# 3) صحت را بررسی کنید (شمارش رکوردها باید با منبع برابر باشد)
docker exec finora-postgres psql -U finora -d $db -tAc "SELECT count(*) FROM users;"
docker exec finora-postgres psql -U finora -d $db -tAc "SELECT count(*) FROM drizzle.__drizzle_migrations;"

# 4) فقط دیتابیس موقت را پاک کنید
docker exec finora-postgres psql -U finora -d postgres -c "DROP DATABASE $db;"
```

### روش سخت‌گیرانه‌تر: کانتینر و حجم کاملاً جداگانه

برای محیط تولید، بازیابی را در کانتینر و حجم مستقل انجام دهید:

1. یک فایل `.env` جداگانه برای محیط تست بسازید.
2. یک حجم (volume) جداگانه ایجاد کنید:
   ```powershell
   docker volume create finora_pgdata_test
   ```
3. یک کانتینر موقت PostgreSQL 16 با همان حجم جدید و پورتی غیر از ۱۵۴۳۲ بالا
   بیاورید.
4. فایل پشتیبان را کپی و در محیط جداگانه بازیابی کنید:
   ```powershell
   docker cp $backup <test-container>:/tmp/finora.dump
   docker exec <test-container> pg_restore --no-owner --if-exists -U <testuser> -d <testdb> /tmp/finora.dump
   ```
5. داده‌ها را بررسی کنید و سپس کانتینر و حجم موقت را پاک کنید.

> **ایمنی:** استفاده از `--clean` روی دیتابیس موجود ممنوع است، چون اشیا را
> حذف و بازسازی می‌کند و می‌تواند داده را از بین ببرد.

## نکات امنیتی

- هرگز رمز عبور یا محتوای فایل‌های dump را چاپ نکنید.
- فایل‌های `.dump` ممکن است داده کاربران را در خود داشته باشند؛ آن‌ها را در
  جای امن و با دسترسی محدود نگه دارید.
- از `docker compose down -v` خودداری کنید؛ این دستور حجم `finora_pgdata` را
  پاک می‌کند.
- فایل‌های موقت داخل کانتینر (`/tmp/verify.dump`، `/tmp/restore.dump`) را پس
  از هر بررسی پاک کنید (در دستورهای بالا انجام شده است).
- برای «دیتابیس موقت جداگانه» نقش کاربر به اختیار `CREATEDB` نیاز دارد؛ در
  کانتینر توسعه نقش `finora` این اختیار را دارد. در محیط تولید، ساخت و حذف
  دیتابیس موقت را به نقش محدود و جداگانه بسپارید.

## محدودیت‌ها

- **فقط پشتیبان‌گیری/بازیابی دستی** (بدون cron یا خودکارسازی در این مخزن).
- **نیاز به محیط تست جداگانه** برای هر بازیابی.
- مستندات بر پایه تنظیمات فعلی Docker Compose و PowerShell است.

## الزامات محیط تولید (بیرون از این مخزن)

این موارد عمداً به‌عنوان قابلیت برنامه پیاده‌سازی نشده‌اند و باید در زیرساخت
تولید فراهم شوند:

- **پشتیبان‌گیری زمان‌بندی‌شده:** یک job خارجی (cron / سیستم orchestration)
  که این دستورها را طبق برنامه اجرا کند. برنامه زمان‌بند پشتیبان ندارد.
- **نگهداری روی میزبان جداگانه (off-host):** فایل dump نباید روی همان میزبانی
  بماند که دیتابیس روی آن است؛ آن را به فضای ذخیره‌سازی مستقل و پایدار منتقل
  کنید (مثلاً object storage یا سرور پشتیبان جداگانه).
- **سیاست نگهداری (retention):** تعیین تعداد/بازه نگه‌داری پشتیبان‌ها و حذف
  نسخه‌های قدیمی طبق سیاست سازمانی.
- **رمزنگاری:** فایل‌های dump داده کاربران را در خود دارند؛ آن‌ها را در حالت
  ساکن رمزنگاری و دسترسی به آن‌ها را محدود کنید.
- **آزمون دوره‌ای بازیابی:** اثبات اینکه پشتیبان قابل بازیابی است، نه فقط ساخته
  شده — همان روش «دیتابیس موقت جداگانه» را دوره‌ای اجرا کنید.
- **راستی‌آزمایی وضعیت مهاجرت:** پشتیبان شامل جدول
  `drizzle.__drizzle_migrations` است؛ پس از بازیابی، وضعیت مهاجرت‌ها هم بازمی-
  گردد و باید با `pnpm --filter @finora/web db:generate` («No schema changes»)
  با کد هم‌خوان باشد.

## مراجع

- `docker-compose.yml`
- `apps/web/.env.example`
- `README.md`
- `docs/production-deployment.md`
