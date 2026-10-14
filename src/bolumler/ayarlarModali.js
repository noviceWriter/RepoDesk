import { getVersion } from '@tauri-apps/api/app';
import { openUrl } from '@tauri-apps/plugin-opener';
import { api } from '../lib/api.js';
import { bildir, hataBildir, modalAc, onayla } from '../lib/bilesen.js';
import { html, panoyaKopyala } from '../lib/dom.js';
import { simge } from '../lib/simge.js';
import { ayarlar } from '../ayarlar.js';
import { kimlikModali } from './kimlik.js';

/** Yeni sürüm bildirimi: varsa doğrudan .deb / .AppImage bağlantısı, yoksa release sayfası. */
export function guncellemeBildir(g) {
    const hedef = g.debUrl || g.appimageUrl || g.url;
    bildir(`RepoDesk ${g.surum} çıktı (şu anki: v${g.mevcut}).`, { tur: 'bilgi', sure: 15000, eylem: { metin: g.debUrl ? '.deb indir' : 'İndir', fn: () => openUrl(hedef) } });
}

/** Açılışta, ayar doluysa sessizce güncelleme kontrolü yapar. */
export async function acilistaGuncellemeKontrol() {
    const depo = ayarlar.al('guncellemeDeposu');
    if (!depo) return;
    try {
        const g = await api.guncellemeKontrol(depo);
        if (g) guncellemeBildir(g);
    } catch { /* sessiz: bağlantı yok ya da repo erişilemez */ }
}

export const PROJE_ADRESI = 'https://github.com/noviceWriter/RepoDesk';
export const KILAVUZ_ADRESI = `${PROJE_ADRESI}/blob/main/KULLANIM.md`;
const LISANS_ADRESI = `${PROJE_ADRESI}/blob/main/LICENSE.md`;

/** Hata ayıklama günlüğünün son satırlarını gösterir. */
export function gunlukModali() {
    let bilgi = null;
    modalAc({
        ust: 'HATA AYIKLAMA',
        baslik: 'Uygulama günlüğü',
        aciklama: 'RepoDesk’in yaptığı işlemler ve karşılaştığı hatalar burada tutulur. Bir sorun bildirirken bu metni kopyalayıp gönderebilirsin; şifre ve token gibi bilgiler gizlenir.',
        boyut: 'genis',
        govde: html`
            <pre class="gunluk-metin" data-kaydirma="gunluk" tabindex="0">Yükleniyor…</pre>
            <div class="gunluk-dugmeler">
                <button class="dugme dugme-sessiz" data-eylem="kopyala" type="button">${simge('kopya', 14)} Kopyala</button>
                <button class="dugme dugme-sessiz" data-eylem="klasor" type="button">${simge('klasor', 14)} Klasörü aç</button>
                <button class="dugme dugme-sessiz" data-eylem="yenile" type="button">${simge('yenile', 14)} Yenile</button>
                <button class="dugme-metin tehlike-metin" data-eylem="temizle" type="button">${simge('cop', 13)} Temizle</button>
            </div>
            <small class="ipucu" data-yol></small>`,
        acilinca(kok) {
            const pre = kok.querySelector('.gunluk-metin');
            const yukle = async () => {
                try {
                    bilgi = await api.gunlukOku();
                    pre.textContent = bilgi.metin || 'Günlük şimdilik boş.';
                    kok.querySelector('[data-yol]').textContent = bilgi.dosya;
                    pre.scrollTop = pre.scrollHeight;
                } catch (h) {
                    pre.textContent = h.message;
                }
            };
            const eylemler = {
                kopyala: async () => {
                    await panoyaKopyala(bilgi?.metin || '');
                    bildir('Günlük panoya kopyalandı.', { tur: 'basari', sure: 2000 });
                },
                klasor: () => api.gunlukKlasoruAc(),
                yenile: yukle,
                temizle: async () => {
                    if (!(await onayla('Günlükteki tüm kayıtlar silinsin mi?', { baslik: 'Günlüğü temizle', tamam: 'Temizle', tehlikeli: true }))) return;
                    await api.gunlukTemizle();
                    await yukle();
                },
            };
            kok.querySelector('.gunluk-dugmeler').addEventListener('click', (e) => {
                const d = e.target.closest('[data-eylem]');
                if (d) Promise.resolve(eylemler[d.dataset.eylem]()).catch(hataBildir);
            });
            yukle();
        },
    });
}

const ARALIKLAR = [[0, 'Kapalı'], [2, '2 dakikada bir'], [5, '5 dakikada bir'], [15, '15 dakikada bir'], [30, '30 dakikada bir']];

