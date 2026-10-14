// Güvenli HTML şablonları: ${} içindeki her değer otomatik kaçışlanır.
// Kaçışlanmaması gereken (zaten güvenli) içerik `ham()` ile sarılır.

const HAM = Symbol('ham');

export const ham = (metin) => ({ [HAM]: String(metin) });

export const kacis = (deger) =>
    String(deger ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[c]);

function yaz(deger) {
    if (deger == null || deger === false) return '';
    if (Array.isArray(deger)) return deger.map(yaz).join('');
    if (typeof deger === 'object' && HAM in deger) return deger[HAM];
    return kacis(deger);
}

export function html(parcalar, ...degerler) {
    let sonuc = parcalar[0];
    for (let i = 0; i < degerler.length; i += 1) sonuc += yaz(degerler[i]) + parcalar[i + 1];
    return ham(sonuc);
}

export const metin = (sablon) => yaz(sablon);

/** Odaktaki alanı ve imleç konumunu koruyarak bir bölümü yeniden çizer. */
export function ciz(kap, sablon) {
    const odak = document.activeElement;
    const odakId = odak && kap.contains(odak) ? odak.id : '';
    const secim = odakId && 'selectionStart' in odak ? [odak.selectionStart, odak.selectionEnd] : null;
    const kaydirma = [...kap.querySelectorAll('[data-kaydirma]')].map((el) => [el.dataset.kaydirma, el.scrollTop]);
    kap.innerHTML = metin(sablon);
    for (const [ad, deger] of kaydirma) {
        const el = kap.querySelector(`[data-kaydirma="${ad}"]`);
        if (el) el.scrollTop = deger;
    }
    if (odakId) {
        const yeni = document.getElementById(odakId);
        if (yeni) {
            yeni.focus();
            if (secim && 'setSelectionRange' in yeni) {
                try { yeni.setSelectionRange(...secim); } catch { /* bazı input türleri desteklemez */ }
            }
        }
    }
}

/** `data-eylem` özniteliği taşıyan öğeler için tek noktadan olay dinleyici. */
export function eylemler(kap, olay, isleyiciler) {
    kap.addEventListener(olay, (e) => {
        const hedef = e.target.closest('[data-eylem]');
        if (!hedef || !kap.contains(hedef) || hedef.disabled) return;
        const isleyici = isleyiciler[hedef.dataset.eylem];
        if (isleyici) isleyici(hedef, e);
    });
}

const tarihBicimi = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
const goreliBicim = new Intl.RelativeTimeFormat('tr', { numeric: 'auto' });

export function goreliZaman(tarih) {
    if (!tarih) return 'bilinmiyor';
    const fark = (new Date(tarih).getTime() - Date.now()) / 1000;
    const birimler = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
    for (const [birim, saniye] of birimler) {
        if (Math.abs(fark) >= saniye) return goreliBicim.format(Math.round(fark / saniye), birim);
    }
    return 'az önce';
}

export const tarihYaz = (tarih) => (tarih ? tarihBicimi.format(new Date(tarih)) : 'bilinmiyor');

export function boyutYaz(bayt) {
    if (bayt < 1024) return `${bayt} B`;
    if (bayt < 1024 * 1024) return `${(bayt / 1024).toFixed(1)} KB`;
    return `${(bayt / 1024 / 1024).toFixed(1)} MB`;
}

export const klasorAdi = (yol) => yol.split(/[\\/]/).filter(Boolean).pop() || yol;

/** Klasör adını GitHub'ın kabul edeceği bir repo adına çevirir. */
export function repoAdiOner(ad) {
    const harita = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'C', Ğ: 'G', İ: 'I', Ö: 'O', Ş: 'S', Ü: 'U' };
    return ad
        .replace(/[çğıöşüÇĞİÖŞÜ]/g, (c) => harita[c])
        .replace(/[^A-Za-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 100);
}

export const repoAdiGecerli = (ad) => /^[A-Za-z0-9._][A-Za-z0-9._-]{0,99}$/.test(ad) && ad !== '.' && ad !== '..';

/** GitHub adreslerini karşılaştırmak için sade biçim: `sahip/repo`. */
export function repoAnahtari(url) {
    if (!url) return '';
    const eslesme = url.trim().match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?\/?$/i);
    return eslesme ? eslesme[1].toLowerCase() : '';
}

export const depola = {
    oku(anahtar, varsayilan) {
        try {
            const deger = localStorage.getItem(`repodesk:${anahtar}`);
            return deger == null ? varsayilan : JSON.parse(deger);
        } catch {
            return varsayilan;
        }
    },
    yaz(anahtar, deger) {
        try { localStorage.setItem(`repodesk:${anahtar}`, JSON.stringify(deger)); } catch { /* depolama kapalı olabilir */ }
    },
};

/**
 * Metni panoya kopyalar. `navigator.clipboard` her web görünümünde (ör. bazı
 * WebKitGTK sürümleri) bulunmadığı için gizli bir metin alanıyla yedek yol dener.
 */
export async function panoyaKopyala(metin) {
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(metin);
            return;
        }
    } catch { /* yedek yönteme geç */ }
    const alan = document.createElement('textarea');
    alan.value = metin;
    alan.setAttribute('readonly', '');
    alan.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    const odak = document.activeElement;
    document.body.appendChild(alan);
    alan.select();
    const tamam = document.execCommand('copy');
    alan.remove();
    odak?.focus?.();
    if (!tamam) throw new Error('Panoya kopyalanamadı.');
}
