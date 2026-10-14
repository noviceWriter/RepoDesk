import { open } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import './style.css';
import { acikModalVar, enUstModaliKapat, gunlugeYaz } from './lib/bilesen.js';
import { ciz, depola, eylemler, html } from './lib/dom.js';
import { simge } from './lib/simge.js';
import { durum, dinle } from './durum.js';
import { calismaAlani, calismaKur } from './bolumler/calisma.js';
import { girisYap, hesabiYukle, hesapKur } from './bolumler/hesap.js';
import { istatistikCiz, kutuphaneKur, repolariYukle, yeniRepoModali } from './bolumler/kutuphane.js';
import { acilistaGuncellemeKontrol, ayarlarModali } from './bolumler/ayarlarModali.js';

// Beklenmeyen arayüz hataları da günlüğe düşsün (hata ayıklamak için).
window.addEventListener('error', (e) => gunlugeYaz('hata', 'arayüz', `${e.message} (${e.filename?.split('/').pop() || '?'}:${e.lineno})`));
window.addEventListener('unhandledrejection', (e) => gunlugeYaz('hata', 'arayüz', `Yakalanmamış hata: ${e.reason?.message || e.reason}`));

// ---------- Tema ----------

const temaSorgusu = window.matchMedia('(prefers-color-scheme: dark)');
const etkinTema = () => depola.oku('tema', '') || (temaSorgusu.matches ? 'koyu' : 'acik');

function temaUygula() {
    const tema = depola.oku('tema', '');
    if (tema) document.documentElement.dataset.theme = tema === 'koyu' ? 'dark' : 'light';
    else delete document.documentElement.dataset.theme;
    const dugme = document.getElementById('tema-dugme');
    if (dugme) ciz(dugme, simge(etkinTema() === 'koyu' ? 'gunes' : 'ay', 17));
}
temaSorgusu.addEventListener('change', temaUygula);
dinle('ayar:tema', temaUygula);

// ---------- İskelet ----------

const app = document.getElementById('app');
ciz(app, html`
    <div class="kabuk">
        <header class="ust-cubuk">
            <div class="ust-ic">
                <div class="marka">
                    <img class="marka-isaret" src="/logo.png" alt="" width="36" height="36">
                    <div><strong>RepoDesk</strong><span>GitHub çalışma alanın</span></div>
                </div>
                <div class="ust-eylemler" id="ust-eylemler">
                    <button class="ikon-dugme" id="tema-dugme" data-eylem="tema" type="button" title="Temayı değiştir" aria-label="Temayı değiştir"></button>
                    <button class="ikon-dugme" data-eylem="yenile" type="button" title="Her şeyi yenile (Ctrl+R)" aria-label="Yenile">${simge('yenile', 17)}</button>
                    <button class="ikon-dugme" data-eylem="ayarlar" type="button" title="Ayarlar (Ctrl+,)" aria-label="Ayarlar">${simge('ayar', 17)}</button>
                    <div class="hesap-kap" id="hesap"></div>
                </div>
            </div>
        </header>
        <main id="ana">
            <section class="kahraman" id="kahraman"></section>
            <section class="istatistikler" id="istatistikler"></section>
            <div id="calisma"></div>
            <div id="kutuphane"></div>
            <div id="karsilama" hidden></div>
        </main>
    </div>`);
temaUygula();

eylemler(document.getElementById('ust-eylemler'), 'click', {
    tema: () => {
        depola.yaz('tema', etkinTema() === 'koyu' ? 'acik' : 'koyu');
        temaUygula();
    },
    yenile: () => herSeyiYenile(),
    ayarlar: () => ayarlarModali(),
});

function herSeyiYenile() {
    if (durum.hesap) repolariYukle();
    else hesabiYukle();
    calismaAlani.yenile();
}

// ---------- Bölümler ----------

const kahraman = document.getElementById('kahraman');
const istatistikler = document.getElementById('istatistikler');
const kutuphane = document.getElementById('kutuphane');
const karsilama = document.getElementById('karsilama');

eylemler(kahraman, 'click', {
    yeniRepo: () => yeniRepoModali(),
    klasorAc: () => klasorSec(),
});
eylemler(karsilama, 'click', {
    giris: () => girisYap(),
    tekrar: () => hesabiYukle(),
    kur: () => openUrl('https://cli.github.com'),
});

async function klasorSec() {
    const secim = await open({ directory: true, multiple: false, title: 'Proje klasörünü seç' });
    if (typeof secim === 'string') calismaAlani.ac(secim);
}

