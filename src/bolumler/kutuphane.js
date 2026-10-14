import { open } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import { api } from '../lib/api.js';
import { bildir, hataBildir, menuAc, modalAc, onayla } from '../lib/bilesen.js';
import { ciz, depola, eylemler, goreliZaman, html, panoyaKopyala, repoAdiGecerli, repoAnahtari, tarihYaz } from '../lib/dom.js';
import { dilRengi, simge } from '../lib/simge.js';
import { durum, dinle, yayinla, yerelEslesme } from '../durum.js';
import { calismaAlani } from './calisma.js';
import { isteklerModali } from './istekler.js';
import { ciModali, ciRozeti } from './ci.js';
import { surumlerModali } from './surumler.js';
import { cihazAkisi } from './hesap.js';

const FILTRELER = [
    ['hepsi', 'Tümü', () => true],
    ['public', 'Public', (r) => gorunurluk(r) === 'public'],
    ['private', 'Private', (r) => gorunurluk(r) !== 'public'],
    ['fork', 'Fork', (r) => r.isFork],
    ['arsiv', 'Arşiv', (r) => r.isArchived],
];

const SIRALAMALAR = {
    son: (a, b) => new Date(b.pushedAt || 0) - new Date(a.pushedAt || 0),
    ad: (a, b) => a.name.localeCompare(b.name, 'tr'),
    yildiz: (a, b) => b.stargazerCount - a.stargazerCount || SIRALAMALAR.son(a, b),
};

const gorunurluk = (repo) => repo.visibility.toLowerCase();

function filtrelenmis() {
    const kosul = FILTRELER.find(([ad]) => ad === durum.filtre)?.[2] || (() => true);
    const sorgu = durum.arama.trim().toLocaleLowerCase('tr');
    return durum.repolar
        .filter(kosul)
        .filter((r) => !sorgu || `${r.name} ${r.description || ''} ${r.primaryLanguage?.name || ''}`.toLocaleLowerCase('tr').includes(sorgu))
        .sort(SIRALAMALAR[durum.siralama] || SIRALAMALAR.son);
}

export async function repolariYukle() {
    durum.repolarYukleniyor = true;
    durum.repoHatasi = '';
    yayinla('repolar');
    try {
        durum.repolar = await api.repolar();
    } catch (e) {
        durum.repoHatasi = e.message;
    } finally {
        durum.repolarYukleniyor = false;
        yayinla('repolar');
    }
    ciOzetleriniYukle();
}

/** CI rozetleri ayrı ve sessizce yüklenir; başarısız olursa kartlar rozetsiz kalır. */
export async function ciOzetleriniYukle() {
    try {
        durum.ciDurumlari = await api.ciOzetleri();
        yayinla('repolar');
    } catch { /* rozetsiz devam */ }
}

// ---------- Çizim ----------

