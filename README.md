# Postarxiv

Instagram ictimai profilləri üçün Bun + Next.js (SSR), Prisma/PostgreSQL və Kotlin Android agent prototipi.

**Instagram API-si tələb olunmur.** Agent telefonda açıq WebView səhifəsindən post linklərini, tam caption və dəqiq tarixi oxuyur. Giriş lazım olsa istifadəçi birbaşa Instagram səhifəsində daxil olur. Instagram şifrəsi və sessiya cookie-ləri backend-ə göndərilmir. Backend profil, tapşırıq, tam caption və postun əlçatan göstəricilərini saxlayır.

Bu prototipin veb və APK build-ləri yoxlanılıb. İlk versiya istifadəçi tərəfindən real cihazda işlək olaraq yoxlanılıb. **0.4.0 dəyişikliklərinin cihazda davranışı və 1500 profil üzrə yük hələ təsdiqlənməyib.** Yenilənmiş `artifacts/postarxiv-agent-0.4.0.apk` faylını əvvəlki APK-nin üzərinə quraşdırın; tətbiqi silməyin ki, giriş və qoşulma saxlanılsın. 0.1-dən keçiddə yarımçıq aktiv iş öz tarix aralığında başdan yoxlanır ki, artıq arxivdəki postların göstəriciləri də toplansın; shortcode üzrə təkrar post yaranmır.

## Lokal işə salmaq

Tələblər: Bun 1.4.1+, PostgreSQL. Layihədə verilən bağlantı `.env` faylına yazılıb; həmin fayl Git və Docker build kontekstindən çıxarılıb. Cədvəllər yalnız `instagram_parser` sxemindədir.

```sh
bun install --frozen-lockfile
bun run db:migrate
bun run build 2>&1 | tail -n 50
bun run start
```

Ayrı terminalda avtomatik növbə və gecikmiş tapşırıqların bərpası:

```sh
bun run scheduler
```

Brauzer: `http://localhost:3000`. Giriş şifrəsi `.env` faylındakı `ADMIN_PASSWORD` dəyəridir. Şifrə avtomatik yaradılıb. `.env` faylını paylaşmayın.

## Android ilə ilk manual yoxlama

1. `artifacts/postarxiv-agent-debug.apk` faylını Android 8+ cihazında quraşdırın. Android naməlum mənbədən quraşdırma icazəsi istəyə bilər. Bu APK manual prototip yoxlaması üçün debug imzalıdır.
2. Telefonu serverlə eyni Wi-Fi şəbəkəsinə qoşun. APK-də server kimi kompüterin LAN ünvanını yazın: `http://192.168.x.x:3000`. Telefonda `localhost` kompüterə aid deyil. Server uzaqdadırsa HTTPS ünvanını istifadə edin.
3. Veb interfeysdə **Cihazlar → Cihaz qoş** seçin. 15 dəqiqəlik birdəfəlik kodu APK-yə yazın, cihaz adı verin və **Serverə qoşul** seçin. Hər cihaz üçün ayrıca kod yaradılır; eyni APK istifadə edilir.
4. Android-də **Instagram** düyməsini açın. Lazımdırsa girişi, 2FA və təhlükəsizlik yoxlamasını özünüz tamamlayın.
5. Veb interfeysdə **Profillər** bölməsinə 2–3 ictimai profil əlavə edin. Adları sətir, vergül və ya boşluqla ayıra bilərsiniz. Məlumatların açıq olduğunu və toplama icazənizi təsdiqləyin.
6. **Paylaşımlar** səhifəsində profil və tarix seçib **Topla və göstər** basın. Mövcud nəticələr göstərilir; yeni toplama məhz bu tarixlərə yaradılır. **Arxivə bax** yalnız bazanı oxuyur. Caption mətninə görə filtr yoxdur.
7. APK-də **Başlat** seçin. **Tətbiq ekranda açıq qalmalıdır.** Ekran iş zamanı sönmür. Başqa tətbiqə keçdikdə avtomatlaşdırma dayanır və mərhələ saxlanılır. Qayıdanda **Başlat** ilə davam edin.
8. Agent oxunmayan postu avtomatik ötürür: bir səhifəyə maksimum 14 saniyə ayrılır, adətən daha tez növbəti posta keçir. Son 20 ötürülən link və səbəb **Tapşırıqlar** bölməsində görünür. Ayrı postun müvəqqəti HTTP xətası həmin linki sonraya saxlayır. Instagram giriş/yoxlama tələb etdikdə cihaz dayanır və paneldə giriş tələbi göstərilir.
9. **Tapşırıqlar** bölməsində intervalı, təxmini müddəti, faizi, qəbul edilən, tarixdən kənar və oxunmayan post sayını izləyin. Nəticədəki caption-u Instagram ilə sətir-sətir müqayisə edin: emoji, Azərbaycan hərfləri, yeni sətir, hashtag və boş caption. CSV-ni Excel-də açıb eyni mətni yoxlayın.

