import { listen } from '@tauri-apps/api/event';
import { openUrl } from '@tauri-apps/plugin-opener';
import { api } from '../lib/api.js';
import { bildir, hataBildir, modalAc, onayla } from '../lib/bilesen.js';
import { ciz, eylemler, html, panoyaKopyala } from '../lib/dom.js';
import { simge } from '../lib/simge.js';
import { durum, dinle, yayinla } from '../durum.js';
import { repolariYukle } from './kutuphane.js';

let menuAcik = false;

export function hesapKur(kap) {
    const cizHesap = () => {
        const h = durum.hesap;
        if (h === undefined) {
            ciz(kap, html`<span class="hesap-dugme iskelet"><span class="avatar"></span></span>`);
            return;
        }
        if (!h) {
            menuAcik = false;
            ciz(kap, durum.ghHatasi ? '' : html`<button class="dugme" data-eylem="giris" type="button">${simge('kullanici', 15)} Giriş yap</button>`);
            return;
        }
        ciz(kap, html`
            <button class="hesap-dugme ${menuAcik ? 'aktif' : ''}" data-eylem="menu" type="button" aria-haspopup="menu" aria-expanded="${menuAcik}">
                <img class="avatar" src="${h.avatarUrl}" alt="" referrerpolicy="no-referrer">
                <span>${h.login}</span>
                ${simge('acilir', 13)}
            </button>
            ${menuAcik ? html`
                <div class="hesap-menusu" role="menu">
                    <div class="menu-profil">
                        <img class="avatar avatar-buyuk" src="${h.avatarUrl}" alt="" referrerpolicy="no-referrer">
                        <div><strong>${h.name || h.login}</strong><span>@${h.login}</span></div>
                    </div>
                    <button class="menu-dugme" data-eylem="profil" type="button" role="menuitem">${simge('dis', 15)} GitHub profilini aç</button>
                    <button class="menu-dugme" data-eylem="tazele" type="button" role="menuitem">${simge('yenile', 15)} Hesabı yenile</button>
                    <button class="menu-dugme tehlike" data-eylem="cikis" type="button" role="menuitem">${simge('cikis', 15)} Çıkış yap</button>
                </div>` : ''}`);
    };

    eylemler(kap, 'click', {
        giris: () => girisYap(),
        menu: () => { menuAcik = !menuAcik; cizHesap(); },
        profil: () => { menuAcik = false; cizHesap(); openUrl(durum.hesap.htmlUrl); },
        tazele: async () => { menuAcik = false; await hesabiYukle(); },
        cikis: async () => {
            menuAcik = false;
            cizHesap();
            if (!(await onayla('GitHub CLI oturumu bu bilgisayarda kapatılacak. Devam edilsin mi?', { baslik: 'Çıkış yap', tamam: 'Çıkış yap', tehlikeli: true }))) return;
            try {
                await api.cikisYap();
                durum.hesap = null;
                durum.repolar = [];
                yayinla('hesap');
                yayinla('repolar');
                bildir('Oturum kapatıldı.', { tur: 'basari' });
            } catch (e) {
                hataBildir(e);
            }
        },
    });
    document.addEventListener('mousedown', (e) => {
        if (menuAcik && !kap.contains(e.target)) { menuAcik = false; cizHesap(); }
    });
    document.addEventListener('keydown', (e) => {
        if (menuAcik && e.key === 'Escape') { menuAcik = false; cizHesap(); }
    });
    dinle('hesap', cizHesap);
    cizHesap();
}

export async function hesabiYukle() {
    durum.hesap = undefined;
    durum.ghHatasi = '';
    yayinla('hesap');
    try {
        durum.hesap = await api.hesap();
    } catch (e) {
        durum.hesap = null;
        durum.ghHatasi = e.message;
    }
    yayinla('hesap');
    if (durum.hesap) await repolariYukle();
}

/**
 * GitHub cihaz kodu akışı penceresi (giriş ve ek izin isteme için ortak).
 * @param {{ust: string, baslik: string, aciklama: string, baslat: () => Promise<any>, basarili: (sonuc: any) => void}} s
 */
export async function cihazAkisi({ ust, baslik, aciklama, baslat, basarili }) {
    let bitti = false;
    const kodDinleyici = await listen('oturum-kodu', ({ payload }) => kodGoster(payload));
    const kayit = modalAc({
        ust,
        baslik,
        aciklama,
        govde: html`<div class="giris-kodu" data-giris><span class="donen"></span><p>Onay kodu hazırlanıyor…</p></div>`,
        kapaninca() {
            kodDinleyici();
            if (!bitti) api.girisIptal().catch(() => {});
        },
    });
    const alan = kayit.kok.querySelector('[data-giris]');

    function kodGoster({ kod, adres, tarayiciAc }) {
        ciz(alan, html`
            <p class="giris-adim">1 · Kodu kopyala</p>
            <button class="kod-harfler" data-kopyala type="button" title="Kopyala">${kod}</button>
            <p class="giris-adim">2 · ${adres.replace('https://', '')} adresinde yapıştır</p>
            <div class="giris-dugmeler">
                <button class="dugme dugme-sessiz" data-kopyala type="button">${simge('kopya', 15)} Kodu kopyala</button>
                <button class="dugme" data-ac type="button">${simge('dis', 15)} Tarayıcıda aç</button>
            </div>
            <p class="giris-bekle"><span class="donen kucuk"></span> GitHub onayı bekleniyor…</p>`);
        const kopyala = async () => {
            try { await panoyaKopyala(kod); bildir('Kod panoya kopyalandı.', { tur: 'basari', sure: 2500 }); } catch { /* pano erişimi yok */ }
        };
        alan.querySelectorAll('[data-kopyala]').forEach((d) => d.addEventListener('click', kopyala));
        alan.querySelector('[data-ac]').addEventListener('click', () => openUrl(adres));
        kopyala();
        if (tarayiciAc) openUrl(adres).catch(hataBildir);
    }

    try {
        const sonuc = await baslat();
        bitti = true;
        kayit.kapat();
        basarili(sonuc);
    } catch (e) {
        bitti = true;
        if (!alan.isConnected) return;
        ciz(alan, html`
            <span class="bos-ikon">${simge('uyari', 22)}</span>
            <p class="form-hata">${e.message}</p>
            <button class="dugme" data-tekrar type="button">${simge('yenile', 15)} Tekrar dene</button>`);
        alan.querySelector('[data-tekrar]').addEventListener('click', () => { kayit.kapat(); cihazAkisi({ ust, baslik, aciklama, baslat, basarili }); });
    }
}

export function girisYap() {
    return cihazAkisi({
        ust: 'GITHUB GİRİŞİ',
        baslik: 'GitHub hesabını bağla',
        aciklama: 'Güvenli cihaz girişi: tarayıcıda açılan sayfaya aşağıdaki kodu gir ve erişimi onayla.',
        baslat: () => api.girisYap(),
        basarili(kullanici) {
            durum.hesap = kullanici;
            durum.ghHatasi = '';
            yayinla('hesap');
            bildir(`Hoş geldin, ${kullanici.name || kullanici.login}!`, { tur: 'basari' });
            repolariYukle();
        },
    });
}

