//! Uygulama günlüğü (log): hata ayıklamak için olanları dosyaya yazar.
//!
//! Dosya `~/.local/share/<uygulama>/logs/repodesk.log` gibi bir yerde durur; 1 MB'ı geçince
//! `repodesk.1.log` olarak saklanıp yenisine başlanır, yani en fazla ~2 MB yer kaplar.
//! Token ve parola benzeri değerler yazılmadan önce maskelenir.

use std::fs::{self, File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use tauri::{AppHandle, Manager};

const DOSYA_ADI: &str = "repodesk.log";
const ESKI_DOSYA_ADI: &str = "repodesk.1.log";
const AZAMI_BOYUT: u64 = 1024 * 1024;
const AZAMI_SATIR: usize = 4000;

static KLASOR: OnceLock<PathBuf> = OnceLock::new();
static KILIT: Mutex<()> = Mutex::new(());

#[derive(Clone, Copy)]
pub enum Seviye {
    Bilgi,
    Uyari,
    Hata,
}

impl Seviye {
    fn etiket(self) -> &'static str {
        match self {
            Seviye::Bilgi => "BİLGİ",
            Seviye::Uyari => "UYARI",
            Seviye::Hata => "HATA ",
        }
    }
}

/// Uygulama açılırken bir kez çağrılır.
pub fn baslat(app: &AppHandle) {
    let Ok(klasor) = app.path().app_log_dir() else { return };
    if fs::create_dir_all(&klasor).is_err() {
        return;
    }
    let _ = KLASOR.set(klasor);
    let paket = if std::env::var_os("APPIMAGE").is_some() { "AppImage" } else { "kurulu paket" };
    yaz(
        Seviye::Bilgi,
        "uygulama",
        &format!(
            "RepoDesk {} açıldı ({} {}, {paket})",
            app.package_info().version,
            std::env::consts::OS,
            std::env::consts::ARCH
        ),
    );
}

fn dosya_yolu() -> Option<PathBuf> {
    KLASOR.get().map(|k| k.join(DOSYA_ADI))
}

/// Bir satır günlük yazar. Günlük hiç kurulamadıysa sessizce geçer; uygulamayı asla durdurmaz.
pub fn yaz(seviye: Seviye, kaynak: &str, mesaj: &str) {
    let Some(yol) = dosya_yolu() else { return };
    let satir = format!(
        "{} {} [{kaynak}] {}\n",
        chrono::Local::now().format("%Y-%m-%d %H:%M:%S"),
        seviye.etiket(),
        kisalt(&maskele(mesaj).replace('\n', " ⏎ "), AZAMI_SATIR)
    );
    let _kilit = KILIT.lock().unwrap_or_else(|e| e.into_inner());
    if fs::metadata(&yol).map(|m| m.len() > AZAMI_BOYUT).unwrap_or(false) {
        let _ = fs::rename(&yol, yol.with_file_name(ESKI_DOSYA_ADI));
    }
    if let Ok(mut dosya) = OpenOptions::new().create(true).append(true).open(&yol) {
        let _ = dosya.write_all(satir.as_bytes());
    }
}

/// Dış komut çalıştırıldıktan sonra çağrılır. Değişiklik yapan komutlar her zaman yazılır.
/// Sık tekrarlanan salt okuma sorguları ise yalnızca gerçek bir hata mesajıyla başarısız olursa yazılır;
/// ör. `rev-parse --verify MERGE_HEAD` gibi "yok" cevabını çıkış koduyla veren yoklamalar atlanır.
pub fn komut(program: &str, args: &[&str], sure: Duration, basarili: bool, hata: &str) {
    if salt_okuma(program, args) && (basarili || hata.trim().is_empty()) {
        return;
    }
    let ms = sure.as_millis();
    let komut = komut_metni(program, args);
    if basarili {
        yaz(Seviye::Bilgi, "komut", &format!("{komut} ✓ {ms} ms"));
    } else {
        let hata = if hata.trim().is_empty() { "(hata mesajı yok)" } else { hata.trim() };
        yaz(Seviye::Uyari, "komut", &format!("{komut} ✗ {ms} ms — {}", kisalt(hata, 800)));
    }
}

