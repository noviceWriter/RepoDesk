import { getVersion } from '@tauri-apps/api/app';
import { openUrl } from '@tauri-apps/plugin-opener';
import { api } from '../lib/api.js';
import { bildir, hataBildir, modalAc } from '../lib/bilesen.js';
import { html } from '../lib/dom.js';
import { simge } from '../lib/simge.js';
import { ayarlar } from '../ayarlar.js';

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
            <fieldset class="alan hakkinda">
                <legend>Hakkında ve güncellemeler</legend>
                <p class="ipucu">RepoDesk <strong data-surum>…</strong></p>
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
