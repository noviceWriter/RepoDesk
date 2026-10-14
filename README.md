# RepoDesk

GitHub depoların için hafif bir masaüstü çalışma alanı. Tauri 2 + saf JavaScript ile yazıldı;
GitHub işlemleri resmi [GitHub CLI (`gh`)](https://cli.github.com) üzerinden, yerel işlemler `git` ile yapılır.
Şifren veya token'ın uygulamaya hiç girilmez.

## Özellikler

- **Kütüphane** — tüm depolar; arama (ad, açıklama, dil), Public/Private/Fork/Arşiv filtreleri, sıralama, istatistikler
- **Repo işlemleri** — yeni repo (README, .gitignore şablonu, lisans), açıklama/görünürlük düzenleme, klonlama, adres kopyalama
- **Yerel çalışma alanı**
  - Dal, ileri/geri commit sayısı, Pull / Push (ilk push'ta upstream otomatik ayarlanır)
  - Değişiklikler listesi + renkli **diff görünümü**, dosya bazında seçerek commit, “Commit ve Push”
  - Klasörler arasında gezinilebilen dosya gezgini, dosya editörü (Ctrl+S, Tab girintisi)
  - Commit geçmişi (GitHub'da açılabilir)
  - Bağlı olmayan klasörü **GitHub'da yayınlama** (node_modules, .env… için .gitignore önerileri) veya mevcut repoya bağlama
  - Git kimliği yoksa tek tıkla GitHub hesabından ayarlama
  - **Dal yönetimi** — dal çipine tıkla: oluştur, geç, birleştir, yeniden adlandır, sil; GitHub'daki dalları al
  - **Geri alma** — dosya bazında “son commit hâline döndür”, son commit'i geri al (push edilmemişse)
  - **Çakışma çözücü** — pull/birleştirme çakışmalarını yan yana gör, “benimkini / geleni / ikisini” seç ya da elle düzenle
- **Sekmeler** — birden fazla klasörü aynı anda aç; sekmelerde dal, değişiklik sayısı ve gelen commit'ler görünür
- **Otomatik kontrol** — açık sekmelerde GitHub belirli aralıklarla yoklanır, yeni commit gelince haber verir (Ayarlar'dan aralık seçilir)
- **Sağ tık menüleri** — dosya/klasör/değişiklik/sekme üzerinde: yeniden adlandır/taşı, terminalde aç, VS Code'da aç, yolu kopyala, geri al, sil
- **Kod editörü** — CodeMirror: sözdizimi renklendirme (JS/TS, Rust, Python, HTML, CSS, JSON, Markdown, YAML, C/C++, Java, Go, SQL, XML, PHP), Ctrl+F arama, katlama
- **Commit ayrıntısı** — geçmişte commit'e tıkla: değişen dosyalar, satır sayıları, fark; commit'i tersine çevirme; daha eski geçmişi yükleme
- **Pull Request ve Issue'lar** — listele, filtrele, PR aç (dal otomatik push edilir), PR birleştir, PR'ı yerelde aç, issue aç/kapat
- **CI durumu** — repo kartlarında ve çalışma alanında son commit'in kontrol rozeti (✓ / ✗ / çalışıyor); iş akışı çalıştırmalarını listele, başarısızları yeniden çalıştır
- **Sürümler** — release'leri listele (notlar, indirilebilir dosyalar), yeni release yayınla (dosya ekleme, otomatik notlar, taslak/ön sürüm), etiket oluştur/gönder/sil; sonraki sürüm numarası önerilir
- **Repo silme / arşivleme** — kart menüsünden; silmek için tam adı yazarak onay, gerekirse tarayıcıdan “delete_repo” izni
- **Güncelleme bildirimi** — Ayarlar'da güncelleme deposu girilirse açılışta yeni sürüm kontrol edilir
- **Giriş** — tarayıcı üzerinden cihaz kodu ile; kod uygulamada gösterilir ve panoya kopyalanır
- Açık/koyu tema, son açılan klasörler, pencere odağa gelince otomatik yenileme

### Kısayollar

| Tuş | İşlev |
| --- | --- |
| `/` | Depo ara |
| `Ctrl+R` / `F5` | Her şeyi yenile |
| `Ctrl+O` | Klasör aç |
| `Ctrl+N` | Yeni repo |
| `Ctrl+Enter` | Modalı onayla / commit et |
| `Esc` | Modalı kapat |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Sonraki / önceki sekme |
| `Ctrl+1`…`Ctrl+9` | Sekmeye git |
| `Ctrl+W` | Sekmeyi kapat |
| `Ctrl+,` | Ayarlar |

## Gereksinimler

- [Rust](https://rustup.rs) ve Node.js 18+
- `git` ve `gh` (GitHub CLI)
- Linux için Tauri sistem paketleri: <https://tauri.app/start/prerequisites/>

## Kurulum (hazır paket)

```bash
npm run paket                     # src-tauri/target/release/bundle/ altına paket üretir
sudo apt install ./src-tauri/target/release/bundle/deb/RepoDesk_*.deb
# ya da taşınabilir sürüm:
chmod +x src-tauri/target/release/bundle/appimage/RepoDesk_*.AppImage && ./src-tauri/target/release/bundle/appimage/RepoDesk_*.AppImage
```

GitHub CLI kurulu değilse: `sudo apt install gh` (ya da https://cli.github.com).

Hazır paketler [Releases](https://github.com/noviceWriter/RepoDesk/releases) sayfasından indirilebilir.
Sürümler elle hazırlanır: `npm run paket` ile derlenen `.deb` ve `.AppImage` dosyaları `v0.3.0` gibi bir
etiketle yeni bir release'e yüklenir (RepoDesk'in kendi **Sürümler** penceresinden de yapılabilir).
Uygulama, **Ayarlar → Güncelleme deposu** alanındaki repoda (varsayılan `noviceWriter/RepoDesk`) yeni sürüm çıkınca haber verir.

## Çalıştırma

```bash
npm install
npm run app      # geliştirme modu (tauri dev)
npm run paket    # dağıtım paketi (tauri build)
npm test         # Rust testleri (uçtan uca akış dahil)
```

## Yapı

```
src/
  main.js              uygulama iskeleti, tema, kısayollar
  durum.js             paylaşılan durum + basit yayın/abone
  lib/                 api (Tauri komutları), güvenli HTML şablonu, modal/bildirim, simgeler
  bolumler/            kutuphane (repolar), calisma (yerel alan), hesap (giriş),
                       dallar, cakisma, istekler (PR/Issue) pencereleri
src-tauri/src/
  github.rs            gh komutları (liste, giriş, oluşturma, düzenleme, klonlama)
  yerel.rs             git durumu, diff, commit/pull/push, yayınlama, dosya işlemleri
  dal.rs               dallar, geri alma, birleştirme çakışmaları
  istek.rs             pull request ve issue işlemleri
  gecmis.rs            commit ayrıntısı, commit farkı, tersine çevirme
  harici.rs            terminal / kod editöründe açma, dosya taşıma
  ci.rs                GitHub Actions / kontrol durumu
  surum.rs             etiketler ve release'ler
  guncelleme.rs        uygulamanın kendi güncelleme denetimi
  akis_testi.rs        gerçek git depolarıyla uçtan uca kullanıcı akışı testi
  yol.rs               depo dışına taşmayı engelleyen yol doğrulama
  komut.rs             etkileşimsiz süreç çalıştırma
```

## Lisans

RepoDesk **© 2026 noviceWriter** tarafından geliştirilmiştir ve
[PolyForm Noncommercial 1.0.0](LICENSE.md) lisansıyla dağıtılır.

- ✅ Kişisel kullanım, öğrenme, araştırma, hobi projeleri ve kâr amacı gütmeyen kurumlar için **ücretsizdir**.
- ✅ Kodu inceleyebilir, kendine göre değiştirebilir ve paylaşabilirsin.
- ⚠️ Paylaştığın her kopyada (değiştirilmiş olsa bile) lisans metni ve `Required Notice` satırı, yani asıl sahibinin **noviceWriter** olduğu bilgisi korunmalıdır.
- ❌ **Ticari kullanım yasaktır**: satmak, ücretli bir ürüne/hizmete dahil etmek ya da bir şirket içinde para kazanmak amacıyla kullanmak için ayrıca yazılı izin gerekir. İzin için GitHub üzerinden [noviceWriter](https://github.com/noviceWriter) ile iletişime geç.

Bu özet bilgilendirme amaçlıdır; bağlayıcı olan [LICENSE.md](LICENSE.md) dosyasındaki İngilizce metindir.
