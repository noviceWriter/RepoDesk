import { open } from '@tauri-apps/plugin-dialog';
import { openUrl, revealItemInDir } from '@tauri-apps/plugin-opener';
import { api } from '../lib/api.js';
import { acikModalVar, bildir, hataBildir, menuAc, modalAc, onayla } from '../lib/bilesen.js';
import { boyutYaz, ciz, depola, eylemler, goreliZaman, html, klasorAdi, panoyaKopyala, repoAdiOner, repoAdiGecerli, repoAnahtari, tarihYaz } from '../lib/dom.js';
import { simge } from '../lib/simge.js';
import { durum, yayinla, yerelEslesme } from '../durum.js';
import { gorunurlukSecici, repolariYukle } from './kutuphane.js';
import { ayarlar } from '../ayarlar.js';
import { dallarModali } from './dallar.js';
import { cakismaModali } from './cakisma.js';
import { isteklerModali } from './istekler.js';
import { commitModali, farkSatirSinifi } from './commit.js';
import { ciModali, ciRozeti } from './ci.js';
import { surumlerModali } from './surumler.js';

const DURUM_ETIKETI = {
    yeni: ['+', 'Yeni'],
    eklendi: ['+', 'Eklendi'],
    degisti: ['●', 'Değişti'],
    silindi: ['−', 'Silindi'],
    tasindi: ['→', 'Taşındı'],
    cakisma: ['!', 'Çakışma'],
};

const ONERILEN_HARICLER = ['node_modules', 'dist', 'build', 'target', 'out', '.next', 'coverage', '.env', '.venv', 'venv', '__pycache__', '.DS_Store', '.idea', '.vscode'];
const EN_FAZLA_SON = 6;

const EN_FAZLA_SEKME = 10;

/** Her açık klasör (sekme) kendi durumunu taşır. */
function yeniAlan(kok) {
    return {
        kok,
        bilgi: null,
        dosyalar: [],
        alt: '',
        sekme: depola.oku('sekme', 'degisiklikler'),
        disarida: new Set(),
        mesaj: '',
        farkYol: '',
        fark: '',
        farkYukleniyor: false,
        mesgul: '',
        yukleniyor: Boolean(kok),
        sonKontrol: 0,
        bildirilenGeri: 0,
        ekGecmis: [],
        uzakHatasi: '',
        ci: '',
        ciZaman: 0,
        gecmisSonu: false,
    };
}

const BOS = yeniAlan('');
let alanlar = [];
/** Etkin sekme. Hiç sekme seçili değilse BOS (klasör açma ekranı). */
let c = BOS;
let kap;
let sonYenileme = 0;
let sonUzakKontrol = Date.now();

const sonKlasorler = () => depola.oku('sonKlasorler', []);

function sonlaraEkle(yol) {
    depola.yaz('sonKlasorler', [yol, ...sonKlasorler().filter((y) => y !== yol)].slice(0, EN_FAZLA_SON));
}

function sekmeleriKaydet() {
    depola.yaz('acikKlasorler', alanlar.map((a) => a.bilgi?.kok || a.kok));
    depola.yaz('aktifKlasor', c.bilgi?.kok || c.kok);
}

/** git@github.com:a/b.git → https://github.com/a/b */
const repoYolu = (origin) => origin?.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?\/?$/i)?.[1] || '';
const webAdresi = (origin) => (repoYolu(origin) ? `https://github.com/${repoYolu(origin)}` : '');

/** Diğer pencerelerin (dallar, çakışma, PR) etkin sekmeye erişimi. */
const baglam = {
    get kok() { return c.kok; },
    get bilgi() { return c.bilgi; },
    yenile: () => yenile().catch(hataBildir),
};

function alanSec(alan) {
    if (!alan) return;
    c = alan;
    sekmeleriKaydet();
    yayinla('calisma-origin');
    panelCiz();
    if (!alan.bilgi) yenile(alan).catch((e) => { hataBildir(e); alanKapat(alan); });
    else calismaAlani.sessizYenile();
}

function alanKapat(alan) {
    const sira = alanlar.indexOf(alan);
    if (sira < 0) return;
    alanlar.splice(sira, 1);
    if (c === alan) c = alanlar[sira] || alanlar[sira - 1] || BOS;
    sekmeleriKaydet();
    yayinla('calisma-origin');
    panelCiz();
    if (c !== BOS && !c.bilgi) yenile(c).catch(hataBildir);
}

