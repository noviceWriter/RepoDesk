//! Depo klasörü dışına taşan dosya yollarını engelleyen yardımcılar.

use std::path::{Component, Path, PathBuf};

/// Kullanıcının seçtiği klasörü doğrular ve gerçek (kanonik) yolunu döndürür.
pub fn kok_dizin(kok: &str) -> Result<PathBuf, String> {
    let kok = kok.trim();
    if kok.is_empty() {
        return Err("Klasör yolu gerekli.".into());
    }
    let yol = PathBuf::from(kok)
        .canonicalize()
        .map_err(|e| format!("Klasör bulunamadı ({kok}): {e}"))?;
    if !yol.is_dir() {
        return Err("Seçilen yol bir klasör değil.".into());
    }
    Ok(yol)
}

/// `goreli` yolunu `kok` altında çözer. `..`, mutlak yollar ve kök dışına
/// işaret eden sembolik bağlantılar reddedilir. `yazma` açıkken `.git`
/// klasörüne dokunulmasına izin verilmez.
pub fn ic_yol(kok: &Path, goreli: &str, yazma: bool) -> Result<PathBuf, String> {
    let mut hedef = kok.to_path_buf();
    let mut ilk = true;
    for parca in Path::new(goreli.trim()).components() {
        match parca {
            Component::Normal(ad) => {
                if yazma && ilk && ad == ".git" {
                    return Err(".git klasörü bu arayüzden değiştirilemez.".into());
                }
                ilk = false;
                hedef.push(ad);
            }
            Component::CurDir => {}
            _ => return Err("Yol depo klasörünün içinde kalmalı (.. veya mutlak yol kullanılamaz).".into()),
        }
    }

    // Var olan en derin üst klasörü bulup gerçek konumunu kontrol et;
    // böylece kök dışına uzanan sembolik bağlantılar da yakalanır.
    let mut mevcut = hedef.as_path();
    while mevcut.symlink_metadata().is_err() {
        mevcut = mevcut.parent().ok_or("Geçersiz dosya yolu.")?;
    }
    let gercek = mevcut.canonicalize().map_err(|e| format!("Yol çözümlenemedi: {e}"))?;
    if !gercek.starts_with(kok) {
        return Err("Yol depo klasörünün dışına çıkamaz.".into());
    }
    Ok(hedef)
}

/// Arayüzde gösterilecek, platformdan bağımsız göreli yol (`a/b/c`).
pub fn goreli_metin(kok: &Path, yol: &Path) -> String {
    yol.strip_prefix(kok)
        .unwrap_or(yol)
        .components()
        .map(|c| c.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

/// Windows'taki `\\?\` önekini kullanıcıya göstermemek için.
pub fn gorunen(yol: &Path) -> String {
    let metin = yol.to_string_lossy();
    metin.strip_prefix(r"\\?\").unwrap_or(&metin).to_string()
}

#[cfg(test)]
mod testler {
    use super::*;

    /// Test bitince (panik olsa bile) kendini silen geçici klasör.
    struct GeciciKok(PathBuf);

    impl std::ops::Deref for GeciciKok {
        type Target = PathBuf;
        fn deref(&self) -> &PathBuf { &self.0 }
    }

    impl Drop for GeciciKok {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn gecici_kok(ad: &str) -> GeciciKok {
        let yol = std::env::temp_dir().join(format!("repodesk-test-{ad}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&yol);
        std::fs::create_dir_all(yol.join("alt")).unwrap();
        GeciciKok(yol.canonicalize().unwrap())
    }

    #[test]
    fn icerdeki_yollar_kabul_edilir() {
        let kok = gecici_kok("ic");
        assert_eq!(ic_yol(&kok, "alt/yeni.txt", true).unwrap(), kok.join("alt/yeni.txt"));
        assert_eq!(ic_yol(&kok, "./a/b/c.txt", true).unwrap(), kok.join("a/b/c.txt"));
        assert_eq!(ic_yol(&kok, "", false).unwrap(), *kok);
    }

    #[test]
    fn disari_kacis_reddedilir() {
        let kok = gecici_kok("kacis");
        assert!(ic_yol(&kok, "../disari.txt", true).is_err());
        assert!(ic_yol(&kok, "alt/../../disari.txt", true).is_err());
        assert!(ic_yol(&kok, "yok/../../disari.txt", true).is_err());
        assert!(ic_yol(&kok, "/etc/passwd", false).is_err());
    }

    #[test]
    fn git_klasoru_yazmaya_kapali() {
        let kok = gecici_kok("git");
        assert!(ic_yol(&kok, ".git/config", true).is_err());
        assert!(ic_yol(&kok, ".git/config", false).is_ok());
        assert!(ic_yol(&kok, "alt/.git", true).is_ok());
    }

    #[cfg(unix)]
    #[test]
    fn sembolik_baglanti_kacisi_reddedilir() {
        let kok = gecici_kok("link");
        let dis = gecici_kok("link-dis");
        std::os::unix::fs::symlink(&*dis, kok.join("kacis")).unwrap();
        std::os::unix::fs::symlink(dis.join("yok.txt"), kok.join("sarkik")).unwrap();
        assert!(ic_yol(&kok, "kacis/dosya.txt", true).is_err());
        assert!(ic_yol(&kok, "sarkik", true).is_err());
    }

    #[test]
    fn goreli_metin_egik_cizgi_kullanir() {
        let kok = gecici_kok("metin");
        assert_eq!(goreli_metin(&kok, &kok.join("a").join("b.txt")), "a/b.txt");
    }
}
