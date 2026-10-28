// web/diff.js: kod değişikliklerini Claude Code / TUI benzeri formatta gösteren diff motoru testleri
import assert from 'node:assert';
import '../web/diff.js';

const D = (globalThis as any).ObsDiff;
assert.ok(D, 'ObsDiff yüklenmeli');

// 1. computeDiff & computeStats
const oldCode = 'const a = 1;\nconst b = 2;\nconsole.log(a + b);';
const newCode = 'const a = 1;\nconst b = 3;\nconst c = 4;\nconsole.log(a + b + c);';

const stats = D.computeStats(oldCode, newCode);
assert.strictEqual(stats.del, 2, 'b = 2 ve log satırları değişti');
assert.strictEqual(stats.add, 3, 'b = 3, c = 4 ve log satırları eklendi');

const diff = D.computeDiff(oldCode, newCode, 10);
assert.ok(diff.lines.length >= 4);
assert.strictEqual(diff.lines[0].type, 'same');
assert.strictEqual(diff.lines[0].text, 'const a = 1;');
assert.strictEqual(diff.lines[0].oldLine, 10);
assert.strictEqual(diff.lines[0].newLine, 10);

// 2. parseUnifiedDiff
const uniDiff = `--- a/src/app.js
+++ b/src/app.js
@@ -37,5 +37,6 @@
 unchanged context
-old removed line
+new added line
+second added line
 footer context`;

const parsedUni = D.parseUnifiedDiff(uniDiff);
assert.strictEqual(parsedUni.file, 'src/app.js');
assert.strictEqual(parsedUni.del, 1);
assert.strictEqual(parsedUni.add, 2);
assert.ok(parsedUni.lines.some((l: any) => l.type === 'del' && l.text === 'old removed line'));
assert.ok(parsedUni.lines.some((l: any) => l.type === 'add' && l.text === 'new added line'));

// 3. parseNumberedText
const numberedText = `
8511   if (origin === 'user') {
8514 +   const trial = wakeTrialRef.current
8515 -   oldCode();
8516   }
`;
const parsedNum = D.parseNumberedText(numberedText);
assert.strictEqual(parsedNum.add, 1);
assert.strictEqual(parsedNum.del, 1);
assert.strictEqual(parsedNum.lines.length, 4);
assert.strictEqual(parsedNum.lines[1].type, 'add');
assert.strictEqual(parsedNum.lines[1].newLine, 8514);
assert.strictEqual(parsedNum.lines[2].type, 'del');
assert.strictEqual(parsedNum.lines[2].oldLine, 8515);

// 4. isDiffLike
assert.strictEqual(D.isDiffLike({ name: 'Edit', input: { file_path: 'a.ts' } }), true);
assert.strictEqual(D.isDiffLike({ name: 'str_replace_editor', input: {} }), true);
assert.strictEqual(D.isDiffLike({ name: 'Write', input: { content: '...' } }), true);
assert.strictEqual(D.isDiffLike({ name: 'Bash', input: { command: 'ls' } }), false);
assert.strictEqual(D.isDiffLike({ name: 'Bash', out: '@@ -1,3 +1,4 @@\n+added' }), true);

// 5. fromToolPart
const toolPartEdit = {
  name: 'Edit',
  kind: 'diff',
  input: {
    file_path: 'src/app/components/JarvisWidget.tsx',
    old_string: 'const a = 1;',
    new_string: 'const a = 2;\nconst b = 3;'
  },
  out: '8511\tconst a = 2;\n8512\tconst b = 3;'
};
const model = D.fromToolPart(toolPartEdit);
assert.ok(model);
assert.strictEqual(model.action, 'Updated');
assert.strictEqual(model.file, 'src/app/components/JarvisWidget.tsx');
assert.strictEqual(model.add, 2);
assert.strictEqual(model.del, 1);
assert.strictEqual(model.lines[0].oldLine, 8511);

// 6. renderDiff (Mock DOM)
const createMockDoc = () => {
  const el = (tag: string) => ({
    tagName: tag,
    className: '',
    textContent: '',
    title: '',
    children: [] as any[],
    classList: {
      add(c: string) { (this as any)._cls = c; },
      remove(c: string) { (this as any)._cls = ''; }
    },
    appendChild(child: any) { this.children.push(child); return child; },
    removeChild(child: any) {
      const idx = this.children.indexOf(child);
      if (idx >= 0) this.children.splice(idx, 1);
      return child;
    },
    append(...args: any[]) {
      args.forEach((a) => {
        if (typeof a === 'string') this.children.push({ text: a });
        else this.children.push(a);
      });
    },
    get lastChild() { return this.children[this.children.length - 1]; }
  });
  return {
    createElement: el,
    createTextNode: (t: string) => ({ text: t })
  };
};

const mockDoc = createMockDoc();
const mockParent = mockDoc.createElement('div');
const card = D.renderDiff(mockDoc, mockParent, model, { maxLines: 2 });
assert.strictEqual(card.className, 'diff-card');
assert.strictEqual(mockParent.children.length, 1);
// maxLines = 2 olduğuna göre diff-more butonu eklenmeli
const moreBtn = card.children.find((c: any) => c.className === 'diff-more');
assert.ok(moreBtn, 'kalan satırlar için katlanabilir buton bulunmalı');

console.log('✔ web/diff.js: kod farkı hesaplama, unified diff, satır numarası ve kart çizimi');