Giriş tələb edən səhifələrdə və CAPTCHA zamanı avtomatik keçid yoxdur. Məxfi profil toplanmır; agent növbəti tapşırığa keçir. Profilin ictimai olduğunu əvvəlcədən təsdiqləmək istifadəçinin məsuliyyətidir.

## Instagram HTTP 429 / açılmayan linklər

- Chrome-da da post HTTP 429 qaytarırsa Instagram sorğu limiti tətbiq edir. Ana səhifənin açılması postların da əlçatan olduğunu göstərmir. Ardıcıl yeniləmə və yeni toplama cəhdləri etmədən fasilə verin; limitin götürülmə vaxtına zəmanət yoxdur.
- Agent əsas səhifənin HTTP statusunu oxuyur; şəkil/video resursunun xətası post xətası sayılmır. 404/410 ötürülür, 401/403 giriş yoxlaması üçün dayanır.
- 0.4.0-da bir postun 429 və ya “Try again later” xətası həmin linki 15 dəqiqə sonraya saxlayır, digər postların yoxlanması davam edir. İkinci uğursuz cəhddə 30 dəqiqə gözlənilir; üçüncü uğursuz cəhddən sonra link səbəbi ilə ötürülür. 5xx və səhifə bağlantı xətalarında gözləmə 1, sonra 2 dəqiqədir. Daha uzun `Retry-After` varsa həmin link üçün nəzərə alınır.
- Profilin qalan hissəsi bitəndə gözləyən linklər serverdə saxlanılır və tapşırıq uyğun vaxta növbəyə qaytarılır. Cihaz başqa profilə keçə bilər; vaxtı çatmış linkləri 0.4.0 və sonrakı agent götürə bilər. Planlı gözləmə tapşırığın xəta cəhdini artırmır. Link, səbəb, cəhd sayı və növbəti vaxt **Tapşırıqlar** bölməsində görünür.
- Arada uğurlu post oxunmadan üç fərqli post 429 qaytararsa və ya profil səhifəsinin özü limitə düşərsə ümumi fasilə tətbiq edilir: 15/30/60/120 dəqiqə. Daha uzun `Retry-After` qorunur. Bu müddət Instagram limitinin bitəcəyi barədə vəd deyil.
- Ümumi fasilənin qalan vaxtı tətbiqdə, **Instagram fasiləsi** statusu cihazlar panelində görünür. Fasilə cihazda şifrələnmiş vəziyyətlə birlikdə saxlanılır; bağlayıb açmaq və Başlat düyməsi müddəti sıfırlamır. Tətbiq açıq olduqda backend heartbeat davam edir, Instagram-a yeni səhifə sorğusu göndərilmir.
- Təkrar ümumi limitdən sonra agent intervalı avtomatik artıra bilər. Admin intervalından daha uzun vaxt tətbiq edilirsə tapşırıqda ayrıca göstərilir. Bu da bloklanmama zəmanəti deyil.
- Backend və bütün APK-lər birlikdə yenilənməlidir. Mövcud tapşırıq və profil məlumatlarının silinməsi lazım deyil.

## Interval, müddət və gedişat

