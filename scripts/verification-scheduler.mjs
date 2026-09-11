import { createServer } from 'node:net';
import { createHash } from 'node:crypto';
import { availableParallelism, constants, setPriority } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

/** 内核持有锁：异常退出也会释放，不留下需要手动删除的 PID 文件。 */
export async function acquireVerificationSlot(workspace, log = console.log, signal) {
  const port = 45000 + createHash('sha256').update(workspace.toLowerCase()).digest().readUInt16BE() % 10000;
  let announced = false;
  for (;;) {
    signal?.throwIfAborted();
    const server = createServer(socket => socket.destroy());
    const acquired = await new Promise((resolve, reject) => {
      server.once('error', error => error.code === 'EADDRINUSE' ? resolve(false) : reject(error));
      server.listen({ host: '127.0.0.1', port, exclusive: true }, () => resolve(true));
    });
    if (acquired) return () => new Promise(resolve => server.close(resolve));
    if (!announced) { log('验证排队中：当前项目每次只运行一个检查。'); announced = true; }
    await delay(1000, undefined, { signal });
  }
}

/** Windows 子进程继承此亲和性与低优先级，约束 Vite、Chrome 与软件渲染线程总量。 */
export async function applyVerificationBudget() {
  setPriority(0, constants.priority.PRIORITY_BELOW_NORMAL);
  if (process.platform !== 'win32') return '低优先级';
  const cores = Math.max(1, Math.min(2, Math.floor(availableParallelism() / 4)));
  const script = `$ErrorActionPreference='Stop'; $taskProcess=Get-Process -Id ${process.pid}; $allowed=[long]$taskProcess.ProcessorAffinity; $selected=[long]0; $count=0; for($bit=0;$bit -lt 63 -and $count -lt ${cores};$bit++){ $value=[long]1 -shl $bit; if(($allowed -band $value) -ne 0){$selected=$selected -bor $value; $count++} }; if($selected -eq 0){throw 'No available CPU'}; $taskProcess.ProcessorAffinity=[IntPtr]$selected; Write-Output $count`;
  const { stdout } = await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true });
  return `低优先级，最多 ${stdout.trim()} 个逻辑核心（子进程继承）`;
}

export function verificationBatches(name, args) {
  if (name === 'battle-browser-report' && args.length === 0) return [['--core-only'], ['--natural-only']];
  if (name === 'battle-browser-report' && args.length === 1 && args[0] === '--relief-only') {
    return [1440, 1366, 1920].map(size => ['--relief-only', `--relief-size=${size}`]);
  }
  return [args];
}
