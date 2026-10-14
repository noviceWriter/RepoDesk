import { api } from '../lib/api.js';
import { bildir, modalAc } from '../lib/bilesen.js';
import { ciz, html } from '../lib/dom.js';
import { simge } from '../lib/simge.js';

const KAYNAK_ACIKLAMA = {
    depo: 'Bu ad yalnızca bu proje için ayarlanmış.',
    genel: 'Bu ad tüm projelerin için ayarlanmış (genel ayar).',
    sistem: 'Bu ad hiçbir yerde ayarlanmamış. Git onu bilgisayar hesabındaki addan, yani Linux’u kurarken yazdığın addan aldı.',
};

/**
 * Commit'lerde görünen ad ve e-postayı seçme penceresi.
 * @param {{kok?: string, sonra?: () => void}} [s]  kok verilirse “yalnızca bu proje” seçeneği de çıkar.
 */
export function kimlikModali({ kok = '', sonra } = {}) {
    let b = null;
    modalAc({
        ust: 'COMMIT KİMLİĞİ',
        baslik: 'Commit’lerinde hangi ad görünsün?',
        aciklama: 'Her commit’e bir ad ve e-posta yazılır; GitHub’a gönderdiğinde herkes bunları görebilir. Değişiklik yalnızca bundan sonraki commit’leri etkiler.',
        boyut: 'genis',
        gonderMetni: 'Kaydet',
        govde: html`<div data-kimlik class="kimlik-yukleniyor"><span class="donen"></span></div>`,
        async acilinca(kokEl) {
            const kap = kokEl.querySelector('[data-kimlik]');
            try {
                b = await api.kimlikBilgisi(kok || null);
            } catch (e) {
                kap.textContent = e.message;
                return;
            }
            const gizli = b.githubGizliEposta;
            const secenekler = [
                b.githubKullanici && { deger: 'kullanici', ikon: 'kullanici', baslik: `${b.githubKullanici}`, alt: `GitHub kullanıcı adın + gizli e-posta (${gizli})`, onerilen: true },
                b.githubAd && b.githubAd !== b.githubKullanici && { deger: 'profil', ikon: 'kullanici', baslik: b.githubAd, alt: `GitHub profilindeki ad + gizli e-posta` },
                { deger: 'ozel', ikon: 'kalem', baslik: 'Kendim yazacağım', alt: 'Ad ve e-postayı elle gir' },
                kok && (b.depoAd || b.depoEposta) && { deger: 'kaldir', ikon: 'geriAl', baslik: 'Bu projeye özel ayarı kaldır', alt: 'Tüm projeler için olan genel kimlik kullanılsın' },
            ].filter(Boolean);
            const ilk = secenekler[0].deger;
            ciz(kap, html`
                <div class="kimlik-simdi">
                    <p class="ust-baslik">ŞU AN COMMIT’LERDE GÖRÜNEN</p>
                    <p class="kimlik-ad"><strong>${b.gecerliAd || '(ayarlı değil)'}</strong> <code>${b.gecerliEposta ? `<${b.gecerliEposta}>` : ''}</code></p>
                    <small class="ipucu">${KAYNAK_ACIKLAMA[b.adKaynagi] || ''}</small>
                </div>
                <fieldset class="gorunurluk-secici"><legend>Yeni kimlik</legend>
                    ${secenekler.map((s) => html`
                        <label class="secenek-kart"><input type="radio" name="secim" value="${s.deger}" ${s.deger === ilk ? 'checked' : ''}>
                            <span class="secenek-ikon">${simge(s.ikon, 15)}</span>
                            <span><strong>${s.baslik}</strong>${s.onerilen ? html` <span class="rozet rozet-acik">Önerilen</span>` : ''}<small class="ipucu">${s.alt}</small></span></label>`)}
                </fieldset>
                <div class="kimlik-ozel" data-ozel hidden>
                    <label class="alan">Ad<input name="ad" value="${b.gecerliAd}" autocomplete="off" spellcheck="false"></label>
                    <label class="alan">E-posta<input name="eposta" value="${b.gecerliEposta}" autocomplete="off" spellcheck="false">
                        <small class="ipucu">Gerçek e-postanın görünmesini istemiyorsan GitHub’ın gizli adresini kullan: <code>${gizli || 'kullanici@users.noreply.github.com'}</code></small></label>
                </div>
                ${kok ? html`
                    <fieldset class="gorunurluk-secici" data-kapsam><legend>Nerede geçerli olsun?</legend>
                        <div class="tema-secici">
                            <label class="secenek-kart"><input type="radio" name="kapsam" value="genel" checked><span><strong>Tüm projelerimde</strong></span></label>
                            <label class="secenek-kart"><input type="radio" name="kapsam" value="depo"><span><strong>Sadece bu projede</strong></span></label>
                        </div>
                    </fieldset>` : html`<small class="ipucu">Bu ayar tüm projelerin için geçerli olur. Bir projeye özel kimlik için o projenin klasörüne sağ tıkla → “Commit kimliği”.</small>`}`);
            const guncelle = () => {
                const secim = kap.querySelector('[name="secim"]:checked')?.value;
                kap.querySelector('[data-ozel]').hidden = secim !== 'ozel';
                const kapsam = kap.querySelector('[data-kapsam]');
                if (kapsam) kapsam.hidden = secim === 'kaldir';
            };
            kap.addEventListener('change', guncelle);
            guncelle();
        },
        async gonder(kokEl) {
            if (!b) throw new Error('Kimlik bilgisi yüklenemedi.');
            const al = (ad) => kokEl.querySelector(`[name="${ad}"]`);
            const secim = kokEl.querySelector('[name="secim"]:checked')?.value;
            let kapsam = kok ? kokEl.querySelector('[name="kapsam"]:checked')?.value || 'genel' : 'genel';
            let ad = '';
            let eposta = '';
            if (secim === 'kullanici') { ad = b.githubKullanici; eposta = b.githubGizliEposta; }
            else if (secim === 'profil') { ad = b.githubAd; eposta = b.githubGizliEposta; }
            else if (secim === 'ozel') { ad = al('ad').value; eposta = al('eposta').value; }
            else if (secim === 'kaldir') kapsam = 'depo';
            bildir(await api.kimlikKaydet(kapsam, kok || null, ad, eposta), { tur: 'basari' });
            sonra?.();
        },
    });
}