- **Tapşırıqlar → Toplama intervalı** bölməsində 2–300 saniyə seçilir; standart 10 saniyədir. Ayar bazada saxlanır, yeni və aktiv tapşırıqlara tətbiq edilir. İşləyən 0.4.0 agent onu növbəti heartbeat-də, normal bağlantıda ən gec 30 saniyəyə alır.
- Yeni tapşırıqda interval və post limiti saxlanır. Post sayı hələ bilinməyəndə ilkin müddət həmin limitdən hesablanır. Linklər tapıldıqdan sonra qalan müddət tapılmış, hələ yoxlanmamış postlara əsaslanır. Növbə, profil axtarışı və gözləmə fasilələri bu aktiv vaxt hesabına daxil deyil.
- Faiz `yoxlanmış / tapılmış postlar` hesabıdır. Sonraya saxlanan postlar tamamlanmış sayılmır. Profil sürüşdürüldükcə yeni linklər tapıla və faiz dəyişə bilər. Panel hər 30 saniyədə yenilənir; agent nəticə və checkpoint-i ardıcıl işləmə zamanı ən azı hər 15 saniyəlik həddən sonra göndərməyə çalışır.
- Faiz hazırda tapılmış postlara aiddir; tapşırıq hələ profilin davamında yeni linklər axtara bilər. İşin bitməsi ayrıca statusla göstərilir. Bütün Instagram tarixçəsinin əldə olunduğu sübut edilmədiyindən WebView toplaması yenə **Toplanıb · natamam** statusu ilə bitir.

## Collab və profil arxivi

- Əsas müəllif və qəbul edilmiş collab iştirakçıları səhifədəki `coauthor_producers` məlumatından və ya post başlığındakı müəllif linklərindən təsdiqlənir. Caption-da @mention və şəkil etiketləri collab sayılmır.
- Eyni shortcode bazada bir postdur. `PostProfile` əlaqəsi onu izlənən iştirakçı profillərin hər birində göstərir; saylar və caption bir yerdə yenilənir. İştirakçı sonradan profil siyahısına əlavə edilərsə mövcud əlaqələr də bərpa olunur.
- **Profillər** bölməsində profil sətrini açın: tarixdən asılı olmayaraq arxivdəki postlar, tam caption və göstəricilər görünür. İlk 10 post açılışda yüklənir, davamı **Daha 10 post göstər** düyməsindədir. Toplama tarixini dəyişmək üçün **Tarix seç / topla** istifadə edin.
- CSV-də əsas müəllif, collab iştirakçıları və əlaqəli izlənən profillər ayrı sütunlardadır. Hər post bir CSV sətridir.
- 0.3.0 extractor-u verilmiş `DeMzG16NtF9` paylaşımının real brauzer səhifəsində `by_kemale` / `influencer_az` collab-ını, tam caption-u, dəqiq tarixi və görünən şərh sayını oxuyub. APK-də eyni hesabla cihaz yoxlaması ayrıca aparılmalıdır.

## Tarixçə və dəqiqlik