function kahramanCiz() {
    const h = durum.hesap;
    const ad = h ? (h.name || h.login).split(' ')[0] : '';
    ciz(kahraman, html`
        <div>
            <p class="ust-baslik">KÜTÜPHANE</p>
            <h1>${ad ? html`Merhaba ${ad},<br><span>depoların tek bakışta.</span>` : html`Depoların,<br><span>tek bakışta.</span>`}</h1>
            <p class="alt-baslik">GitHub projelerini bul, klonla, düzenle ve senkronize et — terminale dokunmadan.</p>
        </div>
        <div class="kahraman-dugmeler">
            <button class="dugme dugme-sessiz" data-eylem="klasorAc" type="button" title="Ctrl+O">${simge('klasor', 15)} Klasör aç</button>
            ${h ? html`<button class="dugme" data-eylem="yeniRepo" type="button" title="Ctrl+N">${simge('arti', 15)} Yeni repo</button>` : ''}
        </div>`);
}

function karsilamaCiz() {
    if (durum.ghHatasi) {
        ciz(karsilama, html`<section class="karsilama karsilama-hata">
            <span class="bos-ikon">${simge('uyari', 24)}</span>
            <h2>GitHub CLI’a ulaşılamadı</h2>
            <p>${durum.ghHatasi}</p>
            <div class="kahraman-dugmeler">
                <button class="dugme dugme-sessiz" data-eylem="kur" type="button">${simge('dis', 15)} cli.github.com</button>
                <button class="dugme" data-eylem="tekrar" type="button">${simge('yenile', 15)} Tekrar dene</button>
            </div>
        </section>`);
        return;
    }
    ciz(karsilama, html`<section class="karsilama">
        <span class="karsilama-isaret">${simge('kullanici', 26)}</span>
        <h2>GitHub hesabını bağla</h2>
        <p>Depolarını listelemek, yeni repo oluşturmak ve push/pull yapabilmek için bir kez giriş yapman yeterli. Giriş GitHub’ın resmi CLI aracıyla, tarayıcı üzerinden yapılır; şifren bu uygulamaya hiç girilmez.</p>
        <button class="dugme dugme-buyuk" data-eylem="giris" type="button">${simge('kullanici', 16)} GitHub ile giriş yap</button>
        <small>Yerel klasör özellikleri giriş yapmadan da kullanılabilir.</small>
    </section>`);
}

let kutuphaneKuruldu = false;
dinle('hesap', () => {
    kahramanCiz();
    const girisli = Boolean(durum.hesap);
    const yukleniyor = durum.hesap === undefined;
    if ((girisli || yukleniyor) && !kutuphaneKuruldu) {
        kutuphaneKur(kutuphane);
        istatistikCiz(istatistikler);
        kutuphaneKuruldu = true;
    }
    kutuphane.hidden = !(girisli || yukleniyor);
    istatistikler.hidden = !(girisli || yukleniyor);
    karsilama.hidden = girisli || yukleniyor;
    if (!karsilama.hidden) karsilamaCiz();
});

hesapKur(document.getElementById('hesap'));
calismaKur(document.getElementById('calisma'));
kahramanCiz();

// ---------- Klavye kısayolları ----------

const yaziyor = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (e.defaultPrevented) return;
    if (e.key === 'Escape' && acikModalVar()) {
        e.preventDefault();
        enUstModaliKapat();
        return;
    }
    if (acikModalVar()) return;
    if (e.key === '/' && !yaziyor(document.activeElement)) {
        const arama = document.getElementById('arama');
        if (arama && !kutuphane.hidden) { e.preventDefault(); arama.focus(); arama.select(); }
    } else if ((mod && e.key.toLowerCase() === 'r') || e.key === 'F5') {
        e.preventDefault();
        herSeyiYenile();
    } else if (mod && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        klasorSec();
    } else if (mod && e.key === 'Tab') {
        e.preventDefault();
        calismaAlani.gez(e.shiftKey ? -1 : 1);
    } else if (mod && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        calismaAlani.kapat();
    } else if (mod && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        calismaAlani.secSira(Number(e.key) - 1);
    } else if (mod && e.key === ',') {
        e.preventDefault();
        ayarlarModali();
    } else if (mod && e.key.toLowerCase() === 'n' && durum.hesap) {
        e.preventDefault();
        yeniRepoModali();
    } else if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[role="button"][data-eylem], [role="tab"][data-eylem]')) {
        e.preventDefault();
        e.target.click();
    }
});

window.addEventListener('focus', () => calismaAlani.sessizYenile());

hesabiYukle();
setTimeout(acilistaGuncellemeKontrol, 8000);
