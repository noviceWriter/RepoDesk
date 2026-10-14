import { api } from '../lib/api.js';
import { bildir, hataBildir, modalAc, onayla } from '../lib/bilesen.js';
import { ciz, eylemler, goreliZaman, html } from '../lib/dom.js';
import { simge } from '../lib/simge.js';

const BIRLESMEMIS = 'BIRLESMEMIS:';

/**
 * Dal yönetimi penceresi.
 * @param {{kok: string, bilgi: object, yenile: () => Promise<void>}} baglam
 */
export function dallarModali(baglam) {
    let dallar = null;
    let hata = '';
    let mesgul = '';
    let govde;

    const kayit = modalAc({
        ust: 'DALLAR',
        baslik: 'Dal yönetimi',
        aciklama: 'Dallar arasında geçiş yap, yeni dal aç, dalları birleştir.',
        boyut: 'genis',
        govde: html`<div data-dallar></div>`,
        acilinca(kok) {
            govde = kok.querySelector('[data-dallar]');
            eylemler(govde, 'click', {
                olustur: () => olustur(),
                gec: (el) => calistir('gec', () => api.dalGec(baglam.kok, el.dataset.ad, el.dataset.uzak === '1')),
                birlestir: (el) => birlestir(el.dataset.ad),
                adlandir: (el) => yenidenAdlandir(el.dataset.ad),
                sil: (el) => sil(el.dataset.ad),
                uzakSil: (el) => uzakSil(el.dataset.ad),
                getir: () => calistir('getir', () => api.uzakGuncelle(baglam.kok)),
            });
            govde.addEventListener('keydown', (e) => {
                if (e.target.id === 'yeni-dal' && e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); olustur(); }
            });
            yukle();
        },
    });

    async function yukle() {
        try {
            dallar = await api.dallar(baglam.kok);
            hata = '';
        } catch (e) {
            hata = e.message;
        }
        ciz_();
    }

    async function calistir(ad, fn, { kapat = false } = {}) {
        if (mesgul) return;
        mesgul = ad;
        ciz_();
        try {
            const sonuc = await fn();
            if (sonuc) bildir(sonuc, { tur: sonuc.includes('çakışma') ? 'bilgi' : 'basari' });
            await baglam.yenile();
            if (kapat) { mesgul = ''; kayit.kapat(); return; }
        } catch (e) {
            hataBildir(e);
        }
        mesgul = '';
        await yukle();
    }

    function olustur() {
        const girdi = govde.querySelector('#yeni-dal');
        const ad = girdi.value.trim();
        if (!ad) { girdi.focus(); return; }
        const gec = govde.querySelector('#yeni-dal-gec').checked;
        calistir('olustur', () => api.dalOlustur(baglam.kok, ad, gec));
    }

    async function birlestir(ad) {
        const hedef = baglam.bilgi.dal;
        const tamam = await onayla(`“${ad}” dalındaki değişiklikler, şu an bulunduğun “${hedef}” dalına birleştirilsin mi?`, { baslik: 'Dalı birleştir', tamam: 'Birleştir' });
        if (!tamam) return;
        calistir('birlestir', async () => {
            const sonuc = await api.dalBirlestir(baglam.kok, ad);
            if (sonuc.includes('çakışma')) setTimeout(() => kayit.kapat(), 0);
            return sonuc;
        });
    }

    function yenidenAdlandir(ad) {
        modalAc({
            ust: 'DAL',
            baslik: 'Dalı yeniden adlandır',
            aciklama: `“${ad}” için yeni bir ad yaz.`,
            gonderMetni: 'Yeniden adlandır',
            govde: html`<label class="alan">Yeni ad<input name="ad" value="${ad}" spellcheck="false" autocomplete="off" autofocus></label>
                <p class="ipucu">GitHub’daki dal etkilenmez; yalnızca bilgisayarındaki dalın adı değişir.</p>`,
            acilinca(kok) { kok.querySelector('[name="ad"]').select(); },
            async gonder(kok) {
                const yeni = kok.querySelector('[name="ad"]').value.trim();
                if (!yeni || yeni === ad) throw new Error('Farklı bir ad gir.');
                bildir(await api.dalYenidenAdlandir(baglam.kok, ad, yeni), { tur: 'basari' });
                await baglam.yenile();
                await yukle();
            },
        });
    }

    async function sil(ad) {
        if (!(await onayla(`“${ad}” dalı bilgisayarından silinsin mi?`, { baslik: 'Dalı sil', tamam: 'Sil', tehlikeli: true }))) return;
        try {
            bildir(await api.dalSil(baglam.kok, ad), { tur: 'basari' });
        } catch (e) {
            if (!e.message.startsWith(BIRLESMEMIS)) { hataBildir(e); return; }
            const zorla = await onayla(`${e.message.slice(BIRLESMEMIS.length)}\n\nSilersen bu commit'ler kaybolabilir. Yine de silinsin mi?`, { baslik: 'Birleştirilmemiş dal', tamam: 'Yine de sil', tehlikeli: true });
            if (!zorla) return;
            try { bildir(await api.dalSil(baglam.kok, ad, true), { tur: 'basari' }); } catch (e2) { hataBildir(e2); return; }
        }
        await baglam.yenile();
        await yukle();
    }

    async function uzakSil(ad) {
        const tamam = await onayla(`“${ad}” dalı GitHub’dan silinsin mi?\n\nBu dalı kullanan başkaları varsa onları da etkiler.`, { baslik: 'GitHub’dan dal sil', tamam: 'GitHub’dan sil', tehlikeli: true });
        if (tamam) calistir('uzakSil', () => api.uzakDalSil(baglam.kok, ad));
    }

    function ciz_() {
        if (!govde?.isConnected) return;
        if (hata) {
            ciz(govde, html`<p class="form-hata">${hata}</p>`);
            return;
        }
        if (!dallar) {
            ciz(govde, html`<div class="fark-bos"><span class="donen"></span></div>`);
            return;
        }
        const bagli = Boolean(baglam.bilgi.origin);
        const yalnizUzak = dallar.uzak.filter((d) => !d.yerelVar);
        const kilitli = mesgul ? 'disabled' : '';
        ciz(govde, html`
            <div class="dal-olustur">
                <label class="arama">${simge('dal', 15)}<input id="yeni-dal" placeholder="yeni-dal-adi" spellcheck="false" autocomplete="off" ${baglam.bilgi.commitVar ? '' : 'disabled'}></label>
                <label class="onay-kutusu"><input type="checkbox" id="yeni-dal-gec" checked> Oluşturunca geç</label>
                <button class="dugme ${mesgul === 'olustur' ? 'yukleniyor' : ''}" data-eylem="olustur" type="button" ${kilitli} ${baglam.bilgi.commitVar ? '' : 'disabled'}>${simge('arti', 15)} Dal oluştur</button>
            </div>
            ${baglam.bilgi.commitVar ? '' : html`<p class="ipucu">Dal oluşturmak için önce bir commit gerekiyor.</p>`}
            <div class="dal-bolum-baslik"><span>Bilgisayarındaki dallar</span><span>${dallar.yerel.length}</span></div>
            <div class="dal-listesi">
                ${dallar.yerel.map((d) => html`
                    <div class="dal-satir ${d.guncel ? 'guncel' : ''}">
                        <span class="dal-isaret">${simge(d.guncel ? 'tik' : 'dal', 14)}</span>
                        <div class="dal-bilgi">
                            <strong>${d.ad}${d.guncel ? html` <em>şu an buradasın</em>` : ''}</strong>
                            <small>${d.sonMesaj} · ${goreliZaman(d.tarih)}</small>
                        </div>
                        <span class="dal-rozetler">
                            ${d.ileri ? html`<span class="rozet rozet-acik" title="GitHub'a gönderilmemiş commit">↑${d.ileri}</span>` : ''}
                            ${d.geri ? html`<span class="rozet rozet-private" title="GitHub'da olup sende olmayan commit">↓${d.geri}</span>` : ''}
                            ${bagli && !d.upstream ? html`<span class="rozet" title="Bu dal henüz GitHub'a gönderilmedi">yalnızca yerel</span>` : ''}
                            ${d.upstreamSilindi ? html`<span class="rozet" title="GitHub'daki karşılığı silinmiş">uzakta silindi</span>` : ''}
                        </span>
                        <span class="dal-eylemler">
                            ${d.guncel ? '' : html`
                                <button class="dugme dugme-sessiz dugme-kucuk ${mesgul === 'gec' ? 'yukleniyor' : ''}" data-eylem="gec" data-ad="${d.ad}" type="button" ${kilitli}>Geç</button>
                                <button class="ikon-dugme" data-eylem="birlestir" data-ad="${d.ad}" type="button" title="Bu dalı “${baglam.bilgi.dal}” dalına birleştir" aria-label="Birleştir" ${kilitli}>${simge('birlestir', 15)}</button>`}
                            <button class="ikon-dugme" data-eylem="adlandir" data-ad="${d.ad}" type="button" title="Yeniden adlandır" aria-label="Yeniden adlandır" ${kilitli}>${simge('kalem', 14)}</button>
                            ${d.guncel ? '' : html`<button class="ikon-dugme tehlike" data-eylem="sil" data-ad="${d.ad}" type="button" title="Sil" aria-label="Sil" ${kilitli}>${simge('cop', 14)}</button>`}
                        </span>
                    </div>`)}
            </div>
            ${bagli ? html`
                <div class="dal-bolum-baslik">
                    <span>Yalnızca GitHub’da olan dallar</span>
                    <button class="dugme-metin ${mesgul === 'getir' ? 'donuyor' : ''}" data-eylem="getir" type="button" ${kilitli}>${simge('yenile', 13)} GitHub’dan yenile</button>
                </div>
                <div class="dal-listesi">
                    ${yalnizUzak.length ? yalnizUzak.map((d) => html`
                        <div class="dal-satir">
                            <span class="dal-isaret">${simge('dunya', 14)}</span>
                            <div class="dal-bilgi"><strong>${d.ad}</strong><small>${d.sonMesaj} · ${goreliZaman(d.tarih)}</small></div>
                            <span class="dal-eylemler">
                                <button class="dugme dugme-sessiz dugme-kucuk" data-eylem="gec" data-ad="${d.ad}" data-uzak="1" type="button" title="Bilgisayarına indir ve geç" ${kilitli}>${simge('indir', 13)} Al ve geç</button>
                                <button class="ikon-dugme" data-eylem="birlestir" data-ad="${d.tamAd}" type="button" title="Bu dalı “${baglam.bilgi.dal}” dalına birleştir" aria-label="Birleştir" ${kilitli}>${simge('birlestir', 15)}</button>
                                <button class="ikon-dugme tehlike" data-eylem="uzakSil" data-ad="${d.ad}" type="button" title="GitHub'dan sil" aria-label="GitHub'dan sil" ${kilitli}>${simge('cop', 14)}</button>
                            </span>
                        </div>`) : html`<p class="ipucu dal-bos">Her uzak dalın bilgisayarında da bir karşılığı var.</p>`}
                </div>` : ''}`);
    }
}
