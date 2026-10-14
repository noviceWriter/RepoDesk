import { depola } from './lib/dom.js';

/** Uygulamanın paylaşılan durumu. Değiştiren kod ilgili konuyu `yayinla` ile duyurur. */
export const durum = {
    /** undefined: yükleniyor, null: oturum yok */
    hesap: undefined,
    ghHatasi: '',
    repolar: [],
    repolarYukleniyor: false,
    repoHatasi: '',
    /** sahip/repo (küçük harf) → basarili | basarisiz | suruyor | … */
    ciDurumlari: {},
    arama: '',
    filtre: depola.oku('filtre', 'hepsi'),
    siralama: depola.oku('siralama', 'son'),
};

const dinleyiciler = new Map();

export function dinle(konu, fn) {
    if (!dinleyiciler.has(konu)) dinleyiciler.set(konu, new Set());
    dinleyiciler.get(konu).add(fn);
}

export function yayinla(konu) {
    for (const fn of dinleyiciler.get(konu) || []) fn();
}

/** Bir GitHub reposunun bilgisayarda hangi klasörde açıldığını hatırlar. */
export const yerelEslesme = {
    hepsi: () => depola.oku('yerelEslesme', {}),
    al: (anahtar) => (anahtar ? depola.oku('yerelEslesme', {})[anahtar] : undefined),
    kaydet(anahtar, yol) {
        if (!anahtar) return;
        const harita = depola.oku('yerelEslesme', {});
        if (harita[anahtar] === yol) return;
        harita[anahtar] = yol;
        depola.yaz('yerelEslesme', harita);
        yayinla('repolar');
    },
};
