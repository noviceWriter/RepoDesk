import { api } from '../lib/api.js';
import { bildir, hataBildir, modalAc } from '../lib/bilesen.js';
import { ciz, eylemler, html } from '../lib/dom.js';
import { simge } from '../lib/simge.js';

/** Git çakışma işaretli metni düz ve çakışmalı parçalara böler. */
export function cakismalariAyristir(metin) {
    const satirlar = metin.split('\n');
    const parcalar = [];
    let duz = [];
    for (let i = 0; i < satirlar.length; i += 1) {
        const satir = satirlar[i];
        if (!satir.startsWith('<<<<<<<')) {
            duz.push(satir);
            continue;
        }
        if (duz.length) { parcalar.push({ tur: 'duz', satirlar: duz }); duz = []; }
        const parca = { tur: 'cakisma', bizim: [], onlarin: [], bizimEtiket: satir.slice(8).trim(), onlarinEtiket: '', secim: null };
        let bolge = 'bizim';
        for (i += 1; i < satirlar.length; i += 1) {
            const s = satirlar[i];
            if (bolge === 'bizim' && s.startsWith('|||||||')) bolge = 'taban';
            else if (bolge !== 'onlarin' && s.startsWith('=======')) bolge = 'onlarin';
            else if (bolge === 'onlarin' && s.startsWith('>>>>>>>')) { parca.onlarinEtiket = s.slice(8).trim(); break; }
            else if (bolge === 'bizim') parca.bizim.push(s);
            else if (bolge === 'onlarin') parca.onlarin.push(s);
        }
        parcalar.push(parca);
    }
    if (duz.length) parcalar.push({ tur: 'duz', satirlar: duz });
    return parcalar;
}

/** Seçimlere göre çözülmüş dosya metnini üretir. */
export function cozumuOlustur(parcalar) {
    return parcalar
        .flatMap((p) => {
            if (p.tur === 'duz') return p.satirlar;
            if (p.secim === 'bizim') return p.bizim;
            if (p.secim === 'onlarin') return p.onlarin;
            return [...p.bizim, ...p.onlarin];
        })
        .join('\n');
}

const satirlar = (liste) => (liste.length ? liste.map((s) => html`<div class="fs">${s || ' '}</div>`) : html`<div class="fs fs-meta">(boş — bu tarafta satır yok)</div>`);

/**
 * @param {{kok: string, yenile: () => Promise<void>}} baglam
 * @param {string} yol
 */
