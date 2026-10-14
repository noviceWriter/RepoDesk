//! Uçtan uca akış testi: gerçek git depoları üzerinde, arayüzün çağırdığı
//! komutları bir kullanıcının yapacağı sırayla çalıştırır. Uzak depo olarak
//! yerel bir "bare" depo kullanılır; ağa çıkılmaz.

use std::path::{Path, PathBuf};

use crate::komut::git;
use crate::{dal, gecmis, harici, yerel};

fn blok<T>(f: impl std::future::Future<Output = T>) -> T {
    tauri::async_runtime::block_on(f)
}

struct Gecici(PathBuf);

impl Drop for Gecici {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn kimlik(depo: &Path, ad: &str) {
    for a in [&["config", "user.email", "t@example.com"][..], &["config", "user.name", ad], &["config", "commit.gpgsign", "false"]] {
        git(depo, a).unwrap().tamam().unwrap();
    }
}

fn yaz(depo: &Path, dosya: &str, icerik: &str) {
    std::fs::write(depo.join(dosya), icerik).unwrap();
}

fn oku(depo: &Path, dosya: &str) -> String {
    std::fs::read_to_string(depo.join(dosya)).unwrap()
}

#[test]
fn tam_kullanici_akisi() {
    let kok = std::env::temp_dir().join(format!("repodesk-akis-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&kok);
    std::fs::create_dir_all(&kok).unwrap();
    let _temizlik = Gecici(kok.clone());
    let kok = kok.canonicalize().unwrap();

    // Uzak depo + takım arkadaşının kopyası
    let uzak = kok.join("uzak.git");
    git(&kok, &["init", "--bare", "-b", "main", uzak.to_str().unwrap()]).unwrap().tamam().unwrap();
    let arkadas = kok.join("arkadas");
    git(&kok, &["clone", uzak.to_str().unwrap(), arkadas.to_str().unwrap()]).unwrap().tamam().unwrap();
    kimlik(&arkadas, "Arkadas");
    yaz(&arkadas, "ortak.txt", "1\n2\n3\n");
    git(&arkadas, &["add", "-A"]).unwrap().tamam().unwrap();
    git(&arkadas, &["commit", "-m", "ilk"]).unwrap().tamam().unwrap();
    git(&arkadas, &["push", "-u", "origin", "main"]).unwrap().tamam().unwrap();

    // Benim klasörüm: git deposu değil, sonra origin bağlanıyor (yerel_bagla GitHub
    // adresi istediği için origin'i burada elle ekliyoruz).
    let ben = kok.join("ben");
    std::fs::create_dir_all(&ben).unwrap();
    let b = ben.to_string_lossy().to_string();
    let d = blok(yerel::yerel_durum(b.clone())).unwrap();
    assert!(!d.git_mi, "boş klasör git deposu sayılmamalı");
    git(&ben, &["init", "-b", "main"]).unwrap().tamam().unwrap();
    kimlik(&ben, "Ben");
    git(&ben, &["remote", "add", "origin", uzak.to_str().unwrap()]).unwrap().tamam().unwrap();

    // İlk pull: upstream yok, yerelde commit yok → uzak varsayılan dal alınmalı
    let sonuc = blok(yerel::yerel_pull(b.clone())).unwrap();
    assert!(sonuc.contains("main"), "{sonuc}");
    assert_eq!(oku(&ben, "ortak.txt"), "1\n2\n3\n");
    let d = blok(yerel::yerel_durum(b.clone())).unwrap();
    assert_eq!(d.upstream.as_deref(), Some("origin/main"));

    // Arkadaş yeni commit gönderiyor → uzak kontrol (fetch) geri sayısını görmeli
    yaz(&arkadas, "ortak.txt", "1\nARKADAS\n3\n");
    git(&arkadas, &["commit", "-am", "arkadas degistirdi"]).unwrap().tamam().unwrap();
    git(&arkadas, &["push"]).unwrap().tamam().unwrap();
    blok(dal::uzak_guncelle(b.clone())).unwrap();
    let d = blok(yerel::yerel_durum(b.clone())).unwrap();
    assert_eq!(d.geri, 1, "fetch sonrası 1 commit geride olmalı");

    // Ben aynı satırı değiştirip commit ediyorum → pull çakışma vermeli (hata değil durum)
    yaz(&ben, "ortak.txt", "1\nBEN\n3\n");
    blok(yerel::yerel_commit(b.clone(), "ben degistirdim".into(), vec![], true)).unwrap();
    let sonuc = blok(yerel::yerel_pull(b.clone())).unwrap();
    assert_eq!(sonuc, yerel::CAKISMA_MESAJI);
    let d = blok(yerel::yerel_durum(b.clone())).unwrap();
    assert!(d.birlestirme);
    assert!(d.birlestirme_mesaji.as_deref().unwrap_or("").contains("Merge"), "birleştirme mesajı okunmalı");
    let cakisan = oku(&ben, "ortak.txt");
    assert!(cakisan.contains("<<<<<<<") && cakisan.contains("BEN") && cakisan.contains("ARKADAS"));

    // Çakışmayı çöz → commit → push
    blok(dal::cakisma_coz(b.clone(), "ortak.txt".into(), "1\nBEN\nARKADAS\n3\n".into())).unwrap();
    let mesaj = d.birlestirme_mesaji.clone().unwrap();
    blok(yerel::yerel_commit(b.clone(), mesaj, vec![], true)).unwrap();
    let d = blok(yerel::yerel_durum(b.clone())).unwrap();
    assert!(!d.birlestirme && d.degisiklikler.is_empty());
    assert_eq!(d.ileri, 2);
    blok(yerel::yerel_push(b.clone())).unwrap();
    assert_eq!(blok(yerel::yerel_durum(b.clone())).unwrap().ileri, 0);

    // Gönderilmiş commit "son commit'i geri al" ile geri alınamamalı
    assert!(blok(dal::son_commit_geri_al(b.clone())).is_err());

    // Dal aç, değişiklik yap, ana dala birleştir, yeni dalı push et, sil
    blok(dal::dal_olustur(b.clone(), "ozellik/yeni".into(), true)).unwrap();
    yaz(&ben, "yeni.txt", "ozellik\n");
    blok(yerel::yerel_commit(b.clone(), "ozellik eklendi".into(), vec!["yeni.txt".into()], false)).unwrap();
    blok(yerel::yerel_push(b.clone())).unwrap(); // upstream yok → -u origin HEAD
    let dallar = blok(dal::dal_listele(b.clone())).unwrap();
    let json = serde_json::to_string(&dallar).unwrap();
    assert!(json.contains("\"ad\":\"ozellik/yeni\"") && json.contains("\"upstream\":\"origin/ozellik/yeni\""), "{json}");
    blok(dal::dal_gec(b.clone(), "main".into(), false)).unwrap();
    let sonuc = blok(dal::dal_birlestir(b.clone(), "ozellik/yeni".into())).unwrap();
    assert!(sonuc.contains("birleştirildi"), "{sonuc}");
    assert!(ben.join("yeni.txt").exists());
    blok(dal::dal_sil(b.clone(), "ozellik/yeni".into(), false)).unwrap();
    blok(dal::uzak_dal_sil(b.clone(), "ozellik/yeni".into())).unwrap();

    // Commit ayrıntısı ve tersine çevirme
    let liste = blok(gecmis::commit_listesi(b.clone(), 0, 10)).unwrap();
    let son = serde_json::to_value(&liste[0]).unwrap();
    let kisa = son["kisa"].as_str().unwrap().to_string();
    let ayrinti = serde_json::to_value(blok(gecmis::commit_ayrinti(b.clone(), kisa.clone())).unwrap()).unwrap();
    assert_eq!(ayrinti["baslik"], "ozellik eklendi");
    assert_eq!(ayrinti["dosyalar"][0]["yol"], "yeni.txt");
    blok(gecmis::commit_tersine_cevir(b.clone(), kisa)).unwrap();
    assert!(!ben.join("yeni.txt").exists(), "tersine çevirme dosyayı kaldırmalı");

    // Dosya taşıma, değişikliği geri alma ve yeni dosyayı silme
    blok(harici::dosya_tasi(b.clone(), "ortak.txt".into(), "klasor/ortak.txt".into())).unwrap();
    yaz(&ben, "cop.txt", "x");
    let d = blok(yerel::yerel_durum(b.clone())).unwrap();
    let yollar: Vec<String> = d.degisiklikler.iter().map(|x| x.yol.clone()).collect();
    assert!(yollar.iter().any(|y| y.starts_with("klasor")), "{yollar:?}");
    blok(dal::degisiklik_geri_al(b.clone(), {
        let mut y = yollar.clone();
        y.push("ortak.txt".into());
        y
    }))
    .unwrap();
    assert_eq!(oku(&ben, "ortak.txt"), "1\nBEN\nARKADAS\n3\n");
    assert!(!ben.join("cop.txt").exists() && !ben.join("klasor").exists());
    assert!(blok(yerel::yerel_durum(b.clone())).unwrap().degisiklikler.is_empty());

    // Depo dışına yazma girişimleri reddedilmeli
    assert!(blok(yerel::dosya_kaydet(b.clone(), "../kacis.txt".into(), "x".into(), true)).is_err());
    assert!(blok(harici::dosya_tasi(b.clone(), "klasor".into(), "../disari".into())).is_err());
    assert!(blok(dal::cakisma_coz(b.clone(), ".git/config".into(), "x".into())).is_err());
    assert!(!kok.join("kacis.txt").exists());
}
