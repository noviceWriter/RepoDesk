//! GitHub hesabı ve uzak depolarla ilgili komutlar (`gh` CLI üzerinden).

use std::io::{BufRead, BufReader, Read, Write};
use std::path::PathBuf;
use std::process::{Child, Stdio};
use std::sync::{Mutex, MutexGuard};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::arka_plan;
use crate::komut::{self, gh};
use crate::yol;

const REPO_ALANLARI: &str =
    "name,nameWithOwner,description,homepageUrl,visibility,url,pushedAt,isArchived,isFork,stargazerCount,primaryLanguage";
const CIHAZ_ADRESI: &str = "https://github.com/login/device";

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Repo {
    name: String,
    name_with_owner: String,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    homepage_url: Option<String>,
    visibility: String,
    url: String,
    #[serde(default)]
    pushed_at: Option<String>,
    #[serde(default)]
    is_archived: bool,
    #[serde(default)]
    is_fork: bool,
    #[serde(default)]
    stargazer_count: u64,
    #[serde(default)]
    primary_language: Option<Dil>,
}

#[derive(Deserialize, Serialize)]
pub struct Dil {
    name: String,
}

#[derive(Deserialize, Serialize)]
pub struct Kullanici {
    pub login: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(rename(serialize = "avatarUrl"))]
    pub avatar_url: String,
    #[serde(rename(serialize = "htmlUrl"))]
    pub html_url: String,
    #[serde(skip_serializing)]
    pub id: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GirisKodu {
    kod: String,
    adres: &'static str,
    tarayici_ac: bool,
}

/// Süren `gh auth login` süreci; iptal edilebilmesi için saklanır.
#[derive(Default)]
pub struct GirisSureci(Mutex<Option<Child>>);

impl GirisSureci {
    fn kilit(&self) -> MutexGuard<'_, Option<Child>> {
        self.0.lock().unwrap_or_else(|e| e.into_inner())
    }
}

pub fn ad_dogrula(ad: &str) -> Result<&str, String> {
    let ad = ad.trim();
    if ad.is_empty() {
        return Err("Repo adı gerekli.".into());
    }
    let gecerli = ad.len() <= 100
        && !ad.starts_with('-')
        && ad != "."
        && ad != ".."
        && ad.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'));
    if gecerli { Ok(ad) } else { Err("Repo adı yalnızca İngilizce harf, rakam, '-', '_' ve '.' içerebilir.".into()) }
}

pub fn gorunurluk_bayragi(gorunurluk: &str) -> Result<&'static str, String> {
    match gorunurluk {
        "public" => Ok("--public"),
        "private" => Ok("--private"),
        _ => Err("Görünürlük public veya private olmalı.".into()),
    }
}

pub fn github_adresi_dogrula(url: &str) -> Result<&str, String> {
    let url = url.trim();
    if url.starts_with("https://github.com/") || url.starts_with("git@github.com:") {
        Ok(url)
    } else {
        Err("Yalnızca GitHub repo adresleri kullanılabilir.".into())
    }
}

pub fn kullanici_getir() -> Result<Kullanici, String> {
    let cikti = gh(&["api", "user"])?.tamam()?;
    serde_json::from_str(&cikti.stdout).map_err(|e| format!("Kullanıcı bilgisi okunamadı: {e}"))
}

/// `gh` çıktısındaki tek kullanımlık cihaz kodunu (ör. `ABCD-1234`) bulur.
fn kod_bul(satir: &str) -> Option<String> {
    satir
        .split_whitespace()
        .map(|parca| parca.trim_matches(|c: char| !c.is_ascii_alphanumeric()))
        .find(|parca| {
            parca.len() == 9
                && parca.char_indices().all(|(i, c)| {
                    if i == 4 { c == '-' } else { c.is_ascii_digit() || c.is_ascii_uppercase() }
                })
        })
        .map(str::to_string)
}

#[tauri::command]
pub async fn repo_listele() -> Result<Vec<Repo>, String> {
    arka_plan(|| {
        let cikti = gh(&["repo", "list", "--limit", "1000", "--json", REPO_ALANLARI])?.tamam()?;
        serde_json::from_str(&cikti.stdout).map_err(|e| format!("Depo listesi okunamadı: {e}"))
    })
    .await
}

#[tauri::command]
pub async fn hesap_bilgisi() -> Result<Option<Kullanici>, String> {
    arka_plan(|| {
        if !gh(&["auth", "status", "--hostname", "github.com"])?.basarili {
            return Ok(None);
        }
        kullanici_getir().map(Some)
    })
    .await
}