export async function cakismaModali(baglam, yol) {
    let icerik = null;
    try {
        icerik = await api.dosyaOku(baglam.kok, yol);
    } catch {
        icerik = null; // ikili dosya ya da silme/değiştirme çakışması
    }
    const parcalar = icerik == null ? [] : cakismalariAyristir(icerik);
    const cakismalar = parcalar.filter((p) => p.tur === 'cakisma');

    if (!cakismalar.length) {
        modalAc({
            ust: 'ÇAKIŞMA',
            baslik: yol,
            aciklama: 'Bu dosyada satır satır karşılaştırılabilecek bir çakışma yok (ikili dosya ya da bir tarafta silinmiş olabilir). Hangi sürümün kalacağını seç.',
            govde: html`<div class="cakisma-taraflar">
                <button class="secenek-kart" data-taraf="bizim" type="button"><span class="secenek-ikon">${simge('kullanici', 16)}</span><span><strong>Benim sürümüm</strong><small>Bu daldaki hâli kalsın</small></span></button>
                <button class="secenek-kart" data-taraf="onlarin" type="button"><span class="secenek-ikon">${simge('indir', 16)}</span><span><strong>Gelen sürüm</strong><small>Birleştirilen daldaki hâli kalsın</small></span></button>
            </div>`,
            acilinca(kok, kayit) {
                kok.querySelectorAll('[data-taraf]').forEach((d) => d.addEventListener('click', async () => {
                    try {
                        bildir(await api.cakismaTarafSec(baglam.kok, yol, d.dataset.taraf), { tur: 'basari' });
                        kayit.kapat();
                        await baglam.yenile();
                    } catch (e) { hataBildir(e); }
                }));
            },
        });
        return;
    }

    let govde;
    let onizleme = false;
    const kayit = modalAc({
        ust: 'ÇAKIŞMA ÇÖZ',
        baslik: yol,
        aciklama: 'Her çakışma için hangi değişikliğin kalacağını seç. İstersen sonucu elle de düzenleyebilirsin.',
        boyut: 'tam',
        gonderMetni: 'Çözüldü olarak kaydet',
        govde: html`<div class="cakisma-govde" data-cakisma></div>`,
        acilinca(kok) {
            govde = kok.querySelector('[data-cakisma]');
            eylemler(govde, 'click', {
                sec: (el) => { cakismalar[Number(el.dataset.sira)].secim = el.dataset.secim; ciz_(); },
                hepsi: (el) => { cakismalar.forEach((p) => { p.secim = el.dataset.secim; }); ciz_(); },
                onizleme: () => {
                    if (cakismalar.some((p) => !p.secim)) { bildir('Önce tüm çakışmalar için bir seçim yap.', { tur: 'hata' }); return; }
                    onizleme = !onizleme;
                    ciz_();
                },
            });
            ciz_();
        },
        async gonder(kok) {
            let sonuc;
            if (onizleme) sonuc = kok.querySelector('.editor').value;
            else {
                const eksik = cakismalar.filter((p) => !p.secim).length;
                if (eksik) throw new Error(`${eksik} çakışma için henüz seçim yapılmadı.`);
                sonuc = cozumuOlustur(parcalar);
            }
            bildir(await api.cakismaCoz(baglam.kok, yol, sonuc), { tur: 'basari' });
            await baglam.yenile();
        },
    });

    function ciz_() {
        const cozulen = cakismalar.filter((p) => p.secim).length;
        const bas = cakismalar[0];
        const ust = html`
            <div class="cakisma-ust">
                <span class="cakisma-sayac ${cozulen === cakismalar.length ? 'tamam' : ''}">${cozulen} / ${cakismalar.length} çakışma çözüldü</span>
                <div class="cakisma-hizli">
                    <button class="dugme dugme-sessiz dugme-kucuk" data-eylem="hepsi" data-secim="bizim" type="button">Tümünde benimkini al</button>
                    <button class="dugme dugme-sessiz dugme-kucuk" data-eylem="hepsi" data-secim="onlarin" type="button">Tümünde geleni al</button>
                    <button class="dugme dugme-sessiz dugme-kucuk" data-eylem="onizleme" type="button">${simge(onizleme ? 'geriAl' : 'kalem', 13)} ${onizleme ? 'Seçimlere dön' : 'Sonucu gör / düzenle'}</button>
                </div>
            </div>`;
        if (onizleme) {
            ciz(govde, html`${ust}<textarea class="editor" spellcheck="false">${cozumuOlustur(parcalar)}</textarea>`);
            return;
        }
        let sira = -1;
        ciz(govde, html`${ust}
            <div class="cakisma-liste" data-kaydirma="cakisma">
                ${parcalar.map((p) => {
                    if (p.tur === 'duz') {
                        const gosterilen = p.satirlar.length > 8 ? [...p.satirlar.slice(0, 3), null, ...p.satirlar.slice(-3)] : p.satirlar;
                        return html`<div class="cakisma-baglam">${gosterilen.map((s) => (s === null
                            ? html`<div class="fs fs-meta">⋯ ${p.satirlar.length - 6} satır değişmedi</div>`
                            : html`<div class="fs">${s || ' '}</div>`))}</div>`;
                    }
                    sira += 1;
                    const secenek = (secim, etiket) => html`<button class="dugme dugme-kucuk ${p.secim === secim ? '' : 'dugme-sessiz'}" data-eylem="sec" data-sira="${sira}" data-secim="${secim}" type="button">${p.secim === secim ? simge('tik', 13) : ''} ${etiket}</button>`;
                    return html`<div class="cakisma-kart ${p.secim ? 'secildi' : ''}">
                        <div class="cakisma-yanyana">
                            <div class="cakisma-taraf taraf-bizim ${p.secim === 'bizim' || p.secim === 'ikisi' ? 'aktif' : ''} ${p.secim === 'onlarin' ? 'soluk' : ''}">
                                <header>${simge('kullanici', 13)} Senin değişikliğin <small>${p.bizimEtiket || bas.bizimEtiket}</small></header>
                                <div class="fark">${satirlar(p.bizim)}</div>
                            </div>
                            <div class="cakisma-taraf taraf-onlarin ${p.secim === 'onlarin' || p.secim === 'ikisi' ? 'aktif' : ''} ${p.secim === 'bizim' ? 'soluk' : ''}">
                                <header>${simge('indir', 13)} Gelen değişiklik <small>${p.onlarinEtiket}</small></header>
                                <div class="fark">${satirlar(p.onlarin)}</div>
                            </div>
                        </div>
                        <div class="cakisma-secim">${secenek('bizim', 'Benimkini al')}${secenek('onlarin', 'Geleni al')}${secenek('ikisi', 'İkisini de al')}</div>
                    </div>`;
                })}
            </div>`);
    }
    return kayit;
}