fn salt_okuma(program: &str, args: &[&str]) -> bool {
    let konumlu: Vec<&str> = args.iter().copied().filter(|a| !a.starts_with('-')).collect();
    let ilk = konumlu.first().copied().unwrap_or("");
    let ikinci = konumlu.get(1).copied().unwrap_or("");
    let var = |aranan: &[&str]| args.iter().any(|a| aranan.contains(a));
    match program {
        "git" => match ilk {
            "status" | "rev-parse" | "log" | "diff" | "show" | "for-each-ref" | "ls-files" | "cat-file" | "rev-list"
            | "merge-base" | "describe" | "check-ignore" | "ls-remote" => true,
            // Ad verilirse dal/etiket oluşturur; yalnızca listeleme salt okumadır.
            "branch" | "tag" => !var(&["-d", "-D", "-m", "-M", "-a", "-f", "--delete"]) && (konumlu.len() == 1 || var(&["--list", "-l"])),
            // `config anahtar` okur, `config anahtar değer` yazar.
            "config" => var(&["--get", "--get-regexp", "-l", "--list"]) || (konumlu.len() == 2 && !var(&["--unset", "--add", "--unset-all"])),
            "remote" => matches!(ikinci, "" | "get-url" | "show"),
            "symbolic-ref" => konumlu.len() <= 2,
            _ => false,
        },
        "gh" => match ilk {
            "api" => !var(&["-X", "--method", "-f", "-F", "--field", "--raw-field", "--input"]),
            "auth" => matches!(ikinci, "status" | "token"),
            _ => matches!(ikinci, "list" | "view" | "status" | "checks" | "diff"),
        },
        _ => false,
    }
}

/// Komutu okunur biçimde yazar; çok uzun argümanlar (ör. PR açıklaması) kısaltılır.
fn komut_metni(program: &str, args: &[&str]) -> String {
    let mut metin = program.to_string();
    for arg in args {
        metin.push(' ');
        let kisa = kisalt(arg, 80);
        if kisa.contains(char::is_whitespace) || kisa.is_empty() {
            metin.push_str(&format!("\"{kisa}\""));
        } else {
            metin.push_str(&kisa);
        }
    }
    metin
}

fn kisalt(metin: &str, sinir: usize) -> String {
    if metin.chars().count() <= sinir {
        return metin.to_string();
    }
    let mut kisa: String = metin.chars().take(sinir).collect();
    kisa.push('…');
    kisa
}

/// GitHub token'ları, `https://kullanici:parola@` biçimli adresler ve `token=` gibi değerler gizlenir.
fn maskele(metin: &str) -> String {
    let mut sonuc = String::with_capacity(metin.len());
    for (i, parca) in metin.split(' ').enumerate() {
        if i > 0 {
            sonuc.push(' ');
        }
        sonuc.push_str(&parca_maskele(parca));
    }
    sonuc
}

fn parca_maskele(parca: &str) -> String {
    const ONEKLER: [&str; 6] = ["ghp_", "gho_", "ghu_", "ghs_", "ghr_", "github_pat_"];
    if let Some(bas) = ONEKLER.iter().filter_map(|o| parca.find(o)).min() {
        return format!("{}***", &parca[..bas]);
    }
    if let Some(sema) = parca.find("://") {
        let govde = &parca[sema + 3..];
        if let Some(at) = govde.find('@').filter(|&at| !govde[..at].contains('/')) {
            return format!("{}://***@{}", &parca[..sema], &govde[at + 1..]);
        }
    }
    let kucuk = parca.to_lowercase();
    for anahtar in ["token=", "password=", "parola=", "secret="] {
        if let Some(bas) = kucuk.find(anahtar) {
            return format!("{}***", &parca[..bas + anahtar.len()]);
        }
    }
    parca.to_string()
}