/// `gh auth login/refresh --web` gibi cihaz kodu akışlarını çalıştırır: kodu arayüze
/// olay olarak gönderir ve kullanıcı tarayıcıda onaylayana kadar bekler.
fn cihaz_akisi(app: &AppHandle, args: &[&str], ne: &str) -> Result<(), String> {
    // Unix'te tarayıcıyı biz açıyoruz; gh'nin kendisi açmaya çalışmasın.
    let tarayici_ac = cfg!(unix);
    let mut komut = komut::hazirla("gh");
    komut.args(args).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    if tarayici_ac {
        komut.env("GH_BROWSER", "true");
    }
    let mut cocuk = komut.spawn().map_err(|e| komut::baslatma_hatasi("gh", e))?;
    let mut girdi = cocuk.stdin.take();
    let hata_akisi = cocuk.stderr.take().ok_or("gh çıktısı okunamadı.")?;
    let cikti_akisi = cocuk.stdout.take();
    let surec = app.state::<GirisSureci>();
    if let Some(mut eski) = surec.kilit().replace(cocuk) {
        let _ = eski.kill();
        let _ = eski.wait();
    }

    let okuyucu = std::thread::spawn(move || {
        let mut metin = String::new();
        if let Some(mut akis) = cikti_akisi {
            let _ = akis.read_to_string(&mut metin);
        }
        metin
    });

    let mut gunluk = String::new();
    let mut kod_gonderildi = false;
    for satir in BufReader::new(hata_akisi).lines().map_while(Result::ok) {
        if !kod_gonderildi {
            if let Some(kod) = kod_bul(&satir) {
                kod_gonderildi = true;
                let _ = app.emit("oturum-kodu", GirisKodu { kod, adres: CIHAZ_ADRESI, tarayici_ac });
                // "Press Enter to open github.com..." istemini geç.
                if let Some(girdi) = girdi.as_mut() {
                    let _ = girdi.write_all(b"\n").and_then(|_| girdi.flush());
                }
            }
        }
        gunluk.push_str(&satir);
        gunluk.push('\n');
    }
    drop(girdi);
    let stdout = okuyucu.join().unwrap_or_default();

    let Some(mut cocuk) = surec.kilit().take() else {
        return Err(format!("{ne} iptal edildi."));
    };
    if !cocuk.wait().map(|durum| durum.success()).unwrap_or(false) {
        let detay = if gunluk.trim().is_empty() { stdout } else { gunluk };
        return Err(format!("{ne} tamamlanamadı. {}", detay.trim()));
    }
    Ok(())
}

#[tauri::command]
pub async fn oturum_ac(app: AppHandle) -> Result<Kullanici, String> {
    arka_plan(move || {
        cihaz_akisi(&app, &["auth", "login", "--hostname", "github.com", "--git-protocol", "https", "--web"], "GitHub girişi")?;
        // git'in kimlik bilgisi için gh'yi kullanmasını sağla (push/pull için).
        let _ = gh(&["auth", "setup-git", "--hostname", "github.com"]);
        kullanici_getir()
    })
    .await
}

/// Oturuma ek bir izin (kapsam) ekler; ör. repo silmek için `delete_repo`.
#[tauri::command]
pub async fn izin_ekle(app: AppHandle, kapsam: String) -> Result<(), String> {
    arka_plan(move || {
        // Yalnızca arayüzün gerçekten istediği izinler.
        if !matches!(kapsam.as_str(), "delete_repo") {
            return Err("Bu izin istenemez.".into());
        }
        cihaz_akisi(&app, &["auth", "refresh", "--hostname", "github.com", "--scopes", &kapsam], "İzin verme")
    })
    .await
}

/// `gh auth status` çıktısındaki token kapsamları.
fn kapsamlar(cikti: &str) -> Vec<String> {
    cikti
        .lines()
        .find_map(|s| s.split_once("Token scopes:").map(|(_, k)| k))
        .map(|k| k.split(',').map(|x| x.trim().trim_matches(['\'', '"']).to_string()).filter(|x| !x.is_empty()).collect())
        .unwrap_or_default()
}

const IZIN_GEREKLI: &str = "IZIN_GEREKLI:";