export function kutuphaneKur(kap) {
    ciz(kap, html`
        <section class="arac-cubugu">
            <label class="arama">
                ${simge('ara', 15)}
                <input id="arama" type="search" placeholder="Depo, açıklama veya dil ara…" autocomplete="off" spellcheck="false">
                <kbd>/</kbd>
            </label>
            <div class="filtreler" id="filtreler" role="tablist"></div>
            <select id="siralama" aria-label="Sıralama">
                <option value="son">Son güncellenen</option>
                <option value="ad">İsme göre</option>
                <option value="yildiz">Yıldıza göre</option>
            </select>
        </section>
        <section class="repo-izgara" id="repo-izgara" aria-live="polite"></section>`);

    const arama = kap.querySelector('#arama');
    const siralama = kap.querySelector('#siralama');
    siralama.value = durum.siralama;
    arama.addEventListener('input', () => { durum.arama = arama.value; izgaraCiz(); });
    siralama.addEventListener('change', () => {
        durum.siralama = siralama.value;
        depola.yaz('siralama', durum.siralama);
        izgaraCiz();
    });

    eylemler(kap.querySelector('#filtreler'), 'click', {
        filtre(el) {
            durum.filtre = el.dataset.filtre;
            depola.yaz('filtre', durum.filtre);
            filtreleriCiz();
            izgaraCiz();
        },
    });

    eylemler(kap.querySelector('#repo-izgara'), 'click', {
        klonla: (el) => klonModali(repoBul(el)),
        duzenle: (el) => duzenleModali(repoBul(el)),
        ac: (el) => openUrl(repoBul(el).url),
        kopyala: async (el) => {
            try {
                await panoyaKopyala(`${repoBul(el).url}.git`);
                bildir('Klon adresi panoya kopyalandı.', { tur: 'basari' });
            } catch (e) { hataBildir(e); }
        },
        yerelAc: (el) => calismaAlani.ac(el.dataset.yol),
        kartMenu: (el, e) => kartMenusu(e, repoBul(el)),
        ci: (el) => {
            const repo = repoBul(el);
            ciModali({ url: repo.url, ad: repo.nameWithOwner });
        },
        istekler: (el) => {
            const repo = repoBul(el);
            const yerel = repoAnahtari(calismaAlani.origin()) === repoAnahtari(repo.url) ? calismaAlani.baglam() : null;
            isteklerModali({ url: repo.url, ad: repo.nameWithOwner }, yerel);
        },
        tekrar: () => repolariYukle(),
        temizle: () => {
            durum.arama = '';
            arama.value = '';
            durum.filtre = 'hepsi';
            filtreleriCiz();
            izgaraCiz();
        },
    });

    kap.querySelector('#repo-izgara').addEventListener('contextmenu', (e) => {
        const kart = e.target.closest('.repo-kart[data-url]');
        if (!kart) return;
        e.preventDefault();
        kartMenusu(e, durum.repolar.find((r) => r.url === kart.dataset.url));
    });

    const tumunuCiz = () => { filtreleriCiz(); izgaraCiz(); };
    dinle('repolar', tumunuCiz);
    dinle('hesap', izgaraCiz);
    dinle('calisma-origin', izgaraCiz);
    tumunuCiz();
}

/** Repo kartındaki “⋯” ve sağ tık menüsü. */
function kartMenusu(e, repo) {
    if (!repo) return;
    const anahtar = repoAnahtari(repo.url);
    const yerel = repoAnahtari(calismaAlani.origin()) === anahtar ? calismaAlani.baglam() : null;
    const yerelYol = yerelEslesme.al(anahtar);
    const ozet = { url: repo.url, ad: repo.nameWithOwner };
    const konum = e.type === 'contextmenu' ? e : (() => { const k = e.target.closest('button').getBoundingClientRect(); return { x: k.left, y: k.bottom + 4 }; })();
    menuAc(konum, [
        yerelYol ? { etiket: 'Yerelde aç', simge: 'klasor', fn: () => calismaAlani.ac(yerelYol) } : { etiket: 'Klonla', simge: 'indir', fn: () => klonModali(repo) },
        { etiket: 'Pull Request ve Issue’lar', simge: 'pr', fn: () => isteklerModali(ozet, yerel) },
        { etiket: 'Sürümler (release / etiket)', simge: 'etiket', fn: () => surumlerModali(ozet, yerel) },
        { etiket: 'GitHub Actions', simge: 'oynat', fn: () => ciModali(ozet) },
        '-',
        { etiket: 'Ayarları düzenle', simge: 'kalem', fn: () => duzenleModali(repo) },
        { etiket: 'Klon adresini kopyala', simge: 'kopya', fn: async () => { try { await panoyaKopyala(`${repo.url}.git`); bildir('Klon adresi panoya kopyalandı.', { tur: 'basari', sure: 2000 }); } catch (h) { hataBildir(h); } } },
        { etiket: 'GitHub’da aç', simge: 'dis', fn: () => openUrl(repo.url) },
        '-',
        repo.isArchived
            ? { etiket: 'Arşivden çıkar', simge: 'arsiv', fn: () => arsivle(repo, false) }
            : { etiket: 'Arşivle (salt okunur yap)', simge: 'arsiv', fn: () => arsivle(repo, true) },
        { etiket: 'Repoyu sil…', simge: 'cop', tehlikeli: true, fn: () => repoSilModali(repo) },
    ]);
}

async function arsivle(repo, arsivleMi) {
    const metin = arsivleMi
        ? `“${repo.nameWithOwner}” arşivlensin mi?\n\nRepo silinmez; salt okunur olur (push, issue ve PR kapanır). İstediğin zaman arşivden çıkarabilirsin.`
        : `“${repo.nameWithOwner}” arşivden çıkarılsın mı? Yeniden push ve issue açılabilir olur.`;
    if (!(await onayla(metin, { baslik: arsivleMi ? 'Repoyu arşivle' : 'Arşivden çıkar', tamam: arsivleMi ? 'Arşivle' : 'Arşivden çıkar' }))) return;
    try {
        bildir(await api.repoArsivle(repo.url, arsivleMi), { tur: 'basari' });
        repolariYukle();
    } catch (e) { hataBildir(e); }
}

