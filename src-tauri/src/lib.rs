#[cfg(test)]
mod akis_testi;
#[cfg(test)]
mod test_yardim;
mod ci;
mod dal;
mod gecmis;
mod github;
mod guncelleme;
mod gunluk;
mod harici;
mod istek;
mod kimlik;
mod surum;
mod komut;
mod yerel;
mod yol;

/// Uzun süren `gh`/`git` çağrılarını arayüz iş parçacığını kilitlemeden çalıştırır.
pub(crate) async fn arka_plan<T, F>(is: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(is)
        .await
        .map_err(|e| format!("Arka plan görevi başarısız oldu: {e}"))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(github::GirisSureci::default())
        .setup(|app| {
            gunluk::baslat(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            github::repo_listele,
            github::hesap_bilgisi,
            github::oturum_ac,
            github::oturum_iptal,
            github::oturum_kapat,
            github::repo_olustur,
            github::repo_guncelle,
            github::repo_klonla,
            github::izin_ekle,
            github::repo_sil,
            github::repo_arsivle,
            guncelleme::guncelleme_kontrol,
            gunluk::gunluk_yaz,
            gunluk::gunluk_oku,
            gunluk::gunluk_temizle,
            gunluk::gunluk_klasoru_ac,
            kimlik::kimlik_bilgisi,
            kimlik::kimlik_kaydet,
            yerel::yerel_durum,
            yerel::yerel_dosyalar,
            yerel::yerel_fark,
            yerel::yerel_bagla,
            yerel::yerel_baglanti_kaldir,
            yerel::yerel_yayinla,
            yerel::yerel_pull,
            yerel::yerel_push,
            yerel::yerel_commit,
            yerel::yerel_kimlik_ayarla,
            yerel::dosya_oku,
            yerel::dosya_kaydet,
            yerel::dosya_sil,
            dal::dal_listele,
            dal::uzak_guncelle,
            dal::dal_olustur,
            dal::dal_gec,
            dal::dal_birlestir,
            dal::dal_yeniden_adlandir,
            dal::dal_sil,
            dal::uzak_dal_sil,
            dal::degisiklik_geri_al,
            dal::son_commit_geri_al,
            dal::cakisma_taraf_sec,
            dal::cakisma_coz,
            dal::birlestirme_iptal,
            istek::istek_listele,
            istek::varsayilan_dal,
            istek::issue_olustur,
            istek::issue_durum_degistir,
            istek::pr_olustur,
            istek::pr_birlestir,
            istek::pr_yerelde_ac,
            harici::harici_ac,
            harici::dosya_tasi,
            gecmis::commit_ayrinti,
            gecmis::commit_fark,
            gecmis::commit_tersine_cevir,
            gecmis::commit_listesi,
            ci::ci_ozetleri,
            ci::ci_calismalari,
            ci::ci_yeniden_calistir,
            surum::etiket_listele,
            surum::etiket_olustur,
            surum::etiket_gonder,
            surum::etiket_sil,
            surum::release_listele,
            surum::release_ayrinti,
            surum::release_olustur,
            surum::release_sil,
        ])
        .run(tauri::generate_context!())
        .expect("RepoDesk başlatılamadı");
}
