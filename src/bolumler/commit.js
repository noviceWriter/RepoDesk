import { openUrl } from '@tauri-apps/plugin-opener';
import { api } from '../lib/api.js';
import { bildir, hataBildir, modalAc, onayla } from '../lib/bilesen.js';
import { ciz, eylemler, goreliZaman, html, panoyaKopyala, tarihYaz } from '../lib/dom.js';
import { simge } from '../lib/simge.js';

const DURUM = { eklendi: ['+', 'Eklendi'], degisti: ['●', 'Değişti'], silindi: ['−', 'Silindi'], tasindi: ['→', 'Taşındı'] };

export function farkSatirSinifi(s) {
    if (s.startsWith('@@')) return 'fs-kanca';
    if (/^(diff |index |\+\+\+ |--- |new file|deleted file|similarity|rename |old mode|new mode)/.test(s)) return 'fs-meta';
    if (s.startsWith('+')) return 'fs-ekle';
    if (s.startsWith('-')) return 'fs-sil';
    return '';
}

/**
 * @param {{kok: string, bilgi: object, yenile: () => Promise<void>}} baglam
 * @param {string} hash
 * @param {string} webAdresi  Repo GitHub adresi (yoksa boş)
 */
export function commitModali(baglam, hash, webAdresi) {
    const d = { ayrinti: null, hata: '', secili: null, fark: '', farkYukleniyor: false, mesgul: false };
    let govde;
    const kok = baglam.kok;

    const kayit = modalAc({
        ust: 'COMMIT',
        baslik: 'Commit ayrıntısı',
        boyut: 'tam',
        govde: html`<div class="commit-govde" data-commit><div class="fark-bos"><span class="donen"></span></div></div>`,
        acilinca(k) {
            govde = k.querySelector('[data-commit]');
            eylemler(govde, 'click', {
                dosya: (el) => dosyaSec(d.ayrinti.dosyalar[Number(el.dataset.sira)]),
                kopyala: async () => {
                    try { await panoyaKopyala(d.ayrinti.hash); bildir('Commit kimliği kopyalandı.', { tur: 'basari', sure: 2000 }); } catch (e) { hataBildir(e); }
                },
                github: () => openUrl(`${webAdresi}/commit/${d.ayrinti.hash}`),
                ebeveyn: (el) => { kayit.kapat(); commitModali(baglam, el.dataset.hash, webAdresi); },
                tersine: () => tersineCevir(),
            });
            yukle();
        },
    });

    async function yukle() {
        try {
            d.ayrinti = await api.commitAyrinti(kok, hash);
            const ilk = d.ayrinti.dosyalar[0];
            ciz_();
            if (ilk) dosyaSec(ilk);
        } catch (e) {
            d.hata = e.message;
            ciz_();
        }
    }

    async function dosyaSec(dosya) {
        d.secili = dosya;
        d.farkYukleniyor = true;
        ciz_();
        try {
            const fark = await api.commitFark(kok, d.ayrinti.hash, dosya.yol, dosya.eskiYol || null);
            if (d.secili === dosya) d.fark = fark;
        } catch (e) {
            if (d.secili === dosya) d.fark = `⚠ ${e.message}`;
        }
        d.farkYukleniyor = false;
        ciz_();
    }

    async function tersineCevir() {
        const tamam = await onayla(
            `“${d.ayrinti.baslik}” commit’inin yaptığı değişiklikler geri alınsın mı?\n\nGeçmiş silinmez; bu değişiklikleri tersine çeviren yeni bir commit oluşturulur. GitHub’a gönderilmiş commit’ler için de güvenlidir.`,
            { baslik: 'Commit’i tersine çevir', tamam: 'Tersine çevir' },
        );
        if (!tamam) return;
        d.mesgul = true;
        ciz_();
        try {
            bildir(await api.commitTersineCevir(kok, d.ayrinti.hash), { tur: 'basari' });
            await baglam.yenile();
            kayit.kapat();
        } catch (e) {
            hataBildir(e);
            d.mesgul = false;
            ciz_();
        }
    }

    function ciz_() {
        if (!govde?.isConnected) return;
        if (d.hata) { ciz(govde, html`<p class="form-hata">${d.hata}</p>`); return; }
        const a = d.ayrinti;
        if (!a) return;
        const enCok = Math.max(1, ...a.dosyalar.map((f) => (f.eklenen || 0) + (f.silinen || 0)));
        ciz(govde, html`
            <header class="commit-baslik">
                <div class="commit-mesaj">
                    <h3>${a.baslik}</h3>
                    ${a.govde ? html`<pre>${a.govde}</pre>` : ''}
                    <p class="commit-meta">
                        ${simge('kullanici', 13)} <strong>${a.yazar}</strong> <span title="${a.eposta}">&lt;${a.eposta}&gt;</span>
                        · <span title="${tarihYaz(a.tarih)}">${goreliZaman(a.tarih)}</span>
                        · <span class="commit-sayi ekle">+${a.eklenen}</span> <span class="commit-sayi sil">−${a.silinen}</span>
                        · ${a.dosyalar.length} dosya
                    </p>
                    <p class="commit-meta">
                        <button class="hash" data-eylem="kopyala" type="button" title="Tam kimliği kopyala">${simge('kopya', 11)} ${a.kisa}</button>
                        ${a.ebeveynler.length ? html`${a.ebeveynler.length > 1 ? 'birleştirme · ebeveynler' : 'önceki'}:
                            ${a.ebeveynler.map((p) => html`<button class="hash" data-eylem="ebeveyn" data-hash="${p}" type="button" title="Bu commit'e git">${p.slice(0, 7)}</button>`)}` : html`<span class="rozet">ilk commit</span>`}
                    </p>
                </div>
                <div class="commit-eylemler">
                    ${webAdresi ? html`<button class="dugme dugme-sessiz dugme-kucuk" data-eylem="github" type="button">${simge('dis', 13)} GitHub’da aç</button>` : ''}
                    <button class="dugme dugme-sessiz dugme-kucuk ${d.mesgul ? 'yukleniyor' : ''}" data-eylem="tersine" type="button" ${d.mesgul ? 'disabled' : ''} title="Bu commit'in değişikliklerini geri alan yeni bir commit oluştur">${simge('geriAl', 13)} Tersine çevir</button>
                </div>
            </header>
            <div class="degisim-duzeni commit-duzeni">
                <div class="degisim-sol">
                    <div class="liste-baslik"><span>Değişen dosyalar</span></div>
                    <div class="degisim-listesi" data-kaydirma="commit-dosya">
                        ${a.dosyalar.length ? a.dosyalar.map((f, i) => {
                            const [harf, etiket] = DURUM[f.durum] || ['●', f.durum];
                            const toplam = (f.eklenen || 0) + (f.silinen || 0);
                            return html`<div class="degisim-satir ${d.secili === f ? 'secili' : ''}" data-eylem="dosya" data-sira="${i}" title="${f.eskiYol ? `${f.eskiYol} → ${f.yol}` : f.yol}">
                                <span class="dosya-yolu">${f.yol}</span>
                                ${f.eklenen == null ? html`<span class="commit-ikili">ikili</span>` : html`
                                    <span class="commit-cubuk" title="+${f.eklenen} −${f.silinen}">
                                        <i class="ekle" style="width:${Math.round(((f.eklenen || 0) / enCok) * 40)}px"></i><i class="sil" style="width:${Math.round(((f.silinen || 0) / enCok) * 40)}px"></i>
                                    </span>`}
                                <span class="durum-harf durum-${f.durum}" title="${etiket}${toplam ? ` · +${f.eklenen} −${f.silinen}` : ''}">${harf}</span>
                            </div>`;
                        }) : html`<p class="ipucu dal-bos">Bu commit’te dosya değişikliği yok.</p>`}
                    </div>
                </div>
                <div class="fark-paneli">
                    ${d.secili ? html`
                        <div class="fark-ust"><span class="dosya-yolu" title="${d.secili.yol}">${d.secili.eskiYol ? `${d.secili.eskiYol} → ` : ''}${d.secili.yol}</span></div>
                        <div class="fark" data-kaydirma="commit-fark">
                            ${d.farkYukleniyor ? html`<div class="fark-bos"><span class="donen"></span></div>`
                                : d.fark.split('\n').slice(0, 6000).map((s) => html`<div class="fs ${farkSatirSinifi(s)}">${s || ' '}</div>`)}
                        </div>` : html`<div class="fark-bos">${simge('dosya', 26)}<p>Farkı görmek için bir dosya seç.</p></div>`}
                </div>
            </div>`);
    }
}
