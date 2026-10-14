//! Commit geçmişi: ayrıntı, dosya farkları, tersine çevirme, sayfalı liste.

use std::collections::HashMap;
use std::path::Path;

use serde::Serialize;

use crate::arka_plan;
use crate::komut::git;
use crate::yerel::git_hata_acikla;
use crate::yol::kok_dizin;

const EN_BUYUK_FARK: usize = 400 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitAyrinti {
    hash: String,
    kisa: String,
    yazar: String,
    eposta: String,
    tarih: String,
    ebeveynler: Vec<String>,
    baslik: String,
    govde: String,
    dosyalar: Vec<CommitDosyasi>,
    eklenen: u64,
    silinen: u64,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CommitDosyasi {
    yol: String,
    eski_yol: Option<String>,
    durum: &'static str,
    eklenen: Option<u64>,
    silinen: Option<u64>,
}

#[derive(Serialize)]
pub struct KisaCommit {
    kisa: String,
    mesaj: String,
    yazar: String,
    tarih: String,
}

fn hash_dogrula(hash: &str) -> Result<&str, String> {
    let hash = hash.trim();
    if (4..=64).contains(&hash.len()) && hash.chars().all(|c| c.is_ascii_hexdigit()) {
        Ok(hash)
    } else {
        Err("Geçersiz commit kimliği.".into())
    }
}

/// `git diff --name-status -z -M` çıktısı.
fn ad_durum_ayristir(cikti: &str) -> Vec<CommitDosyasi> {
    let mut sonuc = Vec::new();
    let mut parcalar = cikti.split('\0').filter(|p| !p.is_empty());
    while let Some(kod) = parcalar.next() {
        let harf = kod.chars().next().unwrap_or('M');
        let (yol, eski_yol) = if matches!(harf, 'R' | 'C') {
            let eski = parcalar.next().unwrap_or_default().to_string();
            (parcalar.next().unwrap_or_default().to_string(), Some(eski))
        } else {
            (parcalar.next().unwrap_or_default().to_string(), None)
        };
        let durum = match harf {
            'A' => "eklendi",
            'D' => "silindi",
            'R' => "tasindi",
            'C' => "eklendi",
            _ => "degisti",
        };
        sonuc.push(CommitDosyasi { yol, eski_yol, durum, eklenen: None, silinen: None });
    }
    sonuc
}

/// `git diff --numstat -z -M` çıktısı → yol başına (eklenen, silinen); ikili dosyalarda None.
fn sayi_ayristir(cikti: &str) -> HashMap<String, (Option<u64>, Option<u64>)> {
    let mut harita = HashMap::new();
    let mut parcalar = cikti.split('\0');
    while let Some(kayit) = parcalar.next() {
        let mut alan = kayit.splitn(3, '\t');
        let (Some(e), Some(s), Some(yol)) = (alan.next(), alan.next(), alan.next()) else { continue };
        let yol = if yol.is_empty() {
            // Taşıma: ardından eski ve yeni yol gelir.
            let _eski = parcalar.next();
            parcalar.next().unwrap_or_default().to_string()
        } else {
            yol.to_string()
        };
        harita.insert(yol, (e.parse().ok(), s.parse().ok()));
    }
    harita
}

/// Commit'in ilk ebeveyni (yoksa kök commit).
fn fark_tabani(kok: &Path, hash: &str) -> Result<Option<String>, String> {
    let cikti = git(kok, &["rev-parse", "--verify", "-q", &format!("{hash}^1")])?;
    Ok(cikti.basarili.then(|| cikti.stdout.trim().to_string()))
}

/// Seçenekler, sonra sürümler, en sonda `--` ve yollar gelecek şekilde argüman dizer.
fn fark_argumanlari<'a>(taban: &'a Option<String>, hash: &'a str, secenekler: &[&'a str], yollar: &[&'a str]) -> Vec<&'a str> {
    let mut args = vec!["--literal-pathspecs", "-c", "core.quotepath=false"];
    match taban {
        Some(t) => {
            args.extend(["diff", "--no-color", "-M"]);
            args.extend(secenekler);
            args.extend([t.as_str(), hash]);
        }
        None => {
            args.extend(["diff-tree", "--no-color", "-r", "-M", "--root", "--no-commit-id"]);
            args.extend(secenekler);
            args.push(hash);
        }
    }
    if !yollar.is_empty() {
        args.push("--");
        args.extend(yollar);
    }
    args
}

#[tauri::command]
pub async fn commit_ayrinti(kok: String, hash: String) -> Result<CommitAyrinti, String> {
    arka_plan(move || {
        let kok = kok_dizin(&kok)?;
        let hash = hash_dogrula(&hash)?.to_string();
        let bilgi = git(&kok, &["show", "-s", "--format=%H%x1f%h%x1f%an%x1f%ae%x1f%cI%x1f%P%x1f%s%x1f%b", &hash])?.tamam()?;
        let alan: Vec<&str> = bilgi.stdout.splitn(8, '\x1f').collect();
        if alan.len() < 8 {
            return Err("Commit bilgisi okunamadı.".into());
        }
        let tam = alan[0].to_string();
        let taban = fark_tabani(&kok, &tam)?;
        let adlar = git(&kok, &fark_argumanlari(&taban, &tam, &["--name-status", "-z"], &[]))?.tamam()?;
        let sayilar = sayi_ayristir(&git(&kok, &fark_argumanlari(&taban, &tam, &["--numstat", "-z"], &[]))?.tamam()?.stdout);
        let mut dosyalar = ad_durum_ayristir(&adlar.stdout);
        for d in &mut dosyalar {
            if let Some(&(e, s)) = sayilar.get(&d.yol) {
                d.eklenen = e;
                d.silinen = s;
            }
        }
        Ok(CommitAyrinti {
            eklenen: dosyalar.iter().filter_map(|d| d.eklenen).sum(),
            silinen: dosyalar.iter().filter_map(|d| d.silinen).sum(),
            hash: tam,
            kisa: alan[1].to_string(),
            yazar: alan[2].to_string(),
            eposta: alan[3].to_string(),
            tarih: alan[4].to_string(),
            ebeveynler: alan[5].split_whitespace().map(str::to_string).collect(),
            baslik: alan[6].to_string(),
            govde: alan[7].trim().to_string(),
            dosyalar,
        })
    })
    .await
}

#[tauri::command]
pub async fn commit_fark(kok: String, hash: String, yol: String, eski_yol: Option<String>) -> Result<String, String> {
    arka_plan(move || {
        let kok = kok_dizin(&kok)?;
        let hash = hash_dogrula(&hash)?.to_string();
        let taban = fark_tabani(&kok, &hash)?;
        let mut yollar = vec![yol.as_str()];
        yollar.extend(eski_yol.as_deref());
        let mut fark = git(&kok, &fark_argumanlari(&taban, &hash, &["-p"], &yollar))?.tamam()?.stdout;
        if fark.trim().is_empty() {
            return Ok("Metin farkı yok (ikili dosya veya yalnızca kip değişikliği).".into());
        }
        if fark.len() > EN_BUYUK_FARK {
            let mut kesim = EN_BUYUK_FARK;
            while !fark.is_char_boundary(kesim) {
                kesim -= 1;
            }
            fark.truncate(kesim);
            fark.push_str("\n… (çıktı kısaltıldı)");
        }
        Ok(fark)
    })
    .await
}

/// Commit'in etkisini yeni bir commit'le tersine çevirir (gönderilmiş commit'ler için güvenli).
#[tauri::command]
pub async fn commit_tersine_cevir(kok: String, hash: String) -> Result<String, String> {
    arka_plan(move || {
        let kok = kok_dizin(&kok)?;
        let hash = hash_dogrula(&hash)?.to_string();
        if !git(&kok, &["status", "--porcelain", "--untracked-files=no"])?.tamam()?.stdout.trim().is_empty() {
            return Err("Önce commit edilmemiş değişikliklerini commit et ya da geri al.".into());
        }
        let ebeveyn_sayisi = git(&kok, &["rev-list", "--parents", "-n", "1", &hash])?.tamam()?.stdout.split_whitespace().count() - 1;
        let mut args = vec!["revert", "--no-edit"];
        if ebeveyn_sayisi > 1 {
            args.extend(["-m", "1"]);
        }
        args.push(&hash);
        let cikti = git(&kok, &args)?;
        if !cikti.basarili {
            let _ = git(&kok, &["revert", "--abort"]);
            return Err(git_hata_acikla(format!(
                "Commit otomatik olarak tersine çevrilemedi (sonraki değişikliklerle çakışıyor). Hiçbir şey değiştirilmedi.\n\n{}",
                cikti.hata()
            )));
        }
        Ok("Commit tersine çevrildi; bunu yapan yeni bir commit oluşturuldu.".into())
    })
    .await
}

#[tauri::command]
pub async fn commit_listesi(kok: String, atla: u32, adet: u32) -> Result<Vec<KisaCommit>, String> {
    arka_plan(move || {
        let kok = kok_dizin(&kok)?;
        let atla = format!("--skip={atla}");
        let adet = format!("-n{}", adet.clamp(1, 200));
        let cikti = git(&kok, &["log", &adet, &atla, "--pretty=format:%h%x1f%s%x1f%an%x1f%cI%x1e"])?.tamam()?;
        Ok(cikti
            .stdout
            .split('\x1e')
            .filter_map(|kayit| {
                let mut a = kayit.trim_matches(['\n', '\r']).split('\x1f');
                Some(KisaCommit {
                    kisa: a.next().filter(|s| !s.is_empty())?.to_string(),
                    mesaj: a.next()?.to_string(),
                    yazar: a.next()?.to_string(),
                    tarih: a.next()?.to_string(),
                })
            })
            .collect())
    })
    .await
}

#[cfg(test)]
mod testler {
    use super::*;

    #[test]
    fn ad_durum_cozulur() {
        let d = ad_durum_ayristir("M\0a.txt\0R087\0eski.rs\0yeni.rs\0A\0b c.txt\0D\0silinen\0");
        assert_eq!(d.len(), 4);
        assert_eq!(d[1], CommitDosyasi { yol: "yeni.rs".into(), eski_yol: Some("eski.rs".into()), durum: "tasindi", eklenen: None, silinen: None });
        assert_eq!(d[2].yol, "b c.txt");
        assert_eq!(d[3].durum, "silindi");
    }

    #[test]
    fn sayilar_cozulur() {
        let h = sayi_ayristir("3\t1\ta.txt\0-\t-\tresim.png\x002\t0\t\0eski.rs\0yeni.rs\0");
        assert_eq!(h["a.txt"], (Some(3), Some(1)));
        assert_eq!(h["resim.png"], (None, None));
        assert_eq!(h["yeni.rs"], (Some(2), Some(0)));
    }

    #[test]
    fn gercek_depoda_ayrinti_ve_tersine() {
        let kok = std::env::temp_dir().join(format!("repodesk-gecmis-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&kok);
        std::fs::create_dir_all(&kok).unwrap();
        let _temizlik = crate::test_yardim::Temizlik(kok.clone());
        let kok = kok.canonicalize().unwrap();
        for a in [&["init", "-b", "main"][..], &["config", "user.email", "t@e.com"], &["config", "user.name", "T"], &["config", "commit.gpgsign", "false"]] {
            git(&kok, a).unwrap().tamam().unwrap();
        }
        std::fs::write(kok.join("a.txt"), "bir\n").unwrap();
        git(&kok, &["add", "-A"]).unwrap();
        git(&kok, &["commit", "-m", "ilk", "-m", "gövde metni"]).unwrap().tamam().unwrap();
        std::fs::write(kok.join("a.txt"), "bir\niki\n").unwrap();
        git(&kok, &["commit", "-am", "ikinci"]).unwrap().tamam().unwrap();
        let k = kok.to_string_lossy().to_string();

        let ilk = tauri::async_runtime::block_on(commit_listesi(k.clone(), 1, 10)).unwrap();
        assert_eq!(ilk.len(), 1);
        let a = tauri::async_runtime::block_on(commit_ayrinti(k.clone(), ilk[0].kisa.clone())).unwrap();
        assert_eq!((a.baslik.as_str(), a.govde.as_str()), ("ilk", "gövde metni"));
        assert_eq!(a.dosyalar[0].durum, "eklendi");
        assert!(a.ebeveynler.is_empty());

        let son = tauri::async_runtime::block_on(commit_listesi(k.clone(), 0, 1)).unwrap();
        let b = tauri::async_runtime::block_on(commit_ayrinti(k.clone(), son[0].kisa.clone())).unwrap();
        assert_eq!((b.eklenen, b.silinen), (1, 0));
        assert!(tauri::async_runtime::block_on(commit_fark(k.clone(), b.kisa.clone(), "a.txt".into(), None)).unwrap().contains("+iki"));

        tauri::async_runtime::block_on(commit_tersine_cevir(k.clone(), b.kisa.clone())).unwrap();
        assert_eq!(std::fs::read_to_string(kok.join("a.txt")).unwrap(), "bir\n");
        assert!(tauri::async_runtime::block_on(commit_ayrinti(k.clone(), "zzzz".into())).is_err());
        let _ = std::fs::remove_dir_all(&kok);
    }
}