- Tarix filtrləri **Asia/Baku, UTC+4** ilə hesablanır. Bitiş günü tam daxil edilir; SQL intervalı `[başlanğıc, növbəti gün)` şəklindədir. Bazada UTC saxlanır, CSV tarixləri UTC olaraq işarələnir.
- Caption `TEXT` sahəsində, Unicode və yeni sətirlərlə saxlanılır; avtomatik qısaltma edilmir. Natamam meta-description caption əvəzinə istifadə olunmur.
- Oxuma ardıcıllığı: səhifənin daxilində yüklənmiş JSON-da dəqiq shortcode + müəllif + caption + vaxt; sonra görünən caption başlığı + müəllif + `<time datetime>`; təsdiqlənməyən post avtomatik ötürülür.
- Instagram HTML quruluşu dəyişə bilər. Uyğun olmayan post uğurlu nəticə kimi qəbul edilmir; səbəbi qeyd edilərək ötürülür. Oxunmayan profil də növbəni saxlamır. Parser qaydaları `android/app/src/main/assets/extractor.js` faylındadır.
- WebView sonsuz sürüşdürməsi bütün tarixçəni verdiyini sübut etmir. Buna görə bu agentin toplaması **PARTIAL / Toplanıb · natamam** ilə bitir. Bu status caption-un kəsildiyini deyil, tarixçənin əhatəsinin təsdiqlənmədiyini bildirir.
- 2018–2026 intervalını seçmək 2018-ci il postlarının əldə olunacağına zəmanət vermir. Tarix filtri arxivə tətbiq edilir; yeni toplama yalnız Instagram-ın göstərdiyi səhifələrə qədər gedə bilər.
- Profil səhifəsi saxlanılır, tapılan linklər hissə-hissə işlənir. Tarixi profildə məlum olan aralıqdan kənar post ayrıca açılmır. Digər postlarda əvvəlcə tarix yoxlanır, sonra tam caption və göstəricilər oxunur. Bütün tarixçənin linklərini yığmaq üçün gözləmə yoxdur.
- İlk 3 mövqe və pin işarəsi olan postlar dayanma qərarına daxil deyil. Başlanğıc tarixindən köhnə 6 ardıcıl, tarix üzrə geriyə gedən postdan sonra baxış dayanır. Bu, Instagram grid sırasına əsaslanan **evristikadır**; profil sırası əl ilə dəyişdirilibsə və ya bəzi postlar yüklənməyibsə tam əhatə sübut edilmir. Tapşırıqda dayanma səbəbi göstərilir.
- Başlanğıc limitlər: 200 sürüşdürmə, 500 post linki, səhifə açma/sürüşdürmə arasında standart 10 saniyə (admin paneldən dəyişir). Dəqiq vaxt və caption hazır olanda şəkillərin tam yüklənməsi gözlənilmir. 10 postadək məlumat bir sorğuda göndərilir; hər post əvvəlcə şifrələnmiş lokal yaddaşa yazılır. Böyük interval üçün `.env` limitlərini artırmaq olar.
- Yeni profil tarix seçilənədək avtomatik işə başlamır. **Topla və göstər** seçilmiş aralığı profilə yazır, fərqli tarixdəki aktiv tapşırığı ləğv edib yenisini açır. Eyni aralıqda artıq aktiv iş varsa davam edir. Bitmiş iş üçün düyməyə yenidən basmaq sayları və caption-u yeniləyən təkrar toplama yaradır.
- Dövri toplama profilə yazılmış **eyni tarix aralığını** hər 24 saatda yenidən yoxlayır; aralığı özbaşına son 30 günə dəyişmir. Yeni günləri daxil etmək üçün bitiş tarixini yeniləyib toplamanı başladın.
- Tam caption, hashtag, permalink, dəqiq tarix və yoxlama vaxtı ilə yanaşı Instagram ID, media növü, bəyənmə/şərh/baxış/oynatma/paylaşma/repost/yadda saxlama sayları, mediaya aid ölçü/alt mətn/URL/saniyə sayı, karusel elementləri, məkan, etiketlənmiş və ortaq müəlliflər yalnız səhifə bunları təqdim etdikdə saxlanılır. Şərhlərin mətnləri, sessiya məlumatları və səhifənin bütöv daxili JSON-u saxlanılmır.
- **Görünməyən say sıfır deyil.** Naməlum göstərici `NULL` qalır; sonrakı yoxlamada gizlənibsə əvvəlki müşahidə öz vaxtı ilə qorunur. `1.2K` kimi yuvarlaq göstərici təxmini (`≈`) qeyd olunur. Repost, paylaşma və yadda saxlama sayı bir çox postda təqdim olunmur. Hər sayın mənbəyi və yoxlanma vaxtı ayrıca saxlanılır; tooltip və CSV-də görünür. CSV-də boş say naməlumdur, həqiqi sıfır `0`-dır; təxminilik ayrıca JSON sütunundadır.
- Şəkil/video faylları backend-ə yüklənmir. Android WebView Instagram səhifəsini normal göstərərkən həmin səhifənin mediası yüklənə bilər.

## Etibarlılıq və cihaz idarəetməsi

