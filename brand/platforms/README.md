# PIT RATING — логотип для всех платформ

Основа: утверждённый вариант C «Шевроны ранга» (18.10.2026). Цвета: золото #e8c35a, тёмное золото #9a7419, ink #15171b, paper #f4f1ea, фон #0e1014 / #111418. Шрифт Unbounded, текст в кривых.

| Платформа | Папка / файл | Размер | Назначение |
|---|---|---|---|
| iOS / iPadOS | `ios/AppIcon.appiconset/` | 1024 ×3 | Xcode: обычная, тёмная (iOS 18), тонированная; Contents.json готов |
| iOS / iPadOS | `ios/legacy/icon-*.png` | 20–180 | старые Xcode / сборщики (Expo, Flutter); <58 px — только знак |
| iOS / iPadOS | `ios/AppStore-1024.png` | 1024 | App Store Connect (без прозрачности, без скругления) |
| Android | `android/res/` | 48–432 | mipmap всех плотностей: обычная, круглая, adaptive (foreground + фон #111418 + monochrome для Android 13+); drawable-*/ic_stat_pit — уведомления |
| Android | `android/splash/splash_icon.png` | 1152 | Android 12+ SplashScreen (288dp, знак в круге 192dp) |
| Google Play | `google-play/` | 512; 1024×500 | иконка магазина и Feature graphic |
| Web / PWA | `web/` | 16–512 | favicon.ico (16/32/48), favicon.svg, apple-touch 180, PWA 192/512 + maskable, Safari pinned tab, Windows tile, site.webmanifest, head-snippet.html |
| Web / соцпревью | `web/og-image, twitter-card` | 1200×630; 1200×600 | превью ссылки в Telegram, WhatsApp, Facebook, X, LinkedIn, iMessage |
| macOS | `macos/` | 16–1024 | PIT-RATING.icns (Big Sur: скруглённая плашка с полем) + PNG 1024 |
| Windows | `windows/` | 16–310 | PIT-RATING.ico (16–256, мелкие — только знак), плитки Microsoft Store / Windows |
| TV | `tv/` | 80 – 3840×2160 | Android/Google TV баннер, Apple tvOS (иконка: слои back/front, Top Shelf), Samsung Tizen, LG webOS, заставка экранов зала 1080p/4K |
| Соцсети — аватары | `social/avatars/` | 400–1080 | Instagram, Threads, TikTok, Telegram, YouTube, X, Facebook, LinkedIn, WhatsApp Business; тёмный и золотой, знак в круглой безопасной зоне |
| Соцсети — обложки | `social/covers/` | по требованиям площадок | YouTube 2560×1440 (логотип в безопасной зоне 1546×423), X 1500×500 (сдвиг вправо от аватара), Facebook 1640×624, LinkedIn компания/личный, превью Telegram-канала |
| Instagram | `social/instagram/` | 1080 | шаблон поста 4:5, сторис 9:16, 6 обложек «Актуального» |
| Продукты | `products/` | SVG + PNG | PIT ARENA, PIT CRM, MY PIT — та же система: знак + PIT + строка продукта; тёмный и светлый фон |
| Печать | `print/*.pdf` | вектор | PDF в кривых для типографии, вывесок, мерча; mark-gold-solid — вышивка/гравировка |
| Почта | `email/` | 600×150 (@2x) | логотип для подписи письма: светлый и тёмный |
| Исходники | `svg-master/` | SVG | утверждённый комплект варианта C (без изменений) |

Правила: иконки меньше 58 px — только знак (надпись PIT не читается); Android adaptive и PWA maskable — контент в безопасной зоне; обложки — логотип в безопасных зонах площадок; не менять пропорции, прозрачности шевронов, не добавлять обводки и тени.
