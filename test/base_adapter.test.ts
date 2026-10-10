import assert from 'node:assert';
import { BaseAdapter } from '../src/adapters/base_adapter.ts';

class DummyAdapter extends BaseAdapter {
  constructor() {
    super('claude');
  }
  buildCommand(opts: any): any {
    return { exe: 'dummy', args: [], cwd: opts.cwd || process.cwd(), env: process.env };
  }
  handleStdoutLine(_line: string, _taskId: string, _store: any): void {}
}

const adapter = new DummyAdapter();
assert.strictEqual(adapter.name, 'claude', 'Adapter adı doğru dönmeli');

console.log('✔ base_adapter.test.ts başarıyla geçti!');