#[tauri::command]
pub async fn repo_sil(repo: String, onay: String) -> Result<(), String> {
    arka_plan(move || {
        let tam_ad = sahip_repo(&repo)?;
        // Arayüzdeki onay kutusunun atlanamaması için adı burada da denetle.
        if onay.trim() != tam_ad {
            return Err(format!("Onay metni '{tam_ad}' ile birebir aynı olmalı."));
        }
        let durum = gh(&["auth", "status", "--hostname", "github.com"])?;
        let metin = format!("{}{}", durum.stdout, durum.stderr);
        if !kapsamlar(&metin).iter().any(|k| k == "delete_repo") {
            return Err(format!("{IZIN_GEREKLI}Repo silmek için GitHub CLI'ın “delete_repo” iznine ihtiyacı var. “İzin ver” butonuyla bir kez onayla."));
        }
        let cikti = gh(&["repo", "delete", &tam_ad, "--yes"])?;
        if !cikti.basarili {
            let hata = cikti.hata();
            if hata.contains("delete_repo") {
                return Err(format!("{IZIN_GEREKLI}GitHub silme iznini reddetti. “İzin ver” ile yeniden onayla.\n\n{hata}"));
            }
            if hata.contains("Must have admin rights") || hata.contains("403") {
                return Err(format!("Bu repoyu silmek için yönetici (admin) yetkin yok.\n\n{hata}"));
            }
            return Err(hata);
        }
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn repo_arsivle(repo: String, arsivle: bool) -> Result<String, String> {
    arka_plan(move || {
        let tam_ad = sahip_repo(&repo)?;
        gh(&["repo", if arsivle { "archive" } else { "unarchive" }, &tam_ad, "--yes"])?.tamam()?;
        Ok(if arsivle { format!("{tam_ad} arşivlendi.") } else { format!("{tam_ad} arşivden çıkarıldı.") })
    })
    .await
}

#[tauri::command]
pub fn oturum_iptal(surec: State<'_, GirisSureci>) {
    if let Some(mut cocuk) = surec.kilit().take() {
        let _ = cocuk.kill();
        let _ = cocuk.wait();
    }
}

#[tauri::command]
pub async fn oturum_kapat() -> Result<(), String> {
    arka_plan(|| {
        gh(&["auth", "logout", "--hostname", "github.com"])?.tamam()?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn repo_olustur(
    ad: String,
    aciklama: String,
    gorunurluk: String,
    readme: bool,
    gitignore: Option<String>,
    lisans: Option<String>,
) -> Result<String, String> {
    arka_plan(move || {
        let ad = ad_dogrula(&ad)?;
        let mut args = vec!["repo", "create", ad, gorunurluk_bayragi(&gorunurluk)?];
        let aciklama = aciklama.trim();
        if !aciklama.is_empty() {
            args.extend(["--description", aciklama]);
        }
        if readme {
            args.push("--add-readme");
        }
        if let Some(sablon) = gitignore.as_deref().filter(|s| !s.is_empty()) {
            args.extend(["--gitignore", sablon]);
        }
        if let Some(lisans) = lisans.as_deref().filter(|s| !s.is_empty()) {
            args.extend(["--license", lisans]);
        }
        let cikti = gh(&args)?;
        if !cikti.basarili && cikti.hata().contains("Name already exists") {
            return Err(format!("GitHub hesabında '{ad}' adında bir repo zaten var."));
        }
        Ok(cikti.tamam()?.stdout.trim().to_string())
    })
    .await
}

/// `https://github.com/sahip/repo(.git)` → `sahip/repo`
pub(crate) fn sahip_repo(url: &str) -> Result<String, String> {
    let yol = github_adresi_dogrula(url)?
        .trim_start_matches("https://github.com/")
        .trim_start_matches("git@github.com:")
        .trim_end_matches('/')
        .trim_end_matches(".git");
    match yol.split('/').collect::<Vec<_>>()[..] {
        [sahip, repo] if !sahip.is_empty() && !repo.is_empty() => Ok(format!("{sahip}/{repo}")),
        _ => Err("Repo adresi çözümlenemedi.".into()),
    }
}

/// Repo ayarlarını günceller; ad değiştiyse yeni adresi döndürür.
#[tauri::command]
pub async fn repo_guncelle(
    repo: String,
    yeni_ad: Option<String>,
    aciklama: String,
    ana_sayfa: String,
    gorunurluk: Option<String>,
) -> Result<Option<String>, String> {
    arka_plan(move || {
        let tam_ad = sahip_repo(&repo)?;
        let ana_sayfa = ana_sayfa.trim();
        if !ana_sayfa.is_empty() && !ana_sayfa.starts_with("http://") && !ana_sayfa.starts_with("https://") {
            return Err("Ana sayfa adresi http:// veya https:// ile başlamalı.".into());
        }
        let mut args = vec!["repo", "edit", tam_ad.as_str(), "--description", aciklama.as_str(), "--homepage", ana_sayfa];
        let mut duzenlendi = false;
        if let Some(gorunurluk) = gorunurluk.as_deref() {
            if !matches!(gorunurluk, "public" | "private" | "internal") {
                return Err("Geçersiz görünürlük seçimi.".into());
            }
            args.extend(["--visibility", gorunurluk]);
            // Yeni gh sürümleri bu onayı zorunlu tutuyor, eskileri tanımıyor.
            let mut onayli = args.clone();
            onayli.push("--accept-visibility-change-consequences");
            let cikti = gh(&onayli)?;
            if cikti.basarili || !cikti.hata().contains("unknown flag") {
                cikti.tamam()?;
                duzenlendi = true;
            }
        }
        if !duzenlendi {
            gh(&args)?.tamam()?;
        }

        let Some(yeni_ad) = yeni_ad.as_deref().map(str::trim).filter(|a| !a.is_empty()) else {
            return Ok(None);
        };
        let yeni_ad = ad_dogrula(yeni_ad)?;
        let (sahip, eski_ad) = tam_ad.split_once('/').unwrap_or_default();
        if yeni_ad == eski_ad {
            return Ok(None);
        }
        let cikti = gh(&["repo", "rename", yeni_ad, "--repo", tam_ad.as_str(), "--yes"])?;
        if !cikti.basarili && cikti.hata().contains("already exists") {
            return Err(format!("'{yeni_ad}' adında bir repo zaten var. Diğer ayarlar kaydedildi."));
        }
        cikti.tamam()?;
        Ok(Some(format!("https://github.com/{sahip}/{yeni_ad}")))
    })
    .await
}

#[tauri::command]
pub async fn repo_klonla(url: String, hedef_klasor: String, ad: String) -> Result<String, String> {
    arka_plan(move || {
        let url = github_adresi_dogrula(&url)?;
        let ad = ad_dogrula(&ad)?;
        let ust = yol::kok_dizin(&hedef_klasor)?;
        let hedef: PathBuf = ust.join(ad);
        if hedef.symlink_metadata().is_ok() {
            return Err(format!("'{}' zaten var. Başka bir hedef klasör seçin.", yol::gorunen(&hedef)));
        }
        let hedef_metni = hedef.to_string_lossy().to_string();
        gh(&["repo", "clone", url, &hedef_metni])?.tamam()?;
        Ok(yol::gorunen(&hedef))
    })
    .await
}

#[cfg(test)]
mod testler {
    use super::*;

    #[test]
    fn cihaz_kodu_bulunur() {
        assert_eq!(kod_bul("! First copy your one-time code: AB12-CD34").as_deref(), Some("AB12-CD34"));
        assert_eq!(kod_bul("- one-time code: (1A2B-3C4D)").as_deref(), Some("1A2B-3C4D"));
        assert_eq!(kod_bul("Press Enter to open github.com in your browser..."), None);
        assert_eq!(kod_bul("one-time abcd-efgh"), None);
    }

    /// Onay metni eşleşmezse gh'ye hiç gidilmeden reddedilmeli (arayüz atlatılsa bile).
    #[test]
    fn repo_silme_onay_olmadan_reddedilir() {
        let sil = |repo: &str, onay: &str| tauri::async_runtime::block_on(repo_sil(repo.into(), onay.into()));
        let hata = sil("https://github.com/sahip/repo", "sahip/baska").unwrap_err();
        assert!(hata.contains("birebir"), "{hata}");
        assert!(sil("https://github.com/sahip/repo", "").unwrap_err().contains("birebir"));
        assert!(sil("https://github.com/sahip/repo", "SAHIP/REPO").is_err(), "büyük/küçük harf de birebir olmalı");
        assert!(sil("https://kotu.example/a/b", "a/b").is_err(), "GitHub dışı adres reddedilmeli");
    }

    #[test]
    fn kapsamlar_okunur() {
        let cikti = "github.com\n  ✓ Logged in to github.com account a (keyring)\n  - Token scopes: 'gist', 'read:org', 'repo', 'workflow'\n";
        assert_eq!(kapsamlar(cikti), vec!["gist", "read:org", "repo", "workflow"]);
        assert!(kapsamlar("hiçbir şey").is_empty());
    }

    #[test]
    fn repo_adi_dogrulanir() {
        assert_eq!(ad_dogrula("  proje-1.0_x ").unwrap(), "proje-1.0_x");
        assert!(ad_dogrula("").is_err());
        assert!(ad_dogrula("--help").is_err());
        assert!(ad_dogrula("çalışma").is_err());
        assert!(ad_dogrula("a/b").is_err());
        assert!(ad_dogrula("..").is_err());
    }

    #[test]
    fn sahip_repo_cozulur() {
        assert_eq!(sahip_repo("https://github.com/a/b").unwrap(), "a/b");
        assert_eq!(sahip_repo("https://github.com/a/b.git").unwrap(), "a/b");
        assert_eq!(sahip_repo("git@github.com:a/b.git").unwrap(), "a/b");
        assert!(sahip_repo("https://github.com/a").is_err());
        assert!(sahip_repo("https://github.com/a/b/c").is_err());
    }

    #[test]
    fn yalniz_github_adresleri() {
        assert!(github_adresi_dogrula("https://github.com/a/b").is_ok());
        assert!(github_adresi_dogrula("git@github.com:a/b.git").is_ok());
        assert!(github_adresi_dogrula("https://evil.example/a").is_err());
        assert!(github_adresi_dogrula("--upload-pack=x").is_err());
    }
}
