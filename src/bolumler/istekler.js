import { openUrl } from '@tauri-apps/plugin-opener';
import { api } from '../lib/api.js';
import { bildir, hataBildir, modalAc, onayla } from '../lib/bilesen.js';
import { ciz, eylemler, goreliZaman, html, tarihYaz } from '../lib/dom.js';
import { simge } from '../lib/simge.js';

const DURUMLAR = {
    pr: [['open', 'Açık'], ['merged', 'Birleşmiş'], ['closed', 'Kapalı'], ['all', 'Tümü']],
    issue: [['open', 'Açık'], ['closed', 'Kapalı'], ['all', 'Tümü']],
};

const INCELEME = {
    APPROVED: ['Onaylandı', 'yesil'],
    CHANGES_REQUESTED: ['Değişiklik istendi', 'kirmizi'],
    REVIEW_REQUIRED: ['İnceleme bekliyor', 'amber'],
};

function durumSinifi(i, tur) {
    if (tur === 'pr' && i.taslak && i.durum === 'open') return 'taslak';
    return i.durum; // open | closed | merged
}

function etiketRengi(hex) {
    const renk = /^[0-9a-f]{6}$/i.test(hex) ? `#${hex}` : 'var(--metin-3)';
    return `--etiket:${renk}`;
}

/**
 * Bir reponun Pull Request ve Issue listesi.
 * @param {{url: string, ad: string}} repo
 * @param {null | {kok: string, bilgi: object, yenile: () => Promise<void>}} baglam  Repo yerelde açıksa
 */
