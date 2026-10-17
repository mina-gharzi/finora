# راهنمای پشتیبان‌گیری و بازیابی PostgreSQL (Finora)

این راهنما بر پایه تنظیمات فعلی پروژه نوشته شده است:
- سرویس db با تصویر postgres:16-alpine
- نام کانتینر: inora-postgres
- پورت: 127.0.0.1:15432:5432
- حجم داده: حجم خارجی inora_pgdata (external=true)
- مقادیر حساس از pps/web/.env خوانده می‌شوند

> **توجه:** هیچ‌گاه حجم یا کانتینر موجود را حذف یا بازنویسی نکنید. بازیابی باید در محیطی جداگانه آزمایش شود و هرگز مستقیماً روی DB در حال اجرا اعمال نشود.

## پیش‌نیازها

1. Docker Desktop در حال اجرا باشد
2. فایل pps/web/.env شامل POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB مقداردهی شده باشد
3. کانتینر inora-postgres در حال اجرا باشد
4. مقصد پشتیبان‌گیری قابل نوشتن باشد (ترجیحاً خارج از پوشه پروژه)

## پشتیبان‌گیری با pg_dump

`powershell
cd D:\Project\finora
 = "C:\Users\Mgh\finora-backup-20261017-164817.dump"
docker exec finora-postgres pg_dump -U finora -Fc -f /tmp/finora.dump finora
docker cp finora-postgres:/tmp/finora.dump 
docker exec finora-postgres rm /tmp/finora.dump
Write-Host "Backup saved to: "
`

## تأیید صحت پشتیبان

`powershell
pg_restore --list "C:\Users\Mgh\finora-backup-YYYYMMDD-HHMMSS.dump"
`

## بازیابی (فقط در محیط جداگانه)

هرگز روی کانتینر یا inora_pgdata موجود بازیابی نکنید. باید در volume و کانتینر کاملاً جداگانه انجام شود.

1. .env جداگانه برای محیط تست بسازید
2. docker volume create finora_pgdata_test
3. کانتینر موقت PostgreSQL با volume جدید بالا بیاورید
4. فایل پشتیبان را کپی و با pg_restore --no-owner --if-exists -U <testuser> -d <testdb> /tmp/finora.dump بازیابی کنید
5. داده‌ها را بررسی و سپس پاک کنید

> **ایمنی:** استفاده از --clean روی DB موجود ممنوع است.

## نکات امنیتی

- هرگز رمز عبور را چاپ نکنید
- فایل‌های .dump را در جای امن نگه دارید
- از docker compose down -v خودداری کنید

## محدودیت‌ها

- فقط backup/restore دستی (بدون cron/automation)
- نیاز به محیط تست جداگانه
- مستندات بر پایه تنظیمات فعلی Docker Compose و PowerShell است

## مراجع

- docker-compose.yml
- pps/web/.env.example
- README.md