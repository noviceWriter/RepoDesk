//! Dosya/klasörü harici uygulamada (terminal, kod editörü) açma ve dosya taşıma.

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use crate::arka_plan;
use crate::yol::{goreli_metin, ic_yol, kok_dizin};

/// PATH içinde programı arar.
fn bul(program: &str) -> Option<PathBuf> {
    let yol = Path::new(program);
    if yol.components().count() > 1 {
        return yol.is_file().then(|| yol.to_path_buf());
    }
    let uzantilar: &[&str] = if cfg!(windows) { &["", ".exe", ".cmd", ".bat"] } else { &[""] };
    std::env::split_paths(&std::env::var_os("PATH")?).find_map(|dizin| {
        uzantilar.iter().map(|u| dizin.join(format!("{program}{u}"))).find(|aday| aday.is_file())
    })
}

/// AppImage içinden çalışırken ortam değişkenleri paketin içini gösterir (`PYTHONHOME`,
/// `LD_LIBRARY_PATH`, `GTK_PATH`…). Bunlar dış programlara geçerse sistemin kendi programları
/// (ör. Python betiği olan gnome-terminal) açılamaz. Paket içini gösteren parçaları ayıklar;
/// değer tamamen boşalırsa `None` döner (değişken silinmeli).
fn appimage_disi_deger(deger: &str, appdir: &str) -> Option<String> {
    let kalan: Vec<&str> = deger.split(':').filter(|p| !p.is_empty() && !p.starts_with(appdir)).collect();
    (!kalan.is_empty()).then(|| kalan.join(":"))
}

pub(crate) fn ortami_temizle(komut: &mut Command) {
    let Some(appdir) = std::env::var("APPDIR").ok().filter(|d| !d.is_empty()) else { return };
    for anahtar in ["APPDIR", "APPIMAGE", "ARGV0", "OWD"] {
        komut.env_remove(anahtar);
    }
    for (anahtar, deger) in std::env::vars() {
        if !deger.contains(&appdir) {
            continue;
        }
        match appimage_disi_deger(&deger, &appdir) {
            Some(yeni) => komut.env(&anahtar, yeni),
            None => komut.env_remove(&anahtar),
        };
    }
}

/// Süreci arka planda başlatır; bitince toplanması için bir iş parçacığı bekler.
fn baslat(program: &Path, args: &[String], dizin: &Path) -> Result<(), String> {
    let mut komut = Command::new(program);
    ortami_temizle(&mut komut);
    komut.args(args).current_dir(dizin).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    let mut cocuk = komut.spawn().map_err(|e| {
        let hata = format!("{} başlatılamadı: {e}", program.display());
        crate::gunluk::yaz(crate::gunluk::Seviye::Hata, "harici", &hata);
        hata
    })?;
    crate::gunluk::yaz(crate::gunluk::Seviye::Bilgi, "harici", &format!("{} {} ({})", program.display(), args.join(" "), dizin.display()));
    std::thread::spawn(move || {
        let _ = cocuk.wait();
    });
    Ok(())
}

/// Ayarlardaki komutu (ör. `code --new-window`) programa ve argümanlara ayırır. Kabuk kullanılmaz.
fn komutu_ayir(komut: &str) -> Option<(String, Vec<String>)> {
    let mut parcalar = komut.split_whitespace().map(str::to_string);
    let program = parcalar.next()?;
    Some((program, parcalar.collect()))
}

/// Bilinen terminaller için çalışma dizini argümanı.
fn terminal_argumanlari(ad: &str, dizin: &str) -> Vec<String> {
    match ad {
        "gnome-terminal" | "xfce4-terminal" | "tilix" | "ptyxis" | "kgx" => vec![format!("--working-directory={dizin}")],
        "konsole" => vec!["--workdir".into(), dizin.into()],
        "kitty" => vec!["--directory".into(), dizin.into()],
        "alacritty" => vec!["--working-directory".into(), dizin.into()],
        "wezterm" => vec!["start".into(), "--cwd".into(), dizin.into()],
        _ => vec![],
    }
}

fn terminal_ac(dizin: &Path, ayar: &str) -> Result<(), String> {
    let dizin_metni = dizin.to_string_lossy().to_string();
    if let Some((program, mut args)) = komutu_ayir(ayar) {
        let yol = bul(&program).ok_or_else(|| format!("Terminal komutu bulunamadı: {program}"))?;
        let ad = yol.file_stem().map(|a| a.to_string_lossy().to_string()).unwrap_or_default();
        args.extend(terminal_argumanlari(&ad, &dizin_metni));
        return baslat(&yol, &args, dizin);
    }
    if cfg!(target_os = "macos") {
        return baslat(Path::new("open"), &["-a".into(), "Terminal".into(), dizin_metni], dizin);
    }
    if cfg!(windows) {
        if let Some(wt) = bul("wt") {
            return baslat(&wt, &["-d".into(), dizin_metni], dizin);
        }
        return baslat(Path::new("cmd"), &["/c".into(), "start".into(), "cmd".into()], dizin);
    }
    let adaylar = std::env::var("TERMINAL").ok().into_iter().chain(
        ["gnome-terminal", "ptyxis", "kgx", "konsole", "xfce4-terminal", "tilix", "kitty", "alacritty", "wezterm", "x-terminal-emulator", "xterm"]
            .map(String::from),
    );
    for aday in adaylar {
        if let Some(yol) = bul(&aday) {
            return baslat(&yol, &terminal_argumanlari(&aday, &dizin_metni), dizin);
        }
    }
    Err("Bilgisayarında desteklenen bir terminal bulunamadı. Ayarlar'dan terminal komutunu belirtebilirsin.".into())
}

