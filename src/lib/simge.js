import { ham } from './dom.js';

const YOLLAR = {
    yenile: '<path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/>',
    arti: '<path d="M12 5v14M5 12h14"/>',
    ara: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    indir: '<path d="M12 3v12m0 0-4-4m4 4 4-4"/><path d="M5 21h14"/>',
    kalem: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    dis: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
    klasor: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    dosya: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
    dal: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="7" r="2"/><path d="M6 7v10"/><path d="M18 9c0 5-6 4-11 8.5"/>',
    yukari: '<path d="M12 19V5m0 0-6 6m6-6 6 6"/>',
    asagi: '<path d="M12 5v14m0 0-6-6m6 6 6-6"/>',
    tik: '<path d="m5 12 5 5 9-10"/>',
    cop: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
    carpi: '<path d="M6 6l12 12M18 6 6 18"/>',
    yildiz: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    kilit: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    dunya: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    gunes: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    ay: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    kopya: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    cikis: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l-5-5 5-5M5 12h11"/>',
    sag: '<path d="m9 6 6 6-6 6"/>',
    acilir: '<path d="m6 9 6 6 6-6"/>',
    gecmis: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
    uyari: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
    kullanici: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    arsiv: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4"/>',
    catal: '<circle cx="6" cy="5" r="2"/><circle cx="18" cy="5" r="2"/><circle cx="12" cy="19" r="2"/><path d="M6 7v1a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V7M12 11v6"/>',
    baglanti: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    yayinla: '<path d="M7 18a5 5 0 0 1-.6-10A6 6 0 0 1 18 9a4 4 0 0 1 0 9"/><path d="M12 12v8m0-8-3 3m3-3 3 3"/>',
    degisim: '<circle cx="12" cy="12" r="3"/><path d="M12 3v6M12 15v6"/>',
    ev: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/>',
    geriAl: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    pr: '<circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/><path d="M6 8v8"/><path d="M18 16V9a3 3 0 0 0-3-3h-4"/><path d="m13 3-3 3 3 3"/>',
    issue: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/>',
    birlestir: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="12" r="2"/><path d="M6 7v10"/><path d="M6 7c0 4 4 5 10 5"/>',
    ayar: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M13 15h4"/>',
    kod: '<path d="m8 7-5 5 5 5M16 7l5 5-5 5"/>',
    oynat: '<path d="M7 4v16l13-8z"/>',
    etiket: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
    menu: '<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>',
};

export function simge(ad, boyut = 16) {
    return ham(
        `<svg class="simge" width="${boyut}" height="${boyut}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${YOLLAR[ad] || ''}</svg>`,
    );
}

const DIL_RENKLERI = {
    JavaScript: '#e8c33a', TypeScript: '#3178c6', Rust: '#c5704a', Python: '#3572a5', Go: '#00add8',
    Java: '#b07219', Kotlin: '#a97bff', Swift: '#f05138', 'C++': '#f34b7d', C: '#6e7781', 'C#': '#178600',
    HTML: '#e34c26', CSS: '#663399', SCSS: '#c6538c', Vue: '#41b883', Svelte: '#ff3e00', Dart: '#00b4ab',
    PHP: '#4f5d95', Ruby: '#701516', Shell: '#89e051', Lua: '#000080', Dockerfile: '#384d54', 'Jupyter Notebook': '#da5b0b',
};

export function dilRengi(dil) {
    if (!dil) return 'var(--metin-3)';
    if (DIL_RENKLERI[dil]) return DIL_RENKLERI[dil];
    let ozet = 0;
    for (const c of dil) ozet = (ozet * 31 + c.charCodeAt(0)) % 360;
    return `hsl(${ozet} 55% 50%)`;
}