export const calismaAlani = {
    baglam: () => (c.bilgi?.gitMi ? baglam : null),
    origin: () => c.bilgi?.origin || '',
    /** Açık sekmelerin tümünün GitHub anahtarları (kartlarda “Açık” rozeti için). */
    originler: () => new Set(alanlar.map((a) => repoAnahtari(a.bilgi?.origin)).filter(Boolean)),
    mesgul: () => Boolean(c.mesgul),
    async originDegistir(url) {
        await api.bagla(c.kok, url);
        await yenile();
    },
    async ac(yol, { sessiz = false } = {}) {
        yol = (yol || '').trim().replace(/[\\/]+$/, '') || (yol || '').trim();
        if (!yol) return;
        const mevcut = alanlar.find((a) => a.kok === yol || a.bilgi?.kok === yol);
        if (mevcut) { alanSec(mevcut); return; }
        if (alanlar.length >= EN_FAZLA_SEKME) {
            bildir(`En fazla ${EN_FAZLA_SEKME} klasör aynı anda açık olabilir. Önce bir sekmeyi kapat.`, { tur: 'hata' });
            return;
        }
        const alan = yeniAlan(yol);
        alanlar.push(alan);
        c = alan;
        panelCiz();
        try {
            await yenile(alan);
            const tekrar = alanlar.find((a) => a !== alan && a.bilgi?.kok === alan.bilgi.kok);
            if (tekrar) { alanKapat(alan); alanSec(tekrar); return; }
            sonlaraEkle(alan.bilgi.kok);
            sekmeleriKaydet();
            if (!sessiz && alan.bilgi.origin) {
                bildir(`Bu klasör GitHub’daki “${repoYolu(alan.bilgi.origin) || alan.bilgi.origin}” reposuna bağlı. Değiştirmek için bağlantının yanındaki “Değiştir”i kullan.`, { tur: 'bilgi', sure: 7000 });
            }
            if (!sessiz) kap.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (e) {
            hataBildir(e);
            alanKapat(alan);
        }
    },
    kapat: () => alanKapat(c),
    yeniSekme() {
        c = BOS;
        panelCiz();
        kap.querySelector('#klasor-yolu')?.focus();
    },
    /** Sekmeler arasında gezinme: +1 sonraki, -1 önceki. */
    gez(yon) {
        if (!alanlar.length) return;
        const sira = alanlar.indexOf(c);
        alanSec(alanlar[(sira + yon + alanlar.length) % alanlar.length]);
    },
    secSira: (sira) => alanSec(alanlar[sira]),
    async yenile() {
        if (!c.bilgi || c.mesgul) return;
        try { await yenile(); } catch (e) { hataBildir(e); }
    },
    /** Pencere odağa geldiğinde dışarıda yapılan değişiklikleri yakalar. */
    async sessizYenile() {
        if (!c.bilgi || c.mesgul || acikModalVar() || Date.now() - sonYenileme < 1500) return;
        try { await yenile(); } catch { /* sessiz */ }
    },
    /** Tüm sekmelerde GitHub'ı yoklar (git fetch); yeni commit varsa haber verir. */
    async uzakKontrol({ elle = false } = {}) {
        sonUzakKontrol = Date.now();
        for (const alan of [...alanlar]) {
            if (!alan.bilgi?.origin || alan.mesgul) continue;
            alan.mesgul = 'kontrol';
            panelCiz();
            try {
                await api.uzakGuncelle(alan.kok);
                alan.sonKontrol = Date.now();
                alan.uzakHatasi = '';
            } catch (e) {
                // Aynı hatayı her turda tekrar gösterme; yalnızca yeni/farklıysa bildir.
                if (elle || e.message !== alan.uzakHatasi) hataBildir(new Error(`${alan.bilgi.ad}: ${e.message}`));
                alan.uzakHatasi = e.message;
            }
            alan.mesgul = '';
            try { await yenile(alan); } catch { /* sekme kapanmış olabilir */ }
            await ciGuncelle(alan, true);
            const geri = alan.bilgi?.geri || 0;
            if (geri > alan.bildirilenGeri) {
                bildir(`${alan.bilgi.ad}: GitHub’da ${geri} yeni commit var.`, {
                    tur: 'bilgi',
                    eylem: { metin: 'Pull yap', fn: () => { alanSec(alan); islem('pull', () => api.pull(alan.kok), alan); } },
                });
            }
            alan.bildirilenGeri = geri;
        }
        if (elle) bildir('GitHub kontrol edildi.', { tur: 'basari', sure: 2500 });
    },
};

/** Ayarlanan aralıkla otomatik uzak kontrol. */
setInterval(() => {
    const dakika = Number(ayarlar.al('otomatikKontrol')) || 0;
    if (!dakika || acikModalVar() || Date.now() - sonUzakKontrol < dakika * 60000) return;
    calismaAlani.uzakKontrol();
}, 30000);

async function yenile(alan = c) {
    if (!alan.kok) return;
    if (alan === c) sonYenileme = Date.now();
    const kok = alan.kok;
    const dosyalariGetir = () => api.dosyalar(kok, alan.alt).catch((e) => {
        if (!alan.alt) throw e;
        alan.alt = '';
        return api.dosyalar(kok, '');
    });
    const [bilgi, dosyalar] = await Promise.all([api.durum(kok), dosyalariGetir()]);
    if (!alanlar.includes(alan)) return;
    if (alan.bilgi?.gecmis[0]?.kisa !== bilgi.gecmis[0]?.kisa) { alan.ekGecmis = []; alan.gecmisSonu = false; }
    alan.bilgi = bilgi;
    alan.kok = bilgi.kok;
    alan.dosyalar = dosyalar;
    alan.yukleniyor = false;
    if (bilgi.birlestirme && !alan.mesaj) alan.mesaj = bilgi.birlestirmeMesaji || '';
    const yollar = new Set(bilgi.degisiklikler.map((d) => d.yol));
    for (const y of alan.disarida) if (!yollar.has(y)) alan.disarida.delete(y);
    if (alan.farkYol) {
        const d = bilgi.degisiklikler.find((x) => x.yol === alan.farkYol);
        if (d) farkYukle(d.yol, d.durum, true, alan);
        else { alan.farkYol = ''; alan.fark = ''; }
    }
    yerelEslesme.kaydet(repoAnahtari(bilgi.origin), bilgi.kok);
    yayinla('calisma-origin');
    panelCiz();
    if (alan === c) ciGuncelle(alan);
}

/** Geçerli dalın son CI çalıştırmasını getirir (en fazla dakikada bir, `zorla` hariç). */
async function ciGuncelle(alan, zorla = false) {
    const b = alan.bilgi;
    if (!durum.hesap || !b?.origin || !b.dal || !b.upstream || b.upstreamSilindi) return;
    if (!zorla && Date.now() - alan.ciZaman < 60000) return;
    alan.ciZaman = Date.now();
    try {
        const liste = await api.ciCalismalari(webAdresi(b.origin), b.dal);
        alan.ci = liste[0]?.durum || '';
    } catch {
        alan.ci = '';
    }
    if (alanlar.includes(alan)) panelCiz();
}

/** Push'tan sonra GitHub iş akışını başlatana kadar bekleyip CI durumunu tazeler. */
function pushSonrasiCi(alan) {
    setTimeout(() => ciGuncelle(alan, true), 6000);
}

async function islem(ad, fn, alan = c) {
    if (alan.mesgul) return false;
    alan.mesgul = ad;
    panelCiz();
    let basarili = false;
    try {
        const sonuc = await fn();
        if (typeof sonuc === 'string' && sonuc) bildir(sonuc, { tur: sonuc.includes('çakışma') ? 'bilgi' : 'basari' });
        basarili = true;
    } catch (e) {
        hataBildir(e);
    }
    alan.mesgul = '';
    try { await yenile(alan); } catch (e) { hataBildir(e); panelCiz(); }
    return basarili;
}

async function farkYukle(yol, durumAdi, sessiz = false, alan = c) {
    alan.farkYol = yol;
    if (!sessiz) { alan.farkYukleniyor = true; panelCiz(); }
    try {
        const fark = await api.fark(alan.kok, yol.replace(/\/$/, ''), durumAdi);
        if (alan.farkYol === yol) alan.fark = fark;
    } catch (e) {
        if (alan.farkYol === yol) alan.fark = `⚠ ${e.message}`;
    }
    alan.farkYukleniyor = false;
    panelCiz();
}

// ---------- Kurulum ----------

export function calismaKur(kapsayici) {
    kap = kapsayici;
    eylemler(kap, 'click', {
        klasorSec: async () => {
            const secim = await open({ directory: true, multiple: false, title: 'Proje klasörünü seç' });
            if (typeof secim === 'string') calismaAlani.ac(secim);
        },
        yolAc: () => calismaAlani.ac(kap.querySelector('#klasor-yolu')?.value),
        sonAc: (el) => calismaAlani.ac(el.dataset.yol),
        sonSil: (el, e) => {
            e.stopPropagation();
            depola.yaz('sonKlasorler', sonKlasorler().filter((y) => y !== el.dataset.yol));
            panelCiz();
        },
        kapat: () => calismaAlani.kapat(),
        yenile: () => {
            const alan = c;
            islem('yenile', async () => {
                if (!alan.bilgi?.origin) return;
                await api.uzakGuncelle(alan.kok);
                alan.sonKontrol = Date.now();
            }, alan);
        },
        goster: () => revealItemInDir(c.bilgi.kok).catch(hataBildir),
        githubAc: () => openUrl(webAdresi(c.bilgi.origin)),
        ustAc: () => calismaAlani.ac(c.bilgi.ustDepo),
        sekme: (el) => { c.sekme = el.dataset.sekme; depola.yaz('sekme', c.sekme); panelCiz(); },
        pull: () => islem('pull', () => api.pull(c.kok)),
        push: () => {
            if (!c.bilgi.origin) { yayinlaModali(); return; }
            const alan = c;
            islem('push', () => api.push(alan.kok), alan).then((tamam) => tamam && pushSonrasiCi(alan));
        },
        surumler: () => surumlerModali({ url: webAdresi(c.bilgi.origin), ad: repoYolu(c.bilgi.origin) }, baglam),
        ciAc: () => ciModali({ url: webAdresi(c.bilgi.origin), ad: repoYolu(c.bilgi.origin) }, c.bilgi.dal),
        kimlik: () => islem('kimlik', () => api.kimlikAyarla(c.kok)),
        yayinla: () => yayinlaModali(),
        bagla: () => baglaModali(),
        baglantiKaldir: () => baglantiyiKaldir(),
        commit: () => commitYap(false),
        commitPush: () => commitYap(true),
        sec: (el) => {
            if (el.checked) c.disarida.delete(el.dataset.yol);
            else c.disarida.add(el.dataset.yol);
            panelCiz();
        },
        hepsiniSec: (el) => {
            c.disarida = el.checked ? new Set() : new Set(c.bilgi.degisiklikler.map((d) => d.yol));
            panelCiz();
        },
        farkGoster: (el) => farkYukle(el.dataset.yol, el.dataset.durum),
        klasoreGit: (el) => klasoreGit(el.dataset.yol),
        terminal: () => hariciAc(c, '', 'terminal'),
        editorAc: () => hariciAc(c, '', 'editor'),
        alanSec: (el) => alanSec(alanlar[Number(el.dataset.sira)]),
        alanKapat: (el, e) => { e.stopPropagation(); alanKapat(alanlar[Number(el.dataset.sira)]); },
        yeniSekme: () => calismaAlani.yeniSekme(),
        uzakKontrol: () => calismaAlani.uzakKontrol({ elle: true }),
        dosyaAc: (el) => editorAc(el.dataset.yol),
        yeniDosya: () => editorAc(''),
        dosyaSil: (el, e) => { e.stopPropagation(); dosyaSil(el.dataset.yol); },
        dosyaDuzenle: (el, e) => { e.stopPropagation(); editorAc(el.dataset.yol); },
        dallar: () => dallarModali(baglam),
        istekler: () => isteklerModali({ url: webAdresi(c.bilgi.origin), ad: repoYolu(c.bilgi.origin) }, baglam),
        cakismaAc: (el) => cakismaModali(baglam, el.dataset.yol),
        ilkCakisma: () => {
            const ilk = c.bilgi.degisiklikler.find((d) => d.durum === 'cakisma');
            if (ilk) cakismaModali(baglam, ilk.yol);
        },
        birlestirmeIptal: async () => {
            const tamam = await onayla('Birleştirme iptal edilsin mi? Çakışma çözümleri dahil birleştirmeyle gelen her şey geri alınır.', { baslik: 'Birleştirmeyi iptal et', tamam: 'İptal et', tehlikeli: true });
            if (tamam) { c.mesaj = ''; islem('iptal', () => api.birlestirmeIptal(c.kok)); }
        },
        satirGeriAl: (el, e) => {
            e.stopPropagation();
            const d = c.bilgi.degisiklikler.find((x) => x.yol === el.dataset.yol);
            if (d) geriAl([d]);
        },
        seciliGeriAl: () => geriAl(c.bilgi.degisiklikler.filter((d) => !c.disarida.has(d.yol))),
        sonCommitGeriAl: () => sonCommitiGeriAl(),
        commitDetay: (el) => commitModali(baglam, el.dataset.hash, webAdresi(c.bilgi.origin)),
        dahaGecmis: async () => {
            const alan = c;
            if (alan.mesgul) return;
            alan.mesgul = 'gecmis';
            panelCiz();
            try {
                const yeni = await api.commitListesi(alan.kok, alan.bilgi.gecmis.length + alan.ekGecmis.length, 50);
                alan.ekGecmis.push(...yeni);
                if (yeni.length < 50) alan.gecmisSonu = true;
            } catch (e) { hataBildir(e); }
            alan.mesgul = '';
            panelCiz();
        },
    });
    kap.addEventListener('input', (e) => { if (e.target.id === 'commit-mesaji') c.mesaj = e.target.value; });
    kap.addEventListener('auxclick', (e) => {
        const sekme = e.button === 1 && e.target.closest('.alan-sekme');
        if (sekme) { e.preventDefault(); alanKapat(alanlar[Number(sekme.dataset.sira)]); }
    });
    kap.addEventListener('contextmenu', (e) => {
        const sekme = e.target.closest('.alan-sekme');
        if (sekme) { e.preventDefault(); sekmeMenusu(e, alanlar[Number(sekme.dataset.sira)]); return; }
        if (!c.bilgi) return;
        const dosya = e.target.closest('.dosya-satir[data-yol]');
        if (dosya && dosya.tagName !== 'BUTTON') { e.preventDefault(); dosyaMenusu(e, dosya.dataset.yol, dosya.classList.contains('klasor')); return; }
        const degisim = e.target.closest('.degisim-satir');
        if (degisim) {
            const d = c.bilgi.degisiklikler.find((x) => x.yol === degisim.dataset.yol);
            if (d) { e.preventDefault(); degisimMenusu(e, d); }
            return;
        }
        if (e.target.closest('.panel-ust')) { e.preventDefault(); menuAc(e, klasorOgeleri(c, '')); }
    });
    kap.addEventListener('keydown', (e) => {
        if (e.target.id === 'commit-mesaji' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commitYap(false); }
        if (e.target.id === 'klasor-yolu' && e.key === 'Enter') calismaAlani.ac(e.target.value);
    });
    sekmeleriGeriYukle();
}

async function sekmeleriGeriYukle() {
    const eski = depola.oku('acikKlasor', '');
    const liste = depola.oku('acikKlasorler', eski ? [eski] : []);
    const aktif = depola.oku('aktifKlasor', eski);
    alanlar = liste.slice(0, EN_FAZLA_SEKME).map(yeniAlan);
    c = alanlar.find((a) => a.kok === aktif) || alanlar[0] || BOS;
    panelCiz();
    // Önce etkin sekme, sonra diğerleri (rozetler için) sırayla yüklenir.
    for (const alan of [c, ...alanlar.filter((a) => a !== c)]) {
        if (alan === BOS) continue;
        try { await yenile(alan); } catch { alanKapat(alan); }
    }
}

// ---------- Çizim ----------

function sekmeSeridi() {
    if (!alanlar.length) return '';
    return html`<div class="alan-sekmeleri" role="tablist" aria-label="Açık klasörler">
        ${alanlar.map((a, i) => {
            const b = a.bilgi;
            const degisim = b?.degisiklikler.length || 0;
            return html`<div class="alan-sekme ${a === c ? 'aktif' : ''}" data-eylem="alanSec" data-sira="${i}" role="tab" tabindex="0" aria-selected="${a === c}" title="${b?.kok || a.kok}${i < 9 ? ` (Ctrl+${i + 1})` : ''}">
                ${a.mesgul || a.yukleniyor ? html`<span class="donen kucuk"></span>` : simge('klasor', 13)}
                <span class="alan-ad">${b?.ad || klasorAdi(a.kok)}</span>
                ${b?.dal ? html`<span class="alan-dal">${b.dal}</span>` : ''}
                ${b?.birlestirme ? html`<span class="alan-rozet alan-rozet-uyari" title="Birleştirme çakışması">!</span>` : ''}
                ${b?.geri ? html`<span class="alan-rozet alan-rozet-geri" title="${b.geri} yeni commit GitHub'da">↓${b.geri}</span>` : ''}
                ${degisim ? html`<span class="alan-rozet" title="${degisim} değişiklik">${degisim}</span>` : ''}
                <button class="alan-kapat" data-eylem="alanKapat" data-sira="${i}" type="button" title="Sekmeyi kapat" aria-label="Sekmeyi kapat">${simge('carpi', 11)}</button>
            </div>`;
        })}
        <button class="alan-ekle ${c === BOS ? 'aktif' : ''}" data-eylem="yeniSekme" type="button" title="Başka bir klasör aç" aria-label="Yeni sekme">${simge('arti', 14)}</button>
    </div>`;
}

function panelCiz() {
    if (!kap) return;
    const serit = sekmeSeridi();
    if (!c.kok) return ciz(kap, html`${serit}${bosPanel()}`);
    if (!c.bilgi) {
        return ciz(kap, html`${serit}<section class="panel panel-yukleniyor"><span class="donen"></span><p>${klasorAdi(c.kok)} açılıyor…</p></section>`);
    }
    const b = c.bilgi;
    const bagli = b.gitMi && b.origin;
    const sekmeler = [
        b.gitMi && ['degisiklikler', 'Değişiklikler', b.degisiklikler.length],
        ['dosyalar', 'Dosyalar', null],
        b.gitMi && b.commitVar && ['gecmis', 'Geçmiş', b.gecmis.length],
    ].filter(Boolean);
    if (!sekmeler.some(([ad]) => ad === c.sekme)) c.sekme = sekmeler[0][0];

    ciz(kap, html`${serit}
        <section class="panel">
            <header class="panel-ust">
                <div class="panel-kimlik">
                    <span class="panel-ikon">${simge('klasor', 20)}</span>
                    <div>
                        <p class="ust-baslik">YEREL ÇALIŞMA ALANI</p>
                        <h2>${b.ad}</h2>
                        <p class="yol" title="${b.kok}">${b.kok}</p>
                    </div>
                </div>
                <div class="panel-ust-eylemler">
                    ${bagli ? html`<button class="dugme dugme-sessiz dugme-kucuk" data-eylem="istekler" type="button" title="Pull Request ve Issue'lar">${simge('pr', 14)} PR ve Issue</button>
                        <button class="dugme dugme-sessiz dugme-kucuk" data-eylem="surumler" type="button" title="Release ve etiketler">${simge('etiket', 14)} Sürümler</button>` : ''}
                    <button class="ikon-dugme" data-eylem="terminal" type="button" title="Terminalde aç" aria-label="Terminalde aç">${simge('terminal', 17)}</button>
                    <button class="ikon-dugme" data-eylem="editorAc" type="button" title="Editörde aç (${ayarlar.al('editorKomutu') || 'code'})" aria-label="Editörde aç">${simge('kod', 17)}</button>
                    <button class="ikon-dugme" data-eylem="goster" type="button" title="Dosya yöneticisinde göster" aria-label="Dosya yöneticisinde göster">${simge('dis', 17)}</button>
                    <button class="ikon-dugme ${c.mesgul === 'yenile' || c.mesgul === 'kontrol' ? 'donuyor' : ''}" data-eylem="yenile" type="button" title="${b.origin ? "Yenile ve GitHub'ı kontrol et" : 'Yenile'}" aria-label="Yenile">${simge('yenile', 17)}</button>
                    <button class="ikon-dugme" data-eylem="kapat" type="button" title="Çalışma alanını kapat" aria-label="Kapat">${simge('carpi', 17)}</button>
                </div>
            </header>
            ${b.gitMi ? cipler(b) : ''}
            ${uyarilar(b)}
            ${bagli ? senkronCubugu(b) : ''}
            <nav class="sekmeler" role="tablist">
                ${sekmeler.map(([ad, etiket, sayi]) => html`
                    <button class="sekme ${c.sekme === ad ? 'aktif' : ''}" data-eylem="sekme" data-sekme="${ad}" role="tab" aria-selected="${c.sekme === ad}" type="button">
                        ${etiket}${sayi ? html`<span>${sayi}</span>` : ''}
                    </button>`)}
            </nav>
            <div class="sekme-icerik">
                ${c.sekme === 'degisiklikler' ? degisiklikSekmesi(b) : c.sekme === 'gecmis' ? gecmisSekmesi(b) : dosyaSekmesi(b)}
            </div>
        </section>`);

    const hepsi = kap.querySelector('[data-eylem="hepsiniSec"]');
    if (hepsi) hepsi.indeterminate = c.disarida.size > 0 && c.disarida.size < b.degisiklikler.length;
}

function bosPanel() {
    const sonlar = sonKlasorler();
    return html`
        <section class="panel panel-bos">
            <div class="panel-bos-metin">
                <p class="ust-baslik">YEREL ÇALIŞMA ALANI</p>
                <h2>Bir proje klasörü aç</h2>
                <p>Dosyaları düzenle, değişiklikleri incele, commit et ve GitHub ile senkronize et.</p>
            </div>
            <div class="klasor-ac">
                <div class="girdi-grubu">
                    <input id="klasor-yolu" placeholder="Klasör yolunu yaz ya da “Gözat” ile seç" spellcheck="false" autocomplete="off">
                    <button class="dugme dugme-sessiz" data-eylem="klasorSec" type="button">${simge('klasor', 15)} Gözat</button>
                    <button class="dugme" data-eylem="yolAc" type="button">Aç</button>
                </div>
                ${sonlar.length ? html`
                    <div class="son-klasorler">
                        <span>Son açılanlar</span>
                        ${sonlar.map((yol) => html`
                            <button class="cip" data-eylem="sonAc" data-yol="${yol}" type="button" title="${yol}">
                                ${simge('klasor', 13)} ${klasorAdi(yol)}
                                <span class="cip-sil" data-eylem="sonSil" data-yol="${yol}" role="button" aria-label="Listeden kaldır">${simge('carpi', 11)}</span>
                            </button>`)}
                    </div>` : ''}
            </div>
        </section>`;
}

function cipler(b) {
    return html`<div class="cipler">
        <button class="cip cip-dal" data-eylem="dallar" type="button" title="Dalları yönet">${simge('dal', 13)} ${b.dal || 'ayrık HEAD'} ${simge('acilir', 12)}</button>
        ${b.origin && c.ci ? ciRozeti(c.ci, { eylem: 'ciAc', etiket: 'CI' }) : ''}
        ${b.origin ? html`<button class="cip cip-baglanti" data-eylem="githubAc" type="button" title="${b.origin}">${simge('baglanti', 13)} ${repoYolu(b.origin) || b.origin}</button><button class="cip cip-eylem" data-eylem="bagla" type="button" title="Bu klasörün bağlı olduğu repoyu değiştir">${simge('kalem', 12)} Değiştir</button>` : ''}
        ${b.degisiklikler.length ? html`<span class="cip cip-degisim">${simge('degisim', 13)} ${b.degisiklikler.length} değişiklik</span>` : html`<span class="cip cip-temiz">${simge('tik', 13)} Temiz</span>`}
        ${b.birlestirme ? html`<span class="cip cip-uyari">${simge('uyari', 13)} Birleştirme sürüyor</span>` : ''}
    </div>`;
}

function uyarilar(b) {
    if (b.ustDepo) {
        return html`<div class="bilgi-kutusu">
            ${simge('uyari', 18)}
            <div><strong>Bu klasör başka bir Git deposunun içinde.</strong><p>${b.ustDepo}</p></div>
            <button class="dugme dugme-sessiz" data-eylem="ustAc" type="button">Üst depoyu aç</button>
        </div>`;
    }
    const parcalar = [];
    if (!b.gitMi || !b.origin) {
        parcalar.push(html`<div class="bilgi-kutusu bilgi-vurgulu">
            ${simge('yayinla', 20)}
            <div>
                <strong>${b.gitMi ? 'Bu depo henüz GitHub’a bağlı değil.' : 'Bu klasör henüz bir Git deposu değil.'}</strong>
                <p>GitHub’da yeni bir repo olarak yayınla ya da var olan bir repona bağla.</p>
            </div>
            <div class="bilgi-dugmeler">
                <button class="dugme dugme-sessiz" data-eylem="bagla" type="button">${simge('baglanti', 15)} Mevcut repoya bağla</button>
                <button class="dugme" data-eylem="yayinla" type="button">${simge('yayinla', 15)} GitHub’da yayınla</button>
            </div>
        </div>`);
    }
    if (b.birlestirme) {
        const kalan = b.degisiklikler.filter((d) => d.durum === 'cakisma').length;
        parcalar.push(html`<div class="bilgi-kutusu bilgi-cakisma">
            ${simge('birlestir', 20)}
            <div>
                <strong>${kalan ? `Birleştirme çakışması: ${kalan} dosya çözülmeyi bekliyor` : 'Tüm çakışmalar çözüldü'}</strong>
                <p>${kalan ? 'Aynı satırlar iki tarafta da değişmiş. Her çakışma için hangi değişikliğin kalacağını seç.' : 'Birleştirmeyi tamamlamak için aşağıdan commit et.'}</p>
            </div>
            <div class="bilgi-dugmeler">
                <button class="dugme dugme-sessiz ${c.mesgul === 'iptal' ? 'yukleniyor' : ''}" data-eylem="birlestirmeIptal" type="button" ${c.mesgul ? 'disabled' : ''}>Birleştirmeyi iptal et</button>
                ${kalan ? html`<button class="dugme" data-eylem="ilkCakisma" type="button">${simge('birlestir', 15)} Çakışmaları çöz</button>` : ''}
            </div>
        </div>`);
    }
    if (b.gitMi && !b.kimlikVar) {
        parcalar.push(html`<div class="bilgi-kutusu">
            ${simge('kullanici', 18)}
            <div><strong>Git kimliği ayarlı değil.</strong><p>Commit oluşturabilmek için bir ad ve e-posta gerekiyor.</p></div>
            <button class="dugme dugme-sessiz ${c.mesgul === 'kimlik' ? 'yukleniyor' : ''}" data-eylem="kimlik" type="button" ${c.mesgul ? 'disabled' : ''}>GitHub hesabımla ayarla</button>
        </div>`);
    }
    return parcalar;
}

function senkronCubugu(b) {
    const dugme = (eylem, ikon, etiket, sayi, aciklama) => html`
        <button class="senkron-dugme ${c.mesgul === eylem ? 'yukleniyor' : ''} ${sayi ? 'bekleyen' : ''}" data-eylem="${eylem}" type="button" ${c.mesgul ? 'disabled' : ''}>
            ${simge(ikon, 16)}
            <span><strong>${etiket}${sayi ? html` <em>${sayi}</em>` : ''}</strong><small>${aciklama}</small></span>
        </button>`;
    const yayinda = b.upstream && !b.upstreamSilindi;
    return html`<div class="senkron">
        ${dugme('pull', 'asagi', 'Pull', b.geri, b.geri ? `${b.geri} yeni commit seni bekliyor` : c.sonKontrol ? `Güncel · ${goreliZaman(new Date(c.sonKontrol))} kontrol edildi` : 'GitHub’dan değişiklikleri al')}
        ${dugme('push', 'yukari', 'Push', b.ileri, !b.commitVar ? 'Önce bir commit oluştur' : yayinda ? (b.ileri ? `${b.ileri} commit gönderilecek` : 'Her şey gönderildi') : 'Dal henüz GitHub’da yok')}
    </div>`;
}

function yolParcala(yol) {
    const klasorMu = yol.endsWith('/');
    const temiz = yol.replace(/\/$/, '');
    const i = temiz.lastIndexOf('/');
    return { dizin: i >= 0 ? temiz.slice(0, i + 1) : '', ad: temiz.slice(i + 1) + (klasorMu ? '/' : '') };
}

function degisiklikSekmesi(b) {
    if (!b.degisiklikler.length) {
        return html`<div class="bos bos-kucuk">
            <span class="bos-ikon bos-basari">${simge('tik', 22)}</span>
            <h3>Çalışma alanı temiz</h3>
            <p>${b.commitVar ? 'Son commit’ten bu yana değişiklik yok.' : 'Klasöre dosya ekleyerek başla.'}</p>
        </div>`;
    }
    const birlesme = b.birlestirme;
    const seciliSayi = birlesme ? b.degisiklikler.length : b.degisiklikler.length - c.disarida.size;
    const cakismaKaldi = b.degisiklikler.some((d) => d.durum === 'cakisma');
    const commitKapali = c.mesgul || !seciliSayi || cakismaKaldi;
    return html`<div class="degisim-duzeni">
        <div class="degisim-sol">
            <div class="liste-baslik">
                <label class="onay-kutusu">
                    <input type="checkbox" data-eylem="hepsiniSec" ${birlesme || c.disarida.size === 0 ? 'checked' : ''} ${birlesme ? 'disabled' : ''}>
                    ${seciliSayi} / ${b.degisiklikler.length} seçili
                </label>
                ${birlesme ? '' : html`<button class="dugme-metin tehlike-metin" data-eylem="seciliGeriAl" type="button" ${c.mesgul || !seciliSayi ? 'disabled' : ''} title="Seçili dosyaları son commit'teki hâline döndür">${simge('geriAl', 13)} Seçilenleri geri al</button>`}
            </div>
            <div class="degisim-listesi" data-kaydirma="degisim">
                ${b.degisiklikler.map((d) => {
                    const [harf, etiket] = DURUM_ETIKETI[d.durum] || ['?', d.durum];
                    const { dizin, ad } = yolParcala(d.yol);
                    const cakisan = d.durum === 'cakisma';
                    return html`<div class="degisim-satir ${c.farkYol === d.yol ? 'secili' : ''} ${cakisan ? 'cakisan' : ''}" data-eylem="${cakisan ? 'cakismaAc' : 'farkGoster'}" data-yol="${d.yol}" data-durum="${d.durum}" title="${cakisan ? 'Çakışmayı çözmek için tıkla' : d.eskiYol ? `${d.eskiYol} → ${d.yol}` : d.yol}">
                        <input type="checkbox" data-eylem="sec" data-yol="${d.yol}" ${birlesme || !c.disarida.has(d.yol) ? 'checked' : ''} ${birlesme ? 'disabled' : ''} aria-label="${d.yol} commit'e dahil">
                        <span class="dosya-yolu"><span class="dizin">${dizin}</span>${ad}</span>
                        ${birlesme ? '' : html`<button class="ikon-dugme satir-geri-al" data-eylem="satirGeriAl" data-yol="${d.yol}" type="button" title="Bu dosyadaki değişikliği geri al" aria-label="Geri al" ${c.mesgul ? 'disabled' : ''}>${simge('geriAl', 13)}</button>`}
                        <span class="durum-harf durum-${d.durum}" title="${etiket}">${harf}</span>
                    </div>`;
                })}
            </div>
            <div class="commit-kutusu">
                <textarea id="commit-mesaji" rows="3" placeholder="${birlesme ? 'Birleştirme commit mesajı' : 'Commit mesajı — ne değişti? (Ctrl+Enter)'}" ${c.mesgul ? 'disabled' : ''}>${c.mesaj}</textarea>
                <div class="commit-dugmeler">
                    <button class="dugme ${c.mesgul === 'commit' ? 'yukleniyor' : ''}" data-eylem="commit" type="button" ${commitKapali ? 'disabled' : ''} title="${cakismaKaldi ? 'Önce tüm çakışmaları çöz' : ''}">${simge('tik', 15)} Commit (${seciliSayi})</button>
                    ${b.origin ? html`<button class="dugme dugme-sessiz ${c.mesgul === 'commitPush' ? 'yukleniyor' : ''}" data-eylem="commitPush" type="button" ${commitKapali ? 'disabled' : ''}>${simge('yukari', 15)} Commit ve Push</button>` : ''}
                </div>
            </div>
        </div>
        <div class="fark-paneli">${farkGorunumu(b)}</div>
    </div>`;
}

function farkGorunumu(b) {
    if (!c.farkYol) {
        return html`<div class="fark-bos">${simge('dosya', 26)}<p>Değişikliği görmek için soldan bir dosya seç.</p></div>`;
    }
    const d = b.degisiklikler.find((x) => x.yol === c.farkYol);
    const satirlar = c.fark.split('\n').slice(0, 6000);
    return html`
        <div class="fark-ust">
            <span class="dosya-yolu" title="${c.farkYol}">${c.farkYol}</span>
            ${d && d.durum !== 'silindi' && !c.farkYol.endsWith('/') ? html`<button class="dugme-metin" data-eylem="dosyaDuzenle" data-yol="${c.farkYol}" type="button">${simge('kalem', 13)} Düzenle</button>` : ''}
        </div>
        <div class="fark" data-kaydirma="fark">
            ${c.farkYukleniyor ? html`<div class="fark-bos"><span class="donen"></span></div>` : satirlar.map((s) => html`<div class="fs ${farkSatirSinifi(s)}">${s || ' '}</div>`)}
        </div>`;
}

function dosyaSekmesi(b) {
    const degisimler = new Map(b.degisiklikler.map((d) => [d.yol.replace(/\/$/, ''), d.durum]));
    const klasorDegisti = (yol) => b.degisiklikler.some((d) => d.yol.startsWith(`${yol}/`));
    const parcalar = c.alt ? c.alt.split('/') : [];
    const ust = parcalar.slice(0, -1).join('/');
    return html`
        <div class="dosya-arac">
            <nav class="kirinti" aria-label="Klasör yolu">
                <button data-eylem="klasoreGit" data-yol="" type="button">${simge('ev', 14)} ${b.ad}</button>
                ${parcalar.map((p, i) => html`${simge('sag', 12)}<button data-eylem="klasoreGit" data-yol="${parcalar.slice(0, i + 1).join('/')}" type="button">${p}</button>`)}
            </nav>
            <button class="dugme dugme-sessiz" data-eylem="yeniDosya" type="button">${simge('arti', 15)} Yeni dosya</button>
        </div>
        <div class="dosya-listesi" data-kaydirma="dosya">
            ${c.alt ? html`<button class="dosya-satir" data-eylem="klasoreGit" data-yol="${ust}" type="button"><span class="dosya-ikon">${simge('klasor', 16)}</span><span class="dosya-adi">..</span></button>` : ''}
            ${c.dosyalar.length ? c.dosyalar.map((f) => {
                const durumAdi = degisimler.get(f.yol) || (f.klasor && klasorDegisti(f.yol) ? 'degisti' : '');
                return html`<div class="dosya-satir ${f.klasor ? 'klasor' : ''}" data-eylem="${f.klasor ? 'klasoreGit' : 'dosyaAc'}" data-yol="${f.yol}" role="button" tabindex="0">
                    <span class="dosya-ikon">${simge(f.klasor ? 'klasor' : 'dosya', 16)}</span>
                    <span class="dosya-adi">${f.ad}</span>
                    ${durumAdi ? html`<span class="durum-harf durum-${durumAdi}" title="${DURUM_ETIKETI[durumAdi]?.[1] || ''}">${DURUM_ETIKETI[durumAdi]?.[0] || ''}</span>` : ''}
                    <span class="dosya-boyut">${f.klasor ? '' : boyutYaz(f.boyut)}</span>
                    <span class="dosya-eylemler">
                        ${f.klasor ? '' : html`<button class="ikon-dugme" data-eylem="dosyaDuzenle" data-yol="${f.yol}" type="button" title="Düzenle" aria-label="Düzenle">${simge('kalem', 14)}</button>`}
                        <button class="ikon-dugme tehlike" data-eylem="dosyaSil" data-yol="${f.yol}" type="button" title="Sil" aria-label="Sil">${simge('cop', 14)}</button>
                    </span>
                </div>`;
            }) : html`<div class="bos bos-kucuk"><p>Bu klasör boş.</p></div>`}
        </div>`;
}

function gecmisSekmesi(b) {
    const gonderilmis = b.upstream && !b.upstreamSilindi && b.ileri === 0;
    const geriAlinabilir = !b.birlestirme && !gonderilmis;
    const liste = [...b.gecmis, ...c.ekGecmis];
    const dahaVar = c.gecmisSonu !== true && liste.length >= 40;
    return html`<div class="gecmis-listesi" data-kaydirma="gecmis">
        ${liste.map((k, i) => html`
            <div class="gecmis-satir" data-eylem="commitDetay" data-hash="${k.kisa}" role="button" tabindex="0" title="Ayrıntıları gör">
                <span class="gecmis-cizgi ${i === 0 ? 'ilk' : ''}"></span>
                <div class="gecmis-metin">
                    <strong>${k.mesaj}</strong>
                    <small>${k.yazar} · <span title="${tarihYaz(k.tarih)}">${goreliZaman(k.tarih)}</span></small>
                </div>
                ${i === 0 ? html`<button class="dugme-metin gecmis-geri" data-eylem="sonCommitGeriAl" type="button" ${geriAlinabilir && !c.mesgul ? '' : 'disabled'}
                    title="${gonderilmis ? "Bu commit GitHub'a gönderildiği için geri alınamaz; ayrıntıdan “Tersine çevir”i kullanabilirsin" : b.birlestirme ? 'Birleştirme sürerken geri alınamaz' : 'Commit’i geri al; değişiklikler kaybolmaz'}">${simge('geriAl', 13)} Geri al</button>` : ''}
                <span class="hash">${k.kisa}</span>
                ${simge('sag', 14)}
            </div>`)}
        ${dahaVar ? html`<button class="dugme dugme-sessiz gecmis-daha ${c.mesgul === 'gecmis' ? 'yukleniyor' : ''}" data-eylem="dahaGecmis" type="button">${simge('asagi', 14)} Daha eski commit’leri yükle</button>` : ''}
    </div>`;
}

// ---------- İşlemler ----------

async function commitYap(sonraPush) {
    const alan = c;
    const b = alan.bilgi;
    const mesaj = alan.mesaj.trim();
    if (!mesaj) {
        bildir('Önce bir commit mesajı yaz.', { tur: 'hata' });
        kap.querySelector('#commit-mesaji')?.focus();
        return;
    }
    if (b.degisiklikler.some((d) => d.durum === 'cakisma')) {
        bildir('Önce tüm çakışmaları çöz.', { tur: 'hata' });
        return;
    }
    const secili = b.birlestirme ? b.degisiklikler : b.degisiklikler.filter((d) => !c.disarida.has(d.yol));
    if (!secili.length) return;
    const tumu = b.birlestirme || secili.length === b.degisiklikler.length;
    const yollar = secili.flatMap((d) => (d.eskiYol ? [d.yol, d.eskiYol] : [d.yol]));
    await islem(sonraPush ? 'commitPush' : 'commit', async () => {
        const sonuc = await api.commit(alan.kok, mesaj, yollar, tumu);
        alan.mesaj = '';
        alan.disarida.clear();
        if (!sonraPush) return sonuc;
        await api.push(alan.kok);
        pushSonrasiCi(alan);
        return `${sonuc} GitHub’a gönderildi.`;
    }, alan);
}

async function geriAl(degisiklikler) {
    if (!degisiklikler.length) return;
    const yeniler = degisiklikler.filter((d) => d.durum === 'yeni' || d.durum === 'eklendi').length;
    const tek = degisiklikler.length === 1 ? `“${degisiklikler[0].yol}”` : `${degisiklikler.length} dosya`;
    const uyari = yeniler ? `\n\n${yeniler} yeni dosya son commit'te olmadığı için silinecek.` : '';
    const tamam = await onayla(`${tek} son commit’teki hâline döndürülsün mi?${uyari}\n\nBu işlem geri alınamaz.`, { baslik: 'Değişiklikleri geri al', tamam: 'Geri al', tehlikeli: true });
    if (!tamam) return;
    const yollar = degisiklikler.flatMap((d) => (d.eskiYol ? [d.yol, d.eskiYol] : [d.yol]));
    islem('geriAl', () => api.geriAl(c.kok, yollar));
}

async function sonCommitiGeriAl() {
    const son = c.bilgi.gecmis[0];
    const tamam = await onayla(`Son commit (“${son?.mesaj}”) geri alınsın mı?\n\nDosyalardaki değişiklikler kaybolmaz; commit edilmemiş hâle döner ve mesaj commit kutusuna geri yazılır.`, { baslik: 'Son commit’i geri al', tamam: 'Geri al' });
    if (!tamam) return;
    const alan = c;
    await islem('sonCommit', async () => {
        const mesaj = await api.sonCommitiGeriAl(alan.kok);
        alan.mesaj = mesaj;
        alan.sekme = 'degisiklikler';
        return 'Son commit geri alındı. Değişikliklerin “Değişiklikler” sekmesinde.';
    }, alan);
}

async function dosyaSil(yol) {
    const tamam = await onayla(`“${yol}” kalıcı olarak silinsin mi?`, { baslik: 'Dosyayı sil', tamam: 'Sil', tehlikeli: true });
    if (tamam) islem('sil', () => api.dosyaSil(c.kok, yol));
}

async function editorAc(yol, dizin = c.alt) {
    const alan = c;
    let icerik = '';
    if (yol) {
        try { icerik = await api.dosyaOku(alan.kok, yol); } catch (e) { hataBildir(e); return; }
    }
    let editor = null;
    const yedek = () => {
        const t = govdeKok.querySelector('.editor-yedek');
        return { deger: () => t.value, kirli: () => t.value !== icerik, odaklan: () => t.focus(), yokEt() {}, girinti: 'Sekme' };
    };
    let govdeKok;
    modalAc({
        ust: 'DOSYA EDİTÖRÜ',
        baslik: yol ? klasorAdi(yol) : 'Yeni dosya',
        aciklama: yol || 'Depo içinde göreli bir yol yaz; eksik klasörler otomatik oluşturulur.',
        boyut: 'tam',
        gonderMetni: 'Kaydet',
        govde: html`
            ${yol ? '' : html`<label class="alan">Dosya yolu<input name="yol" value="${dizin ? `${dizin}/` : ''}" placeholder="src/yeni-dosya.js" spellcheck="false" autofocus></label>`}
            <div class="kod-alani" data-kod><div class="fark-bos"><span class="donen"></span></div></div>
            <div class="editor-alt"><span data-konum></span><span data-degisti></span><span data-dil></span><span>Ctrl+S kaydet · Ctrl+F ara · Ctrl+Z geri al</span></div>`,
        kapatilsinMi: () => (!editor?.kirli() ? true : onayla('Kaydedilmemiş değişiklikler var. Kaydetmeden kapatılsın mı?', { baslik: 'Kaydedilmedi', tamam: 'Kaydetmeden kapat', tehlikeli: true })),
        kapaninca: () => editor?.yokEt(),
        async acilinca(kok, kayit) {
            govdeKok = kok;
            const kap_ = kok.querySelector('[data-kod]');
            const konum = kok.querySelector('[data-konum]');
            const degisti = kok.querySelector('[data-degisti]');
            const dilEl = kok.querySelector('[data-dil]');
            const yolGirdisi = kok.querySelector('[name="yol"]');
            const durumYaz = ({ kirli, satir, sutun, toplam }) => {
                konum.textContent = `Satır ${satir}, Sütun ${sutun} · ${toplam} satır`;
                degisti.textContent = kirli ? '● Kaydedilmedi' : '';
            };
            try {
                const { editorOlustur, dilAdi } = await import('../lib/kodEditoru.js');
                kap_.innerHTML = '';
                editor = editorOlustur(kap_, { icerik, yol: yol || yolGirdisi?.value || '', kaydet: () => kayit.gonder(), degisince: durumYaz });
                const dilGuncelle = () => {
                    const hedef = yol || yolGirdisi?.value || '';
                    editor.dilDegistir(hedef);
                    dilEl.textContent = `${dilAdi(hedef)} · ${editor.girinti}`;
                };
                dilGuncelle();
                yolGirdisi?.addEventListener('input', dilGuncelle);
            } catch {
                kap_.innerHTML = '<textarea class="editor editor-yedek" spellcheck="false"></textarea>';
                kap_.querySelector('textarea').value = icerik;
                editor = yedek();
                dilEl.textContent = 'Düz metin';
            }
            kok.addEventListener('keydown', (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && !e.defaultPrevented) { e.preventDefault(); kayit.gonder(); }
            });
            if (yol) editor.odaklan();
        },
        async gonder(kok) {
            const hedef = yol || kok.querySelector('[name="yol"]').value.trim();
            if (!hedef || hedef.endsWith('/')) throw new Error('Dosya adını da içeren bir yol gir.');
            if (!editor) throw new Error('Editör henüz hazır değil.');
            const sonuc = await api.dosyaKaydet(alan.kok, hedef, editor.deger(), !yol);
            bildir(sonuc, { tur: 'basari' });
            await yenile(alan);
        },
    });
}

