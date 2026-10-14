import { open } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import { api } from '../lib/api.js';
import { bildir, hataBildir, modalAc, onayla } from '../lib/bilesen.js';
import { boyutYaz, ciz, eylemler, goreliZaman, html, klasorAdi, tarihYaz } from '../lib/dom.js';
import { simge } from '../lib/simge.js';

const SEMVER = /^(v?)(\d+)\.(\d+)\.(\d+)$/;

/** Mevcut etiketlere bakarak bir sonraki yama / küçük / büyük sürümü önerir. */
export function sonrakiSurumler(adlar) {
    const surumler = adlar
        .map((a) => a.match(SEMVER))
        .filter(Boolean)
        .map((m) => ({ on: m[1], s: [Number(m[2]), Number(m[3]), Number(m[4])] }))
        .sort((a, b) => b.s[0] - a.s[0] || b.s[1] - a.s[1] || b.s[2] - a.s[2]);
    if (!surumler.length) return [['İlk sürüm', 'v1.0.0'], ['Erken sürüm', 'v0.1.0']];
    const { on, s: [b, k, y] } = surumler[0];
    return [['Yama', `${on}${b}.${k}.${y + 1}`], ['Küçük', `${on}${b}.${k + 1}.0`], ['Büyük', `${on}${b + 1}.0.0`]];
}

/**
 * @param {{url: string, ad: string}} repo
 * @param {null | {kok: string, bilgi: object, yenile: () => Promise<void>}} baglam  Repo yerelde açıksa
 */