const IZIN_GEREKLI = 'IZIN_GEREKLI:';

function repoSilModali(repo) {
    const tamAd = repo.nameWithOwner;
    const yerelBagli = calismaAlani.originler().has(repoAnahtari(repo.url));
    modalAc({
        ust: 'GERİ ALINAMAZ İŞLEM',
        baslik: 'Repoyu kalıcı olarak sil',
        aciklama: tamAd,
        gonderMetni: 'Kalıcı olarak sil',
        tehlikeli: true,
        govde: html`
            <div class="silme-uyari">
                ${simge('uyari', 18)}
                <div>
                    <strong>Bu işlem geri alınamaz.</strong>
                    <ul>
                        <li>Tüm kod, commit geçmişi, dallar ve etiketler GitHub’dan silinir.</li>
                        <li>Issue’lar, Pull Request’ler, release’ler, wiki ve Actions geçmişi kaybolur.</li>
                        <li>Yıldızlar, izleyiciler ve fork bağlantıları kopar.</li>
                        ${yerelBagli ? html`<li>Bilgisayarındaki klasörün <em>dosyaları silinmez</em>, ama artık var olmayan bir repoya bağlı kalır.</li>` : ''}
                    </ul>
                </div>
            </div>
            ${repo.isArchived ? '' : html`<div class="bilgi-kutusu">
                ${simge('arsiv', 18)}
                <div><strong>Bunun yerine arşivlemek ister misin?</strong><p>Arşivlenen repo silinmez, salt okunur olur ve istediğin zaman geri açılabilir.</p></div>
                <button class="dugme dugme-sessiz" data-arsivle type="button">Arşivle</button>
            </div>`}
            <label class="alan">Onaylamak için <code>${tamAd}</code> yaz
                <input name="onay" autocomplete="off" spellcheck="false" placeholder="${tamAd}" autofocus>
            </label>
            <div data-izin hidden class="bilgi-kutusu bilgi-vurgulu">
                ${simge('kilit', 18)}
                <div><strong>Silme izni gerekiyor</strong><p>Güvenlik için GitHub CLI’ın repo silme izni (delete_repo) varsayılan olarak kapalıdır. Bir kez tarayıcıdan onaylaman yeterli.</p></div>
                <button class="dugme" data-izin-ver type="button">${simge('kilit', 14)} İzin ver</button>
            </div>`,
        acilinca(kok, kayit) {
            const girdi = kok.querySelector('[name="onay"]');
            const gonder = kok.querySelector('.modal-gonder');
            const denetle = () => { gonder.disabled = girdi.value.trim() !== tamAd; };
            girdi.addEventListener('input', denetle);
            denetle();
            kok.querySelector('[data-arsivle]')?.addEventListener('click', () => { kayit.kapat(true); arsivle(repo, true); });
            kok.querySelector('[data-izin-ver]').addEventListener('click', () => {
                cihazAkisi({
                    ust: 'GITHUB İZNİ',
                    baslik: 'Repo silme iznini ver',
                    aciklama: 'Tarayıcıda açılan sayfaya kodu gir ve “delete_repo” iznini onayla. Sonra silme penceresine dönüp tekrar dene.',
                    baslat: () => api.izinEkle('delete_repo'),
                    basarili() {
                        kok.querySelector('[data-izin]').hidden = true;
                        kayit.hata('');
                        bildir('Silme izni verildi. Şimdi silmeyi onaylayabilirsin.', { tur: 'basari' });
                    },
                });
            });
        },
        async gonder(kok) {
            const onay = kok.querySelector('[name="onay"]').value.trim();
            if (onay !== tamAd) throw new Error(`Onay için tam olarak “${tamAd}” yazmalısın.`);
            try {
                await api.repoSil(repo.url, onay);
            } catch (e) {
                if (e.message.startsWith(IZIN_GEREKLI)) {
                    kok.querySelector('[data-izin]').hidden = false;
                    throw new Error(e.message.slice(IZIN_GEREKLI.length));
                }
                throw e;
            }
            durum.repolar = durum.repolar.filter((r) => r.url !== repo.url);
            yayinla('repolar');
            bildir(`“${tamAd}” GitHub’dan silindi.`, { tur: 'basari' });
            repolariYukle();
        },
    });
}