// ---------- Harici uygulamalar & sağ tık menüleri ----------

function hariciAc(alan, yol, tur) {
    const komut = tur === 'editor' ? ayarlar.al('editorKomutu') : ayarlar.al('terminalKomutu');
    api.hariciAc(alan.kok, yol, tur, komut || '').catch(hataBildir);
}

const tamYol = (alan, yol) => (yol ? `${alan.bilgi.kok}/${yol}` : alan.bilgi.kok);

async function yoluKopyala(alan, yol) {
    try {
        await panoyaKopyala(tamYol(alan, yol));
        bildir('Yol panoya kopyalandı.', { tur: 'basari', sure: 2000 });
    } catch (e) { hataBildir(e); }
}

function tasiModali(yol, klasor) {
    const alan = c;
    modalAc({
        ust: klasor ? 'KLASÖR' : 'DOSYA',
        baslik: 'Yeniden adlandır / taşı',
        aciklama: 'Yeni yolu yaz. Başka bir klasöre taşımak için klasör adını da ekle (ör. src/yeni-ad.js).',
        gonderMetni: 'Uygula',
        govde: html`<label class="alan">Yeni yol<input name="yeni" value="${yol}" spellcheck="false" autocomplete="off" autofocus></label>`,
        acilinca(kok) {
            const girdi = kok.querySelector('[name="yeni"]');
            const bas = yol.lastIndexOf('/') + 1;
            const nokta = klasor ? -1 : yol.lastIndexOf('.');
            girdi.setSelectionRange(bas, nokta > bas ? nokta : yol.length);
        },
        async gonder(kok) {
            const yeni = kok.querySelector('[name="yeni"]').value.trim();
            if (!yeni || yeni === yol) throw new Error('Farklı bir yol gir.');
            bildir(await api.dosyaTasi(alan.kok, yol, yeni), { tur: 'basari' });
            await yenile(alan);
        },
    });
}

