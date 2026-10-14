import { invoke } from '@tauri-apps/api/core';

/** Tauri komutlarını çağırır; Rust tarafındaki metin hatalarını `Error`'a çevirir. */
async function cagir(komut, argumanlar = {}) {
    try {
        return await invoke(komut, argumanlar);
    } catch (hata) {
        throw new Error(typeof hata === 'string' ? hata : hata?.message || String(hata));
    }
}

export const api = {
    repolar: () => cagir('repo_listele'),
    hesap: () => cagir('hesap_bilgisi'),
    girisYap: () => cagir('oturum_ac'),
    girisIptal: () => cagir('oturum_iptal'),
    cikisYap: () => cagir('oturum_kapat'),
    repoOlustur: (secenekler) => cagir('repo_olustur', secenekler),
    repoGuncelle: (repo, { yeniAd, aciklama, anaSayfa, gorunurluk }) => cagir('repo_guncelle', { repo, yeniAd, aciklama, anaSayfa, gorunurluk }),
    repoKlonla: (url, hedefKlasor, ad) => cagir('repo_klonla', { url, hedefKlasor, ad }),

    durum: (kok) => cagir('yerel_durum', { kok }),
    dosyalar: (kok, alt = '') => cagir('yerel_dosyalar', { kok, alt }),
    fark: (kok, yol, durum) => cagir('yerel_fark', { kok, yol, durum }),
    bagla: (kok, url) => cagir('yerel_bagla', { kok, url }),
    baglantiKaldir: (kok) => cagir('yerel_baglanti_kaldir', { kok }),
    yayinla: (secenekler) => cagir('yerel_yayinla', secenekler),
    pull: (kok) => cagir('yerel_pull', { kok }),
    push: (kok) => cagir('yerel_push', { kok }),
    commit: (kok, mesaj, dosyalar, tumu) => cagir('yerel_commit', { kok, mesaj, dosyalar, tumu }),
    kimlikAyarla: (kok) => cagir('yerel_kimlik_ayarla', { kok }),
    kimlikBilgisi: (kok) => cagir('kimlik_bilgisi', { kok }),
    kimlikKaydet: (kapsam, kok, ad, eposta) => cagir('kimlik_kaydet', { kapsam, kok, ad, eposta }),
    dosyaOku: (kok, yol) => cagir('dosya_oku', { kok, yol }),
    dosyaKaydet: (kok, yol, icerik, yeni) => cagir('dosya_kaydet', { kok, yol, icerik, yeni }),
    dosyaSil: (kok, yol) => cagir('dosya_sil', { kok, yol }),

    dallar: (kok) => cagir('dal_listele', { kok }),
    uzakGuncelle: (kok) => cagir('uzak_guncelle', { kok }),
    dalOlustur: (kok, ad, gec) => cagir('dal_olustur', { kok, ad, gec }),
    dalGec: (kok, ad, uzak = false) => cagir('dal_gec', { kok, ad, uzak }),
    dalBirlestir: (kok, kaynak) => cagir('dal_birlestir', { kok, kaynak }),
    dalYenidenAdlandir: (kok, eski, yeni) => cagir('dal_yeniden_adlandir', { kok, eski, yeni }),
    dalSil: (kok, ad, zorla = false) => cagir('dal_sil', { kok, ad, zorla }),
    uzakDalSil: (kok, ad) => cagir('uzak_dal_sil', { kok, ad }),
    geriAl: (kok, yollar) => cagir('degisiklik_geri_al', { kok, yollar }),
    sonCommitiGeriAl: (kok) => cagir('son_commit_geri_al', { kok }),
    cakismaTarafSec: (kok, yol, taraf) => cagir('cakisma_taraf_sec', { kok, yol, taraf }),
    cakismaCoz: (kok, yol, icerik) => cagir('cakisma_coz', { kok, yol, icerik }),
    birlestirmeIptal: (kok) => cagir('birlestirme_iptal', { kok }),

    hariciAc: (kok, yol, tur, komut) => cagir('harici_ac', { kok, yol, tur, komut }),
    dosyaTasi: (kok, eski, yeni) => cagir('dosya_tasi', { kok, eski, yeni }),
    commitAyrinti: (kok, hash) => cagir('commit_ayrinti', { kok, hash }),
    commitFark: (kok, hash, yol, eskiYol) => cagir('commit_fark', { kok, hash, yol, eskiYol }),
    commitTersineCevir: (kok, hash) => cagir('commit_tersine_cevir', { kok, hash }),
    commitListesi: (kok, atla, adet) => cagir('commit_listesi', { kok, atla, adet }),

    ciOzetleri: () => cagir('ci_ozetleri'),
    ciCalismalari: (repo, dal) => cagir('ci_calismalari', { repo, dal }),
    ciYenidenCalistir: (repo, id, sadeceBasarisiz) => cagir('ci_yeniden_calistir', { repo, id, sadeceBasarisiz }),

    etiketListele: (kok) => cagir('etiket_listele', { kok }),
    etiketOlustur: (kok, ad, mesaj, hedef) => cagir('etiket_olustur', { kok, ad, mesaj, hedef }),
    etiketGonder: (kok, ad) => cagir('etiket_gonder', { kok, ad }),
    etiketSil: (kok, ad, uzakta) => cagir('etiket_sil', { kok, ad, uzakta }),
    releaseListele: (repo) => cagir('release_listele', { repo }),
    releaseAyrinti: (repo, etiket) => cagir('release_ayrinti', { repo, etiket }),
    releaseOlustur: (secenekler) => cagir('release_olustur', secenekler),
    releaseSil: (repo, etiket, etiketiDeSil) => cagir('release_sil', { repo, etiket, etiketiDeSil }),

    repoSil: (repo, onay) => cagir('repo_sil', { repo, onay }),
    repoArsivle: (repo, arsivle) => cagir('repo_arsivle', { repo, arsivle }),
    izinEkle: (kapsam) => cagir('izin_ekle', { kapsam }),
    guncellemeKontrol: (repo) => cagir('guncelleme_kontrol', { repo }),
    gunlukYaz: (seviye, kaynak, mesaj) => cagir('gunluk_yaz', { seviye, kaynak, mesaj }),
    gunlukOku: () => cagir('gunluk_oku'),
    gunlukTemizle: () => cagir('gunluk_temizle'),
    gunlukKlasoruAc: () => cagir('gunluk_klasoru_ac'),

    istekler: (repo, tur, durum) => cagir('istek_listele', { repo, tur, durum }),
    varsayilanDal: (repo) => cagir('varsayilan_dal', { repo }),
    issueOlustur: (repo, baslik, govde) => cagir('issue_olustur', { repo, baslik, govde }),
    issueDurum: (repo, numara, kapat) => cagir('issue_durum_degistir', { repo, numara, kapat }),
    prOlustur: (kok, secenekler) => cagir('pr_olustur', { kok, ...secenekler }),
    prBirlestir: (repo, numara, yontem, dalSil) => cagir('pr_birlestir', { repo, numara, yontem, dalSil }),
    prYereldeAc: (kok, numara) => cagir('pr_yerelde_ac', { kok, numara }),
};