function repoBul(el) {
    return durum.repolar.find((r) => r.url === el.closest('[data-url]').dataset.url);
}

function filtreleriCiz() {
    const kap = document.getElementById('filtreler');
    if (!kap) return;
    ciz(kap, FILTRELER.map(([ad, etiket, kosul]) => {
        const sayi = durum.repolar.filter(kosul).length;
        if (ad !== 'hepsi' && ad !== durum.filtre && sayi === 0 && (ad === 'fork' || ad === 'arsiv')) return '';
        return html`<button class="filtre ${durum.filtre === ad ? 'aktif' : ''}" data-eylem="filtre" data-filtre="${ad}" type="button" role="tab" aria-selected="${durum.filtre === ad}">
            ${etiket}<span>${sayi}</span></button>`;
    }));
}

function izgaraCiz() {
    const kap = document.getElementById('repo-izgara');
    if (!kap) return;
    if ((durum.repolarYukleniyor || durum.hesap === undefined) && !durum.repolar.length) {
        ciz(kap, Array.from({ length: 6 }, () => html`<div class="repo-kart iskelet"><span></span><span></span><span></span></div>`));
        return;
    }
    if (durum.repoHatasi) {
        ciz(kap, html`<div class="bos durum-hata">
            <span class="bos-ikon">${simge('uyari', 22)}</span>
            <h2>Depolar getirilemedi</h2><p>${durum.repoHatasi}</p>
            <button class="dugme" data-eylem="tekrar" type="button">${simge('yenile', 15)} Tekrar dene</button></div>`);
        return;
    }
    const liste = filtrelenmis();
    if (!liste.length) {
        const hicYok = !durum.repolar.length;
        ciz(kap, html`<div class="bos">
            <span class="bos-ikon">${simge(hicYok ? 'klasor' : 'ara', 22)}</span>
            <h2>${hicYok ? 'Henüz hiç deponuz yok' : 'Sonuç bulunamadı'}</h2>
            <p>${hicYok ? 'Yukarıdaki “Yeni repo” ile ilk deponu oluştur.' : 'Arama veya filtreleri değiştirip tekrar dene.'}</p>
            ${hicYok ? '' : html`<button class="dugme dugme-sessiz" data-eylem="temizle" type="button">Filtreleri temizle</button>`}</div>`);
        return;
    }
    const acikAnahtarlar = calismaAlani.originler();
    const eslesmeler = yerelEslesme.hepsi();
    ciz(kap, liste.map((repo) => repoKarti(repo, acikAnahtarlar, eslesmeler)));
}