async function klasoreGit(yol) {
    const alan = c;
    const onceki = alan.alt;
    alan.alt = yol;
    try {
        alan.dosyalar = await api.dosyalar(alan.kok, alan.alt);
        panelCiz();
    } catch (e) {
        alan.alt = onceki;
        hataBildir(e);
    }
}

function klasorOgeleri(alan, yol) {
    return [
        { etiket: 'Terminalde aç', simge: 'terminal', fn: () => hariciAc(alan, yol, 'terminal') },
        { etiket: 'Editörde aç', simge: 'kod', fn: () => hariciAc(alan, yol, 'editor') },
        { etiket: 'Dosya yöneticisinde göster', simge: 'dis', fn: () => revealItemInDir(tamYol(alan, yol)).catch(hataBildir) },
        { etiket: 'Yolu kopyala', simge: 'kopya', fn: () => yoluKopyala(alan, yol) },
    ];
}

function dosyaMenusu(e, yol, klasor) {
    const alan = c;
    const degisim = alan.bilgi.degisiklikler.find((d) => d.yol.replace(/\/$/, '') === yol);
    menuAc(e, [
        klasor
            ? { etiket: 'Klasörü aç', simge: 'klasor', fn: () => klasoreGit(yol) }
            : { etiket: 'Düzenle', simge: 'kalem', fn: () => editorAc(yol) },
        klasor && { etiket: 'Burada yeni dosya', simge: 'arti', fn: () => editorAc('', yol) },
        !klasor && { etiket: 'Editörde aç', simge: 'kod', fn: () => hariciAc(alan, yol, 'editor') },
        '-',
        { etiket: 'Yeniden adlandır / taşı', simge: 'kalem', fn: () => tasiModali(yol, klasor) },
        { etiket: 'Terminalde aç', simge: 'terminal', fn: () => hariciAc(alan, yol, 'terminal') },
        { etiket: 'Dosya yöneticisinde göster', simge: 'dis', fn: () => revealItemInDir(tamYol(alan, yol)).catch(hataBildir) },
        { etiket: 'Yolu kopyala', simge: 'kopya', fn: () => yoluKopyala(alan, yol) },
        degisim && !alan.bilgi.birlestirme && '-',
        degisim && !alan.bilgi.birlestirme && { etiket: 'Değişikliği geri al', simge: 'geriAl', tehlikeli: true, fn: () => geriAl([degisim]) },
        '-',
        { etiket: klasor ? 'Sil (yalnızca boşsa)' : 'Sil', simge: 'cop', tehlikeli: true, fn: () => dosyaSil(yol) },
    ]);
}

