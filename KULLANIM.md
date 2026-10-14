# RepoDesk Kullanım Kılavuzu

RepoDesk, GitHub'daki projelerini **terminal kullanmadan** yönetmeni sağlayan bir masaüstü uygulamasıdır.
Projeni bilgisayarına indirebilir, değişikliklerini kaydedip GitHub'a gönderebilir, başkalarının
değişikliklerini alabilir ve sürüm yayınlayabilirsin. Hepsi butonlarla.

> Bu kılavuz hiç git/GitHub kullanmamış biri düşünülerek yazıldı. Bilinen terimleri atlayabilirsin.

---

## İçindekiler

1. [Kurulum](#1-kurulum)
2. [İlk açılış: GitHub ile giriş](#2-ilk-açılış-github-ile-giriş)
3. [Önce birkaç kavram](#3-önce-birkaç-kavram)
4. [Ana ekran: Kütüphane](#4-ana-ekran-kütüphane)
5. [Bir projeyi bilgisayarına indirmek (Klonla)](#5-bir-projeyi-bilgisayarına-indirmek-klonla)
6. [Çalışma alanı: değişiklikleri kaydetmek ve göndermek](#6-çalışma-alanı-değişiklikleri-kaydetmek-ve-göndermek)
7. [Bilgisayarındaki bir klasörü GitHub'a koymak](#7-bilgisayarındaki-bir-klasörü-githuba-koymak)
8. [Dallar (branch)](#8-dallar-branch)
9. [Çakışma çıkarsa](#9-çakışma-çıkarsa)
10. [Hata yaptım, geri almak istiyorum](#10-hata-yaptım-geri-almak-istiyorum)
11. [Pull Request ve Issue](#11-pull-request-ve-issue)
12. [Sürümler (release)](#12-sürümler-release)
13. [CI rozeti (otomatik kontroller)](#13-ci-rozeti-otomatik-kontroller)
14. [Repo silme ve arşivleme](#14-repo-silme-ve-arşivleme)
15. [Ayarlar ve güncellemeler](#15-ayarlar-ve-güncellemeler)
16. [Sorun giderme](#16-sorun-giderme)
17. [Klavye kısayolları](#17-klavye-kısayolları)
18. [Lisans](#18-lisans)

---

## 1. Kurulum

RepoDesk arka planda iki ücretsiz araç kullanır: **git** ve **GitHub CLI (gh)**. Önce onları kur.
Ubuntu, Linux Mint ve benzeri sistemlerde bir terminal açıp şunu yazman yeterli, bir kerelik:

```bash
sudo apt install git gh
```

Sonra RepoDesk'i [Releases sayfasından](https://github.com/noviceWriter/RepoDesk/releases) indir:

| Dosya | Ne zaman seçilir | Nasıl açılır |
| --- | --- | --- |
| `RepoDesk_..._amd64.deb` | **Önerilen.** Uygulama menüne normal bir program gibi eklenir. | Dosyaya çift tıkla ve “Yükle”ye bas ya da terminalde `sudo apt install ./RepoDesk_*.deb` |
| `RepoDesk_..._amd64.AppImage` | Kurmadan, tek dosya olarak çalıştırmak istersen. | Dosyaya sağ tıkla → Özellikler → “Çalıştırılabilir” kutusunu işaretle, sonra çift tıkla. |

---

## 2. İlk açılış: GitHub ile giriş

1. **GitHub ile giriş yap** butonuna bas.
2. Ekranda 8 karakterlik bir **kod** görünür (ör. `ABCD-1234`). Kod otomatik olarak panoya kopyalanır.
3. Tarayıcı açılır. GitHub hesabına giriş yap, kodu yapıştır ve **Authorize** (Yetkilendir) butonuna bas.
4. Uygulamaya dön. Birkaç saniye içinde projelerin listelenir.

**Şifren RepoDesk'e hiç girilmez.** Giriş işini GitHub'ın kendi resmi aracı (gh) yapar.
Çıkış yapmak için sağ üstteki profil resmine tıklayıp **Çıkış yap**'ı seç.

---

## 3. Önce birkaç kavram

| Terim | Basitçe anlamı |
| --- | --- |
| **Repo (depo)** | Bir proje klasörü. GitHub'daki kopyası ve senin bilgisayarındaki kopyası olabilir. |
| **Commit** | Projenin o anki halinin, açıklama yazılmış bir **kayıt noktası**. Oyunlardaki “kayıt” gibi düşün. |
| **Push** (gönder) | Bilgisayarında yaptığın commit'leri GitHub'a yollamak. |
| **Pull** (al) | GitHub'daki yeni commit'leri bilgisayarına almak. |
| **Dal (branch)** | Projenin ayrı bir kopya hattı. Ana projeyi bozmadan yeni bir şey denemek için kullanılır. Ana dalın adı genelde `main`'dir. |
| **Birleştirme (merge)** | Bir daldaki değişiklikleri başka bir dala aktarmak. |
| **Pull Request (PR)** | “Bu daldaki değişikliklerimi ana dala alır mısın?” diye açılan istek. |
| **Issue** | Projeyle ilgili not, hata bildirimi ya da yapılacak iş. |
| **Release (sürüm)** | Projenin indirilebilir, numaralı bir sürümü (ör. v1.2.0). |
| **Etiket (tag)** | Belli bir commit'e verilen kalıcı isim (ör. `v1.2.0`). Her release bir etikete bağlıdır. |

---

## 4. Ana ekran: Kütüphane

Girişten sonra GitHub'daki **tüm repoların** kartlar halinde listelenir.

- **Arama:** Üstteki kutuya ad, açıklama ya da dil yaz. `/` tuşu doğrudan aramaya götürür.
- **Filtreler:** Public (herkese açık), Private (gizli), Fork (kopya), Arşiv.
- **Sıralama:** Son güncellenene, ada ya da yıldıza göre.
- **Kart menüsü (⋯):** Düzenle (açıklama, görünürlük, ad), adresi kopyala, GitHub'da aç, arşivle, sil.
- **Yeni repo:** `Ctrl+N` ya da **Yeni repo** butonu. İstersen README, .gitignore ve lisans dosyası otomatik eklenir.

Kartlardaki küçük rozetler: kilit = gizli repo, renkli nokta = ana programlama dili,
✓ / ✗ = son otomatik kontrolün sonucu ([bölüm 13](#13-ci-rozeti-otomatik-kontroller)).

---

## 5. Bir projeyi bilgisayarına indirmek (Klonla)

1. Kütüphanede reponun kartındaki **Klonla** butonuna bas.
2. Projenin indirileceği klasörü seç (**Gözat**).
3. **Klonla**'ya bas. İndirme bitince proje otomatik olarak açılır.

Daha önce indirdiğin bir projeyi açmak için **Klasör aç**'ı (`Ctrl+O`) kullan ve klasörü seç.
Son açtığın klasörler giriş ekranında listelenir.

---

## 6. Çalışma alanı: değişiklikleri kaydetmek ve göndermek

Bir klasör açtığında **çalışma alanı** görünür. Birden fazla klasörü aynı anda **sekmelerde** açabilirsin.

### Üst kısım
- **Dal çipi** (ör. `main`): Hangi dalda olduğunu gösterir. Tıklayınca dal yönetimi açılır.
- **Pull ↓**: GitHub'da senin bilgisayarında olmayan commit varsa sayısı yazar. Basınca alınır.
- **Push ↑**: Gönderilmeyi bekleyen commit sayısı. Basınca GitHub'a gönderilir.
- **PR ve Issue**, **Sürümler**: İlgili pencereleri açar.
- **Terminalde aç** ve **Editörde aç** (VS Code) simgeleri.

### Değişiklikler
Dosyalarda yaptığın her değişiklik burada listelenir:
- Bir dosyaya tıkla: **yeşil** satırlar eklenen, **kırmızı** satırlar silinen kısımlardır.
- Her dosyanın yanındaki kutu: o dosyanın commit'e dahil edilip edilmeyeceği.

### Commit atmak (kayıt noktası oluşturmak)
1. Değişikliği anlatan kısa bir mesaj yaz (ör. “Giriş sayfasındaki yazım hatası düzeltildi”).
2. **Commit** butonuna bas (`Ctrl+Enter`). Değişiklik bilgisayarında kaydedilir.
3. GitHub'a göndermek için **Push**'a bas. Ya da ikisini birden yapan **Commit ve Push**'u kullan.

> İpucu: Commit mesajını kısa ama anlamlı yaz. İleride “bunu ne zaman değiştirmiştim?” diye
> baktığında geçmiş listesi çok işine yarar.

### Dosyalar ve geçmiş
- **Dosyalar** sekmesinde klasörler arasında gezebilir, dosyayı uygulamanın içinde açıp düzenleyebilirsin (`Ctrl+S` kaydeder).
- **Geçmiş** sekmesinde tüm commit'ler listelenir. Birine tıklayınca hangi dosyalarda ne değiştiğini görürsün.
- Dosya ve klasörlere **sağ tıklayınca** yeniden adlandır/taşı, sil, terminalde aç, VS Code'da aç, yolu kopyala gibi seçenekler çıkar.

### Otomatik kontrol
RepoDesk açık sekmelerde GitHub'ı belli aralıklarla kontrol eder. Başkası yeni bir commit gönderdiyse
haber verir. Aralığı **Ayarlar**'dan değiştirebilir ya da kapatabilirsin. Bu kontrol dosyalarına dokunmaz.

---

## 7. Bilgisayarındaki bir klasörü GitHub'a koymak

Henüz GitHub'da olmayan bir projeyi açtığında iki seçenek çıkar:

- **GitHub'da yayınla:** Yeni bir repo oluşturur ve dosyalarını yükler. Repo adını, herkese açık mı
  gizli mi olacağını seçersin. `node_modules`, `.env` gibi yüklenmemesi gereken şeyler için öneriler sunulur.
  **Şifre ve gizli anahtar içeren dosyaları yüklemediğinden emin ol.**
- **Mevcut repoya bağla:** GitHub'da zaten boş ya da var olan bir repoya bağlar.

Commit atarken “Git kimliği ayarlı değil” uyarısı çıkarsa **Kimliği GitHub hesabımla ayarla** butonuna bas.
Commit'lerde GitHub kullanıcı adın görünür.

---

## 8. Dallar (branch)

Dal çipine tıkla:
- **Yeni dal**: Bir ad ver, istersen hemen o dala geç.
- **Geç**: Başka bir dala geç. Kaydedilmemiş değişikliğin varsa uyarılırsın.
- **Birleştir**: Seçtiğin daldaki değişiklikleri şu anki dalına aktarır.
- **Yeniden adlandır / Sil**: Bilgisayarındaki dalı yönetir. **GitHub'dan sil** seçeneği uzaktaki dalı siler.
- GitHub'da olup sende olmayan dallar da listelenir. Tıklayınca bilgisayarına alınır.

---

## 9. Çakışma çıkarsa

Aynı dosyanın aynı satırını hem sen hem başkası değiştirdiyse git hangisini tutacağını bilemez.
Buna **çakışma** denir. Korkma, bir şey kaybolmaz.

1. Çalışma alanında **Çakışmaları çöz** butonu görünür.
2. Her çakışmada iki taraf yan yana gösterilir: **Benimki**, **Gelen** ya da **İkisi de**.
   İstersen metni elle de düzenleyebilirsin.
3. Tüm çakışmaları çözünce **Commit** butonuyla birleştirmeyi tamamla.

Vazgeçmek istersen **Birleştirmeyi iptal et**'e bas. Her şey birleştirmeden önceki haline döner.

---

## 10. Hata yaptım, geri almak istiyorum

| Durum | Ne yapmalı |
| --- | --- |
| Bir dosyada yaptığım değişikliği istemiyorum | Değişiklikler listesinde dosyanın yanındaki **Geri al**'a bas. Dosya son commit'teki haline döner. **Bu işlem geri alınamaz.** |
| Birkaç dosyayı birden geri almak istiyorum | Dosyaları seç, **Seçilenleri geri al**. |
| Son commit'i yanlış attım (henüz push etmedim) | Geçmiş'te son commit'in yanındaki **Geri al**. Dosyalardaki değişiklikler kaybolmaz, commit mesajı kutuya geri gelir. |
| Eski bir commit'i iptal etmek istiyorum (push edilmiş olsa bile) | Geçmiş'te commit'e tıkla → **Tersine çevir**. O commit'i geri alan yeni bir commit oluşturulur. |

Silmek, geri almak gibi kalıcı işlemlerden önce RepoDesk her zaman onay ister.

---

## 11. Pull Request ve Issue

**PR ve Issue** butonu reponun isteklerini açar.

- **Issue aç / kapat:** Başlık ve açıklama yaz. Kapatmak için listeden seç.
- **PR aç:** Hangi daldan hangi dala olduğunu seç, başlık yaz. Dalın GitHub'da yoksa önce otomatik gönderilir.
- **PR birleştir:** Birleştirme yöntemini seç. İstersen dal birleştirmeden sonra silinir.
- **Yerelde aç:** Başkasının PR'ını bilgisayarında açıp deneyebilirsin.

---

## 12. Sürümler (release)

**Sürümler** penceresinden:
- Var olan sürümleri, notlarını ve indirilebilir dosyalarını görürsün.
- **Yeni sürüm:** Sürüm numarası önerilir (ör. v1.2.0 → v1.3.0). Notları yaz ya da otomatik oluşturmayı seç,
  istersen dosya ekle (ör. `.deb`, `.apk`). **Taslak** olarak kaydedip sonra yayınlayabilirsin.
- **Etiketler:** Etiket oluştur, GitHub'a gönder ya da sil.

---

## 13. CI rozeti (otomatik kontroller)

Bazı projelerde GitHub her gönderimden sonra otomatik testler ya da derlemeler çalıştırır (GitHub Actions).
Repo kartında ve çalışma alanında küçük bir rozet bunun sonucunu gösterir:

- ✓ **Başarılı**, ✗ **Başarısız**, nabız atan nokta = **hâlâ çalışıyor**.
- Rozete tıklayınca son çalıştırmalar listelenir. Başarısız olanı **Başarısızları** butonuyla yeniden
  çalıştırabilirsin. Ayrıntılı kayıt için **GitHub'da aç**'a bas.

Projede böyle bir otomatik iş yoksa rozet görünmez. Bu normaldir.

> Not: GitHub'ın ücretsiz hesaplarda otomatik işlere ayırdığı depolama alanı sınırlıdır (0,5 GB).
> Çok sayıda büyük derleme dosyası (APK, AppImage vb.) biriken hesaplarda reponun
> Settings → Actions → General sayfasından “Artifact and log retention” süresini kısaltmak iyi olur.

---

## 14. Repo silme ve arşivleme

Kartın **⋯** menüsünden:
- **Arşivle:** Repo salt okunur olur, kimse değişiklik gönderemez. İstediğin zaman **Arşivden çıkar**.
- **Sil:** Repo GitHub'dan **kalıcı olarak** silinir. Yanlışlıkla silinmesin diye reponun tam adını yazman istenir.
  İlk silmede GitHub ek bir izin (“delete_repo”) isteyebilir. **İzin ver**'e basıp tarayıcıda onayla.

Silme yalnızca GitHub'daki kopyayı siler. Bilgisayarındaki klasöre dokunulmaz.

---

## 15. Ayarlar ve güncellemeler

Sağ üstteki dişli simgesi ya da `Ctrl+,`:
- **Tema:** Sistem, Açık, Koyu.
- **GitHub'ı otomatik kontrol et:** Ne sıklıkla yeni commit kontrolü yapılacağı.
- **Kod editörü / Terminal komutu:** “Editörde aç” ve “Terminalde aç” hangi programı açsın. Boş bırakırsan otomatik bulunur.
- **Hakkında ve güncellemeler:** Sürüm numarası, lisans, bu kılavuz ve uygulama günlüğü.
  **Şimdi kontrol et** yeni sürüm olup olmadığına bakar. Varsa indirme bağlantısı verir.
  Yeni sürümü indirip eskisinin üzerine kurman yeterli, ayarların korunur.

---

## 16. Sorun giderme

| Sorun | Çözüm |
| --- | --- |
| “GitHub CLI (gh) bulunamadı” | [Kurulum](#1-kurulum) adımındaki `sudo apt install git gh` komutunu çalıştır. |
| “Uzak depoda sizde olmayan değişiklikler var” | Önce **Pull**, sonra tekrar **Push**. |
| “Kimlik doğrulaması başarısız” | Profil menüsünden çıkış yapıp tekrar giriş yap. |
| “workflow izni gerekiyor” | Projede GitHub Actions dosyası var. Bildirimdeki **İzin ver**'e basıp tarayıcıda onayla, sonra tekrar gönder. |
| “Terminalde aç” bir şey yapmıyor | Ayarlar'da **Terminal komutu** alanına terminal programının adını yaz (ör. `gnome-terminal`, `konsole`, `xfce4-terminal`). |
| “Editörde aç” çalışmıyor | VS Code kurulu değilse Ayarlar'da başka bir editör yaz (ör. `codium`, `gedit`). |

### Uygulama günlüğü (log)
RepoDesk yaptığı işlemleri ve karşılaştığı hataları bir **günlük** dosyasına yazar.
Bir sorun olduğunda: **Ayarlar → Uygulama günlüğü → Kopyala**, sonra metni sorun bildiriminle birlikte gönder.
Şifre, token gibi gizli bilgiler günlüğe yazılmadan önce gizlenir. Günlük en fazla ~2 MB yer kaplar,
eskiler otomatik silinir.

Sorun bildirmek için: <https://github.com/noviceWriter/RepoDesk/issues>

---

## 17. Klavye kısayolları

| Tuş | İşlev |
| --- | --- |
| `/` | Repo ara |
| `Ctrl+R` / `F5` | Her şeyi yenile |
| `Ctrl+O` | Klasör aç |
| `Ctrl+N` | Yeni repo |
| `Ctrl+Enter` | Pencereyi onayla / commit et |
| `Esc` | Pencereyi kapat |
| `Ctrl+S` | Editörde dosyayı kaydet |
| `Ctrl+F` | Editörde ara |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Sonraki / önceki sekme |
| `Ctrl+1` … `Ctrl+9` | O sekmeye git |
| `Ctrl+W` | Sekmeyi kapat |
| `Ctrl+,` | Ayarlar |

---

## 18. Lisans

RepoDesk **© 2026 noviceWriter**'a aittir ve [PolyForm Noncommercial 1.0.0](LICENSE.md) lisansıyla dağıtılır.
Kişisel ve ticari olmayan kullanım ücretsizdir. Değiştirip paylaşabilirsin ama asıl sahibinin
noviceWriter olduğu bilgisi korunmalıdır. **Ticari kullanım için izin gerekir.**
