//! Dallar, değişiklikleri geri alma ve birleştirme çakışmaları.

use std::collections::HashSet;
use std::path::Path;

use serde::Serialize;

use crate::arka_plan;
use crate::komut::git;
use crate::yerel::{cakisma_var_mi, durum_oku, git_hata_acikla, CAKISMA_MESAJI};
use crate::yol::{ic_yol, kok_dizin};

/// Silinmek istenen dal birleştirilmemişse arayüz bu önekle zorla silmeyi önerir.
const BIRLESMEMIS: &str = "BIRLESMEMIS:";
const REF_BICIMI: &str =
    "--format=%(refname:short)%1f%(HEAD)%1f%(upstream:short)%1f%(upstream:track,nobracket)%1f%(committerdate:iso-strict)%1f%(contents:subject)";

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Dal {
    ad: String,
    guncel: bool,
    upstream: Option<String>,
    upstream_silindi: bool,
    ileri: u32,
    geri: u32,
    son_mesaj: String,
    tarih: String,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UzakDal {
    ad: String,
    tam_ad: String,
    yerel_var: bool,
    son_mesaj: String,
    tarih: String,
}

#[derive(Serialize)]
pub struct Dallar {
    yerel: Vec<Dal>,
    uzak: Vec<UzakDal>,
}

/// `ahead 1, behind 2` / `gone` → (ileri, geri, silindi)
fn izleme_ayristir(iz: &str) -> (u32, u32, bool) {
    let (mut ileri, mut geri, mut silindi) = (0, 0, false);
    for parca in iz.split(", ") {
        if let Some(n) = parca.strip_prefix("ahead ") {
            ileri = n.parse().unwrap_or(0);
        } else if let Some(n) = parca.strip_prefix("behind ") {
            geri = n.parse().unwrap_or(0);
        } else if parca == "gone" {
            silindi = true;
        }
    }
    (ileri, geri, silindi)
}

fn yerel_dallari_ayristir(cikti: &str) -> Vec<Dal> {
    cikti
        .lines()
        .filter_map(|satir| {
            let a: Vec<&str> = satir.split('\x1f').collect();
            if a.len() < 6 || a[0].is_empty() {
                return None;
            }
            let (ileri, geri, upstream_silindi) = izleme_ayristir(a[3]);
            Some(Dal {
                ad: a[0].to_string(),
                guncel: a[1] == "*",
                upstream: (!a[2].is_empty()).then(|| a[2].to_string()),
                upstream_silindi,
                ileri,
                geri,
                tarih: a[4].to_string(),
                son_mesaj: a[5].to_string(),
            })
        })
        .collect()
}

fn uzak_dallari_ayristir(cikti: &str, yereller: &HashSet<&str>) -> Vec<UzakDal> {
    cikti
        .lines()
        .filter_map(|satir| {
            let a: Vec<&str> = satir.split('\x1f').collect();
            let ad = a.first()?.strip_prefix("origin/")?;
            if a.len() < 6 || ad.is_empty() || ad == "HEAD" {
                return None;
            }
            Some(UzakDal {
                ad: ad.to_string(),
                tam_ad: a[0].to_string(),
                yerel_var: yereller.contains(ad),
                tarih: a[4].to_string(),
                son_mesaj: a[5].to_string(),
            })
        })
        .collect()
}

fn dal_adi_dogrula(kok: &Path, ad: &str) -> Result<String, String> {
    let ad = ad.trim();
    if ad.is_empty() {
        return Err("Dal adı gerekli.".into());
    }
    if ad.starts_with('-') || !git(kok, &["check-ref-format", "--branch", ad])?.basarili {
        return Err(format!("'{ad}' geçerli bir dal adı değil. Boşluk, '..', '~', '^', ':' ve '\\' kullanılamaz."));
    }
    Ok(ad.to_string())
}

fn gecis_hatasi(hata: String) -> String {
    if hata.contains("would be overwritten") {
        format!("Kaydedilmemiş değişikliklerin bu dala geçince kaybolacak. Önce commit et ya da değişiklikleri geri al.\n\n{hata}")
    } else {
        git_hata_acikla(hata)
    }
}

#[tauri::command]
pub async fn dal_listele(kok: String) -> Result<Dallar, String> {
    arka_plan(move || {
        let kok = kok_dizin(&kok)?;
        let yerel = yerel_dallari_ayristir(&git(&kok, &["for-each-ref", REF_BICIMI, "refs/heads"])?.tamam()?.stdout);
        let adlar: HashSet<&str> = yerel.iter().map(|d| d.ad.as_str()).collect();
        let uzak_cikti = git(&kok, &["for-each-ref", REF_BICIMI, "refs/remotes/origin"])?.tamam()?.stdout;
        let uzak = uzak_dallari_ayristir(&uzak_cikti, &adlar);
        Ok(Dallar { yerel, uzak })
    })
    .await
}

#[tauri::command]
pub async fn uzak_guncelle(kok: String) -> Result<String, String> {
    arka_plan(move || {
        let kok = kok_dizin(&kok)?;
        git(&kok, &["fetch", "--prune", "origin"]).and_then(|c| c.tamam()).map_err(git_hata_acikla)?;
        Ok("Uzak dallar güncellendi.".into())
    })
    .await
}

#[tauri::command]
pub async fn dal_olustur(kok: String, ad: String, gec: bool) -> Result<String, String> {
    arka_plan(move || {
        let kok = kok_dizin(&kok)?;
        let ad = dal_adi_dogrula(&kok, &ad)?;
        if !git(&kok, &["rev-parse", "--verify", "-q", "HEAD"])?.basarili {
            return Err("Dal oluşturmak için önce en az bir commit gerekli.".into());
        }
        if gec {
            git(&kok, &["switch", "-c", &ad]).and_then(|c| c.tamam()).map_err(gecis_hatasi)?;
            Ok(format!("'{ad}' dalı oluşturuldu ve geçildi."))
        } else {
            git(&kok, &["branch", &ad]).and_then(|c| c.tamam()).map_err(git_hata_acikla)?;
            Ok(format!("'{ad}' dalı oluşturuldu."))
        }
    })
    .await
}

#[tauri::command]
pub async fn dal_gec(kok: String, ad: String, uzak: bool) -> Result<String, String> {
    arka_plan(move || {
        let kok = kok_dizin(&kok)?;
        let ad = dal_adi_dogrula(&kok, &ad)?;
        if uzak {
            let kaynak = format!("origin/{ad}");
            git(&kok, &["switch", "--track", &kaynak]).and_then(|c| c.tamam()).map_err(gecis_hatasi)?;
        } else {
            git(&kok, &["switch", &ad]).and_then(|c| c.tamam()).map_err(gecis_hatasi)?;
        }
        Ok(format!("'{ad}' dalına geçildi."))
    })
    .await
}

#[tauri::command]
pub async fn dal_birlestir(kok: String, kaynak: String) -> Result<String, String> {
    arka_plan(move || {
        let kok = kok_dizin(&kok)?;
        let kaynak = kaynak.trim().to_string();
        if kaynak.is_empty() || kaynak.starts_with('-') {
            return Err("Birleştirilecek dal gerekli.".into());
        }
        let cikti = git(&kok, &["merge", "--no-edit", &kaynak])?;
        if !cikti.basarili && cakisma_var_mi(&kok)? {
            return Ok(CAKISMA_MESAJI.into());
        }
        let cikti = cikti.tamam().map_err(git_hata_acikla)?;
        if cikti.stdout.contains("Already up to date") || cikti.stdout.contains("Zaten güncel") {
            return Ok(format!("'{kaynak}' içindeki her şey zaten bu dalda."));
        }
        Ok(format!("'{kaynak}' bu dala birleştirildi."))
    })
    .await
}

#[tauri::command]
pub async fn dal_yeniden_adlandir(kok: String, eski: String, yeni: String) -> Result<String, String> {
    arka_plan(move || {
        let kok = kok_dizin(&kok)?;
        let eski = dal_adi_dogrula(&kok, &eski)?;
        let yeni = dal_adi_dogrula(&kok, &yeni)?;
        git(&kok, &["branch", "-m", &eski, &yeni]).and_then(|c| c.tamam()).map_err(git_hata_acikla)?;
        Ok(format!("'{eski}' dalının adı '{yeni}' oldu."))
    })
    .await
}

#[tauri::command]
pub async fn dal_sil(kok: String, ad: String, zorla: bool) -> Result<String, String> {
    arka_plan(move || {
        let kok = kok_dizin(&kok)?;
        let ad = dal_adi_dogrula(&kok, &ad)?;
        let cikti = git(&kok, &["branch", if zorla { "-D" } else { "-d" }, &ad])?;
        if !cikti.basarili && cikti.hata().contains("not fully merged") {
            return Err(format!("{BIRLESMEMIS}'{ad}' dalında başka hiçbir dala birleştirilmemiş commit'ler var."));
        }
        cikti.tamam().map_err(git_hata_acikla)?;
        Ok(format!("'{ad}' dalı silindi."))
    })
    .await
}

#[tauri::command]
pub async fn uzak_dal_sil(kok: String, ad: String) -> Result<String, String> {
    arka_plan(move || {
        let kok = kok_dizin(&kok)?;
        let ad = dal_adi_dogrula(&kok, &ad)?;
        git(&kok, &["push", "origin", "--delete", &ad]).and_then(|c| c.tamam()).map_err(git_hata_acikla)?;
        Ok(format!("'{ad}' dalı GitHub'dan silindi."))
    })
    .await
}

/// Seçilen dosyaları son commit'teki hâline döndürür; yeni (izlenmeyen) dosyaları siler.
#[tauri::command]
pub async fn degisiklik_geri_al(kok: String, yollar: Vec<String>) -> Result<String, String> {
    arka_plan(move || {
        let kok = kok_dizin(&kok)?;
        if yollar.is_empty() {
            return Err("Geri alınacak dosya seçilmedi.".into());
        }
        let durum = durum_oku(&kok)?;
        let izlenmeyen: HashSet<String> = durum
            .degisiklikler
            .iter()
            .filter(|d| d.durum == "yeni")
            .map(|d| d.yol.trim_end_matches('/').to_string())
            .collect();

        let (mut geri_yukle, mut kaldir) = (Vec::new(), Vec::new());
        for yol in &yollar {
            let yol = yol.trim_end_matches('/');
            if izlenmeyen.contains(yol) {
                let hedef = ic_yol(&kok, yol, true)?;
                let sonuc = if hedef.is_dir() { std::fs::remove_dir_all(&hedef) } else { std::fs::remove_file(&hedef) };
                sonuc.map_err(|e| format!("'{yol}' silinemedi: {e}"))?;
            } else if durum.commit_var && git(&kok, &["cat-file", "-e", &format!("HEAD:{yol}")])?.basarili {
                geri_yukle.push(yol);
            } else {
                kaldir.push(yol);
            }
        }
        if !geri_yukle.is_empty() {
            let mut args = vec!["--literal-pathspecs", "restore", "--source=HEAD", "--staged", "--worktree", "--"];
            args.extend(&geri_yukle);
            git(&kok, &args)?.tamam()?;
        }
        if !kaldir.is_empty() {
            let mut args = vec!["--literal-pathspecs", "rm", "-r", "-f", "-q", "--"];
            args.extend(&kaldir);
            git(&kok, &args)?.tamam()?;
        }
        Ok(format!("{} dosyadaki değişiklik geri alındı.", yollar.len()))
    })
    .await
}

/// Son commit'i geri alır; değişiklikler çalışma alanında kalır. Commit mesajını döndürür.
#[tauri::command]
pub async fn son_commit_geri_al(kok: String) -> Result<String, String> {
    arka_plan(move || {
        let kok = kok_dizin(&kok)?;
        let durum = durum_oku(&kok)?;
        if !durum.commit_var {
            return Err("Geri alınacak commit yok.".into());
        }
        if durum.birlestirme {
            return Err("Birleştirme sürerken commit geri alınamaz.".into());
        }
        if durum.upstream.is_some() && !durum.upstream_silindi && durum.ileri == 0 {
            return Err("Bu commit zaten GitHub'a gönderilmiş; geri almak geçmişi bozar.".into());
        }
        let mesaj = git(&kok, &["log", "-1", "--format=%B"])?.tamam()?.stdout.trim().to_string();
        if git(&kok, &["rev-parse", "--verify", "-q", "HEAD~1"])?.basarili {
            git(&kok, &["reset", "--soft", "HEAD~1"])?.tamam()?;
        } else {
            // Deponun tek commit'i: dalı başlangıç hâline döndür, dosyalar hazırlıkta kalsın.
            git(&kok, &["update-ref", "-d", "HEAD"])?.tamam()?;
        }
        Ok(mesaj)
    })
    .await
}

#[tauri::command]
pub async fn cakisma_taraf_sec(kok: String, yol: String, taraf: String) -> Result<String, String> {
    arka_plan(move || {
        let kok = kok_dizin(&kok)?;
        ic_yol(&kok, &yol, true)?;
        let bayrak = match taraf.as_str() {
            "bizim" => "--ours",
            "onlarin" => "--theirs",
            _ => return Err("Geçersiz seçim.".into()),
        };
        git(&kok, &["--literal-pathspecs", "checkout", bayrak, "--", &yol])?.tamam()?;
        git(&kok, &["--literal-pathspecs", "add", "--", &yol])?.tamam()?;
        Ok(format!("{yol} çözüldü."))
    })
    .await
}

#[tauri::command]
pub async fn cakisma_coz(kok: String, yol: String, icerik: String) -> Result<String, String> {
    arka_plan(move || {
        let kok = kok_dizin(&kok)?;
        let hedef = ic_yol(&kok, &yol, true)?;
        if icerik.lines().any(|s| s.starts_with("<<<<<<< ") || s.starts_with(">>>>>>> ")) {
            return Err("Dosyada hâlâ çözülmemiş çakışma işaretleri var.".into());
        }
        std::fs::write(&hedef, icerik).map_err(|e| format!("Dosya kaydedilemedi: {e}"))?;
        git(&kok, &["--literal-pathspecs", "add", "--", &yol])?.tamam()?;
        Ok(format!("{yol} çözüldü."))
    })
    .await
}

#[tauri::command]
pub async fn birlestirme_iptal(kok: String) -> Result<String, String> {
    arka_plan(move || {
        let kok = kok_dizin(&kok)?;
        git(&kok, &["merge", "--abort"])?.tamam()?;
        Ok("Birleştirme iptal edildi; her şey birleştirme öncesine döndü.".into())
    })
    .await
}

#[cfg(test)]
mod testler {
    use super::*;
    use crate::yerel::durum_oku;

    fn gecici_depo(ad: &str) -> (std::path::PathBuf, crate::test_yardim::Temizlik) {
        let kok = std::env::temp_dir().join(format!("repodesk-dal-{ad}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&kok);
        std::fs::create_dir_all(&kok).unwrap();
        let kok = kok.canonicalize().unwrap();
        for args in [
            &["init", "-b", "main"][..],
            &["config", "user.email", "t@example.com"],
            &["config", "user.name", "T"],
            &["config", "commit.gpgsign", "false"],
        ] {
            git(&kok, args).unwrap().tamam().unwrap();
        }
        let bekci = crate::test_yardim::Temizlik(kok.clone());
        (kok, bekci)
    }

    fn commit(kok: &Path, dosya: &str, icerik: &str, mesaj: &str) {
        std::fs::write(kok.join(dosya), icerik).unwrap();
        git(kok, &["add", "-A"]).unwrap().tamam().unwrap();
        git(kok, &["commit", "-m", mesaj]).unwrap().tamam().unwrap();
    }

    fn calistir<T>(f: impl std::future::Future<Output = T>) -> T {
        tauri::async_runtime::block_on(f)
    }

    #[test]
    fn izleme_bilgisi_cozulur() {
        assert_eq!(izleme_ayristir("ahead 3, behind 1"), (3, 1, false));
        assert_eq!(izleme_ayristir("gone"), (0, 0, true));
        assert_eq!(izleme_ayristir(""), (0, 0, false));
    }

    #[test]
    fn ref_ciktisi_cozulur() {
        let yerel = yerel_dallari_ayristir("main\x1f*\x1forigin/main\x1fahead 1\x1f2026-01-01T00:00:00+03:00\x1fİlk\nozellik\x1f \x1f\x1f\x1f2026-01-02T00:00:00+03:00\x1fDeneme\n");
        assert_eq!(yerel.len(), 2);
        assert!(yerel[0].guncel && yerel[0].ileri == 1);
        assert_eq!(yerel[1].upstream, None);
        let adlar: HashSet<&str> = ["main"].into();
        let uzak = uzak_dallari_ayristir("origin\x1f\x1f\x1f\x1f\x1f\norigin/main\x1f\x1f\x1f\x1fT\x1fA\norigin/yeni\x1f\x1f\x1f\x1fT\x1fB\n", &adlar);
        assert_eq!(uzak.len(), 2);
        assert!(uzak[0].yerel_var);
        assert_eq!(uzak[1].ad, "yeni");
    }

    #[test]
    fn dal_akisi_ve_cakisma() {
        let (kok, _temizlik) = gecici_depo("akis");
        let k = kok.to_string_lossy().to_string();
        commit(&kok, "a.txt", "satir\n", "ilk");

        calistir(dal_olustur(k.clone(), "ozellik".into(), true)).unwrap();
        commit(&kok, "a.txt", "ozellik\n", "ozellik degisikligi");
        calistir(dal_gec(k.clone(), "main".into(), false)).unwrap();
        commit(&kok, "a.txt", "ana\n", "ana degisikligi");

        let dallar = calistir(dal_listele(k.clone())).unwrap();
        assert_eq!(dallar.yerel.len(), 2);
        assert!(dallar.yerel.iter().any(|d| d.ad == "main" && d.guncel));
        assert!(calistir(dal_olustur(k.clone(), "kötü ad".into(), false)).is_err());

        let sonuc = calistir(dal_birlestir(k.clone(), "ozellik".into())).unwrap();
        assert_eq!(sonuc, CAKISMA_MESAJI);
        let durum = durum_oku(&kok).unwrap();
        assert!(durum.birlestirme);
        assert_eq!(durum.degisiklikler[0].durum, "cakisma");

        assert!(calistir(cakisma_coz(k.clone(), "a.txt".into(), "<<<<<<< HEAD\nx\n".into())).is_err());
        calistir(cakisma_coz(k.clone(), "a.txt".into(), "ana\nozellik\n".into())).unwrap();
        git(&kok, &["commit", "--no-edit"]).unwrap().tamam().unwrap();
        assert!(!durum_oku(&kok).unwrap().birlestirme);

        let hata = calistir(dal_sil(k.clone(), "main".into(), false)).unwrap_err();
        assert!(!hata.is_empty());
        calistir(dal_sil(k.clone(), "ozellik".into(), false)).unwrap();
        let _ = std::fs::remove_dir_all(&kok);
    }

    /// Türkçe (ya da başka dilde) sistemlerde git mesajları çevrilir; tanıma yine çalışmalı.
    #[test]
    fn yerellestirilmis_sistemde_hata_tanima() {
        let (kok, _temizlik) = gecici_depo("dil");
        let k = kok.to_string_lossy().to_string();
        commit(&kok, "a.txt", "1\n", "ilk");
        calistir(dal_olustur(k.clone(), "birlesmemis".into(), true)).unwrap();
        commit(&kok, "a.txt", "2\n", "yalnizca bu dalda");
        calistir(dal_gec(k.clone(), "main".into(), false)).unwrap();
        let hata = calistir(dal_sil(k.clone(), "birlesmemis".into(), false)).unwrap_err();
        assert!(hata.starts_with(BIRLESMEMIS), "birleştirilmemiş dal tanınmalı: {hata}");

        std::fs::write(kok.join("a.txt"), "kaydedilmemis\n").unwrap();
        let hata = calistir(dal_gec(k.clone(), "birlesmemis".into(), false)).unwrap_err();
        assert!(hata.starts_with("Kaydedilmemiş değişikliklerin"), "üzerine yazma uyarısı tanınmalı: {hata}");
        let _ = std::fs::remove_dir_all(&kok);
    }

    #[test]
    fn geri_alma() {
        let (kok, _temizlik) = gecici_depo("geri");
        let k = kok.to_string_lossy().to_string();
        commit(&kok, "a.txt", "orijinal\n", "ilk");
        std::fs::write(kok.join("a.txt"), "bozuldu\n").unwrap();
        std::fs::write(kok.join("yeni.txt"), "yeni\n").unwrap();
        calistir(degisiklik_geri_al(k.clone(), vec!["a.txt".into(), "yeni.txt".into()])).unwrap();
        assert_eq!(std::fs::read_to_string(kok.join("a.txt")).unwrap(), "orijinal\n");
        assert!(!kok.join("yeni.txt").exists());

        commit(&kok, "b.txt", "b\n", "ikinci commit");
        let mesaj = calistir(son_commit_geri_al(k.clone())).unwrap();
        assert_eq!(mesaj, "ikinci commit");
        assert!(kok.join("b.txt").exists());
        let durum = durum_oku(&kok).unwrap();
        assert_eq!(durum.gecmis.len(), 1);

        // Tek commit kaldığında da geri alınabilmeli.
        calistir(son_commit_geri_al(k.clone())).unwrap();
        assert!(!durum_oku(&kok).unwrap().commit_var);
        let _ = std::fs::remove_dir_all(&kok);
    }
}