function repoKarti(repo, acikAnahtarlar, eslesmeler) {
    const anahtar = repoAnahtari(repo.url);
    const acik = Boolean(anahtar) && acikAnahtarlar.has(anahtar);
    const yerelYol = eslesmeler[anahtar];
    const gor = gorunurluk(repo);
    const dil = repo.primaryLanguage?.name;
    return html`
        <article class="repo-kart ${acik ? 'acik' : ''} ${repo.isArchived ? 'arsivli' : ''}" data-url="${repo.url}">
            <div class="kart-ust">
                <span class="repo-harf" style="--renk:${dilRengi(dil)}">${repo.name.slice(0, 1).toUpperCase()}</span>
                <div class="rozetler">
                    ${acik ? html`<span class="rozet rozet-acik">${simge('klasor', 11)} Açık</span>` : ''}
                    ${repo.isFork ? html`<span class="rozet">${simge('catal', 11)} Fork</span>` : ''}
                    ${repo.isArchived ? html`<span class="rozet">${simge('arsiv', 11)} Arşiv</span>` : ''}
                    ${ciRozeti(durum.ciDurumlari[anahtar])}
                    <span class="rozet rozet-${gor === 'public' ? 'public' : 'private'}">${simge(gor === 'public' ? 'dunya' : 'kilit', 11)} ${gor}</span>
                </div>
            </div>
            <h3 title="${repo.nameWithOwner}">${repo.name}</h3>
            <p class="aciklama">${repo.description || 'Açıklama eklenmemiş.'}</p>
            <div class="kart-meta">
                ${dil ? html`<span><i class="dil-nokta" style="background:${dilRengi(dil)}"></i>${dil}</span>` : ''}
                ${repo.stargazerCount ? html`<span>${simge('yildiz', 12)} ${repo.stargazerCount}</span>` : ''}
                <span title="${tarihYaz(repo.pushedAt)}">${goreliZaman(repo.pushedAt)}</span>
            </div>
            <div class="kart-alt">
                ${yerelYol
                    ? html`<button class="dugme-metin" data-eylem="yerelAc" data-yol="${yerelYol}" type="button" title="${yerelYol}">${simge('klasor', 14)} ${acik ? 'Sekmesine geç' : 'Yerelde aç'}</button>`
                    : html`<button class="dugme-metin" data-eylem="klonla" type="button">${simge('indir', 14)} Klonla</button>`}
                <div class="kart-eylemler">
                    <button class="ikon-dugme" data-eylem="istekler" type="button" title="Pull Request ve Issue'lar" aria-label="Pull Request ve Issue'lar">${simge('pr', 15)}</button>
                    <button class="ikon-dugme" data-eylem="kartMenu" type="button" title="Diğer işlemler" aria-label="Diğer işlemler">${simge('menu', 15)}</button>
                    <button class="ikon-dugme" data-eylem="duzenle" type="button" title="Ayarları düzenle" aria-label="Ayarları düzenle">${simge('kalem', 15)}</button>
                    <button class="ikon-dugme" data-eylem="ac" type="button" title="GitHub'da aç" aria-label="GitHub'da aç">${simge('dis', 15)}</button>
                </div>
            </div>
        </article>`;
}

export function istatistikCiz(kap) {
    const ciz_ = () => {
        const r = durum.repolar;
        const pub = r.filter((x) => gorunurluk(x) === 'public').length;
        const yildiz = r.reduce((t, x) => t + (x.stargazerCount || 0), 0);
        const sonHafta = r.filter((x) => x.pushedAt && Date.now() - new Date(x.pushedAt) < 7 * 864e5).length;
        const kutular = [
            ['mavi', r.length, 'Toplam depo'],
            ['yesil', pub, 'Public'],
            ['amber', r.length - pub, 'Private'],
            ['mor', sonHafta, 'Bu hafta güncellenen'],
            ['pembe', yildiz, 'Toplam yıldız'],
        ];
        ciz(kap, kutular.map(([renk, sayi, etiket]) => html`
            <div class="istatistik ${(durum.repolarYukleniyor || durum.hesap === undefined) && !r.length ? 'iskelet' : ''}">
                <span class="nokta nokta-${renk}"></span>
                <div><strong>${sayi}</strong><span>${etiket}</span></div>
            </div>`));
    };
    dinle('repolar', ciz_);
    dinle('hesap', ciz_);
    ciz_();
}

// ---------- Modallar ----------

