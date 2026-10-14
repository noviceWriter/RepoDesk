import { openUrl } from '@tauri-apps/plugin-opener';
import { api } from '../lib/api.js';
import { bildir, hataBildir, modalAc } from '../lib/bilesen.js';
import { ciz, eylemler, goreliZaman, html, tarihYaz } from '../lib/dom.js';
import { simge } from '../lib/simge.js';

export const CI_ETIKET = {
    basarili: ['tik', 'Başarılı'],
    basarisiz: ['carpi', 'Başarısız'],
    suruyor: ['degisim', 'Çalışıyor'],
    iptal: ['carpi', 'İptal edildi'],
    atlandi: ['sag', 'Atlandı'],
    bilinmiyor: ['degisim', 'Bilinmiyor'],
};

/** Kart/çip için küçük CI rozeti. */
export function ciRozeti(durum, { eylem = 'ci', etiket = 'CI' } = {}) {
    if (!durum) return '';
    const [ikon, ad] = CI_ETIKET[durum] || CI_ETIKET.bilinmiyor;
    return html`<button class="ci-rozet ci-${durum}" data-eylem="${eylem}" type="button" title="Son commit'in kontrolleri (GitHub Actions ve diğer servisler): ${ad} — ayrıntılar için tıkla">
        ${durum === 'suruyor' ? html`<span class="ci-nabiz"></span>` : simge(ikon, 11)} ${etiket}</button>`;
}

/**
 * @param {{url: string, ad: string}} repo
 * @param {string | null} dal  Verilirse yalnızca o dalın çalıştırmaları gösterilir (açılıp kapatılabilir)
 */
export function ciModali(repo, dal = null) {
    const d = { liste: null, hata: '', yalnizDal: Boolean(dal), mesgul: '' };
    let govde;
    let sira = 0;

    modalAc({
        ust: 'GITHUB ACTIONS',
        baslik: repo.ad,
        aciklama: 'Son iş akışı çalıştırmaları',
        boyut: 'genis',
        govde: html`<div class="ci-govde" data-ci></div>`,
        acilinca(kok) {
            govde = kok.querySelector('[data-ci]');
            eylemler(govde, 'click', {
                ac: (el) => openUrl(el.dataset.url),
                tumu: () => openUrl(`${repo.url}/actions`),
                commitler: () => openUrl(`${repo.url}/commits`),
                yenile: () => yukle(),
                yeniden: (el) => yenidenCalistir(Number(el.dataset.id), el.dataset.basarisiz === '1'),
            });
            govde.addEventListener('change', (e) => {
                if (e.target.id === 'ci-dal') { d.yalnizDal = e.target.checked; yukle(); }
            });
            yukle();
        },
    });

    async function yukle() {
        const no = ++sira;
        d.liste = null;
        d.hata = '';
        ciz_();
        try {
            const liste = await api.ciCalismalari(repo.url, d.yalnizDal ? dal : null);
            if (no === sira) d.liste = liste;
        } catch (e) {
            if (no === sira) d.hata = e.message;
        }
        if (no === sira) ciz_();
    }

    async function yenidenCalistir(id, sadeceBasarisiz) {
        if (d.mesgul) return;
        d.mesgul = String(id);
        ciz_();
        try {
            bildir(await api.ciYenidenCalistir(repo.url, id, sadeceBasarisiz), { tur: 'basari' });
            await new Promise((r) => setTimeout(r, 1500));
        } catch (e) {
            hataBildir(e);
        }
        d.mesgul = '';
        yukle();
    }

    function ciz_() {
        if (!govde?.isConnected) return;
        const ust = html`<div class="ci-ust">
            ${dal ? html`<label class="onay-kutusu"><input type="checkbox" id="ci-dal" ${d.yalnizDal ? 'checked' : ''}> Yalnızca <code>${dal}</code> dalı</label>` : html`<span></span>`}
            <div class="ci-ust-eylemler">
                <button class="dugme-metin" data-eylem="yenile" type="button">${simge('yenile', 13)} Yenile</button>
                <button class="dugme-metin" data-eylem="tumu" type="button">${simge('dis', 13)} GitHub’da tümü</button>
            </div>
        </div>`;
        if (d.hata) {
            ciz(govde, html`${ust}<div class="bos bos-kucuk"><span class="bos-ikon">${simge('uyari', 22)}</span><p>${d.hata}</p></div>`);
            return;
        }
        if (!d.liste) {
            ciz(govde, html`${ust}<div class="fark-bos"><span class="donen"></span></div>`);
            return;
        }
        if (!d.liste.length) {
            ciz(govde, html`${ust}<div class="bos bos-kucuk"><span class="bos-ikon">${simge('degisim', 22)}</span>
                <h3>GitHub Actions çalıştırması yok</h3>
                <p>Bu repoda${d.yalnizDal ? ' bu dal için' : ''} Actions çalıştırılmamış. Rozetteki durum başka bir servisten (ör. Vercel, Netlify) geliyorsa ayrıntıları GitHub’daki commit sayfasında görebilirsin.</p>
                <button class="dugme dugme-sessiz" data-eylem="commitler" type="button">${simge('dis', 14)} Commit’leri GitHub’da aç</button></div>`);
            return;
        }
        ciz(govde, html`${ust}<div class="ci-listesi">
            ${d.liste.map((c) => {
                const [ikon, ad] = CI_ETIKET[c.durum] || CI_ETIKET.bilinmiyor;
                const tekrar = c.durum === 'basarisiz' || c.durum === 'iptal';
                return html`<div class="ci-satir">
                    <span class="ci-ikon ci-${c.durum}" title="${ad}">${c.durum === 'suruyor' ? html`<span class="donen kucuk"></span>` : simge(ikon, 14)}</span>
                    <div class="istek-bilgi">
                        <button class="istek-baslik" data-eylem="ac" data-url="${c.url}" type="button">${c.baslik || c.isAkisi}</button>
                        <div class="istek-meta">
                            <span>${c.isAkisi}</span>
                            <span class="istek-dal">${simge('dal', 11)} ${c.dal}</span>
                            <span>${c.olay}</span>
                            <span title="${tarihYaz(c.tarih)}">${goreliZaman(c.tarih)}</span>
                        </div>
                    </div>
                    <div class="istek-eylemler">
                        ${tekrar ? html`
                            <button class="dugme dugme-sessiz dugme-kucuk ${d.mesgul === String(c.id) ? 'yukleniyor' : ''}" data-eylem="yeniden" data-id="${c.id}" data-basarisiz="1" type="button" ${d.mesgul ? 'disabled' : ''} title="Yalnızca başarısız işleri yeniden çalıştır">${simge('oynat', 12)} Başarısızları</button>
                            <button class="dugme dugme-sessiz dugme-kucuk" data-eylem="yeniden" data-id="${c.id}" data-basarisiz="0" type="button" ${d.mesgul ? 'disabled' : ''} title="Tüm işleri yeniden çalıştır">${simge('yenile', 12)} Tümünü</button>` : ''}
                        <button class="ikon-dugme" data-eylem="ac" data-url="${c.url}" type="button" title="GitHub'da aç" aria-label="GitHub'da aç">${simge('dis', 15)}</button>
                    </div>
                </div>`;
            })}
        </div>`);
    }
}
