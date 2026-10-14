import { ask } from '@tauri-apps/plugin-dialog';
import { ciz, html, metin } from './dom.js';
import { simge } from './simge.js';

// ---------- Bildirimler ----------

let bildirimKabi;

export function bildir(mesaj, { tur = 'bilgi', eylem = null, sure } = {}) {
    if (!bildirimKabi) {
        bildirimKabi = document.createElement('div');
        bildirimKabi.className = 'bildirimler';
        bildirimKabi.setAttribute('aria-live', 'polite');
        document.body.appendChild(bildirimKabi);
    }
    const el = document.createElement('div');
    el.className = `bildirim bildirim-${tur}`;
    el.setAttribute('role', tur === 'hata' ? 'alert' : 'status');
    const ikon = { basari: 'tik', hata: 'uyari', bilgi: 'degisim' }[tur];
    el.innerHTML = metin(html`
        <span class="bildirim-ikon">${simge(ikon, 15)}</span>
        <p>${mesaj}</p>
        ${eylem ? html`<button class="bildirim-eylem" type="button">${eylem.metin}</button>` : ''}
        <button class="bildirim-kapat" type="button" aria-label="Kapat">${simge('carpi', 14)}</button>`);
    const kapat = () => {
        el.classList.add('cikiyor');
        setTimeout(() => el.remove(), 180);
    };
    el.querySelector('.bildirim-kapat').addEventListener('click', kapat);
    el.querySelector('.bildirim-eylem')?.addEventListener('click', () => { kapat(); eylem.fn(); });
    bildirimKabi.appendChild(el);
    const bekle = sure ?? (tur === 'hata' ? 10000 : eylem ? 8000 : 4500);
    let zamanlayici = setTimeout(kapat, bekle);
    el.addEventListener('mouseenter', () => clearTimeout(zamanlayici));
    el.addEventListener('mouseleave', () => { zamanlayici = setTimeout(kapat, 2500); });
    return kapat;
}

export const hataBildir = (hata) => bildir(hata?.message || String(hata), { tur: 'hata' });

// ---------- Onay ----------

export async function onayla(mesaj, { baslik = 'RepoDesk', tamam = 'Evet', iptal = 'Vazgeç', tehlikeli = false } = {}) {
    try {
        return await ask(mesaj, { title: baslik, kind: tehlikeli ? 'warning' : 'info', okLabel: tamam, cancelLabel: iptal });
    } catch {
        return window.confirm(mesaj);
    }
}

// ---------- Modal ----------

const yigin = [];

export const acikModalVar = () => yigin.length > 0;

export function enUstModaliKapat() {
    yigin.at(-1)?.kapat();
}

/**
 * @param {object} s
 * @param {string} s.ust        Küçük üst başlık
 * @param {string} s.baslik
 * @param {string} [s.aciklama]
 * @param {object} s.govde      html`` şablonu
 * @param {string} [s.gonderMetni]
 * @param {(kok: HTMLElement) => Promise<any>} [s.gonder]  Hata fırlatırsa modal açık kalır.
 * @param {(kok: HTMLElement) => void} [s.acilinca]
 * @param {() => void} [s.kapaninca]
 * @param {'normal'|'genis'|'tam'} [s.boyut]
 */
export function modalAc({ ust, baslik, aciklama, govde, gonderMetni, gonder, acilinca, kapaninca, kapatilsinMi, boyut = 'normal', tehlikeli = false }) {
    const oncekiOdak = document.activeElement;
    const arka = document.createElement('div');
    arka.className = 'modal-arka';
    ciz(arka, html`
        <div class="modal modal-${boyut}" role="dialog" aria-modal="true" aria-labelledby="modal-baslik-${yigin.length}">
            <header class="modal-ust">
                <div>
                    ${ust ? html`<p class="ust-baslik">${ust}</p>` : ''}
                    <h2 id="modal-baslik-${yigin.length}">${baslik}</h2>
                    ${aciklama ? html`<p class="modal-aciklama">${aciklama}</p>` : ''}
                </div>
                <button class="ikon-dugme modal-kapat" type="button" aria-label="Kapat">${simge('carpi', 18)}</button>
            </header>
            <div class="modal-govde">${govde}</div>
            ${gonder ? html`
                <footer class="modal-alt">
                    <p class="form-hata" role="alert"></p>
                    <div class="modal-dugmeler">
                        <button class="dugme dugme-sessiz modal-vazgec" type="button">Vazgeç</button>
                        <button class="dugme ${tehlikeli ? 'dugme-tehlike' : ''} modal-gonder" type="button">${gonderMetni || 'Kaydet'}<kbd>Ctrl ↵</kbd></button>
                    </div>
                </footer>` : ''}
        </div>`);

    const modal = arka.firstElementChild;
    let calisiyor = false;
    const kayit = {
        kok: modal,
        kapat(zorla = false) {
            if (calisiyor) return;
            if (!zorla && kapatilsinMi) {
                Promise.resolve(kapatilsinMi()).then((evet) => { if (evet) kayit.kapat(true); });
                return;
            }
            const sira = yigin.indexOf(kayit);
            if (sira >= 0) yigin.splice(sira, 1);
            arka.classList.add('kapaniyor');
            setTimeout(() => arka.remove(), 140);
            kapaninca?.();
            if (oncekiOdak?.isConnected) oncekiOdak.focus();
        },
        hata(mesaj) {
            const el = modal.querySelector('.form-hata');
            if (el) el.textContent = mesaj || '';
        },
        async gonder() {
            if (!gonder || calisiyor) return;
            const dugme = modal.querySelector('.modal-gonder');
            kayit.hata('');
            calisiyor = true;
            dugme.disabled = true;
            dugme.classList.add('yukleniyor');
            try {
                await gonder(modal, kayit);
                calisiyor = false;
                kayit.kapat(true);
            } catch (e) {
                calisiyor = false;
                kayit.hata(e?.message || String(e));
                dugme.disabled = false;
                dugme.classList.remove('yukleniyor');
            }
        },
    };
    yigin.push(kayit);

    modal.querySelector('.modal-kapat').addEventListener('click', () => kayit.kapat());
    modal.querySelector('.modal-vazgec')?.addEventListener('click', () => kayit.kapat());
    modal.querySelector('.modal-gonder')?.addEventListener('click', () => kayit.gonder());
    arka.addEventListener('mousedown', (e) => { if (e.target === arka) kayit.kapat(); });
    modal.addEventListener('keydown', (e) => {
        if (e.defaultPrevented) return; // ör. kod editörü tuşu kendisi işledi
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            kayit.gonder();
        } else if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') {
            e.preventDefault();
            kayit.gonder();
        } else if (e.key === 'Tab') {
            odakTuzagi(modal, e);
        }
    });

    document.body.appendChild(arka);
    acilinca?.(modal, kayit);
    const ilk = modal.querySelector('[autofocus]') || modal.querySelector('.modal-govde input:not([disabled]), .modal-govde textarea, .modal-govde select');
    (ilk || modal.querySelector('.modal-kapat')).focus();
    return kayit;
}

