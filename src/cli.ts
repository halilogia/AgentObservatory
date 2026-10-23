import { globalRunner } from './runtime/agent_runner.ts';
import { globalStore } from './core/event_store.ts';
import { TerminalUI, paint, showSessionPicker, handlePickerKey, inspectTask, resetViewMode } from './ui/tui.ts';

const args = process.argv.slice(2);
const command = args[0] || 'watch';

// `sessions` komutu için raw mode girdi: 1-9 seç, S listeye dön, C canlı akış, Q/Esc çıkış.
function startPickerInput(): void {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    console.log(paint('gray', '(Etkileşimli giriş için TTY gerekli; çıkılıyor. Tek görev için: observatory inspect <taskId>)'));
    process.exit(0);
  }
  stdin.setRawMode(true);
  stdin.resume();
  const release = (): void => {
    stdin.off('data', onKey);
    try {
      stdin.setRawMode(false);
    } catch {}
    stdin.pause();
  };
  const onKey = (chunk: Buffer | string): void => {
    const key = chunk.toString();
    if (key === '\u0003' || key === 'q' || key === 'Q') {
      release();
      process.exit(0);
    }
    const action = handlePickerKey(key);
    if (action === 'handled') return;
    if (action === 'live' || key === 'c' || key === 'C') {
      release();
      resetViewMode();
      new TerminalUI(globalStore).startWatchMode(300, true);
    } else if (key === 's' || key === 'S') {
      showSessionPicker();
    }
  };
  stdin.on('data', onKey);
}

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
  } else if (command === 'sessions') {
    const tasks = showSessionPicker();
    if (tasks.length === 0) process.exit(0);
    startPickerInput();
  } else if (command === 'inspect') {
    const taskId = args[1];
    if (!taskId) {
      console.error(paint('red', 'Kullanım: observatory inspect <taskId>'));
      process.exit(1);
    }
    inspectTask(taskId);
    process.exit(0);
  } else if (command === 'mcp') {
    const { startMcpServer } = await import('./mcp/mcp_server.ts');
    await startMcpServer();
  } else if (command === 'chat') {
    const { runChat } = await import('./ui/transcript.ts');
    await runChat(args.slice(1));
  } else if (command === 'doctor') {
    const { runDoctor } = await import('./commands/doctor.ts');
    await runDoctor(args.slice(1));
    process.exit(0);
  } else if (command === 'serve') {
    const { startServer } = await import('./commands/serve.ts');
    const pIdx = args.indexOf('--port');
    const port = pIdx >= 0 ? Number(args[pIdx + 1]) : Number(process.env.OBSERVATORY_PORT) || 8787;
    startServer({ port });
    console.log(paint('gray', `Observatory API: http://127.0.0.1:${port}  (/health, /tasks, /events, /stream)`));
  } else {
    console.log(paint('bold', '🔭 Agent Observatory CLI (TypeScript)'));
    console.log('Kullanım:');
    console.log('  node --experimental-strip-types src/cli.ts run <agent> "<prompt>"  - Ajanı çalıştırır ve canlı izler');
    console.log('  node --experimental-strip-types src/cli.ts watch                   - Canlı olay akışını izler');
    console.log('  node --experimental-strip-types src/cli.ts sessions                - Son oturumları listeler, seçileni inceler');
    console.log('  node --experimental-strip-types src/cli.ts inspect <taskId>        - Tek bir görevin tüm olaylarını gösterir');
    console.log('  node --experimental-strip-types src/cli.ts mcp                     - Antigravity MCP sunucu modu');
    console.log('  node --experimental-strip-types src/cli.ts chat [taskId|latest] [--follow] [--skin X] - Oturumu ajanın CLI görünümünde gösterir');
    console.log('  node --experimental-strip-types src/cli.ts doctor [--live]        - Kurulu ajanları ve (--live) gerçek yanıtı denetler');
    console.log('  node --experimental-strip-types src/cli.ts serve [--port 8787]     - Olayları HTTP + SSE ile yayınlar');
  }
}

main();
