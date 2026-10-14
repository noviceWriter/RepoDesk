import { depola } from './lib/dom.js';
import { yayinla } from './durum.js';

const VARSAYILAN = {
    tema: '', // '' sistem, 'acik', 'koyu'
    otomatikKontrol: 5, // dakika; 0 kapalı
    editorKomutu: 'code',
    terminalKomutu: '', // boşsa otomatik bulunur
    guncellemeDeposu: 'noviceWriter/RepoDesk', // boşsa güncelleme kontrolü yapılmaz
};

export const ayarlar = {
    al: (anahtar) => depola.oku(anahtar, VARSAYILAN[anahtar]),
    yaz(anahtar, deger) {
        depola.yaz(anahtar, deger);
        yayinla(`ayar:${anahtar}`);
    },
};
