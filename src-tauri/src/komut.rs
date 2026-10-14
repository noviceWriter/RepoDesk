//! `gh` ve `git` süreçlerini etkileşimsiz, tutarlı bir ortamda çalıştırır.

use std::io::ErrorKind;
use std::path::Path;
use std::process::{Command, Stdio};

pub struct Cikti {
    pub basarili: bool,
    pub stdout: String,
    pub stderr: String,
}

impl Cikti {
    /// Kullanıcıya gösterilecek en anlamlı hata metni.
    pub fn hata(&self) -> String {
        let hata = self.stderr.trim();
        let metin = if hata.is_empty() { self.stdout.trim() } else { hata };
        if metin.is_empty() { "Komut başarısız oldu.".into() } else { metin.to_string() }
    }

    pub fn tamam(self) -> Result<Cikti, String> {
        if self.basarili { Ok(self) } else { Err(self.hata()) }
    }

    /// Başarısızlığı hata saymayıp yok sayan sürüm (isteğe bağlı bilgiler için).
    pub fn basarili_ise(self) -> Option<Cikti> {
        self.basarili.then_some(self)
    }
}

/// Hiçbir zaman terminalden girdi beklemeyecek şekilde yapılandırılmış komut.
pub fn hazirla(program: &str) -> Command {
    let mut komut = Command::new(program);
    crate::harici::ortami_temizle(&mut komut);
    komut
        .env("GH_PROMPT_DISABLED", "1")
        .env("GH_NO_UPDATE_NOTIFIER", "1")
        .env("GH_SPINNER_DISABLED", "1")
        .env("NO_COLOR", "1")
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_MERGE_AUTOEDIT", "no")
        // Hata metinleri ayrıştırıldığı için git mesajlarını İngilizceye sabitle
        // (ör. Türkçe sistemde "already exists" yerine "halihazırda var" gelir).
        // Kullanıcıya gösterilen açıklamalar zaten Türkçe olarak üretiliyor.
        .env("LANGUAGE", "en_US:en")
        .stdin(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW: her komutta konsol penceresi açılmasın.
        komut.creation_flags(0x0800_0000);
    }
    komut
}

pub fn baslatma_hatasi(program: &str, hata: std::io::Error) -> String {
    if hata.kind() == ErrorKind::NotFound {
        match program {
            "gh" => "GitHub CLI (gh) bulunamadı. https://cli.github.com adresinden kurup tekrar deneyin.".into(),
            "git" => "Git bulunamadı. Git'i kurup tekrar deneyin.".into(),
            _ => format!("{program} bulunamadı."),
        }
    } else {
        format!("{program} çalıştırılamadı: {hata}")
    }
}

pub fn calistir(program: &str, args: &[&str], dizin: Option<&Path>) -> Result<Cikti, String> {
    let mut komut = hazirla(program);
    komut.args(args);
    if let Some(dizin) = dizin {
        komut.current_dir(dizin);
    }
    let bas = std::time::Instant::now();
    let cikti = komut.output().map_err(|e| {
        let hata = baslatma_hatasi(program, e);
        crate::gunluk::komut(program, args, bas.elapsed(), false, &hata);
        hata
    })?;
    let sonuc = Cikti {
        basarili: cikti.status.success(),
        stdout: String::from_utf8_lossy(&cikti.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&cikti.stderr).into_owned(),
    };
    crate::gunluk::komut(program, args, bas.elapsed(), sonuc.basarili, &sonuc.hata());
    Ok(sonuc)
}

pub fn gh(args: &[&str]) -> Result<Cikti, String> {
    calistir("gh", args, None)
}

pub fn git(dizin: &Path, args: &[&str]) -> Result<Cikti, String> {
    calistir("git", args, Some(dizin))
}