/// Klasörü dosya yöneticisinde açar.
pub(crate) fn klasoru_ac(klasor: &Path) -> Result<(), String> {
    let program = if cfg!(target_os = "macos") { "open" } else if cfg!(windows) { "explorer" } else { "xdg-open" };
    let yol = bul(program).unwrap_or_else(|| PathBuf::from(program));
    baslat(&yol, &[klasor.to_string_lossy().into_owned()], klasor)
}

fn editor_ac(kok: &Path, hedef: &Path, ayar: &str) -> Result<(), String> {
    let ayar = if ayar.trim().is_empty() { "code" } else { ayar.trim() };
    let (program, mut args) = komutu_ayir(ayar).ok_or("Editör komutu boş.")?;
    let yol = bul(&program).ok_or_else(|| {
        format!("'{program}' bulunamadı. VS Code kurulu değilse Ayarlar'dan başka bir editör komutu yazabilirsin (ör. codium, subl, gedit).")
    })?;
    let ad = yol.file_stem().map(|a| a.to_string_lossy().to_lowercase()).unwrap_or_default();
    // VS Code ailesi: klasörü çalışma alanı olarak açıp dosyayı içinde göster.
    if matches!(ad.as_str(), "code" | "codium" | "code-insiders" | "cursor") {
        args.push(kok.to_string_lossy().to_string());
        if hedef != kok {
            args.extend(["--goto".into(), hedef.to_string_lossy().to_string()]);
        }
    } else {
        args.push(hedef.to_string_lossy().to_string());
    }
    baslat(&yol, &args, kok)
}

#[tauri::command]
pub async fn harici_ac(kok: String, yol: String, tur: String, komut: String) -> Result<(), String> {
    arka_plan(move || {
        let kok = kok_dizin(&kok)?;
        let hedef = ic_yol(&kok, &yol, false)?;
        match tur.as_str() {
            "terminal" => {
                let dizin = if hedef.is_dir() { hedef.clone() } else { hedef.parent().unwrap_or(&kok).to_path_buf() };
                terminal_ac(&dizin, &komut)
            }
            "editor" => editor_ac(&kok, &hedef, &komut),
            _ => Err("Geçersiz açma türü.".into()),
        }
    })
    .await
}

#[tauri::command]
pub async fn dosya_tasi(kok: String, eski: String, yeni: String) -> Result<String, String> {
    arka_plan(move || {
        let kok = kok_dizin(&kok)?;
        let kaynak = ic_yol(&kok, &eski, true)?;
        let hedef = ic_yol(&kok, yeni.trim().trim_end_matches('/'), true)?;
        if kaynak == kok || hedef == kok {
            return Err("Depo klasörünün kendisi taşınamaz.".into());
        }
        if kaynak.symlink_metadata().is_err() {
            return Err("Taşınacak dosya bulunamadı.".into());
        }
        if hedef.symlink_metadata().is_ok() {
            return Err(format!("'{}' zaten var.", goreli_metin(&kok, &hedef)));
        }
        if hedef.starts_with(&kaynak) {
            return Err("Bir klasör kendi içine taşınamaz.".into());
        }
        if let Some(ust) = hedef.parent() {
            std::fs::create_dir_all(ust).map_err(|e| format!("Klasör oluşturulamadı: {e}"))?;
        }
        std::fs::rename(&kaynak, &hedef).map_err(|e| format!("Taşınamadı: {e}"))?;
        Ok(format!("{} → {}", goreli_metin(&kok, &kaynak), goreli_metin(&kok, &hedef)))
    })
    .await
}

#[cfg(test)]
mod testler {
    use super::*;

    #[test]
    fn komut_ayrilir() {
        assert_eq!(komutu_ayir("code --new-window"), Some(("code".into(), vec!["--new-window".into()])));
        assert_eq!(komutu_ayir("   "), None);
    }

    #[test]
    fn terminal_dizin_argumani() {
        assert_eq!(terminal_argumanlari("gnome-terminal", "/a b"), vec!["--working-directory=/a b".to_string()]);
        assert_eq!(terminal_argumanlari("konsole", "/x"), vec!["--workdir".to_string(), "/x".to_string()]);
        assert!(terminal_argumanlari("xterm", "/x").is_empty());
    }

    #[test]
    fn appimage_yollari_ayiklanir() {
        let d = "/tmp/.mount_X";
        assert_eq!(appimage_disi_deger("/tmp/.mount_X/usr/bin/:/usr/bin:/bin", d), Some("/usr/bin:/bin".into()));
        assert_eq!(appimage_disi_deger("/tmp/.mount_X/usr/", d), None);
        assert_eq!(appimage_disi_deger("/tmp/.mount_X/usr/lib/gstreamer:", d), None);
    }

    #[test]
    fn tasima() {
        let kok = std::env::temp_dir().join(format!("repodesk-tasi-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&kok);
        std::fs::create_dir_all(kok.join("klasor")).unwrap();
        let _temizlik = crate::test_yardim::Temizlik(kok.clone());
        std::fs::write(kok.join("a.txt"), "a").unwrap();
        let k = kok.canonicalize().unwrap().to_string_lossy().to_string();
        let calistir = |e: &str, y: &str| tauri::async_runtime::block_on(dosya_tasi(k.clone(), e.into(), y.into()));
        calistir("a.txt", "yeni/b.txt").unwrap();
        assert!(kok.join("yeni/b.txt").exists());
        assert!(calistir("yeni/b.txt", "../disari.txt").is_err());
        assert!(calistir("klasor", "klasor/ic").is_err());
        std::fs::write(kok.join("c.txt"), "c").unwrap();
        assert!(calistir("c.txt", "yeni/b.txt").is_err());
        let _ = std::fs::remove_dir_all(&kok);
    }
}