export function isteklerModali(repo, baglam, { sekme = 'pr' } = {}) {
    const d = { sekme, durum: 'open', liste: null, hata: '', gorunum: 'liste', mesgul: '' };
    let govde;
    let istekNo = 0;

    modalAc({
        ust: 'GITHUB',
        baslik: repo.ad,
        aciklama: 'Pull Request’ler ve Issue’lar',
        boyut: 'tam',
        govde: html`<div class="istek-govde" data-istekler></div>`,
        acilinca(kok) {
            govde = kok.querySelector('[data-istekler]');
            eylemler(govde, 'click', {
                sekme: (el) => { Object.assign(d, { sekme: el.dataset.sekme, durum: 'open', gorunum: 'liste' }); yukle(); },
                ac: (el) => openUrl(el.dataset.url),
                yeni: () => { d.gorunum = d.sekme === 'pr' ? 'yeniPr' : 'yeniIssue'; ciz_(); },
                vazgec: () => { d.gorunum = 'liste'; ciz_(); },
                gonderIssue: () => issueGonder(),
                gonderPr: () => prGonder(),
                issueDurum: (el) => issueDurum(Number(el.dataset.no), el.dataset.kapat === '1'),
                prBirlestir: (el) => prBirlestirModali(Number(el.dataset.no)),
                prYerel: (el) => prYerel(Number(el.dataset.no)),
                tekrar: () => yukle(),
            });
            govde.addEventListener('change', (e) => {
                if (e.target.id === 'istek-durum') { d.durum = e.target.value; yukle(); }
            });
            yukle();
        },
    });

    async function yukle() {
        const no = ++istekNo;
        d.liste = null;
        d.hata = '';
        ciz_();
        try {
            const liste = await api.istekler(repo.url, d.sekme, d.durum);
            if (no === istekNo) d.liste = liste;
        } catch (e) {
            if (no === istekNo) d.hata = e.message;
        }
        if (no === istekNo) ciz_();
    }

    async function calistir(ad, fn) {
        if (d.mesgul) return false;
        d.mesgul = ad;
        // Formdayken yeniden çizmek yazılanları siler; yalnızca gönder düğmesini kilitle.
        const dugme = d.gorunum === 'liste' ? null : govde.querySelector('[data-eylem^="gonder"]');
        if (dugme) { dugme.disabled = true; dugme.classList.add('yukleniyor'); } else ciz_();
        try {
            await fn();
            return true;
        } catch (e) {
            hataBildir(e);
            return false;
        } finally {
            d.mesgul = '';
            if (dugme?.isConnected && d.gorunum !== 'liste') { dugme.disabled = false; dugme.classList.remove('yukleniyor'); } else ciz_();
        }
    }

    async function issueGonder() {
        const baslik = govde.querySelector('[name="baslik"]').value;
        const icerik = govde.querySelector('[name="govde"]').value;
        await calistir('gonder', async () => {
            const url = await api.issueOlustur(repo.url, baslik, icerik);
            bildir('Issue oluşturuldu.', { tur: 'basari', eylem: url ? { metin: "GitHub'da aç", fn: () => openUrl(url) } : null });
            d.gorunum = 'liste';
            d.durum = 'open';
        }) && yukle();
    }

    async function prGonder() {
        const al = (ad) => govde.querySelector(`[name="${ad}"]`);
        await calistir('gonder', async () => {
            const url = await api.prOlustur(baglam.kok, {
                baslik: al('baslik').value,
                govde: al('govde').value,
                hedef: al('hedef').value,
                taslak: al('taslak').checked,
            });
            bildir('Pull Request açıldı.', { tur: 'basari', eylem: url ? { metin: "GitHub'da aç", fn: () => openUrl(url) } : null });
            d.gorunum = 'liste';
            d.durum = 'open';
            await baglam.yenile();
        }) && yukle();
    }

    async function issueDurum(no, kapat) {
        if (kapat && !(await onayla(`#${no} kapatılsın mı?`, { baslik: 'Issue’yu kapat', tamam: 'Kapat' }))) return;
        await calistir(`durum-${no}`, async () => bildir(await api.issueDurum(repo.url, no, kapat), { tur: 'basari' })) && yukle();
    }

    async function prYerel(no) {
        await calistir(`yerel-${no}`, async () => {
            bildir(await api.prYereldeAc(baglam.kok, no), { tur: 'basari' });
            await baglam.yenile();
        });
    }

    function prBirlestirModali(no) {
        const pr = d.liste.find((i) => i.numara === no);
        modalAc({
            ust: `PR #${no}`,
            baslik: 'Pull Request’i birleştir',
            aciklama: `“${pr.baslik}” — ${pr.kaynakDal} → ${pr.hedefDal}`,
            gonderMetni: 'Birleştir',
            govde: html`
                <fieldset class="gorunurluk-secici"><legend>Birleştirme yöntemi</legend>
                    ${[
                        ['merge', 'birlestir', 'Merge commit', 'Tüm commit’ler korunur, bir birleştirme commit’i eklenir.'],
                        ['squash', 'tik', 'Squash', 'Tüm commit’ler tek bir commit’e sıkıştırılır.'],
                        ['rebase', 'dal', 'Rebase', 'Commit’ler hedef dalın üstüne tek tek eklenir.'],
                    ].map(([deger, ikon, ad, aciklama], i) => html`
                        <label class="secenek-kart">
                            <input type="radio" name="yontem" value="${deger}" ${i === 0 ? 'checked' : ''}>
                            <span class="secenek-ikon">${simge(ikon, 16)}</span>
                            <span><strong>${ad}</strong><small>${aciklama}</small></span>
                        </label>`)}
                </fieldset>
                <label class="onay-kutusu"><input type="checkbox" name="dalSil" checked> Birleştirdikten sonra “${pr.kaynakDal}” dalını sil</label>`,
            async gonder(kok) {
                const yontem = kok.querySelector('[name="yontem"]:checked').value;
                bildir(await api.prBirlestir(repo.url, no, yontem, kok.querySelector('[name="dalSil"]').checked), { tur: 'basari' });
                if (baglam) await baglam.yenile();
                yukle();
            },
        });
    }

    function satir(i) {
        const tur = d.sekme;
        const sinif = durumSinifi(i, tur);
        const inceleme = tur === 'pr' && i.durum === 'open' && INCELEME[i.inceleme];
        const mesgul = d.mesgul !== '';
        return html`
            <div class="istek-satir">
                <span class="istek-ikon durum-${sinif}" title="${sinif}">${simge(tur === 'pr' ? (i.durum === 'merged' ? 'birlestir' : 'pr') : (i.durum === 'closed' ? 'tik' : 'issue'), 16)}</span>
                <div class="istek-bilgi">
                    <button class="istek-baslik" data-eylem="ac" data-url="${i.url}" type="button" title="GitHub'da aç">${i.baslik}</button>
                    <div class="istek-meta">
                        <span>#${i.numara} · ${i.yazar || 'bilinmiyor'} · <span title="${tarihYaz(i.olusturma)}">${goreliZaman(i.guncelleme || i.olusturma)}</span></span>
                        ${tur === 'pr' && i.kaynakDal ? html`<span class="istek-dal">${simge('dal', 11)} ${i.kaynakDal} → ${i.hedefDal}</span>` : ''}
                        ${tur === 'pr' && i.taslak ? html`<span class="rozet">Taslak</span>` : ''}
                        ${inceleme ? html`<span class="rozet rozet-${inceleme[1]}">${inceleme[0]}</span>` : ''}
                        ${i.etiketler.map((e) => html`<span class="istek-etiket" style="${etiketRengi(e.renk)}">${e.ad}</span>`)}
                    </div>
                </div>
                <div class="istek-eylemler">
                    ${tur === 'pr' && i.durum === 'open' ? html`
                        ${baglam ? html`<button class="dugme dugme-sessiz dugme-kucuk ${d.mesgul === `yerel-${i.numara}` ? 'yukleniyor' : ''}" data-eylem="prYerel" data-no="${i.numara}" type="button" title="Bu PR'ın dalını bilgisayarında aç" ${mesgul ? 'disabled' : ''}>${simge('indir', 13)} Yerelde aç</button>` : ''}
                        <button class="dugme dugme-kucuk" data-eylem="prBirlestir" data-no="${i.numara}" type="button" ${mesgul || i.taslak ? 'disabled' : ''} title="${i.taslak ? 'Taslak PR birleştirilemez' : 'Birleştir'}">${simge('birlestir', 13)} Birleştir</button>` : ''}
                    ${tur === 'issue' ? html`
                        <button class="dugme dugme-sessiz dugme-kucuk ${d.mesgul === `durum-${i.numara}` ? 'yukleniyor' : ''}" data-eylem="issueDurum" data-no="${i.numara}" data-kapat="${i.durum === 'open' ? '1' : '0'}" type="button" ${mesgul ? 'disabled' : ''}>
                            ${i.durum === 'open' ? html`${simge('tik', 13)} Kapat` : html`${simge('geriAl', 13)} Yeniden aç`}
                        </button>` : ''}
                    <button class="ikon-dugme" data-eylem="ac" data-url="${i.url}" type="button" title="GitHub'da aç" aria-label="GitHub'da aç">${simge('dis', 15)}</button>
                </div>
            </div>`;
    }

    function liste() {
        if (d.hata) {
            return html`<div class="bos bos-kucuk"><span class="bos-ikon">${simge('uyari', 22)}</span><p>${d.hata}</p>
                <button class="dugme dugme-sessiz" data-eylem="tekrar" type="button">${simge('yenile', 14)} Tekrar dene</button></div>`;
        }
        if (!d.liste) return html`<div class="fark-bos"><span class="donen"></span></div>`;
        if (!d.liste.length) {
            const ad = d.sekme === 'pr' ? 'Pull Request' : 'Issue';
            return html`<div class="bos bos-kucuk"><span class="bos-ikon">${simge(d.sekme === 'pr' ? 'pr' : 'issue', 22)}</span>
                <h3>${d.durum === 'open' ? `Açık ${ad} yok` : `Bu filtrede ${ad} yok`}</h3></div>`;
        }
        return html`<div class="istek-listesi" data-kaydirma="istek">${d.liste.map(satir)}</div>`;
    }

    function yeniIssueFormu() {
        return html`<div class="istek-form">
            <h3>${simge('issue', 16)} Yeni issue</h3>
            <label class="alan">Başlık<input name="baslik" placeholder="Kısaca sorun ya da öneri" autocomplete="off" autofocus></label>
            <label class="alan">Açıklama <span class="istege-bagli">Markdown desteklenir</span><textarea name="govde" rows="9" placeholder="Ne oldu? Ne bekliyordun? Nasıl tekrar edilir?"></textarea></label>
            <div class="istek-form-alt">
                <button class="dugme dugme-sessiz" data-eylem="vazgec" type="button">Vazgeç</button>
                <button class="dugme ${d.mesgul === 'gonder' ? 'yukleniyor' : ''}" data-eylem="gonderIssue" type="button" ${d.mesgul ? 'disabled' : ''}>Issue oluştur</button>
            </div>
        </div>`;
    }

    function yeniPrFormu() {
        const b = baglam.bilgi;
        const sonCommit = b.gecmis[0]?.mesaj || '';
        return html`<div class="istek-form">
            <h3>${simge('pr', 16)} Yeni Pull Request</h3>
            <p class="ipucu pr-yon">${simge('dal', 13)} <strong>${b.dal}</strong> dalındaki değişiklikler → <input name="hedef" value="" placeholder="hedef dal" spellcheck="false" data-hedef> dalına</p>
            <p class="uyari-kutusu" data-ayni-dal hidden>${simge('uyari', 14)} <span>PR, bir daldan başka bir dala açılır. Şu an hedefle aynı daldasın: önce “Dallar” penceresinden yeni bir dal oluşturup değişikliklerini orada commit et.</span></p>
            ${b.upstream && !b.ileri ? '' : html`<p class="ipucu">Dal önce GitHub’a gönderilecek (push).</p>`}
            ${b.degisiklikler.length ? html`<p class="uyari-kutusu">${simge('uyari', 14)} Commit edilmemiş ${b.degisiklikler.length} değişikliğin var; bunlar PR’a dahil olmaz.</p>` : ''}
            <label class="alan">Başlık<input name="baslik" value="${sonCommit}" autocomplete="off" autofocus></label>
            <label class="alan">Açıklama <span class="istege-bagli">Markdown desteklenir</span><textarea name="govde" rows="8" placeholder="Bu PR ne değiştiriyor ve neden?"></textarea></label>
            <label class="onay-kutusu"><input type="checkbox" name="taslak"> Taslak olarak aç (henüz incelemeye hazır değil)</label>
            <div class="istek-form-alt">
                <button class="dugme dugme-sessiz" data-eylem="vazgec" type="button">Vazgeç</button>
                <button class="dugme ${d.mesgul === 'gonder' ? 'yukleniyor' : ''}" data-eylem="gonderPr" type="button" ${d.mesgul ? 'disabled' : ''}>Pull Request aç</button>
            </div>
        </div>`;
    }

    function ciz_() {
        if (!govde?.isConnected) return;
        const prAcilabilir = baglam && baglam.bilgi.dal && baglam.bilgi.commitVar;
        const ustCubuk = html`
            <div class="istek-ust">
                <nav class="sekmeler sekmeler-sade" role="tablist">
                    <button class="sekme ${d.sekme === 'pr' ? 'aktif' : ''}" data-eylem="sekme" data-sekme="pr" type="button" role="tab">${simge('pr', 14)} Pull Request’ler</button>
                    <button class="sekme ${d.sekme === 'issue' ? 'aktif' : ''}" data-eylem="sekme" data-sekme="issue" type="button" role="tab">${simge('issue', 14)} Issue’lar</button>
                </nav>
                <div class="istek-arac">
                    <select id="istek-durum" aria-label="Durum">${DURUMLAR[d.sekme].map(([v, ad]) => html`<option value="${v}" ${v === d.durum ? 'selected' : ''}>${ad}</option>`)}</select>
                    ${d.sekme === 'issue'
                        ? html`<button class="dugme" data-eylem="yeni" type="button">${simge('arti', 14)} Yeni issue</button>`
                        : html`<button class="dugme" data-eylem="yeni" type="button" ${prAcilabilir ? '' : 'disabled'} title="${prAcilabilir ? '' : 'PR açmak için repoyu çalışma alanında açmalısın'}">${simge('arti', 14)} ${baglam?.bilgi.dal ? `“${baglam.bilgi.dal}” dalından PR aç` : 'PR aç'}</button>`}
                </div>
            </div>
            ${d.sekme === 'pr' && !baglam ? html`<p class="ipucu">PR açmak ve PR’ları yerelde incelemek için bu repoyu çalışma alanında aç.</p>` : ''}`;
        const icerik = d.gorunum === 'yeniIssue' ? yeniIssueFormu() : d.gorunum === 'yeniPr' ? yeniPrFormu() : liste();
        ciz(govde, html`${d.gorunum === 'liste' ? ustCubuk : ''}${icerik}`);
        if (d.gorunum === 'yeniPr') {
            const hedef = govde.querySelector('[data-hedef]');
            const uyari = govde.querySelector('[data-ayni-dal]');
            const gonder = govde.querySelector('[data-eylem="gonderPr"]');
            const denetle = () => {
                const ayni = hedef.value.trim() === baglam.bilgi.dal;
                uyari.hidden = !ayni;
                gonder.disabled = ayni;
            };
            hedef.addEventListener('input', denetle);
            const doldur = (ad) => { if (!hedef.value) hedef.value = ad || 'main'; denetle(); };
            api.varsayilanDal(repo.url).then(doldur).catch(() => doldur('main'));
        }
        if (d.gorunum !== 'liste') govde.querySelector('[autofocus]')?.focus();
    }
}