- PostgreSQL `FOR UPDATE SKIP LOCKED` və qismən unique indekslərlə bir tapşırığı eyni anda yalnız bir cihaz götürür. Profil üzrə paralel aktiv tapşırıq da yoxdur.
- Cihaz hər 30 saniyədə heartbeat göndərir. Lease standart olaraq 180 saniyədir. Bağlantı itərsə server son təsdiqlənmiş mərhələni başqa cihaza verə bilər. 5 uğursuz cəhddən sonra task `FAILED` olur.
- Tapşırığın checkpoint-i və göndərilməmiş batch Android-də AES-GCM/Android Keystore ilə şifrələnmiş `AtomicFile`-da saxlanılır. Server tokeni də həmin şifrələnmiş fayldadır; Android backup söndürülüb.
- Hər upload əvvəlcə diskə yazılır, sonra göndərilir. `taskId + batchId` unikal qəbzi HTTP cavabı itəndə eyni batch-i ikinci dəfə saymağa imkan vermir. Instagram shortcode-u ayrıca unikaldır: post təkrarlanmır, mövcud caption yenilənir.
- Lease itəndə köhnə cihazın yazıları qəbul edilmir. Yeni cihaz serverdəki son təsdiqlənmiş checkpoint-dən davam edir. Köhnə cihaz son göndərilməmiş batch-i lokal saxlayır, başqa tapşırığa tətbiq etmir.
- Cihazı söndürmək onun açarını dərhal təsirsiz edir və aktiv tapşırığını növbəyə qaytarır. Profilin dayandırılması aktiv tapşırığını ləğv edir, toplanmış arxivi silmir.
- WebView avtomatlaşdırması bu prototipdə fon servisi deyil; Android-in fon məhdudiyyətlərini keçməyə çalışmır. Real cihazda login, DOM və uzunmüddətli toplama yoxlandıqdan sonra 1500 profilə mərhələli keçid edilməlidir.

## Production / Docker

`.env.example` bütün sazlamaları göstərir. İstehsalatda `APP_URL` ünvanını istifadəçinin açdığı dəqiq HTTPS origin-ə, `COOKIE_SECURE=true` dəyərinə dəyişin. `ADMIN_PASSWORD` ən azı 16, `SESSION_SECRET` ən azı 32 simvol olsun. Reverse proxy HTTPS təmin etməlidir. PostgreSQL-in TLS ayarlarını öz serverinizin sertifikatlarına uyğun qurun; tətbiq sertifikat yoxlamasını söndürmür.

```sh
docker compose up --build -d
```

Compose əvvəlcə miqrasiyanı, sonra veb tətbiqi və ayrıca scheduler-i işə salır. Mövcud PostgreSQL bağlantısı istifadə olunur; yeni DB konteyneri yaradılmır. Sağlamlıq endpoint-i `/api/health`-dir. Docker image build-i burada ayrıca icra edilməyib.

Admin sessiyası 12 saatlıq, imzalı, HttpOnly və SameSite=Strict cookie-dir. Dəyişiklik endpoint-ləri origin yoxlayır. Giriş/cihaz endpoint-lərində PostgreSQL əsaslı limit var. Cihaz açarlarının yalnız SHA-256 hash-i backend-də saxlanılır. CSV Unicode BOM ilə verilir və Excel formula injection simvolları təhlükəsizləşdirilir.

## APK-ni yenidən yığmaq

Tələblər: JDK 17, Android SDK platform 35 və Build Tools 35.0.0. Gradle Wrapper layihədədir.

```sh
cd android
# JAVA_HOME JDK 17-yə, ANDROID_HOME Android SDK qovluğuna işarə etməlidir.
./gradlew assembleDebug
```

Nəticə: `android/app/build/outputs/apk/debug/app-debug.apk`. Debug APK lokal şəbəkədə HTTP-yə icazə verir; release konfiqurasiyası yalnız HTTPS qəbul edir. Paylanacaq production APK üçün ayrıca release imzalama açarı təyin edilməlidir; açar və şifrə repoya əlavə edilməməlidir.

## Qovluqlar

```text
src/app/           SSR səhifələr və qorunan API route-ları
src/components/    Sadə interfeys və formalar
src/lib/           Auth, PostgreSQL növbəsi, agent protokolu, tarix filtrləri
prisma/            Sxem, ilkin miqrasiya, verilənlər bazası məhdudiyyətləri
scripts/           Dövri planlayıcı
android/           Kotlin APK mənbəyi, WebView extractor, şifrələnmiş checkpoint
artifacts/         Hazır manual yoxlama APK-si və ekran görüntüləri (Git-ə daxil deyil)
```

İnterfeysdə saxta profil və post yoxdur. Real məlumat Android agentdən gəlir. İstəyə uyğun avtomatik test faylları yaradılmayıb.