function degisimMenusu(e, d) {
    const alan = c;
    const b = alan.bilgi;
    const yol = d.yol.replace(/\/$/, '');
    const dahil = !alan.disarida.has(d.yol);
    menuAc(e, [
        d.durum === 'cakisma'
            ? { etiket: 'Çakışmayı çöz', simge: 'birlestir', fn: () => cakismaModali(baglam, d.yol) }
            : { etiket: 'Farkı göster', simge: 'degisim', fn: () => farkYukle(d.yol, d.durum) },
        d.durum !== 'silindi' && !d.yol.endsWith('/') && { etiket: 'Düzenle', simge: 'kalem', fn: () => editorAc(yol) },
        d.durum !== 'silindi' && { etiket: 'Editörde aç', simge: 'kod', fn: () => hariciAc(alan, yol, 'editor') },
        !b.birlestirme && {
            etiket: dahil ? 'Commit’ten çıkar' : 'Commit’e dahil et',
            simge: dahil ? 'carpi' : 'tik',
            fn: () => { if (dahil) alan.disarida.add(d.yol); else alan.disarida.delete(d.yol); panelCiz(); },
        },
        '-',
        d.durum !== 'silindi' && { etiket: 'Dosya yöneticisinde göster', simge: 'dis', fn: () => revealItemInDir(tamYol(alan, yol)).catch(hataBildir) },
        { etiket: 'Yolu kopyala', simge: 'kopya', fn: () => yoluKopyala(alan, yol) },
        !b.birlestirme && '-',
        !b.birlestirme && { etiket: 'Değişikliği geri al', simge: 'geriAl', tehlikeli: true, fn: () => geriAl([d]) },
    ]);
}