export function yeniRepoModali() {
    modalAc({
        ust: 'YENİ PROJE',
        baslik: 'Yeni repo oluştur',
        aciklama: 'GitHub hesabında yeni bir uzak depo başlat.',
        gonderMetni: 'Repo oluştur',
        govde: html`
            <label class="alan">Repo adı
                <input name="ad" placeholder="ornek-proje" autocomplete="off" spellcheck="false" autofocus>
                <small class="ipucu" data-ipucu>Harf, rakam, “-”, “_” ve “.” kullanılabilir.</small>
            </label>
            <label class="alan">Açıklama <span class="istege-bagli">isteğe bağlı</span>
                <textarea name="aciklama" rows="2" placeholder="Bu proje ne yapıyor?"></textarea>
            </label>
            ${gorunurlukSecici('private')}
            <div class="alan-satiri">
                <label class="alan">.gitignore şablonu
                    <select name="gitignore">
                        <option value="">Yok</option>
                        ${['Node', 'Python', 'Rust', 'Go', 'Java', 'Kotlin', 'Swift', 'C++', 'Dart', 'Unity', 'VisualStudio'].map((s) => html`<option>${s}</option>`)}
                    </select>
                </label>
                <label class="alan">Lisans
                    <select name="lisans">
                        <option value="">Yok</option>
                        <option value="mit">MIT</option>
                        <option value="apache-2.0">Apache 2.0</option>
                        <option value="gpl-3.0">GPL v3</option>
                        <option value="bsd-3-clause">BSD 3-Clause</option>
                        <option value="unlicense">Unlicense</option>
                    </select>
                </label>
            </div>
            <label class="onay-kutusu"><input type="checkbox" name="readme" checked> README dosyası ekle</label>`,
        acilinca(kok) {
            const ad = kok.querySelector('[name="ad"]');
            const ipucu = kok.querySelector('[data-ipucu]');
            ad.addEventListener('input', () => {
                const gecerli = !ad.value || repoAdiGecerli(ad.value.trim());
                ipucu.classList.toggle('hatali', !gecerli);
                ipucu.textContent = gecerli ? 'Harf, rakam, “-”, “_” ve “.” kullanılabilir.' : 'Bu ad geçersiz: Türkçe karakter, boşluk ve “/” kullanılamaz.';
            });
        },
        async gonder(kok) {
            const al = (ad) => kok.querySelector(`[name="${ad}"]`);
            const ad = al('ad').value.trim();
            if (!repoAdiGecerli(ad)) throw new Error('Geçerli bir repo adı gir.');
            const url = await api.repoOlustur({
                ad,
                aciklama: al('aciklama').value,
                gorunurluk: kok.querySelector('[name="gorunurluk"]:checked').value,
                readme: al('readme').checked,
                gitignore: al('gitignore').value || null,
                lisans: al('lisans').value || null,
            });
            bildir(`“${ad}” oluşturuldu.`, { tur: 'basari', eylem: url ? { metin: "GitHub'da aç", fn: () => openUrl(url) } : null });
            repolariYukle();
        },
    });
}

export function gorunurlukSecici(secili, internal = false) {
    const secenekler = [
        ['private', 'kilit', 'Private', 'Yalnızca sen ve davet ettiklerin görür.'],
        ['public', 'dunya', 'Public', 'İnternetteki herkes görebilir.'],
    ];
    if (internal) secenekler.push(['internal', 'kullanici', 'Internal', 'Kuruluş üyeleri görebilir.']);
    return html`<fieldset class="gorunurluk-secici"><legend>Görünürlük</legend>
        ${secenekler.map(([deger, ikon, ad, aciklama]) => html`
            <label class="secenek-kart">
                <input type="radio" name="gorunurluk" value="${deger}" ${deger === secili ? html`checked` : ''}>
                <span class="secenek-ikon">${simge(ikon, 16)}</span>
                <span><strong>${ad}</strong><small>${aciklama}</small></span>
            </label>`)}
    </fieldset>`;
}