/// Son günlük satırları (yeniden eskiye değil, dosyadaki sırayla).
fn son_satirlar(yol: &Path, adet: usize) -> String {
    let Ok(mut dosya) = File::open(yol) else { return String::new() };
    let boyut = dosya.metadata().map(|m| m.len()).unwrap_or(0);
    let bas = boyut.saturating_sub(256 * 1024);
    let _ = dosya.seek(SeekFrom::Start(bas));
    let mut ham = Vec::new();
    let _ = dosya.read_to_end(&mut ham);
    let metin = String::from_utf8_lossy(&ham);
    let satirlar: Vec<&str> = metin.lines().skip(usize::from(bas > 0)).collect();
    satirlar[satirlar.len().saturating_sub(adet)..].join("\n")
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GunlukBilgisi {
    klasor: String,
    dosya: String,
    metin: String,
}

#[tauri::command]
pub fn gunluk_yaz(seviye: String, kaynak: String, mesaj: String) {
    let seviye = match seviye.as_str() {
        "hata" => Seviye::Hata,
        "uyari" => Seviye::Uyari,
        _ => Seviye::Bilgi,
    };
    yaz(seviye, &kisalt(&kaynak, 40), &mesaj);
}

#[tauri::command]
pub fn gunluk_oku() -> Result<GunlukBilgisi, String> {
    let yol = dosya_yolu().ok_or("Günlük klasörü oluşturulamadı.")?;
    Ok(GunlukBilgisi {
        klasor: yol.parent().unwrap_or(&yol).to_string_lossy().into_owned(),
        dosya: yol.to_string_lossy().into_owned(),
        metin: son_satirlar(&yol, 400),
    })
}

#[tauri::command]
pub fn gunluk_temizle() -> Result<(), String> {
    let yol = dosya_yolu().ok_or("Günlük klasörü oluşturulamadı.")?;
    let _kilit = KILIT.lock().unwrap_or_else(|e| e.into_inner());
    let _ = fs::remove_file(yol.with_file_name(ESKI_DOSYA_ADI));
    File::create(&yol).map(|_| ()).map_err(|e| format!("Günlük temizlenemedi: {e}"))
}

#[tauri::command]
pub async fn gunluk_klasoru_ac() -> Result<(), String> {
    let klasor = KLASOR.get().ok_or("Günlük klasörü oluşturulamadı.")?.clone();
    crate::arka_plan(move || crate::harici::klasoru_ac(&klasor)).await
}

#[cfg(test)]
mod testler {
    use super::*;

    #[test]
    fn gizli_degerler_maskelenir() {
        assert_eq!(maskele("token gho_abc123XYZ kullanıldı"), "token *** kullanıldı");
        assert_eq!(maskele("https://ali:gizli@github.com/a/b.git"), "https://***@github.com/a/b.git");
        assert_eq!(maskele("https://github.com/a/b@v1"), "https://github.com/a/b@v1");
        assert_eq!(maskele("x?TOKEN=abc"), "x?TOKEN=***");
        assert_eq!(maskele("Authorization: github_pat_11AA"), "Authorization: ***");
    }

    #[test]
    fn salt_okuma_komutlari_atlanir() {
        assert!(salt_okuma("git", &["status", "--porcelain=v2"]));
        assert!(salt_okuma("git", &["branch", "--list"]));
        assert!(!salt_okuma("git", &["branch", "yeni-dal"]));
        assert!(!salt_okuma("git", &["push", "origin", "main"]));
        assert!(!salt_okuma("git", &["branch", "-D", "eski"]));
        assert!(salt_okuma("git", &["config", "user.email"]));
        assert!(!salt_okuma("git", &["config", "user.email", "a@b.c"]));
        assert!(salt_okuma("gh", &["pr", "list", "--json", "x"]));
        assert!(!salt_okuma("gh", &["pr", "merge", "3"]));
        assert!(salt_okuma("gh", &["api", "user"]));
        assert!(!salt_okuma("gh", &["api", "-X", "DELETE", "repos/a/b"]));
    }

    #[test]
    fn uzun_argumanlar_kisaltilir() {
        let uzun = "a".repeat(200);
        let metin = komut_metni("gh", &["pr", "create", "--body", &uzun]);
        assert!(metin.len() < 120);
        assert!(metin.ends_with('…'));
    }
}
