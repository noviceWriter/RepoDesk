//! Uygulamanın kendi güncellemesini GitHub Release'lerinden denetler.

use serde::{Deserialize, Serialize};

use crate::arka_plan;
use crate::komut::gh;

const MEVCUT: &str = env!("CARGO_PKG_VERSION");

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SonRelease {
    tag_name: String,
    url: String,
    #[serde(default)]
    assets: Vec<Varlik>,
}

#[derive(Deserialize)]
struct Varlik {
    name: String,
    url: String,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Guncelleme {
    surum: String,
    mevcut: &'static str,
    url: String,
    deb_url: Option<String>,
    appimage_url: Option<String>,
}

/// `v1.2.3`, `1.2.3-beta` → (1, 2, 3). Sürüm biçiminde değilse None.
fn surum_ayristir(metin: &str) -> Option<(u64, u64, u64)> {
    let cekirdek = metin.trim().trim_start_matches(['v', 'V']).split(['-', '+']).next()?;
    let mut p = cekirdek.split('.').map(|x| x.parse::<u64>().ok());
    Some((p.next()??, p.next().unwrap_or(Some(0))?, p.next().unwrap_or(Some(0))?))
}

fn daha_yeni_mi(aday: &str, mevcut: &str) -> bool {
    matches!((surum_ayristir(aday), surum_ayristir(mevcut)), (Some(a), Some(m)) if a > m)
}

/// `sahip/repo` ya da tam GitHub adresini kabul eder.
fn depo_adi(repo: &str) -> Result<String, String> {
    let r = repo.trim().trim_start_matches("https://github.com/").trim_end_matches('/').trim_end_matches(".git");
    let parcalar: Vec<&str> = r.split('/').collect();
    let gecerli = |s: &str| !s.is_empty() && !s.starts_with('-') && s.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'));
    match parcalar[..] {
        [sahip, ad] if gecerli(sahip) && gecerli(ad) => Ok(format!("{sahip}/{ad}")),
        _ => Err("Güncelleme deposu “kullanici/repo” biçiminde olmalı.".into()),
    }
}

fn guncelleme_bul(json: &str, mevcut: &'static str) -> Result<Option<Guncelleme>, String> {
    let son: SonRelease = serde_json::from_str(json).map_err(|e| format!("Release okunamadı: {e}"))?;
    if !daha_yeni_mi(&son.tag_name, mevcut) {
        return Ok(None);
    }
    let bul = |uzanti: &str| son.assets.iter().find(|v| v.name.to_lowercase().ends_with(uzanti)).map(|v| v.url.clone());
    Ok(Some(Guncelleme {
        deb_url: bul(".deb"),
        appimage_url: bul(".appimage"),
        surum: son.tag_name,
        mevcut,
        url: son.url,
    }))
}

/// Belirtilen repodaki son (taslak ve ön sürüm olmayan) release daha yeniyse bilgisini döndürür.
#[tauri::command]
pub async fn guncelleme_kontrol(repo: String) -> Result<Option<Guncelleme>, String> {
    arka_plan(move || {
        let depo = depo_adi(&repo)?;
        let cikti = gh(&["release", "view", "--repo", &depo, "--json", "tagName,url,assets"])?;
        if !cikti.basarili {
            let hata = cikti.hata();
            if hata.contains("release not found") || hata.contains("Not Found") {
                return Ok(None);
            }
            return Err(format!("Güncelleme denetlenemedi: {hata}"));
        }
        guncelleme_bul(&cikti.stdout, MEVCUT)
    })
    .await
}

#[cfg(test)]
mod testler {
    use super::*;

    #[test]
    fn surumler_karsilastirilir() {
        assert!(daha_yeni_mi("v0.3.0", "0.2.0"));
        assert!(daha_yeni_mi("v0.2.10", "0.2.9"));
        assert!(daha_yeni_mi("1.0.0-beta", "0.9.9"));
        assert!(!daha_yeni_mi("v0.2.0", "0.2.0"));
        assert!(!daha_yeni_mi("v0.1.9", "0.2.0"));
        assert!(!daha_yeni_mi("apk-2026-08-16", "0.2.0"), "sürüm biçiminde olmayan etiket güncelleme sayılmaz");
        assert_eq!(surum_ayristir("v2"), Some((2, 0, 0)));
    }

    #[test]
    fn depo_adi_dogrulanir() {
        assert_eq!(depo_adi("noviceWriter/gh-ui").unwrap(), "noviceWriter/gh-ui");
        assert_eq!(depo_adi("https://github.com/a/b.git").unwrap(), "a/b");
        assert!(depo_adi("--repo").is_err());
        assert!(depo_adi("a/b/c").is_err());
    }

    #[test]
    fn guncelleme_varliklari_bulunur() {
        let json = r#"{"tagName":"v9.0.0","url":"https://github.com/a/b/releases/tag/v9.0.0","assets":[
            {"name":"RepoDesk_9.0.0_amd64.deb","url":"https://x/a.deb"},{"name":"RepoDesk_9.0.0_amd64.AppImage","url":"https://x/a.AppImage"}]}"#;
        let g = guncelleme_bul(json, "0.2.0").unwrap().unwrap();
        assert_eq!(g.deb_url.as_deref(), Some("https://x/a.deb"));
        assert_eq!(g.appimage_url.as_deref(), Some("https://x/a.AppImage"));
        assert_eq!(guncelleme_bul(json, "9.0.0").unwrap(), None);
    }
}