function sekmeMenusu(e, alan) {
    const sira = alanlar.indexOf(alan);
    const hazir = Boolean(alan.bilgi);
    menuAc(e, [
        { etiket: 'Sekmeyi kapat', simge: 'carpi', fn: () => alanKapat(alan) },
        alanlar.length > 1 && { etiket: 'Diğer sekmeleri kapat', simge: 'carpi', fn: () => alanlar.filter((a) => a !== alan).forEach(alanKapat) },
        sira < alanlar.length - 1 && { etiket: 'Sağdakileri kapat', simge: 'carpi', fn: () => alanlar.slice(sira + 1).forEach(alanKapat) },
        hazir && '-',
        ...(hazir ? klasorOgeleri(alan, '') : []),
    ]);
}

async function baglantiyiKaldir() {
    const tamam = await onayla(
        `Klasörün “${repoYolu(c.bilgi.origin)}” ile bağlantısı kaldırılsın mı?\n\nGitHub’daki repo silinmez; yalnızca bu klasörün origin ayarı kaldırılır.`,
        { baslik: 'Bağlantıyı kaldır', tamam: 'Kaldır', tehlikeli: true },
    );
    if (tamam) islem('baglanti', () => api.baglantiKaldir(c.kok));
}

function baglaModali() {
    const mevcut = repoAnahtari(c.bilgi.origin);
    const oneri = repoAdiOner(c.bilgi.ad).toLowerCase();
    const puan = (r) => (repoAnahtari(r.url) === mevcut ? 2 : 0) + (r.name.toLowerCase() === oneri ? 1 : 0);
    const repolar = [...durum.repolar].sort((a, b) => puan(b) - puan(a) || new Date(b.pushedAt || 0) - new Date(a.pushedAt || 0));
    const seciliUrl = repolar.find((r) => (mevcut ? repoAnahtari(r.url) === mevcut : r.name.toLowerCase() === oneri))?.url;
    const etiket = (r) => (repoAnahtari(r.url) === mevcut ? 'şu an bağlı' : r.name.toLowerCase() === oneri ? 'klasör adıyla eşleşiyor' : '');
    modalAc({
        ust: 'GITHUB BAĞLANTISI',
        baslik: mevcut ? 'Bağlı repoyu değiştir' : 'Mevcut repoya bağla',
        aciklama: mevcut
            ? `Bu klasör şu an “${repoYolu(c.bilgi.origin)}” reposuna bağlı. Başka bir repo seçersen push/pull o repoya yapılır. Dosyaların değişmez.`
            : 'Klasörün “origin” bağlantısı seçtiğin repoya ayarlanır. Dosyaların değiştirilmez.',
        gonderMetni: mevcut ? 'Bağlantıyı değiştir' : 'Bağla',
        govde: html`
            ${repolar.length ? html`
                <label class="arama arama-kucuk">${simge('ara', 14)}<input data-repo-ara placeholder="Repo ara…" autocomplete="off" autofocus></label>
                <div class="repo-secim-listesi">
                    ${repolar.map((r) => html`
                        <label class="repo-secim" data-ad="${r.name.toLowerCase()}">
                            <input type="radio" name="repo" value="${r.url}" ${r.url === seciliUrl ? 'checked' : ''}>
                            <span class="repo-secim-ad">${r.name}${etiket(r) ? html` <em>${etiket(r)}</em>` : ''}</span>
                            <small>${r.visibility.toLowerCase()} · ${goreliZaman(r.pushedAt)}</small>
                        </label>`)}
                </div>` : html`<p class="ipucu">Repo listesi boş. GitHub’a giriş yaptıysan adresi aşağıya elle yazabilirsin.</p>`}
            <details class="elle" ${repolar.length ? '' : 'open'}>
                <summary>Adresi elle gir</summary>
                <input name="elle" placeholder="https://github.com/kullanici/repo" spellcheck="false">
            </details>
            ${mevcut ? html`<div class="baglanti-kaldir">
                <span>Bu klasörü hiçbir repoya bağlı tutmak istemiyor musun?</span>
                <button class="dugme-metin tehlike-metin" data-kaldir type="button">${simge('carpi', 13)} Bağlantıyı kaldır</button>
            </div>` : ''}`,
        acilinca(kok, kayit) {
            kok.querySelector('[data-repo-ara]')?.addEventListener('input', (e) => {
                const q = e.target.value.trim().toLowerCase();
                kok.querySelectorAll('.repo-secim').forEach((el) => { el.hidden = q && !el.dataset.ad.includes(q); });
            });
            kok.querySelector('[data-kaldir]')?.addEventListener('click', () => {
                kayit.kapat();
                baglantiyiKaldir();
            });
        },
        async gonder(kok) {
            const url = kok.querySelector('[name="elle"]').value.trim() || kok.querySelector('[name="repo"]:checked')?.value;
            if (!url) throw new Error('Bağlanacak bir repo seç.');
            if (mevcut && repoAnahtari(url) === mevcut) return;
            const sonuc = await api.bagla(c.kok, url);
            await yenile();
            bildir(sonuc, { tur: 'basari', eylem: { metin: 'Şimdi Pull yap', fn: () => islem('pull', () => api.pull(c.kok)) } });
        },
    });
}

