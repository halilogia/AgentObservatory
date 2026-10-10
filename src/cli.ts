import { globalRunner } from './runtime/agent_runner.ts';
import { globalStore } from './core/event_store.ts';
import { TerminalUI, paint } from './ui/tui.ts';

const args = process.argv.slice(2);
const command = args[0] || 'watch';

async function main(): Promise<void> {
  if (command === 'run') {
    const agent = args[1];
    const prompt = args[2];

    if (!agent || !prompt) {
      console.error(paint('red', 'Kullanım: observatory run <claude|codex|agy> "<prompt>"'));
      process.exit(1);
    }

    const tui = new TerminalUI(globalStore);
    tui.start();

    try {
      const result = await globalRunner.runTask({
        agent,
        prompt,
        cwd: process.cwd(),
        timeoutSeconds: 300
      });
      console.log('\n' + paint('bold', 'Nihai Yanıt:'));
      console.log(result.assistantText || '(Boş)');
      process.exit(result.status === 'completed' ? 0 : 1);
    } catch (err: any) {
      console.error(paint('red', `\nHata: ${err.message}`));
      process.exit(1);
    }
  } else if (command === 'watch') {
    const isHistory = args.includes('--history') || args.includes('--all');
    const tui = new TerminalUI(globalStore);
    tui.startWatchMode(300, !isHistory);
    console.log(paint('gray', isHistory ? 'Tüm geçmiş olaylar ve canlı akış dinleniyor...' : 'Temiz oturum: Sadece yeni gelen canlı olaylar dinleniyor (Geçmiş için --history/--all veya [H] tuşu)...'));
  } else if (command === 'mcp') {
    const { startMcpServer } = await import('./mcp/mcp_server.ts');
    await startMcpServer();
  } else {
    console.log(paint('bold', '🔭 Agent Observatory CLI (TypeScript)'));
    console.log('Kullanım:');
    console.log('  node --experimental-strip-types src/cli.ts run <agent> "<prompt>"  - Ajanı çalıştırır ve canlı izler');
    console.log('  node --experimental-strip-types src/cli.ts watch                   - Canlı olay akışını izler');
    console.log('  node --experimental-strip-types src/cli.ts mcp                     - Antigravity MCP sunucu modu');
  }
}

main();
