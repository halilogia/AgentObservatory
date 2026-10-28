// Minimal sahte DOM: web modüllerinin render fonksiyonlarını Node altında sınamak için.
export interface MockEl {
  tagName: string;
  className: string;
  textContent: string;
  title: string;
  dataset: Record<string, string>;
  style: Record<string, string>;
  attrs: Record<string, string>;
  children: any[];
  onclick?: () => void;
  onsubmit?: (e?: any) => any;
  [k: string]: any;
}

function makeEl(tag: string): MockEl {
  const el: MockEl = {
    tagName: tag,
    className: '',
    textContent: '',
    title: '',
    dataset: {},
    style: {},
    attrs: {},
    children: [],
    classList: {
      add(c: string) { if (!el.className.split(' ').includes(c)) el.className = (el.className + ' ' + c).trim(); },
      remove(c: string) { el.className = el.className.split(' ').filter((x) => x && x !== c).join(' '); },
      toggle(c: string, on?: boolean) {
        const has = el.className.split(' ').includes(c);
        const want = on === undefined ? !has : on;
        if (want) el.classList.add(c); else el.classList.remove(c);
      },
      contains(c: string) { return el.className.split(' ').includes(c); }
    },
    setAttribute(k: string, v: any) { el.attrs[k] = String(v); if (k === 'class') el.className = String(v); },
    appendChild(c: any) { el.children.push(c); return c; },
    removeChild(c: any) { const i = el.children.indexOf(c); if (i >= 0) el.children.splice(i, 1); return c; },
    append(...args: any[]) { for (const a of args) el.children.push(typeof a === 'string' ? { text: a } : a); },
    replaceChildren(...args: any[]) { el.children = []; el.append(...args); },
    get lastChild() { return el.children[el.children.length - 1]; }
  };
  return el;
}

export function createMockDoc() {
  return {
    createElement: makeEl,
    createElementNS: (_ns: string, tag: string) => makeEl(tag),
    createTextNode: (t: string) => ({ text: t })
  };
}

/** Alt ağaçtaki koşula uyan tüm öğeleri döner. */
export function findAll(root: any, pred: (e: MockEl) => boolean, out: MockEl[] = []): MockEl[] {
  if (root && root.tagName && pred(root)) out.push(root);
  for (const c of root?.children ?? []) findAll(c, pred, out);
  return out;
}

export const hasClass = (e: MockEl, c: string) => e.className.split(' ').includes(c);
