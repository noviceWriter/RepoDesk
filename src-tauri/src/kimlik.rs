//! Commit kimliği: commit'lerde görünen ad ve e-posta.
//!
//! Git önce depoya özel ayara, sonra genel (`~/.gitconfig`) ayara bakar. Ad hiç ayarlanmamışsa
//! bilgisayar hesabındaki tam adı (Linux kurulumunda girilen) kullanır; bu yüzden kullanıcı
//! hiç yazmadığı gerçek adını commit'lerde görebilir. Bu modül bunu görünür ve seçilebilir kılar.

use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::arka_plan;
use crate::github;
use crate::komut::calistir;
use crate::yol::kok_dizin;

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct KimlikBilgisi {
    /// Commit atılınca gerçekte kullanılacak ad / e-posta.
    gecerli_ad: String,
    gecerli_eposta: String,
    /// Adın nereden geldiği: "depo", "genel" ya da "sistem".
    ad_kaynagi: String,
    eposta_kaynagi: String,
    genel_ad: String,
    genel_eposta: String,
    depo_ad: String,
    depo_eposta: String,
    github_kullanici: String,
    github_ad: String,
    /// GitHub'ın e-postayı gizleyen adresi (ör. 123+ad@users.noreply.github.com).
    github_gizli_eposta: String,
}

fn ayar_oku(dizin: Option<&Path>, kapsam: &str, anahtar: &str) -> String {
    calistir("git", &["config", kapsam, "--get", anahtar], dizin)
        .ok()
        .and_then(|c| c.basarili_ise())
        .map(|c| c.stdout.trim().to_string())
        .unwrap_or_default()
}

fn ev_dizini() -> PathBuf {
    std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")).map(PathBuf::from).unwrap_or_else(std::env::temp_dir)
}

/// `git var GIT_AUTHOR_IDENT` → "Ad <eposta> zaman dilim"
fn ident_ayir(satir: &str) -> Option<(String, String)> {
    let ac = satir.find('<')?;
    let kapa = satir[ac..].find('>')? + ac;
    Some((satir[..ac].trim().to_string(), satir[ac + 1..kapa].trim().to_string()))
}

fn kaynak(depo: &str, genel: &str) -> String {
    let k = if !depo.is_empty() {
        "depo"
    } else if !genel.is_empty() {
        "genel"
    } else {
        "sistem"
    };
    k.to_string()
}

#[tauri::command]
pub async fn kimlik_bilgisi(kok: Option<String>) -> Result<KimlikBilgisi, String> {
    arka_plan(move || {
        let depo = match kok.as_deref().filter(|k| !k.is_empty()) {
            Some(k) => Some(kok_dizin(k)?),
            None => None,
        };
        let ev = ev_dizini();
        let dizin = depo.as_deref().unwrap_or(&ev);
        let mut b = KimlikBilgisi {
            genel_ad: ayar_oku(Some(&ev), "--global", "user.name"),
            genel_eposta: ayar_oku(Some(&ev), "--global", "user.email"),
            ..Default::default()
        };
        if let Some(d) = depo.as_deref() {
            b.depo_ad = ayar_oku(Some(d), "--local", "user.name");
            b.depo_eposta = ayar_oku(Some(d), "--local", "user.email");
        }
        if let Some((ad, eposta)) = calistir("git", &["var", "GIT_AUTHOR_IDENT"], Some(dizin))
            .ok()
            .and_then(|c| c.basarili_ise())
            .and_then(|c| ident_ayir(&c.stdout))
        {
            b.gecerli_ad = ad;
            b.gecerli_eposta = eposta;
        }
        b.ad_kaynagi = kaynak(&b.depo_ad, &b.genel_ad);
        b.eposta_kaynagi = kaynak(&b.depo_eposta, &b.genel_eposta);
        if let Ok(k) = github::kullanici_getir() {
            b.github_gizli_eposta = format!("{}+{}@users.noreply.github.com", k.id, k.login);
            b.github_ad = k.name.unwrap_or_default();
            b.github_kullanici = k.login;
        }
        Ok(b)
    })
    .await
}

/// `kapsam`: "genel" (tüm projeler) ya da "depo" (yalnızca bu klasör).
/// Depo kapsamında ad ve e-posta boş gelirse depoya özel ayar silinir, genel ayar geçerli olur.
#[tauri::command]
pub async fn kimlik_kaydet(kapsam: String, kok: Option<String>, ad: String, eposta: String) -> Result<String, String> {
    arka_plan(move || {
        let (ad, eposta) = (ad.trim().to_string(), eposta.trim().to_string());
        let (bayrak, dizin) = match kapsam.as_str() {
            "genel" => ("--global", ev_dizini()),
            "depo" => ("--local", kok_dizin(kok.as_deref().ok_or("Klasör belirtilmedi.")?)?),
            _ => return Err("Geçersiz kapsam.".into()),
        };
        if bayrak == "--local" && ad.is_empty() && eposta.is_empty() {
            for anahtar in ["user.name", "user.email"] {
                // Ayar zaten yoksa git 5 ile döner; sorun değil.
                let _ = calistir("git", &["config", "--local", "--unset", anahtar], Some(&dizin));
            }
            return Ok("Bu proje artık genel kimliği kullanıyor.".into());
        }
        if ad.is_empty() || ad.contains(['<', '>', '\n']) {
            return Err("Geçerli bir ad yaz.".into());
        }
        if !eposta.contains('@') || eposta.contains(['<', '>', ' ', '\n']) {
            return Err("Geçerli bir e-posta yaz.".into());
        }
        calistir("git", &["config", bayrak, "user.name", &ad], Some(&dizin))?.tamam()?;
        calistir("git", &["config", bayrak, "user.email", &eposta], Some(&dizin))?.tamam()?;
        let yer = if bayrak == "--global" { "Tüm projeler" } else { "Bu proje" };
        Ok(format!("{yer} için commit kimliği: {ad} <{eposta}>"))
    })
    .await
}

#[cfg(test)]
mod testler {
    use super::*;

    #[test]
    fn ident_ayrilir() {
        assert_eq!(
            ident_ayir("Ahmet Günsel <a@b.c> 1760000000 +0300"),
            Some(("Ahmet Günsel".into(), "a@b.c".into()))
        );
        assert_eq!(ident_ayir("bozuk"), None);
    }

    #[test]
    fn depo_kimligi_kaydedilir_ve_kaldirilir() {
        let kok = std::env::temp_dir().join(format!("repodesk-kimlik-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&kok);
        std::fs::create_dir_all(&kok).unwrap();
        let _temizlik = crate::test_yardim::Temizlik(kok.clone());
        calistir("git", &["init", "-q"], Some(&kok)).unwrap().tamam().unwrap();
        let k = kok.canonicalize().unwrap().to_string_lossy().to_string();
        let kaydet = |ad: &str, e: &str| {
            tauri::async_runtime::block_on(kimlik_kaydet("depo".into(), Some(k.clone()), ad.into(), e.into()))
        };
        assert!(kaydet("Ad", "eposta-yok").is_err());
        kaydet("Deneme Kişi", "deneme@ornek.com").unwrap();
        assert_eq!(ayar_oku(Some(&kok), "--local", "user.name"), "Deneme Kişi");
        kaydet("", "").unwrap();
        assert_eq!(ayar_oku(Some(&kok), "--local", "user.name"), "");
    }
}