export function surumlerModali(repo, baglam, { sekme = 'release' } = {}) {
    const d = { sekme, releaseler: null, etiketler: null, hata: '', acik: '', ayrintilar: {}, gorunum: 'liste', taslakEtiket: '', dosyalar: [], mesgul: '' };
    let govde;
    let sira = 0;

    modalAc({
        ust: 'SÜRÜMLER',
        baslik: repo.ad,
        aciklama: 'Release’ler ve etiketler (tag)',
        boyut: 'tam',
        govde: html`<div class="istek-govde" data-surum></div>`,
        acilinca(kok) {
            govde = kok.querySelector('[data-surum]');
            eylemler(govde, 'click', {
                sekme: (el) => { Object.assign(d, { sekme: el.dataset.sekme, gorunum: 'liste' }); yukle(); },
                ac: (el) => openUrl(el.dataset.url),
                genislet: (el) => genislet(el.dataset.etiket),
                yeniRelease: (el) => { Object.assign(d, { gorunum: 'yeniRelease', taslakEtiket: el.dataset.etiket || '', dosyalar: [] }); ciz_(); },
                yeniEtiket: () => { d.gorunum = 'yeniEtiket'; ciz_(); },
                vazgec: () => { d.gorunum = 'liste'; ciz_(); },
                oneri: (el) => { const g = govde.querySelector('[name="etiket"]'); g.value = el.dataset.deger; g.focus(); },
                dosyaEkle: () => dosyaEkle(),
                dosyaCikar: (el) => { d.dosyalar.splice(Number(el.dataset.sira), 1); dosyaListesiCiz(); },
                gonderRelease: () => releaseGonder(),
                gonderEtiket: () => etiketGonder(),
                releaseSil: (el) => releaseSil(el.dataset.etiket),
                etiketPush: (el) => calistir(`push-${el.dataset.etiket}`, () => api.etiketGonder(baglam.kok, el.dataset.etiket)),
                etiketSil: (el) => etiketSil(el.dataset.etiket, el.dataset.uzakta === '1'),
                tekrar: () => yukle(),
            });
            yukle();
        },
    });

    async function yukle() {
        const no = ++sira;
        d.hata = '';
        ciz_();
        try {
            const [releaseler, etiketler] = await Promise.all([
                api.releaseListele(repo.url),
                baglam ? api.etiketListele(baglam.kok).catch(() => []) : Promise.resolve(null),
            ]);
            if (no !== sira) return;
            d.releaseler = releaseler;
            d.etiketler = etiketler;
        } catch (e) {
            if (no === sira) d.hata = e.message;
        }
        if (no === sira) ciz_();
    }

    async function calistir(ad, fn) {
        if (d.mesgul) return false;
        d.mesgul = ad;
        const dugme = d.gorunum === 'liste' ? null : govde.querySelector('[data-eylem^="gonder"]');
        if (dugme) { dugme.disabled = true; dugme.classList.add('yukleniyor'); } else ciz_();
        let tamam = false;
        try {
            const sonuc = await fn();
            if (typeof sonuc === 'string' && sonuc && !sonuc.startsWith('http')) bildir(sonuc, { tur: 'basari' });
            tamam = true;
        } catch (e) {
            hataBildir(e);
        }
        d.mesgul = '';
        if (dugme?.isConnected && !tamam) { dugme.disabled = false; dugme.classList.remove('yukleniyor'); }
        if (tamam) { d.gorunum = 'liste'; await yukle(); } else if (!dugme) ciz_();
        return tamam;
    }

    async function genislet(etiket) {
        d.acik = d.acik === etiket ? '' : etiket;
        ciz_();
        if (d.acik && !d.ayrintilar[etiket]) {
            try {
                d.ayrintilar[etiket] = await api.releaseAyrinti(repo.url, etiket);
            } catch (e) {
                d.ayrintilar[etiket] = { hata: e.message };
            }
            ciz_();
        }
    }

    async function dosyaEkle() {
        const secim = await open({ multiple: true, directory: false, title: 'Release’e eklenecek dosyalar' });
        const liste = Array.isArray(secim) ? secim : typeof secim === 'string' ? [secim] : [];
        for (const yol of liste) if (!d.dosyalar.includes(yol)) d.dosyalar.push(yol);
        dosyaListesiCiz();
    }

    function dosyaListesiCiz() {
        const kap = govde.querySelector('[data-dosyalar]');
        if (!kap) return;
        ciz(kap, d.dosyalar.length
            ? d.dosyalar.map((yol, i) => html`<span class="cip">${simge('dosya', 12)} ${klasorAdi(yol)}
                <span class="cip-sil" data-eylem="dosyaCikar" data-sira="${i}" role="button" aria-label="Çıkar">${simge('carpi', 11)}</span></span>`)
            : html`<span class="ipucu">Dosya eklenmedi (APK, zip, kurulum dosyası vb. ekleyebilirsin).</span>`);
    }

    function releaseGonder() {
        const al = (ad) => govde.querySelector(`[name="${ad}"]`);
        const etiket = al('etiket').value.trim();
        if (!etiket) { bildir('Etiket (sürüm numarası) gerekli.', { tur: 'hata' }); al('etiket').focus(); return; }
        calistir('gonder', async () => {
            const url = await api.releaseOlustur({
                repo: repo.url,
                etiket,
                baslik: al('baslik').value,
                notlar: al('notlar').value,
                otomatikNot: al('otomatikNot').checked,
                taslak: al('taslak').checked,
                onSurum: al('onSurum').checked,
                hedef: al('hedef').value || null,
                dosyalar: d.dosyalar,
            });
            bildir(`${etiket} ${al('taslak').checked ? 'taslak olarak kaydedildi' : 'yayınlandı'}.`, { tur: 'basari', eylem: url.startsWith('http') ? { metin: "GitHub'da aç", fn: () => openUrl(url) } : null });
            if (baglam) await api.uzakGuncelle(baglam.kok).catch(() => {});
        });
    }

    function etiketGonder() {
        const al = (ad) => govde.querySelector(`[name="${ad}"]`);
        const ad = al('etiket').value.trim();
        if (!ad) { bildir('Etiket adı gerekli.', { tur: 'hata' }); return; }
        const gonder = al('gonder').checked;
        calistir('gonder', async () => {
            const sonuc = await api.etiketOlustur(baglam.kok, ad, al('mesaj').value, al('hedef').value || null);
            if (!gonder) return sonuc;
            await api.etiketGonder(baglam.kok, ad);
            return `'${ad}' oluşturuldu ve GitHub'a gönderildi.`;
        });
    }

    async function releaseSil(etiket) {
        const tamam = await onayla(`“${etiket}” release’i silinsin mi? Eklenmiş dosyalar da silinir.\n\nEtiketin kendisi (kod sürümü) korunur.`, { baslik: 'Release’i sil', tamam: 'Sil', tehlikeli: true });
        if (tamam) calistir(`sil-${etiket}`, () => api.releaseSil(repo.url, etiket, false));
    }

    async function etiketSil(ad, uzakta) {
        const metin = uzakta
            ? `“${ad}” etiketi silinsin mi?\n\nGitHub'da da var; oradan da silinecek. Bu etikete bağlı bir release varsa taslağa döner.`
            : `“${ad}” etiketi bilgisayarından silinsin mi?`;
        if (await onayla(metin, { baslik: 'Etiketi sil', tamam: 'Sil', tehlikeli: true })) {
            calistir(`esil-${ad}`, () => api.etiketSil(baglam.kok, ad, uzakta));
        }
    }

    // ---------- Çizim ----------

    function releaseSatiri(r) {
        const acik = d.acik === r.tagName;
        const a = d.ayrintilar[r.tagName];
        return html`<div class="surum-satir ${acik ? 'acik' : ''}">
            <div class="surum-ust" data-eylem="genislet" data-etiket="${r.tagName}" role="button" tabindex="0">
                <span class="istek-ikon ${r.isDraft ? 'durum-taslak' : 'durum-open'}">${simge('etiket', 16)}</span>
                <div class="istek-bilgi">
                    <strong class="surum-ad">${r.name || r.tagName}</strong>
                    <div class="istek-meta">
                        <span class="istek-dal">${simge('etiket', 11)} ${r.tagName}</span>
                        ${r.isLatest ? html`<span class="rozet rozet-yesil">En son</span>` : ''}
                        ${r.isDraft ? html`<span class="rozet">Taslak</span>` : ''}
                        ${r.isPrerelease ? html`<span class="rozet rozet-amber">Ön sürüm</span>` : ''}
                        <span title="${tarihYaz(r.publishedAt || r.createdAt)}">${goreliZaman(r.publishedAt || r.createdAt)}</span>
                    </div>
                </div>
                ${simge(acik ? 'acilir' : 'sag', 14)}
            </div>
            ${acik ? html`<div class="surum-ayrinti">
                ${!a ? html`<div class="fark-bos"><span class="donen"></span></div>` : a.hata ? html`<p class="form-hata">${a.hata}</p>` : html`
                    ${a.body ? html`<pre class="surum-notlar">${a.body}</pre>` : html`<p class="ipucu">Not yazılmamış.</p>`}
                    ${a.assets.length ? html`<div class="surum-dosyalar">${a.assets.map((f) => html`
                        <button class="surum-dosya" data-eylem="ac" data-url="${f.url}" type="button" title="İndir">
                            ${simge('indir', 13)} <span>${f.name}</span><small>${boyutYaz(f.size)} · ${f.downloadCount} indirme</small>
                        </button>`)}</div>` : ''}
                    <div class="surum-eylemler">
                        <button class="dugme dugme-sessiz dugme-kucuk" data-eylem="ac" data-url="${a.url}" type="button">${simge('dis', 13)} GitHub’da aç</button>
                        <button class="dugme dugme-sessiz dugme-kucuk tehlike-metin ${d.mesgul === `sil-${r.tagName}` ? 'yukleniyor' : ''}" data-eylem="releaseSil" data-etiket="${r.tagName}" type="button" ${d.mesgul ? 'disabled' : ''}>${simge('cop', 13)} Sil</button>
                    </div>`}
            </div>` : ''}
        </div>`;
    }

    function etiketSatiri(e) {
        const releaseVar = d.releaseler?.some((r) => r.tagName === e.ad);
        return html`<div class="surum-satir"><div class="surum-ust">
            <span class="istek-ikon ${e.uzakta ? 'durum-open' : 'durum-taslak'}">${simge('etiket', 16)}</span>
            <div class="istek-bilgi">
                <strong class="surum-ad mono">${e.ad}</strong>
                <div class="istek-meta">
                    <span class="hash">${e.commit}</span>
                    ${e.mesaj ? html`<span>${e.mesaj}</span>` : ''}
                    <span title="${tarihYaz(e.tarih)}">${goreliZaman(e.tarih)}</span>
                    ${e.uzakta === true ? html`<span class="rozet rozet-yesil">GitHub’da</span>` : e.uzakta === false ? html`<span class="rozet rozet-amber">Yalnızca yerel</span>` : ''}
                    ${releaseVar ? html`<span class="rozet rozet-acik">Release var</span>` : ''}
                </div>
            </div>
            <div class="istek-eylemler">
                ${e.uzakta === false ? html`<button class="dugme dugme-sessiz dugme-kucuk ${d.mesgul === `push-${e.ad}` ? 'yukleniyor' : ''}" data-eylem="etiketPush" data-etiket="${e.ad}" type="button" ${d.mesgul ? 'disabled' : ''}>${simge('yukari', 13)} Gönder</button>` : ''}
                ${releaseVar ? '' : html`<button class="dugme dugme-sessiz dugme-kucuk" data-eylem="yeniRelease" data-etiket="${e.ad}" type="button">${simge('arti', 13)} Release yap</button>`}
                <button class="ikon-dugme tehlike" data-eylem="etiketSil" data-etiket="${e.ad}" data-uzakta="${e.uzakta ? '1' : '0'}" type="button" title="Sil" aria-label="Sil" ${d.mesgul ? 'disabled' : ''}>${simge('cop', 14)}</button>
            </div>
        </div></div>`;
    }

    function tumEtiketAdlari() {
        return [...new Set([...(d.releaseler || []).map((r) => r.tagName), ...(d.etiketler || []).map((e) => e.ad)])];
    }

    function oneriler() {
        return html`<div class="surum-oneriler">${sonrakiSurumler(tumEtiketAdlari()).map(([ad, deger]) => html`
            <button class="cip" data-eylem="oneri" data-deger="${deger}" type="button">${ad}: <strong>${deger}</strong></button>`)}</div>`;
    }

    function yeniReleaseFormu() {
        const varsayilan = d.taslakEtiket || sonrakiSurumler(tumEtiketAdlari())[0][1];
        const etiketYerelde = d.etiketler?.some((e) => e.ad === d.taslakEtiket);
        return html`<div class="istek-form">
            <h3>${simge('etiket', 16)} Yeni release</h3>
            <label class="alan">Etiket (sürüm numarası)<input name="etiket" value="${varsayilan}" spellcheck="false" autocomplete="off" autofocus></label>
            ${d.taslakEtiket ? '' : oneriler()}
            ${d.taslakEtiket && etiketYerelde && !d.etiketler.find((e) => e.ad === d.taslakEtiket).uzakta
                ? html`<p class="uyari-kutusu">${simge('uyari', 14)} Bu etiket henüz GitHub’da değil; GitHub yeni bir etiket oluşturur. Önce “Gönder” ile etiketi göndermen önerilir.</p>` : ''}
            <label class="alan">Başlık <span class="istege-bagli">boşsa etiket adı kullanılır</span><input name="baslik" placeholder="${varsayilan}" autocomplete="off"></label>
            <label class="alan">Sürüm notları <span class="istege-bagli">Markdown desteklenir</span><textarea name="notlar" rows="7" placeholder="Bu sürümde neler değişti?"></textarea></label>
            <div class="surum-secenekler">
                <label class="onay-kutusu"><input type="checkbox" name="otomatikNot" checked> Notları commit’lerden otomatik ekle</label>
                <label class="onay-kutusu"><input type="checkbox" name="onSurum"> Ön sürüm (beta)</label>
                <label class="onay-kutusu"><input type="checkbox" name="taslak"> Taslak olarak kaydet</label>
            </div>
            <label class="alan">Hedef dal <span class="istege-bagli">etiket yoksa buradan oluşturulur; boşsa varsayılan dal</span>
                <input name="hedef" value="${baglam?.bilgi.dal || ''}" placeholder="main" spellcheck="false"></label>
            <div class="alan">Ekli dosyalar
                <div class="surum-dosya-secimi"><div class="cip-grubu" data-dosyalar></div>
                <button class="dugme dugme-sessiz dugme-kucuk" data-eylem="dosyaEkle" type="button">${simge('arti', 13)} Dosya ekle</button></div>
            </div>
            <div class="istek-form-alt">
                <button class="dugme dugme-sessiz" data-eylem="vazgec" type="button">Vazgeç</button>
                <button class="dugme" data-eylem="gonderRelease" type="button">${simge('yukari', 14)} Yayınla</button>
            </div>
        </div>`;
    }

    function yeniEtiketFormu() {
        return html`<div class="istek-form">
            <h3>${simge('etiket', 16)} Yeni etiket</h3>
            <p class="ipucu">Etiket, kodun belirli bir anını kalıcı olarak işaretler (ör. v1.2.0). Release yapmadan da kullanılabilir.</p>
            <label class="alan">Etiket adı<input name="etiket" value="${sonrakiSurumler(tumEtiketAdlari())[0][1]}" spellcheck="false" autocomplete="off" autofocus></label>
            ${oneriler()}
            <label class="alan">Açıklama <span class="istege-bagli">boşsa hafif etiket olur</span><input name="mesaj" placeholder="Bu sürümün kısa açıklaması" autocomplete="off"></label>
            <label class="alan">Hangi commit? <span class="istege-bagli">boşsa en son commit (HEAD)</span><input name="hedef" placeholder="HEAD veya commit kimliği" spellcheck="false"></label>
            <label class="onay-kutusu"><input type="checkbox" name="gonder" ${baglam?.bilgi.origin ? 'checked' : 'disabled'}> Oluşturunca GitHub’a da gönder</label>
            <div class="istek-form-alt">
                <button class="dugme dugme-sessiz" data-eylem="vazgec" type="button">Vazgeç</button>
                <button class="dugme" data-eylem="gonderEtiket" type="button">Etiket oluştur</button>
            </div>
        </div>`;
    }

    function ciz_() {
        if (!govde?.isConnected) return;
        if (d.gorunum === 'yeniRelease') { ciz(govde, yeniReleaseFormu()); dosyaListesiCiz(); govde.querySelector('[autofocus]')?.focus(); return; }
        if (d.gorunum === 'yeniEtiket') { ciz(govde, yeniEtiketFormu()); govde.querySelector('[autofocus]')?.focus(); return; }
        const ust = html`<div class="istek-ust">
            <nav class="sekmeler sekmeler-sade" role="tablist">
                <button class="sekme ${d.sekme === 'release' ? 'aktif' : ''}" data-eylem="sekme" data-sekme="release" type="button" role="tab">${simge('etiket', 14)} Release’ler ${d.releaseler ? html`<span>${d.releaseler.length}</span>` : ''}</button>
                ${baglam ? html`<button class="sekme ${d.sekme === 'etiket' ? 'aktif' : ''}" data-eylem="sekme" data-sekme="etiket" type="button" role="tab">${simge('dal', 14)} Etiketler ${d.etiketler ? html`<span>${d.etiketler.length}</span>` : ''}</button>` : ''}
            </nav>
            <div class="istek-arac">
                ${d.sekme === 'etiket'
                    ? html`<button class="dugme" data-eylem="yeniEtiket" type="button" ${baglam?.bilgi.commitVar ? '' : 'disabled'}>${simge('arti', 14)} Yeni etiket</button>`
                    : html`<button class="dugme" data-eylem="yeniRelease" type="button">${simge('arti', 14)} Yeni release</button>`}
            </div>
        </div>
        ${!baglam ? html`<p class="ipucu">Etiketleri yönetmek için repoyu çalışma alanında aç.</p>` : ''}`;
        if (d.hata) {
            ciz(govde, html`${ust}<div class="bos bos-kucuk"><span class="bos-ikon">${simge('uyari', 22)}</span><p>${d.hata}</p>
                <button class="dugme dugme-sessiz" data-eylem="tekrar" type="button">${simge('yenile', 14)} Tekrar dene</button></div>`);
            return;
        }
        const liste = d.sekme === 'etiket' ? d.etiketler : d.releaseler;
        if (!liste) { ciz(govde, html`${ust}<div class="fark-bos"><span class="donen"></span></div>`); return; }
        if (!liste.length) {
            ciz(govde, html`${ust}<div class="bos bos-kucuk"><span class="bos-ikon">${simge('etiket', 22)}</span>
                <h3>${d.sekme === 'etiket' ? 'Henüz etiket yok' : 'Henüz release yok'}</h3>
                <p>${d.sekme === 'etiket' ? 'Kodun önemli anlarını (ör. v1.0.0) etiketleyerek işaretle.' : 'Bir sürüm yayınlayarak kullanıcılarına indirilebilir dosyalar ve notlar sun.'}</p></div>`);
            return;
        }
        ciz(govde, html`${ust}<div class="istek-listesi" data-kaydirma="surum">${liste.map(d.sekme === 'etiket' ? etiketSatiri : releaseSatiri)}</div>`);
    }
}