async function yayinlaModali() {
    const b = c.bilgi;
    let kokDosyalar = c.dosyalar;
    let mevcutIgnore = '';
    try {
        if (c.alt) kokDosyalar = await api.dosyalar(c.kok, '');
        if (kokDosyalar.some((f) => f.ad === '.gitignore')) mevcutIgnore = await api.dosyaOku(c.kok, '.gitignore');
    } catch { /* öneriler olmadan devam */ }
    const adlar = new Set(kokDosyalar.map((f) => f.ad));
    const zatenVar = new Set(mevcutIgnore.split('\n').map((s) => s.trim().replace(/^\/|\/$/g, '')));
    const oneriler = ONERILEN_HARICLER.filter((a) => adlar.has(a) && !zatenVar.has(a));
    const commitGerekli = !b.gitMi || !b.commitVar || b.degisiklikler.length > 0;

    modalAc({
        ust: 'GITHUB’A YAYINLA',
        baslik: 'Klasörü GitHub’a yükle',
        aciklama: 'GitHub’da yeni bir repo oluşturulur; dosyaların commit edilip gönderilir.',
        gonderMetni: 'Yayınla',
        govde: html`
            <label class="alan">Repo adı
                <input name="ad" value="${repoAdiOner(b.ad)}" spellcheck="false" autocomplete="off" autofocus>
            </label>
            <label class="alan">Açıklama <span class="istege-bagli">isteğe bağlı</span>
                <input name="aciklama" placeholder="Bu proje ne yapıyor?">
            </label>
            ${gorunurlukSecici('private')}
            ${oneriler.length ? html`
                <fieldset class="alan">
                    <legend>GitHub dışında tutulacaklar <span class="istege-bagli">.gitignore’a eklenir</span></legend>
                    <div class="cip-grubu">
                        ${oneriler.map((a) => html`<label class="cip-secim"><input type="checkbox" name="haric" value="${a}" ${a === '.vscode' || a === '.idea' ? '' : 'checked'}> ${a}</label>`)}
                    </div>
                </fieldset>` : ''}
            <label class="alan">Ek hariç tutulacak yollar <span class="istege-bagli">her satıra bir yol</span>
                <textarea name="haricler" rows="2" placeholder="gizli-notlar.txt"></textarea>
            </label>
            ${commitGerekli ? html`<label class="alan">Commit mesajı<input name="mesaj" value="İlk commit"></label>` : ''}`,
        async gonder(kok) {
            const ad = kok.querySelector('[name="ad"]').value.trim();
            if (!repoAdiGecerli(ad)) throw new Error('Repo adı yalnızca İngilizce harf, rakam, “-”, “_” ve “.” içerebilir.');
            const haricler = [
                ...[...kok.querySelectorAll('[name="haric"]:checked')].map((el) => el.value),
                ...kok.querySelector('[name="haricler"]').value.split('\n').map((s) => s.trim()).filter(Boolean),
            ];
            const sonuc = await api.yayinla({
                kok: c.kok,
                ad,
                gorunurluk: kok.querySelector('[name="gorunurluk"]:checked').value,
                aciklama: kok.querySelector('[name="aciklama"]').value,
                haricler,
                mesaj: kok.querySelector('[name="mesaj"]')?.value || '',
            });
            await yenile();
            const web = webAdresi(c.bilgi?.origin);
            bildir(sonuc, { tur: 'basari', eylem: web ? { metin: "GitHub'da aç", fn: () => openUrl(web) } : null });
            repolariYukle();
        },
    });
}