function odakTuzagi(kap, e) {
    const odaklanabilir = [...kap.querySelectorAll('button, input, textarea, select, a[href], [tabindex]:not([tabindex="-1"])')].filter(
        (el) => !el.disabled && el.offsetParent !== null,
    );
    if (!odaklanabilir.length) return;
    const ilk = odaklanabilir[0];
    const son = odaklanabilir.at(-1);
    if (e.shiftKey && document.activeElement === ilk) {
        e.preventDefault();
        son.focus();
    } else if (!e.shiftKey && document.activeElement === son) {
        e.preventDefault();
        ilk.focus();
    }
}

// ---------- Sağ tık menüsü ----------

let acikMenu = null;

export function menuKapat() {
    if (!acikMenu) return;
    acikMenu.temizle();
    acikMenu = null;
}

/**
 * @param {MouseEvent | {x: number, y: number}} konum
 * @param {Array<'-' | null | {etiket: string, simge?: string, fn: () => void, tehlikeli?: boolean, devreDisi?: boolean, ipucu?: string}>} ogeler
 */
export function menuAc(konum, ogeler) {
    menuKapat();
    const liste = ogeler.filter(Boolean);
    while (liste[0] === '-') liste.shift();
    while (liste.at(-1) === '-') liste.pop();
    if (!liste.length) return;

    const el = document.createElement('div');
    el.className = 'baglam-menusu';
    el.setAttribute('role', 'menu');
    el.innerHTML = metin(liste.map((o, i) => (o === '-'
        ? html`<div class="menu-ayrac" role="separator"></div>`
        : html`<button class="menu-oge ${o.tehlikeli ? 'tehlike' : ''}" data-sira="${i}" type="button" role="menuitem" ${o.devreDisi ? 'disabled' : ''} title="${o.ipucu || ''}">
            ${o.simge ? simge(o.simge, 14) : html`<span class="menu-bosluk"></span>`}<span>${o.etiket}</span></button>`)));
    document.body.appendChild(el);

    const { innerWidth: g, innerHeight: y } = window;
    const kutu = el.getBoundingClientRect();
    el.style.left = `${Math.max(8, Math.min(konum.x ?? konum.clientX, g - kutu.width - 8))}px`;
    el.style.top = `${Math.max(8, Math.min(konum.y ?? konum.clientY, y - kutu.height - 8))}px`;

    const dugmeler = () => [...el.querySelectorAll('.menu-oge:not(:disabled)')];
    el.addEventListener('click', (e) => {
        const d = e.target.closest('.menu-oge');
        if (!d || d.disabled) return;
        const oge = liste[Number(d.dataset.sira)];
        menuKapat();
        oge.fn();
    });
    const tus = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); menuKapat(); return; }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const d = dugmeler();
            const i = d.indexOf(document.activeElement);
            d[(i + (e.key === 'ArrowDown' ? 1 : -1) + d.length) % d.length]?.focus();
        }
    };
    const disari = (e) => { if (!el.contains(e.target)) menuKapat(); };
    const kapat = () => menuKapat();
    document.addEventListener('keydown', tus, true);
    document.addEventListener('mousedown', disari, true);
    window.addEventListener('blur', kapat);
    window.addEventListener('resize', kapat);
    document.addEventListener('scroll', kapat, true);
    acikMenu = {
        temizle() {
            document.removeEventListener('keydown', tus, true);
            document.removeEventListener('mousedown', disari, true);
            window.removeEventListener('blur', kapat);
            window.removeEventListener('resize', kapat);
            document.removeEventListener('scroll', kapat, true);
            el.remove();
        },
    };
    dugmeler()[0]?.focus();
}
