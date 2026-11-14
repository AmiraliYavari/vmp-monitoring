# سیستم مانیتورینگ سرور برای VMP

## وضعیت : فعال

لاگ‌های سرور هم در کنسول و هم در دیسکورد (وبهوک) ارسال می‌شوند.
متن‌های وبهوک monospace هستند و لاگ‌ها به صورت فینگلیش و بدون ایموجی ارسال می‌شوند.

## لاگ‌ها

- Connecting / Join / Drop (همراه با identifiers، IP، ping، مدت حضور، آخرین موقعیت)
- Chat و Command
- Death / Kill (نیاز به resource `baseevents`) و Explosion
- Start / Stop resource ها
- txAdmin: kick, ban, warn, heal, announcement, restart, shutdown
- RCON command ها
- Server status دوره‌ای و خطاهای سیستمی

## نصب

1. پوشه را با نام `vmp-monitoring` داخل resources بگذارید.
2. در `server.cfg` اضافه کنید:

```
set monitoring_webhook "https://discord.com/api/webhooks/XXXX/YYYY"

# اختیاری: وبهوک جدا برای هر دسته (اگر خالی باشد از وبهوک اصلی استفاده می‌شود)
# set monitoring_webhook_connections ""
# set monitoring_webhook_chat ""
# set monitoring_webhook_deaths ""
# set monitoring_webhook_resources ""
# set monitoring_webhook_admin ""
# set monitoring_webhook_system ""

ensure baseevents
ensure vmp-monitoring
```

3. تنظیمات (روشن/خاموش کردن لاگ‌ها، timezone، نمایش IP) بالای `server.js` در `CONFIG` است.

## استفاده از resource های دیگر

```lua
exports['vmp-monitoring']:Log('Title', 'matn log', 'system')
```

## چک لیست ها

- [x] اضافه کردن همه هندلینگ‌ها
- [x] پیکربندی امنیت (آدرس وبهوک فقط از convar خوانده می‌شود)
- [x] اتصال به دیسکورد

Author : AmirVentus
https://amiraliyavari.top/