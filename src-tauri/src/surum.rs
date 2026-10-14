//! Git etiketleri (tag) ve GitHub Release'leri.

use std::collections::HashSet;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::arka_plan;
use crate::github::sahip_repo;
use crate::komut::{gh, git};
use crate::yerel::git_hata_acikla;
use crate::yol::kok_dizin;

const ETIKET_BICIMI: &str =
    "--format=%(refname:short)%1f%(objectname:short)%1f%(*objectname:short)%1f%(creatordate:iso-strict)%1f%(objecttype)%1f%(contents:subject)";

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Etiket {
    ad: String,
    /// Etiketin gösterdiği commit (kısa)
    commit: String,
    tarih: String,
    aciklamali: bool,
    mesaj: String,
    /// None: uzak durum bilinmiyor (bağlantı yok ya da erişilemedi)
    uzakta: Option<bool>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Release {
    #[serde(default)]
    name: String,
    tag_name: String,
    #[serde(default)]
    is_draft: bool,
    #[serde(default)]
    is_latest: bool,
    #[serde(default)]
    is_prerelease: bool,
    #[serde(default)]
    published_at: Option<String>,
    #[serde(default)]
    created_at: Option<String>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseAyrinti {
    #[serde(default)]
    body: String,
    url: String,
    #[serde(default)]
    author: Option<Yazar>,
    #[serde(default)]
    assets: Vec<Dosya>,
}

#[derive(Deserialize, Serialize)]
pub struct Yazar {
    login: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Dosya {
    name: String,
    #[serde(default)]
    size: u64,
    #[serde(default)]
    download_count: u64,
    #[serde(default)]
    url: String,
}

fn etiket_adi_dogrula(kok: &Path, ad: &str) -> Result<String, String> {
    let ad = ad.trim();
    if ad.is_empty() {
        return Err("Etiket adı gerekli.".into());
    }
    if ad.starts_with('-') || !git(kok, &["check-ref-format", &format!("refs/tags/{ad}")])?.basarili {
        return Err(format!("'{ad}' geçerli bir etiket adı değil (boşluk, '..', '~', '^', ':' kullanılamaz)."));
    }
    Ok(ad.to_string())
}

/// gh komutlarında etiket adı argüman olarak geçtiği için `-` ile başlamasın.
fn etiket_metni_dogrula(ad: &str) -> Result<&str, String> {
    let ad = ad.trim();
    if ad.is_empty() || ad.starts_with('-') || ad.contains(char::is_whitespace) {
        Err("Geçersiz etiket adı.".into())
    } else {
        Ok(ad)
    }
}

fn etiketleri_ayristir(cikti: &str, uzaktakiler: Option<&HashSet<String>>) -> Vec<Etiket> {
    cikti
        .lines()
        .filter_map(|satir| {
            let a: Vec<&str> = satir.split('\x1f').collect();
            if a.len() < 6 || a[0].is_empty() {
                return None;
            }
            let aciklamali = a[4] == "tag";
            Some(Etiket {
                ad: a[0].to_string(),
                commit: if aciklamali && !a[2].is_empty() { a[2] } else { a[1] }.to_string(),
                tarih: a[3].to_string(),
                aciklamali,
                mesaj: a[5].to_string(),
                uzakta: uzaktakiler.map(|u| u.contains(a[0])),
            })
        })
        .collect()
}

/// `git ls-remote --tags origin` çıktısındaki etiket adları.
fn uzak_etiketleri_ayristir(cikti: &str) -> HashSet<String> {
    cikti
        .lines()
        .filter_map(|s| s.split('\t').nth(1)?.strip_prefix("refs/tags/"))
        .map(|ad| ad.trim_end_matches("^{}").to_string())
        .collect()
}

#[tauri::command]
pub async fn etiket_listele(kok: String) -> Result<Vec<Etiket>, String> {
    arka_plan(move || {
        let kok = kok_dizin(&kok)?;
        let yerel = git(&kok, &["for-each-ref", "--sort=-creatordate", ETIKET_BICIMI, "refs/tags"])?.tamam()?;
        let uzak = if git(&kok, &["remote", "get-url", "origin"])?.basarili {
            git(&kok, &["ls-remote", "--tags", "origin"])?.basarili_ise().map(|c| uzak_etiketleri_ayristir(&c.stdout))
        } else {
            None
        };
        Ok(etiketleri_ayristir(&yerel.stdout, uzak.as_ref()))
    })
    .await
}

#[tauri::command]
pub async fn etiket_olustur(kok: String, ad: String, mesaj: String, hedef: Option<String>) -> Result<String, String> {
    arka_plan(move || {
        let kok = kok_dizin(&kok)?;
        let ad = etiket_adi_dogrula(&kok, &ad)?;
        if !git(&kok, &["rev-parse", "--verify", "-q", "HEAD"])?.basarili {
            return Err("Etiket için önce en az bir commit gerekli.".into());
        }
        let hedef = hedef.map(|h| h.trim().to_string()).filter(|h| !h.is_empty());
        if let Some(h) = hedef.as_deref() {
            if h.starts_with('-') || !git(&kok, &["rev-parse", "--verify", "-q", &format!("{h}^{{commit}}")])?.basarili {
                return Err(format!("'{h}' bir commit olarak bulunamadı."));
            }
        }
        let mesaj = mesaj.trim();
        let mut args = if mesaj.is_empty() { vec!["tag", ad.as_str()] } else { vec!["tag", "-a", ad.as_str(), "-m", mesaj] };
        args.extend(hedef.as_deref());
        let cikti = git(&kok, &args)?;
        if !cikti.basarili && cikti.hata().contains("already exists") {
            return Err(format!("'{ad}' etiketi zaten var."));
        }
        cikti.tamam().map_err(git_hata_acikla)?;
        Ok(format!("'{ad}' etiketi oluşturuldu."))
    })
    .await
}

#[tauri::command]
pub async fn etiket_gonder(kok: String, ad: String) -> Result<String, String> {
    arka_plan(move || {
        let kok = kok_dizin(&kok)?;
        let ad = etiket_adi_dogrula(&kok, &ad)?;
        git(&kok, &["push", "origin", &format!("refs/tags/{ad}")]).and_then(|c| c.tamam()).map_err(git_hata_acikla)?;
        Ok(format!("'{ad}' etiketi GitHub'a gönderildi."))
    })
    .await
}

#[tauri::command]
pub async fn etiket_sil(kok: String, ad: String, uzakta: bool) -> Result<String, String> {
    arka_plan(move || {
        let kok = kok_dizin(&kok)?;
        let ad = etiket_adi_dogrula(&kok, &ad)?;
        if uzakta {
            git(&kok, &["push", "origin", "--delete", &format!("refs/tags/{ad}")]).and_then(|c| c.tamam()).map_err(git_hata_acikla)?;
        }
        let yerel = git(&kok, &["tag", "-d", &ad])?;
        if !yerel.basarili && !uzakta {
            return Err(yerel.hata());
        }
        Ok(if uzakta { format!("'{ad}' etiketi hem bilgisayarından hem GitHub'dan silindi.") } else { format!("'{ad}' etiketi silindi.") })
    })
    .await
}

#[tauri::command]
pub async fn release_listele(repo: String) -> Result<Vec<Release>, String> {
    arka_plan(move || {
        let tam_ad = sahip_repo(&repo)?;
        let cikti = gh(&["release", "list", "--repo", &tam_ad, "--limit", "50", "--json", "name,tagName,isDraft,isLatest,isPrerelease,publishedAt,createdAt"])?.tamam()?;
        serde_json::from_str(&cikti.stdout).map_err(|e| format!("Release listesi okunamadı: {e}"))
    })
    .await
}

#[tauri::command]
pub async fn release_ayrinti(repo: String, etiket: String) -> Result<ReleaseAyrinti, String> {
    arka_plan(move || {
        let tam_ad = sahip_repo(&repo)?;
        let etiket = etiket_metni_dogrula(&etiket)?;
        let cikti = gh(&["release", "view", etiket, "--repo", &tam_ad, "--json", "body,url,author,assets"])?.tamam()?;
        serde_json::from_str(&cikti.stdout).map_err(|e| format!("Release okunamadı: {e}"))
    })
    .await
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn release_olustur(
    repo: String,
    etiket: String,
    baslik: String,
    notlar: String,
    otomatik_not: bool,
    taslak: bool,
    on_surum: bool,
    hedef: Option<String>,
    dosyalar: Vec<String>,
) -> Result<String, String> {
    arka_plan(move || {
        let tam_ad = sahip_repo(&repo)?;
        let etiket = etiket_metni_dogrula(&etiket)?;
        for dosya in &dosyalar {
            if !Path::new(dosya).is_file() {
                return Err(format!("Eklenecek dosya bulunamadı: {dosya}"));
            }
        }
        let baslik = baslik.trim();
        let mut args = vec!["release", "create", etiket, "--repo", tam_ad.as_str()];
        if !baslik.is_empty() {
            args.extend(["--title", baslik]);
        }
        let notlar = notlar.trim();
        if otomatik_not {
            args.push("--generate-notes");
        }
        // gh, --notes verilmezse etkileşimli editör açmaya çalışır; boş not geç.
        args.extend(["--notes", notlar]);
        if taslak {
            args.push("--draft");
        }
        if on_surum {
            args.push("--prerelease");
        }
        if let Some(h) = hedef.as_deref().map(str::trim).filter(|h| !h.is_empty()) {
            if h.starts_with('-') {
                return Err("Geçersiz hedef dal.".into());
            }
            args.extend(["--target", h]);
        }
        args.extend(dosyalar.iter().map(String::as_str));
        let cikti = gh(&args)?;
        if !cikti.basarili && cikti.hata().contains("already exists") {
            return Err(format!("'{etiket}' için zaten bir release var."));
        }
        Ok(cikti.tamam()?.stdout.trim().lines().last().unwrap_or_default().to_string())
    })
    .await
}

#[tauri::command]
pub async fn release_sil(repo: String, etiket: String, etiketi_de_sil: bool) -> Result<String, String> {
    arka_plan(move || {
        let tam_ad = sahip_repo(&repo)?;
        let etiket = etiket_metni_dogrula(&etiket)?;
        let mut args = vec!["release", "delete", etiket, "--repo", tam_ad.as_str(), "--yes"];
        if etiketi_de_sil {
            args.push("--cleanup-tag");
        }
        gh(&args)?.tamam()?;
        Ok(format!("'{etiket}' release'i silindi{}.", if etiketi_de_sil { " (etiketiyle birlikte)" } else { "" }))
    })
    .await
}

#[cfg(test)]
mod testler {
    use super::*;

    #[test]
    fn uzak_etiketler_cozulur() {
        let u = uzak_etiketleri_ayristir("abc\trefs/tags/v1.0\nabd\trefs/tags/v1.0^{}\nabe\trefs/tags/v2\n");
        assert_eq!(u.len(), 2);
        assert!(u.contains("v1.0") && u.contains("v2"));
    }

    #[test]
    fn gercek_depoda_etiketler() {
        let kok = std::env::temp_dir().join(format!("repodesk-etiket-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&kok);
        std::fs::create_dir_all(&kok).unwrap();
        let _temizlik = crate::test_yardim::Temizlik(kok.clone());
        let kok = kok.canonicalize().unwrap();
        for a in [&["init", "-b", "main"][..], &["config", "user.email", "t@e.com"], &["config", "user.name", "T"], &["config", "commit.gpgsign", "false"], &["config", "tag.gpgsign", "false"]] {
            git(&kok, a).unwrap().tamam().unwrap();
        }
        let k = kok.to_string_lossy().to_string();
        assert!(tauri::async_runtime::block_on(etiket_olustur(k.clone(), "v1.0.0".into(), "".into(), None)).is_err(), "commit yokken hata");
        std::fs::write(kok.join("a"), "a").unwrap();
        git(&kok, &["add", "-A"]).unwrap();
        git(&kok, &["commit", "-m", "ilk"]).unwrap().tamam().unwrap();

        tauri::async_runtime::block_on(etiket_olustur(k.clone(), "v1.0.0".into(), "İlk sürüm".into(), None)).unwrap();
        tauri::async_runtime::block_on(etiket_olustur(k.clone(), "hafif".into(), "".into(), Some("HEAD".into()))).unwrap();
        assert!(tauri::async_runtime::block_on(etiket_olustur(k.clone(), "v1.0.0".into(), "".into(), None)).unwrap_err().contains("zaten"));
        assert!(tauri::async_runtime::block_on(etiket_olustur(k.clone(), "kötü ad".into(), "".into(), None)).is_err());
        assert!(tauri::async_runtime::block_on(etiket_olustur(k.clone(), "x".into(), "".into(), Some("--yanlis".into()))).is_err());

        let liste = tauri::async_runtime::block_on(etiket_listele(k.clone())).unwrap();
        assert_eq!(liste.len(), 2);
        let v1 = liste.iter().find(|e| e.ad == "v1.0.0").unwrap();
        assert!(v1.aciklamali && v1.mesaj == "İlk sürüm" && v1.uzakta.is_none());
        let hafif = liste.iter().find(|e| e.ad == "hafif").unwrap();
        assert_eq!(hafif.commit, v1.commit, "ikisi de aynı commit'i göstermeli");

        tauri::async_runtime::block_on(etiket_sil(k.clone(), "hafif".into(), false)).unwrap();
        assert_eq!(tauri::async_runtime::block_on(etiket_listele(k.clone())).unwrap().len(), 1);
        let _ = std::fs::remove_dir_all(&kok);
    }

    /// Gerçek GitHub hesabıyla yalnızca okuma yapar: `cargo test -- --ignored release_canli`
    #[test]
    #[ignore]
    fn release_canli() {
        let liste = tauri::async_runtime::block_on(release_listele("https://github.com/noviceWriter/iscis".into())).unwrap();
        let ilk = liste.first().expect("release yok");
        println!("release: {} ({}) en son: {}", ilk.name, ilk.tag_name, ilk.is_latest);
        let a = tauri::async_runtime::block_on(release_ayrinti("https://github.com/noviceWriter/iscis".into(), ilk.tag_name.clone())).unwrap();
        println!("dosyalar: {:?}", a.assets.iter().map(|d| (&d.name, d.size, d.download_count)).collect::<Vec<_>>());
        assert!(a.url.starts_with("https://"));
    }
}
