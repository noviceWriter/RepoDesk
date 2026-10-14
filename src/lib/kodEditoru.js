// CodeMirror 6 tabanlı kod editörü. Yalnızca dosya editörü açıldığında yüklenir (dinamik import).

import { Compartment, EditorState } from '@codemirror/state';
import {
    EditorView, crosshairCursor, drawSelection, dropCursor, highlightActiveLine, highlightActiveLineGutter,
    highlightSpecialChars, keymap, lineNumbers, rectangularSelection,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { HighlightStyle, bracketMatching, foldGutter, foldKeymap, indentOnInput, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

const DILLER = [
    [/\.(m?js|cjs|jsx)$/i, 'JavaScript', () => import('@codemirror/lang-javascript').then((m) => m.javascript({ jsx: true }))],
    [/\.tsx$/i, 'TypeScript', () => import('@codemirror/lang-javascript').then((m) => m.javascript({ typescript: true, jsx: true }))],
    [/\.(ts|mts|cts)$/i, 'TypeScript', () => import('@codemirror/lang-javascript').then((m) => m.javascript({ typescript: true }))],
    [/\.rs$/i, 'Rust', () => import('@codemirror/lang-rust').then((m) => m.rust())],
    [/\.(py|pyw)$/i, 'Python', () => import('@codemirror/lang-python').then((m) => m.python())],
    [/\.(html?|vue|svelte)$/i, 'HTML', () => import('@codemirror/lang-html').then((m) => m.html())],
    [/\.(css|scss|less)$/i, 'CSS', () => import('@codemirror/lang-css').then((m) => m.css())],
    [/\.(json|jsonc|json5)$/i, 'JSON', () => import('@codemirror/lang-json').then((m) => m.json())],
    [/\.(md|markdown)$/i, 'Markdown', () => import('@codemirror/lang-markdown').then((m) => m.markdown())],
    [/\.(ya?ml)$/i, 'YAML', () => import('@codemirror/lang-yaml').then((m) => m.yaml())],
    [/\.(c|h|cc|cpp|cxx|hpp|hh|ino)$/i, 'C/C++', () => import('@codemirror/lang-cpp').then((m) => m.cpp())],
    [/\.(java|kt)$/i, 'Java', () => import('@codemirror/lang-java').then((m) => m.java())],
    [/\.go$/i, 'Go', () => import('@codemirror/lang-go').then((m) => m.go())],
    [/\.sql$/i, 'SQL', () => import('@codemirror/lang-sql').then((m) => m.sql())],
    [/\.(xml|svg|xaml|plist|csproj)$/i, 'XML', () => import('@codemirror/lang-xml').then((m) => m.xml())],
    [/\.php$/i, 'PHP', () => import('@codemirror/lang-php').then((m) => m.php())],
];

export const dilAdi = (yol) => DILLER.find(([desen]) => desen.test(yol || ''))?.[1] || 'Düz metin';

const VURGU = HighlightStyle.define([
    { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword, t.modifier, t.definitionKeyword], color: 'var(--kod-anahtar)' },
    { tag: [t.string, t.special(t.string), t.regexp, t.character], color: 'var(--kod-metin)' },
    { tag: [t.number, t.bool, t.null, t.atom, t.unit], color: 'var(--kod-sayi)' },
    { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: 'var(--kod-yorum)', fontStyle: 'italic' },
    { tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName], color: 'var(--kod-fonksiyon)' },
    { tag: [t.typeName, t.className, t.namespace, t.definition(t.typeName)], color: 'var(--kod-tur)' },
    { tag: [t.propertyName, t.attributeName, t.labelName], color: 'var(--kod-ozellik)' },
    { tag: [t.tagName, t.angleBracket], color: 'var(--kod-etiket)' },
    { tag: [t.heading], color: 'var(--kod-anahtar)', fontWeight: 'bold' },
    { tag: t.link, color: 'var(--vurgu)', textDecoration: 'underline' },
    { tag: t.emphasis, fontStyle: 'italic' },
    { tag: t.strong, fontWeight: 'bold' },
    { tag: [t.operator, t.punctuation, t.separator], color: 'var(--metin-2)' },
    { tag: t.invalid, color: 'var(--kirmizi)' },
]);