function duzenleModali(repo) {
    const mevcut = gorunurluk(repo);
    modalAc({
        ust: 'REPO AYARLARI',
        baslik: repo.name,
        aciklama: repo.nameWithOwner,
        gonderMetni: 'Değişiklikleri kaydet',
        boyut: 'genis',
        govde: html`
            <label class="alan">Repo adı
                <input name="ad" value="${repo.name}" autocomplete="off" spellcheck="false">
                <small class="ipucu" data-ad-ipucu>Adı değiştirirsen GitHub eski adresi yeni adrese yönlendirir.</small>
            </label>
            <label class="alan">Açıklama
                <textarea name="aciklama" rows="3" placeholder="Bu proje ne yapıyor?">${repo.description || ''}</textarea>
            </label>
            <label class="alan">Web sitesi <span class="istege-bagli">isteğe bağlı</span>
                <input name="anaSayfa" value="${repo.homepageUrl || ''}" placeholder="https://ornek.com" spellcheck="false">
            </label>
            ${gorunurlukSecici(mevcut, mevcut === 'internal')}
            <p class="uyari-kutusu" data-gorunurluk-uyari hidden>${simge('uyari', 14)} <span></span></p>`,
        acilinca(kok) {
            const uyari = kok.querySelector('[data-gorunurluk-uyari]');
            kok.querySelectorAll('[name="gorunurluk"]').forEach((r) => r.addEventListener('change', () => {
                const yeni = kok.querySelector('[name="gorunurluk"]:checked').value;
                uyari.hidden = yeni === mevcut;
                uyari.querySelector('span').textContent = yeni === 'public'
                    ? 'Repo herkese açık olacak. Gizli bilgi içermediğinden emin ol.'
                    : 'Private yapınca yıldızlar ve izleyiciler kaybolur.';
            }));
            const ad = kok.querySelector('[name="ad"]');
            const ipucu = kok.querySelector('[data-ad-ipucu]');
            ad.addEventListener('input', () => {
                const deger = ad.value.trim();
                const gecerli = repoAdiGecerli(deger);
                ipucu.classList.toggle('hatali', !gecerli);
                ipucu.textContent = !gecerli
                    ? 'Bu ad geçersiz: Türkçe karakter, boşluk ve “/” kullanılamaz.'
                    : deger === repo.name
                        ? 'Adı değiştirirsen GitHub eski adresi yeni adrese yönlendirir.'
                        : `Yeni adres: github.com/${repo.nameWithOwner.split('/')[0]}/${deger}`;
            });
        },
        async gonder(kok) {
            const yeniAd = kok.querySelector('[name="ad"]').value.trim();
            if (!repoAdiGecerli(yeniAd)) throw new Error('Geçerli bir repo adı gir.');
            const yeni = kok.querySelector('[name="gorunurluk"]:checked').value;
            const yeniUrl = await api.repoGuncelle(repo.url, {
                yeniAd: yeniAd === repo.name ? null : yeniAd,
                aciklama: kok.querySelector('[name="aciklama"]').value,
                anaSayfa: kok.querySelector('[name="anaSayfa"]').value,
                gorunurluk: yeni === mevcut ? null : yeni,
            });
            if (yeniUrl) {
                const eskiAnahtar = repoAnahtari(repo.url);
                const yerel = yerelEslesme.al(eskiAnahtar);
                if (yerel) yerelEslesme.kaydet(repoAnahtari(yeniUrl), yerel);
                const acikBagli = repoAnahtari(calismaAlani.origin()) === eskiAnahtar;
                if (acikBagli) await calismaAlani.originDegistir(`${yeniUrl}.git`);
                bildir(`Repo “${yeniAd}” olarak yeniden adlandırıldı.${acikBagli ? ' Açık klasörün bağlantısı da güncellendi.' : ''}`, { tur: 'basari' });
            } else {
                bildir('Repo güncellendi.', { tur: 'basari' });
            }
            repolariYukle();
        },
    });
}

function klonModali(repo) {
    const varsayilan = depola.oku('klonKlasoru', '');
    modalAc({
        ust: 'YEREL ÇALIŞMA',
        baslik: 'Repoyu klonla',
        aciklama: `${repo.nameWithOwner} bilgisayarına indirilecek.`,
        gonderMetni: 'Klonlamayı başlat',
        govde: html`
            <label class="alan">Hedef klasör
                <div class="girdi-grubu">
                    <input name="hedef" value="${varsayilan}" placeholder="Klasör yolunu yaz ya da “Seç” ile seç" spellcheck="false">
                    <button class="dugme dugme-sessiz" data-sec type="button">${simge('klasor', 15)} Seç</button>
                </div>
                <small class="ipucu yol-onizleme" data-onizleme></small>
            </label>`,
        acilinca(kok) {
            const girdi = kok.querySelector('[name="hedef"]');
            const onizleme = kok.querySelector('[data-onizleme]');
            const guncelle = () => {
                const t = girdi.value.trim().replace(/[\\/]+$/, '');
                onizleme.textContent = t ? `→ ${t}/${repo.name}` : 'Repo, seçtiğin klasörün içine kendi adıyla indirilir.';
            };
            girdi.addEventListener('input', guncelle);
            kok.querySelector('[data-sec]').addEventListener('click', async () => {
                const secim = await open({ directory: true, multiple: false, title: 'Klonlanacak klasörü seç', defaultPath: girdi.value || undefined });
                if (typeof secim === 'string') { girdi.value = secim; guncelle(); }
            });
            guncelle();
        },
        async gonder(kok) {
            const hedef = kok.querySelector('[name="hedef"]').value.trim();
            if (!hedef) throw new Error('Hedef klasör gerekli.');
            const yol = await api.repoKlonla(repo.url, hedef, repo.name);
            depola.yaz('klonKlasoru', hedef);
            yerelEslesme.kaydet(repoAnahtari(repo.url), yol);
            bildir(`${repo.name} klonlandı.`, { tur: 'basari', eylem: { metin: 'Çalışma alanında aç', fn: () => calismaAlani.ac(yol) } });
        },
    });
}

