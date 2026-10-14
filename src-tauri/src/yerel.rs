//! Yerel çalışma alanı: Git durumu, commit/pull/push ve dosya işlemleri.

use std::path::Path;

use serde::Serialize;

use crate::arka_plan;
use crate::github::{self, ad_dogrula, gorunurluk_bayragi};
use crate::komut::{gh, git};
use crate::yol::{gorunen, goreli_metin, ic_yol, kok_dizin};

const EN_BUYUK_DOSYA: u64 = 2 * 1024 * 1024;
const EN_BUYUK_FARK: usize = 400 * 1024;
pub(crate) const CAKISMA_MESAJI: &str = "Birleştirme çakışması oluştu. Çakışan dosyaları “Değişiklikler” sekmesinden çözebilirsin.";

/// Bir birleştirme yarıda kaldıysa (MERGE_HEAD var) true.
pub(crate) fn cakisma_var_mi(kok: &Path) -> Result<bool, String> {
    Ok(git(kok, &["rev-parse", "--verify", "-q", "MERGE_HEAD"])?.basarili)
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Durum {
    pub(crate) kok: String,
    pub(crate) ad: String,
    pub(crate) git_mi: bool,
    pub(crate) ust_depo: Option<String>,
    pub(crate) dal: Option<String>,
    pub(crate) upstream: Option<String>,
    pub(crate) upstream_silindi: bool,
    pub(crate) ileri: u32,
    pub(crate) geri: u32,
    pub(crate) commit_var: bool,
    pub(crate) birlestirme: bool,
    pub(crate) birlestirme_mesaji: Option<String>,
    pub(crate) origin: Option<String>,
    pub(crate) kimlik_var: bool,
    pub(crate) degisiklikler: Vec<Degisiklik>,
    pub(crate) gecmis: Vec<Commit>,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Degisiklik {
    pub(crate) yol: String,
    pub(crate) eski_yol: Option<String>,
    pub(crate) durum: &'static str,
    pub(crate) hazir: bool,
}

#[derive(Serialize)]
pub struct Commit {
    kisa: String,
    mesaj: String,
    yazar: String,
    tarih: String,
}

#[derive(Serialize)]
pub struct YerelDosya {
    ad: String,
    yol: String,
    klasor: bool,
    boyut: u64,
}

#[derive(Debug, Default, PartialEq)]
struct DalBasligi {
    dal: Option<String>,
    upstream: Option<String>,
    upstream_silindi: bool,
    ileri: u32,
    geri: u32,
}

/// `git status -b` başlığını çözer: `main...origin/main [ahead 1, behind 2]`.
fn baslik_ayristir(baslik: &str) -> DalBasligi {
    let baslik = baslik
        .strip_prefix("No commits yet on ")
        .or_else(|| baslik.strip_prefix("Initial commit on "))
        .unwrap_or(baslik);
    let (ana, ek) = match baslik.find(" [") {
        Some(i) => (&baslik[..i], baslik[i + 2..].trim_end_matches(']')),
        None => (baslik, ""),
    };
    let (dal, upstream) = match ana.split_once("...") {
        Some((dal, upstream)) => (dal, Some(upstream.to_string())),
        None => (ana, None),
    };
    let mut sonuc = DalBasligi {
        dal: (!dal.starts_with("HEAD (")).then(|| dal.to_string()),
        upstream,
        ..Default::default()
    };
    for parca in ek.split(", ") {
        if let Some(n) = parca.strip_prefix("ahead ") {
            sonuc.ileri = n.parse().unwrap_or(0);
        } else if let Some(n) = parca.strip_prefix("behind ") {
            sonuc.geri = n.parse().unwrap_or(0);
        } else if parca == "gone" {
            sonuc.upstream_silindi = true;
        }
    }
    sonuc
}

/// `git status --porcelain=v1 -b -z` çıktısını çözer.
fn durum_ayristir(cikti: &str) -> (DalBasligi, Vec<Degisiklik>) {
    let mut baslik = DalBasligi::default();
    let mut degisiklikler = Vec::new();
    let mut parcalar = cikti.split('\0').filter(|p| !p.is_empty());
    while let Some(parca) = parcalar.next() {
        if let Some(b) = parca.strip_prefix("## ") {
            baslik = baslik_ayristir(b);
            continue;
        }
        let bayt = parca.as_bytes();
        if bayt.len() < 4 {
            continue;
        }
        let (x, y) = (bayt[0] as char, bayt[1] as char);
        let yol = parca[3..].to_string();
        let eski_yol = if matches!(x, 'R' | 'C') { parcalar.next().map(str::to_string) } else { None };
        let durum = match (x, y) {
            ('?', '?') => "yeni",
            ('U', _) | (_, 'U') | ('A', 'A') | ('D', 'D') => "cakisma",
            ('R', _) | (_, 'R') => "tasindi",
            ('D', _) | (_, 'D') => "silindi",
            ('A', _) | ('C', _) => "eklendi",
            _ => "degisti",
        };
        degisiklikler.push(Degisiklik { yol, eski_yol, durum, hazir: !matches!(x, ' ' | '?') });
    }
    (baslik, degisiklikler)
}

fn gecmis_ayristir(cikti: &str) -> Vec<Commit> {
    cikti
        .split('\x1e')
        .filter_map(|kayit| {
            let mut alan = kayit.trim_matches(['\n', '\r']).split('\x1f');
            Some(Commit {
                kisa: alan.next().filter(|s| !s.is_empty())?.to_string(),
                mesaj: alan.next()?.to_string(),
                yazar: alan.next()?.to_string(),
                tarih: alan.next()?.to_string(),
            })
        })
        .collect()
}

pub(crate) fn git_kok_mu(kok: &Path) -> Result<bool, String> {
    let cikti = git(kok, &["rev-parse", "--show-toplevel"])?;
    if !cikti.basarili {
        return Ok(false);
    }
    let ust = Path::new(cikti.stdout.trim()).canonicalize().ok();
    Ok(ust.as_deref() == Some(kok))
}

fn git_hazirla(kok: &Path) -> Result<(), String> {
    if git_kok_mu(kok)? {
        return Ok(());
    }
    if !git(kok, &["init", "-b", "main"])?.basarili {
        git(kok, &["init"])?.tamam()?;
    }
    Ok(())
}

pub(crate) fn durum_oku(kok: &Path) -> Result<Durum, String> {
    let mut durum = Durum {
        kok: gorunen(kok),
        ad: kok.file_name().map(|a| a.to_string_lossy().to_string()).unwrap_or_else(|| gorunen(kok)),
        ..Default::default()
    };
    let ust = git(kok, &["rev-parse", "--show-toplevel"])?;
    if !ust.basarili {
        return Ok(durum);
    }
    let ust_yol = Path::new(ust.stdout.trim()).canonicalize().map_err(|e| e.to_string())?;
    if ust_yol != kok {
        durum.ust_depo = Some(gorunen(&ust_yol));
        return Ok(durum);
    }
    durum.git_mi = true;

    let status = git(kok, &["status", "--porcelain=v1", "-b", "-z"])?.tamam()?;
    let (baslik, degisiklikler) = durum_ayristir(&status.stdout);
    durum.dal = baslik.dal;
    durum.upstream = baslik.upstream;
    durum.upstream_silindi = baslik.upstream_silindi;
    durum.ileri = baslik.ileri;
    durum.geri = baslik.geri;
    durum.degisiklikler = degisiklikler;

    durum.commit_var = git(kok, &["rev-parse", "--verify", "-q", "HEAD"])?.basarili;
    durum.birlestirme = git(kok, &["rev-parse", "--verify", "-q", "MERGE_HEAD"])?.basarili;
    if durum.birlestirme {
        durum.birlestirme_mesaji = std::fs::read_to_string(kok.join(".git").join("MERGE_MSG")).ok().map(|m| {
            m.lines().filter(|s| !s.starts_with('#')).collect::<Vec<_>>().join("\n").trim().to_string()
        });
    }
    let origin = git(kok, &["remote", "get-url", "origin"])?;
    durum.origin = origin.basarili.then(|| origin.stdout.trim().to_string());
    let email = git(kok, &["config", "user.email"])?;
    durum.kimlik_var = email.basarili && !email.stdout.trim().is_empty();
    if durum.commit_var {
        let log = git(kok, &["log", "-n", "40", "--pretty=format:%h%x1f%s%x1f%an%x1f%cI%x1e"])?;
        if log.basarili {
            durum.gecmis = gecmis_ayristir(&log.stdout);
        }
    }
    Ok(durum)
}

fn origin_ayarla(kok: &Path, url: &str) -> Result<(), String> {
    let islem = if git(kok, &["remote", "get-url", "origin"])?.basarili { "set-url" } else { "add" };
    git(kok, &["remote", islem, "origin", url])?.tamam()?;
    Ok(())
}

fn gitignore_ekle(kok: &Path, haricler: &[String]) -> Result<(), String> {
    let haricler: Vec<&str> = haricler.iter().map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
    if haricler.is_empty() {
        return Ok(());
    }
    for yol in &haricler {
        let ust_klasor = Path::new(yol).components().any(|c| matches!(c, std::path::Component::ParentDir));
        if yol.contains(['\n', '\r']) || Path::new(yol).is_absolute() || ust_klasor {
            return Err(format!("'{yol}' geçersiz: hariç tutulan yollar depo içinde göreli olmalı."));
        }
    }
    let dosya = kok.join(".gitignore");
    let mut icerik = std::fs::read_to_string(&dosya).unwrap_or_default();
    for yol in haricler {
        if !icerik.lines().any(|satir| satir.trim() == yol) {
            if !icerik.is_empty() && !icerik.ends_with('\n') {
                icerik.push('\n');
            }
            icerik.push_str(yol);
            icerik.push('\n');
        }
    }
    std::fs::write(dosya, icerik).map_err(|e| format!(".gitignore yazılamadı: {e}"))
}

/// Uzak deponun varsayılan dalı (`git ls-remote --symref origin HEAD`).
fn uzak_varsayilan_dal(kok: &Path) -> Result<Option<String>, String> {
    let cikti = git(kok, &["ls-remote", "--symref", "origin", "HEAD"])?.tamam()?;
    Ok(cikti
        .stdout
        .lines()
        .find_map(|satir| satir.strip_prefix("ref: refs/heads/"))
        .and_then(|kalan| kalan.split('\t').next())
        .map(str::to_string))
}

fn metni_kirp(mut metin: String, sinir: usize) -> String {
    if metin.len() > sinir {
        let mut kesim = sinir;
        while !metin.is_char_boundary(kesim) {
            kesim -= 1;
        }
        metin.truncate(kesim);
        metin.push_str("\n… (çıktı kısaltıldı)");
    }
    metin
}

fn metin_dosyasi_oku(yol: &Path, sinir: u64) -> Result<String, String> {
    let bilgi = std::fs::metadata(yol).map_err(|e| format!("Dosya okunamadı: {e}"))?;
    if bilgi.len() > sinir {
        return Err(format!("Dosya çok büyük ({} KB); bu arayüzde açılamaz.", bilgi.len() / 1024));
    }
    let bayt = std::fs::read(yol).map_err(|e| format!("Dosya okunamadı: {e}"))?;
    if bayt.iter().take(8000).any(|&b| b == 0) {
        return Err("İkili (binary) dosyalar metin olarak açılamaz.".into());
    }
    String::from_utf8(bayt).map_err(|_| "Dosya UTF-8 metin değil; bu arayüzde açılamaz.".into())
}

/// Arayüz bu önekle başlayan hatada “İzin ver” butonu gösterir.
pub(crate) const WORKFLOW_IZNI: &str = "IZIN_GEREKLI:workflow:";

pub(crate) fn git_hata_acikla(hata: String) -> String {
    if hata.contains("`workflow` scope") {
        format!("{WORKFLOW_IZNI}Gönderilenler arasında bir GitHub Actions dosyası (.github/workflows) var. GitHub bunun için ayrıca “workflow” izni istiyor. “İzin ver” ile bir kez onayla, sonra tekrar gönder.\n\n{hata}")
    } else if hata.contains("Please tell me who you are") || hata.contains("user.email") {
        "Git kimliği ayarlı değil. Çalışma alanındaki “Kimliği GitHub hesabımla ayarla” butonunu kullanın.".into()
    } else if hata.contains("[rejected]") || hata.contains("fetch first") || hata.contains("non-fast-forward") {
        format!("Uzak depoda sizde olmayan değişiklikler var. Önce Pull yapın.\n\n{hata}")
    } else if hata.contains("Repository not found") || (hata.contains("not found") && hata.contains("remote:")) {
        format!("Bağlı olunan repo GitHub'da bulunamadı (silinmiş ya da adı değişmiş olabilir). Bağlantının yanındaki “Değiştir” ile doğru repoya bağla.\n\n{hata}")
    } else if hata.contains("Authentication failed") || hata.contains("could not read Username") {
        format!("GitHub kimlik doğrulaması başarısız. Hesap menüsünden yeniden giriş yapın.\n\n{hata}")
    } else if hata.contains("CONFLICT") || hata.contains("Automatic merge failed") {
        format!("Birleştirme çakışması oluştu. Çakışan dosyaları düzenleyip commit edin.\n\n{hata}")
    } else {
        hata
    }
}

#[tauri::command]
pub async fn yerel_durum(kok: String) -> Result<Durum, String> {
    arka_plan(move || durum_oku(&kok_dizin(&kok)?)).await
}

#[tauri::command]
pub async fn yerel_dosyalar(kok: String, alt: String) -> Result<Vec<YerelDosya>, String> {
    arka_plan(move || {
        let kok = kok_dizin(&kok)?;
        let dizin = ic_yol(&kok, &alt, false)?;
        let mut dosyalar = Vec::new();
        for giris in std::fs::read_dir(&dizin).map_err(|e| format!("Klasör okunamadı: {e}"))? {
            let giris = giris.map_err(|e| e.to_string())?;
            let ad = giris.file_name().to_string_lossy().to_string();
            if ad == ".git" {
                continue;
            }
            let Ok(bilgi) = std::fs::metadata(giris.path()) else { continue };
            dosyalar.push(YerelDosya {
                yol: goreli_metin(&kok, &giris.path()),
                ad,
                klasor: bilgi.is_dir(),
                boyut: bilgi.len(),
            });
        }
        dosyalar.sort_by(|a, b| b.klasor.cmp(&a.klasor).then_with(|| a.ad.to_lowercase().cmp(&b.ad.to_lowercase())));
        Ok(dosyalar)
    })
    .await
}

#[tauri::command]
pub async fn yerel_fark(kok: String, yol: String, durum: String) -> Result<String, String> {
    arka_plan(move || {
        let kok = kok_dizin(&kok)?;
        let hedef = ic_yol(&kok, &yol, false)?;
        if durum == "yeni" {
            if hedef.is_dir() {
                return Ok("Yeni klasör — içindeki dosyalar commit ile birlikte eklenecek.".into());
            }
            let icerik = metin_dosyasi_oku(&hedef, EN_BUYUK_FARK as u64)?;
            let satirlar: String = icerik.lines().map(|s| format!("+{s}\n")).collect();
            return Ok(metni_kirp(satirlar, EN_BUYUK_FARK));
        }
        let taban = if git(&kok, &["rev-parse", "--verify", "-q", "HEAD"])?.basarili { "HEAD" } else { "--cached" };
        let cikti = git(
            &kok,
            &["-c", "core.quotepath=false", "--literal-pathspecs", "diff", "--no-color", taban, "--", &yol],
        )?
        .tamam()?;
        let fark = if cikti.stdout.trim().is_empty() { "Metin farkı yok (ikili dosya veya yalnızca kip değişikliği).".into() } else { cikti.stdout };
        Ok(metni_kirp(fark, EN_BUYUK_FARK))
    })
    .await
}

#[tauri::command]
pub async fn yerel_bagla(kok: String, url: String) -> Result<String, String> {
    arka_plan(move || {
        let kok = kok_dizin(&kok)?;
        let url = github::github_adresi_dogrula(&url)?;
        // Var olmayan bir repoya bağlanmayı baştan engelle.
        let tam_ad = github::sahip_repo(url)?;
        let kontrol = gh(&["repo", "view", &tam_ad, "--json", "name"])?;
        if !kontrol.basarili {
            let hata = kontrol.hata();
            return Err(if hata.contains("Could not resolve") || hata.contains("Not Found") {
                format!("GitHub'da '{tam_ad}' adında bir repo bulunamadı ya da ona erişimin yok. Adresi kontrol et.")
            } else {
                format!("Repo doğrulanamadı: {hata}")
            });
        }
        git_hazirla(&kok)?;
        origin_ayarla(&kok, url)?;
        Ok("Klasör GitHub reposuna bağlandı. Uzaktaki dosyaları almak için Pull yapabilirsin.".into())
    })
    .await
}

#[tauri::command]
pub async fn yerel_baglanti_kaldir(kok: String) -> Result<String, String> {
    arka_plan(move || {
        let kok = kok_dizin(&kok)?;
        git(&kok, &["remote", "remove", "origin"])?.tamam()?;
        Ok("GitHub bağlantısı kaldırıldı. Dosyaların ve commit geçmişin yerinde duruyor.".into())
    })
    .await
}

#[tauri::command]
pub async fn yerel_yayinla(
    kok: String,
    ad: String,
    gorunurluk: String,
    aciklama: String,
    haricler: Vec<String>,
    mesaj: String,
) -> Result<String, String> {
    arka_plan(move || {
        let kok = kok_dizin(&kok)?;
        let ad = ad_dogrula(&ad)?;
        let bayrak = gorunurluk_bayragi(&gorunurluk)?;
        git_hazirla(&kok)?;
        gitignore_ekle(&kok, &haricler)?;

        git(&kok, &["add", "-A"])?.tamam()?;
        if !git(&kok, &["diff", "--cached", "--quiet"])?.basarili {
            let mesaj = if mesaj.trim().is_empty() { "İlk commit" } else { mesaj.trim() };
            git(&kok, &["commit", "-m", mesaj]).and_then(|c| c.tamam()).map_err(git_hata_acikla)?;
        }
        if !git(&kok, &["rev-parse", "--verify", "-q", "HEAD"])?.basarili {
            return Err("Yüklenecek dosya yok. Klasöre en az bir dosya ekleyin.".into());
        }

        if git(&kok, &["remote", "get-url", "origin"])?.basarili {
            git(&kok, &["push", "-u", "origin", "HEAD"]).and_then(|c| c.tamam()).map_err(git_hata_acikla)?;
            return Ok("Değişiklikler mevcut origin reposuna gönderildi.".into());
        }

        let kaynak = kok.to_string_lossy().to_string();
        let mut args = vec!["repo", "create", ad, bayrak, "--source", kaynak.as_str(), "--remote", "origin", "--push"];
        let aciklama = aciklama.trim();
        if !aciklama.is_empty() {
            args.extend(["--description", aciklama]);
        }
        let cikti = gh(&args)?;
        if !cikti.basarili {
            let hata = cikti.hata();
            if hata.contains("Name already exists") {
                return Err(format!("GitHub'da '{ad}' adında bir repo zaten var. Farklı bir ad seç ya da “Mevcut repoya bağla”yı kullan."));
            }
            return Err(hata);
        }
        if let Some(dal) = git(&kok, &["branch", "--show-current"])?.tamam().ok().map(|c| c.stdout.trim().to_string()) {
            let _ = git(&kok, &["branch", &format!("--set-upstream-to=origin/{dal}")]);
        }
        Ok(format!("'{ad}' GitHub'da oluşturuldu ve ilk Push tamamlandı."))
    })
    .await
}

#[tauri::command]
pub async fn yerel_pull(kok: String) -> Result<String, String> {
    arka_plan(move || {
        let kok = kok_dizin(&kok)?;
        let durum = durum_oku(&kok)?;
        if durum.origin.is_none() {
            return Err("Bu klasör bir GitHub reposuna bağlı değil.".into());
        }
        if durum.upstream.is_some() && !durum.upstream_silindi {
            let cikti = git(&kok, &["pull", "--no-rebase", "--no-edit"])?;
            if !cikti.basarili && cakisma_var_mi(&kok)? {
                return Ok(CAKISMA_MESAJI.into());
            }
            cikti.tamam().map_err(git_hata_acikla)?;
            return Ok("Değişiklikler çekildi.".into());
        }
        let Some(uzak_dal) = uzak_varsayilan_dal(&kok)? else {
            return Err("Uzak depo henüz boş. Önce Push yaparak dosyalarını gönder.".into());
        };
        if !durum.commit_var {
            // Henüz commit yoksa yerel dalı uzaktakiyle aynı ada getir.
            git(&kok, &["symbolic-ref", "HEAD", &format!("refs/heads/{uzak_dal}")])?.tamam()?;
        }
        let cikti = git(&kok, &["pull", "--no-rebase", "--no-edit", "--allow-unrelated-histories", "origin", &uzak_dal])?;
        if !cikti.basarili && cakisma_var_mi(&kok)? {
            return Ok(CAKISMA_MESAJI.into());
        }
        cikti.tamam().map_err(git_hata_acikla)?;
        if !durum.commit_var || durum.dal.as_deref() == Some(uzak_dal.as_str()) {
            let _ = git(&kok, &["branch", &format!("--set-upstream-to=origin/{uzak_dal}")]);
        }
        Ok(format!("origin/{uzak_dal} dalındaki değişiklikler çekildi."))
    })
    .await
}

#[tauri::command]
pub async fn yerel_push(kok: String) -> Result<String, String> {
    arka_plan(move || {
        let kok = kok_dizin(&kok)?;
        let durum = durum_oku(&kok)?;
        if durum.origin.is_none() {
            return Err("Bu klasör bir GitHub reposuna bağlı değil.".into());
        }
        if !durum.commit_var {
            return Err("Henüz commit yok. Önce değişikliklerini commit et.".into());
        }
        let args: &[&str] =
            if durum.upstream.is_some() && !durum.upstream_silindi { &["push"] } else { &["push", "-u", "origin", "HEAD"] };
        git(&kok, args).and_then(|c| c.tamam()).map_err(git_hata_acikla)?;
        Ok("Değişiklikler GitHub'a gönderildi.".into())
    })
    .await
}

#[tauri::command]
pub async fn yerel_commit(kok: String, mesaj: String, dosyalar: Vec<String>, tumu: bool) -> Result<String, String> {
    arka_plan(move || {
        let kok = kok_dizin(&kok)?;
        let mesaj = mesaj.trim();
        if mesaj.is_empty() {
            return Err("Commit mesajı gerekli.".into());
        }
        if tumu {
            git(&kok, &["add", "-A"])?.tamam()?;
            git(&kok, &["commit", "-m", mesaj]).and_then(|c| c.tamam()).map_err(git_hata_acikla)?;
            return Ok("Commit oluşturuldu.".into());
        }
        if dosyalar.is_empty() {
            return Err("Commit için en az bir dosya seç.".into());
        }
        if git(&kok, &["rev-parse", "--verify", "-q", "MERGE_HEAD"])?.basarili {
            return Err("Birleştirme sürerken tüm dosyalar birlikte commit edilmeli.".into());
        }
        let yollar: Vec<&str> = dosyalar.iter().map(String::as_str).collect();
        let mut ekle = vec!["--literal-pathspecs", "add", "-A", "--"];
        ekle.extend(&yollar);
        git(&kok, &ekle)?.tamam()?;
        let mut commit = vec!["--literal-pathspecs", "commit", "-m", mesaj, "--"];
        commit.extend(&yollar);
        git(&kok, &commit).and_then(|c| c.tamam()).map_err(git_hata_acikla)?;
        Ok(format!("{} dosya ile commit oluşturuldu.", dosyalar.len()))
    })
    .await
}

#[tauri::command]
pub async fn yerel_kimlik_ayarla(kok: String) -> Result<String, String> {
    arka_plan(move || {
        let kok = kok_dizin(&kok)?;
        if !git_kok_mu(&kok)? {
            return Err("Bu klasör bir Git deposu değil.".into());
        }
        let kullanici = github::kullanici_getir()?;
        let ad = kullanici.name.clone().filter(|a| !a.trim().is_empty()).unwrap_or_else(|| kullanici.login.clone());
        let email = format!("{}+{}@users.noreply.github.com", kullanici.id, kullanici.login);
        git(&kok, &["config", "user.name", &ad])?.tamam()?;
        git(&kok, &["config", "user.email", &email])?.tamam()?;
        Ok(format!("Bu depo için Git kimliği ayarlandı: {ad} <{email}>"))
    })
    .await
}

#[tauri::command]
pub async fn dosya_oku(kok: String, yol: String) -> Result<String, String> {
    arka_plan(move || {
        let kok = kok_dizin(&kok)?;
        metin_dosyasi_oku(&ic_yol(&kok, &yol, false)?, EN_BUYUK_DOSYA)
    })
    .await
}

#[tauri::command]
pub async fn dosya_kaydet(kok: String, yol: String, icerik: String, yeni: bool) -> Result<String, String> {
    arka_plan(move || {
        let kok = kok_dizin(&kok)?;
        if yol.trim().is_empty() {
            return Err("Dosya yolu gerekli.".into());
        }
        let hedef = ic_yol(&kok, &yol, true)?;
        if hedef.is_dir() {
            return Err("Bu yol bir klasör; dosya olarak kaydedilemez.".into());
        }
        if yeni && hedef.exists() {
            return Err("Bu yolda zaten bir dosya var. Listeden açıp düzenleyebilirsin.".into());
        }
        if let Some(ust) = hedef.parent() {
            std::fs::create_dir_all(ust).map_err(|e| format!("Klasör oluşturulamadı: {e}"))?;
        }
        std::fs::write(&hedef, icerik).map_err(|e| format!("Dosya kaydedilemedi: {e}"))?;
        Ok(format!("{} kaydedildi.", goreli_metin(&kok, &hedef)))
    })
    .await
}

#[tauri::command]
pub async fn dosya_sil(kok: String, yol: String) -> Result<String, String> {
    arka_plan(move || {
        let kok = kok_dizin(&kok)?;
        let hedef = ic_yol(&kok, &yol, true)?;
        if hedef == kok {
            return Err("Depo klasörünün kendisi silinemez.".into());
        }
        if hedef.is_dir() {
            std::fs::remove_dir(&hedef).map_err(|_| "Yalnızca boş klasörler silinebilir.".to_string())?;
        } else {
            std::fs::remove_file(&hedef).map_err(|e| format!("Dosya silinemedi: {e}"))?;
        }
        Ok(format!("{} silindi.", goreli_metin(&kok, &hedef)))
    })
    .await
}

#[cfg(test)]
#[test]
fn workflow_izni_hatasi_taninir() {
    let hata = "! [remote rejected] HEAD -> main (refusing to allow an OAuth App to create or update workflow `.github/workflows/a.yml` without `workflow` scope)".to_string();
    assert!(git_hata_acikla(hata).starts_with(WORKFLOW_IZNI));
}

#[cfg(test)]
mod testler {
    use super::*;

    #[test]
    fn dal_basligi_cozulur() {
        let b = baslik_ayristir("main...origin/main [ahead 2, behind 3]");
        assert_eq!(b.dal.as_deref(), Some("main"));
        assert_eq!(b.upstream.as_deref(), Some("origin/main"));
        assert_eq!((b.ileri, b.geri), (2, 3));

        let b = baslik_ayristir("No commits yet on main");
        assert_eq!(b.dal.as_deref(), Some("main"));
        assert_eq!(b.upstream, None);

        let b = baslik_ayristir("ozellik...origin/ozellik [gone]");
        assert!(b.upstream_silindi);

        assert_eq!(baslik_ayristir("HEAD (no branch)").dal, None);
    }

    #[test]
    fn porcelain_cikti_cozulur() {
        let cikti = "## main...origin/main [ahead 1]\0 M src/a.js\0?? yeni dosya.txt\0R  yeni.rs\0eski.rs\0D  silinen\0UU cakisan\0A  eklenen\0";
        let (baslik, d) = durum_ayristir(cikti);
        assert_eq!(baslik.ileri, 1);
        assert_eq!(d.len(), 6);
        assert_eq!(d[0], Degisiklik { yol: "src/a.js".into(), eski_yol: None, durum: "degisti", hazir: false });
        assert_eq!(d[1].durum, "yeni");
        assert_eq!(d[1].yol, "yeni dosya.txt");
        assert_eq!(d[2], Degisiklik { yol: "yeni.rs".into(), eski_yol: Some("eski.rs".into()), durum: "tasindi", hazir: true });
        assert_eq!(d[3].durum, "silindi");
        assert_eq!(d[4].durum, "cakisma");
        assert_eq!(d[5].durum, "eklendi");
    }

    #[test]
    fn gecmis_cozulur() {
        let g = gecmis_ayristir("abc1234\x1fİlk commit\x1fAhmet\x1f2026-01-02T03:04:05+03:00\x1e\ndef5678\x1fİkinci\x1fA\x1f2026-01-03T00:00:00Z\x1e");
        assert_eq!(g.len(), 2);
        assert_eq!(g[0].mesaj, "İlk commit");
        assert_eq!(g[1].kisa, "def5678");
    }

    #[test]
    fn kirpma_karakter_sinirina_uyar() {
        let k = metni_kirp("ğğğğ".into(), 3);
        assert!(k.starts_with('ğ'));
        assert!(k.ends_with("kısaltıldı)"));
    }

    #[test]
    fn gercek_depoda_durum_ve_commit() {
        let kok = std::env::temp_dir().join(format!("repodesk-git-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&kok);
        std::fs::create_dir_all(&kok).unwrap();
        let _temizlik = crate::test_yardim::Temizlik(kok.clone());
        let kok = kok.canonicalize().unwrap();
        git_hazirla(&kok).unwrap();
        git(&kok, &["config", "user.email", "test@example.com"]).unwrap();
        git(&kok, &["config", "user.name", "Test"]).unwrap();
        std::fs::write(kok.join("a.txt"), "merhaba").unwrap();
        std::fs::write(kok.join("b.txt"), "dünya").unwrap();

        let d = durum_oku(&kok).unwrap();
        assert!(d.git_mi && !d.commit_var && d.kimlik_var);
        assert_eq!(d.degisiklikler.len(), 2);

        git(&kok, &["--literal-pathspecs", "add", "-A", "--", "a.txt"]).unwrap().tamam().unwrap();
        git(&kok, &["--literal-pathspecs", "commit", "-m", "yalnız a", "--", "a.txt"]).unwrap().tamam().unwrap();
        let d = durum_oku(&kok).unwrap();
        assert!(d.commit_var);
        assert_eq!(d.gecmis.len(), 1);
        assert_eq!(d.degisiklikler.len(), 1);
        assert_eq!(d.degisiklikler[0].yol, "b.txt");

        std::fs::create_dir_all(kok.join("alt")).unwrap();
        let alt = durum_oku(&kok.join("alt").canonicalize().unwrap()).unwrap();
        assert!(!alt.git_mi);
        assert!(alt.ust_depo.is_some());
        let _ = std::fs::remove_dir_all(&kok);
    }
}