export function ayarlarModali() {
    const tema = ayarlar.al('tema');
    const aralik = Number(ayarlar.al('otomatikKontrol'));
    modalAc({
        ust: 'TERCİHLER',
        baslik: 'Ayarlar',
        gonderMetni: 'Kaydet',
        govde: html`
            <fieldset class="gorunurluk-secici"><legend>Tema</legend>
                <div class="tema-secici">
                    ${[['', 'degisim', 'Sistem'], ['acik', 'gunes', 'Açık'], ['koyu', 'ay', 'Koyu']].map(([deger, ikon, ad]) => html`
                        <label class="secenek-kart"><input type="radio" name="tema" value="${deger}" ${deger === tema ? 'checked' : ''}>
                            <span class="secenek-ikon">${simge(ikon, 16)}</span><span><strong>${ad}</strong></span></label>`)}
                </div>
            </fieldset>
            <label class="alan">GitHub’ı otomatik kontrol et
                <select name="otomatikKontrol">${ARALIKLAR.map(([d, ad]) => html`<option value="${d}" ${d === aralik ? 'selected' : ''}>${ad}</option>`)}</select>
                <small class="ipucu">Açık sekmelerde uzak depo yoklanır (git fetch); yeni commit gelirse bildirim çıkar. Dosyalarına dokunulmaz.</small>
            </label>
            <label class="alan">Kod editörü komutu
                <input name="editorKomutu" value="${ayarlar.al('editorKomutu')}" placeholder="code" spellcheck="false">
                <small class="ipucu">“Editörde aç” için. Örnek: <code>code</code>, <code>codium</code>, <code>subl</code>, <code>gedit</code></small>
            </label>
            <label class="alan">Terminal komutu <span class="istege-bagli">boş bırakılırsa otomatik bulunur</span>
                <input name="terminalKomutu" value="${ayarlar.al('terminalKomutu')}" placeholder="gnome-terminal" spellcheck="false">
            </label>
            <div class="alan">Commit kimliği <span class="istege-bagli">commit’lerinde görünen ad</span>
                <div class="kimlik-satir">
                    <span data-kimlik-ozet class="kimlik-ozet">…</span>
                    <button class="dugme dugme-sessiz" data-kimlik-degistir type="button">${simge('kullanici', 14)} Değiştir</button>
                </div>
            </div>
            <fieldset class="alan hakkinda">
                <legend>Hakkında ve güncellemeler</legend>
                <div class="sahiplik">
                    <img src="/logo.png" alt="" width="40" height="40">
                    <div>
                        <p><strong>RepoDesk</strong> <span data-surum>…</span></p>
                        <p class="ipucu">© 2026 noviceWriter · Tüm hakları saklıdır. Kişisel ve ticari olmayan kullanım için ücretsizdir; ticari kullanım için izin gerekir.</p>
                    </div>
                </div>
                <div class="hakkinda-baglantilar">
                    <button class="dugme-metin" data-ac="${KILAVUZ_ADRESI}" type="button">${simge('dosya', 13)} Kullanım kılavuzu</button>
                    <button class="dugme-metin" data-ac="${PROJE_ADRESI}" type="button">${simge('dis', 13)} GitHub sayfası</button>
                    <button class="dugme-metin" data-ac="${LISANS_ADRESI}" type="button">${simge('kilit', 13)} Lisans</button>
                    <button class="dugme-metin" data-gunluk type="button">${simge('gecmis', 13)} Uygulama günlüğü</button>
                </div>
                <label class="alan">Güncelleme deposu <span class="istege-bagli">uygulamanın release’lerinin yayınlandığı repo</span>
                    <div class="girdi-grubu">
                        <input name="guncellemeDeposu" value="${ayarlar.al('guncellemeDeposu')}" placeholder="noviceWriter/RepoDesk" spellcheck="false">
                        <button class="dugme dugme-sessiz" data-guncelle type="button">${simge('yenile', 14)} Şimdi kontrol et</button>
                    </div>
                    <small class="ipucu">Doluysa uygulama açılışta yeni sürüm olup olmadığına bakar ve haber verir.</small>
                </label>
            </fieldset>`,
        acilinca(kok) {
            getVersion().then((s) => { kok.querySelector('[data-surum]').textContent = `v${s}`; }).catch(() => {});
            kok.querySelectorAll('[data-ac]').forEach((d) => d.addEventListener('click', () => openUrl(d.dataset.ac).catch(hataBildir)));
            kok.querySelector('[data-gunluk]').addEventListener('click', gunlukModali);
            const ozet = kok.querySelector('[data-kimlik-ozet]');
            const kimlikYukle = () => api.kimlikBilgisi(null)
                .then((b) => { ozet.textContent = b.gecerliAd ? `${b.gecerliAd} <${b.gecerliEposta}>` : 'Ayarlı değil'; })
                .catch(() => { ozet.textContent = 'Okunamadı'; });
            kimlikYukle();
            kok.querySelector('[data-kimlik-degistir]').addEventListener('click', () => kimlikModali({ sonra: kimlikYukle }));
            kok.querySelector('[data-guncelle]').addEventListener('click', async (e) => {
                const depo = kok.querySelector('[name="guncellemeDeposu"]').value.trim();
                if (!depo) { bildir('Önce güncelleme deposunu yaz (ör. noviceWriter/RepoDesk).', { tur: 'hata' }); return; }
                const dugme = e.currentTarget;
                dugme.disabled = true;
                dugme.classList.add('yukleniyor');
                try {
                    const g = await api.guncellemeKontrol(depo);
                    if (g) guncellemeBildir(g);
                    else bildir('En güncel sürümü kullanıyorsun.', { tur: 'basari' });
                } catch (h) {
                    hataBildir(h);
                }
                dugme.disabled = false;
                dugme.classList.remove('yukleniyor');
            });
        },
        async gonder(kok) {
            const al = (ad) => kok.querySelector(`[name="${ad}"]`);
            ayarlar.yaz('tema', kok.querySelector('[name="tema"]:checked')?.value || '');
            ayarlar.yaz('otomatikKontrol', Number(al('otomatikKontrol').value));
            ayarlar.yaz('editorKomutu', al('editorKomutu').value.trim() || 'code');
            ayarlar.yaz('terminalKomutu', al('terminalKomutu').value.trim());
            ayarlar.yaz('guncellemeDeposu', al('guncellemeDeposu').value.trim());
            bildir('Ayarlar kaydedildi.', { tur: 'basari', sure: 2500 });
        },
    });
}