const TEMA = EditorView.theme({
    '&': { height: '100%', color: 'var(--metin)', backgroundColor: 'var(--zemin)', fontSize: '13px' },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.6' },
    '.cm-content': { caretColor: 'var(--vurgu)', padding: '10px 0' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--vurgu)', borderLeftWidth: '2px' },
    '.cm-gutters': { backgroundColor: 'var(--zemin)', color: 'var(--metin-3)', border: 'none', borderRight: '1px solid var(--cizgi)' },
    '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--vurgu) 6%, transparent)' },
    '.cm-activeLineGutter': { backgroundColor: 'color-mix(in srgb, var(--vurgu) 10%, transparent)', color: 'var(--metin)' },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
        { backgroundColor: 'color-mix(in srgb, var(--vurgu) 28%, transparent)' },
    '.cm-selectionMatch': { backgroundColor: 'color-mix(in srgb, var(--amber) 22%, transparent)' },
    '.cm-searchMatch': { backgroundColor: 'color-mix(in srgb, var(--amber) 30%, transparent)', outline: '1px solid var(--amber)' },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'color-mix(in srgb, var(--vurgu) 35%, transparent)' },
    '&.cm-focused .cm-matchingBracket': { backgroundColor: 'color-mix(in srgb, var(--yesil) 25%, transparent)', outline: '1px solid var(--yesil)' },
    '.cm-foldPlaceholder': { backgroundColor: 'var(--zemin-2)', border: '1px solid var(--cizgi-2)', color: 'var(--metin-2)' },
    '.cm-panels': { backgroundColor: 'var(--yuzey)', color: 'var(--metin)', borderColor: 'var(--cizgi-2)' },
    '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--cizgi-2)' },
    '.cm-panel.cm-search': { padding: '8px 10px', fontFamily: 'var(--yazi)', fontSize: '12px' },
    '.cm-panel.cm-search input, .cm-panel.cm-search button': { fontFamily: 'inherit', fontSize: '12px' },
    '.cm-textfield': { border: '1px solid var(--cizgi-2)', borderRadius: '5px', backgroundColor: 'var(--zemin)', color: 'var(--metin)', padding: '3px 6px' },
    '.cm-button': { backgroundImage: 'none', backgroundColor: 'var(--zemin-2)', border: '1px solid var(--cizgi-2)', borderRadius: '5px', color: 'var(--metin)' },
    '.cm-tooltip': { backgroundColor: 'var(--yuzey)', border: '1px solid var(--cizgi-2)', color: 'var(--metin)' },
});

const TURKCE = EditorState.phrases.of({
    Find: 'Bul', Replace: 'Değiştir', next: 'sonraki', previous: 'önceki', all: 'tümü',
    'match case': 'büyük/küçük harf', regexp: 'düzenli ifade', 'by word': 'tam kelime',
    replace: 'değiştir', 'replace all': 'tümünü değiştir', close: 'kapat',
    'Go to line': 'Satıra git', go: 'git', 'Folded lines': 'Katlanmış satırlar',
    'Unfolded lines': 'Açılmış satırlar', 'Fold line': 'Satırı katla', 'Unfold line': 'Satırı aç',
    'current match': 'geçerli eşleşme', 'on line': 'satırda', 'replaced match on line $': '$. satırdaki eşleşme değiştirildi',
    'replaced $ matches': '$ eşleşme değiştirildi',
});

/** Dosyada sekme mi boşluk mu kullanıldığını tahmin eder. */
function girintiyiBul(metin) {
    const satirlar = metin.split('\n').slice(0, 400);
    if (satirlar.some((s) => s.startsWith('\t'))) return '\t';
    const genislikler = satirlar.map((s) => s.match(/^ +/)?.[0].length || 0).filter((n) => n > 0);
    if (!genislikler.length) return '    ';
    return genislikler.some((n) => n % 4 !== 0) ? '  ' : '    ';
}

/**
 * @param {HTMLElement} kap
 * @param {{icerik: string, yol: string, kaydet?: () => void, degisince?: (bilgi: {kirli: boolean, satir: number, sutun: number, toplam: number}) => void}} s
 */
export function editorOlustur(kap, { icerik, yol, kaydet, degisince }) {
    const dilBolmesi = new Compartment();
    const girinti = girintiyiBul(icerik);
    const bildir = (state) => {
        const imlec = state.selection.main.head;
        const satir = state.doc.lineAt(imlec);
        degisince?.({ kirli: state.doc.toString() !== icerik, satir: satir.number, sutun: imlec - satir.from + 1, toplam: state.doc.lines });
    };
    const gorunum = new EditorView({
        parent: kap,
        state: EditorState.create({
            doc: icerik,
            extensions: [
                lineNumbers(), highlightActiveLineGutter(), highlightSpecialChars(), history(), foldGutter(),
                drawSelection(), dropCursor(), EditorState.allowMultipleSelections.of(true), indentOnInput(),
                bracketMatching(), closeBrackets(), rectangularSelection(), crosshairCursor(), highlightActiveLine(),
                highlightSelectionMatches(), syntaxHighlighting(VURGU, { fallback: true }),
                indentUnit.of(girinti), EditorState.tabSize.of(4),
                keymap.of([
                    { key: 'Mod-s', preventDefault: true, run: () => { kaydet?.(); return true; } },
                    ...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...foldKeymap, indentWithTab,
                ]),
                TEMA, TURKCE, dilBolmesi.of([]),
                EditorView.updateListener.of((g) => { if (g.docChanged || g.selectionSet) bildir(g.state); }),
            ],
        }),
    });
    bildir(gorunum.state);
    let sonDil = null;
    const dilDegistir = (yeniYol) => {
        const dil = DILLER.find(([desen]) => desen.test(yeniYol || ''));
        if (dil === sonDil) return;
        sonDil = dil;
        if (!dil) { gorunum.dispatch({ effects: dilBolmesi.reconfigure([]) }); return; }
        dil[2]().then((uzanti) => { if (sonDil === dil) gorunum.dispatch({ effects: dilBolmesi.reconfigure(uzanti) }); }).catch(() => {});
    };
    dilDegistir(yol);
    return {
        deger: () => gorunum.state.doc.toString(),
        kirli: () => gorunum.state.doc.toString() !== icerik,
        odaklan: () => gorunum.focus(),
        dilDegistir,
        yokEt: () => gorunum.destroy(),
        girinti: girinti === '\t' ? 'Sekme' : `${girinti.length} boşluk`,
    };
}
