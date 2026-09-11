import { spawn, type ChildProcess } from 'node:child_process';

export interface ProcessResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export class CancelledError extends Error {
  constructor(message = 'Cancelled.') {
    super(message);
    this.name = 'CancelledError';
  }
}

// Arguments reach cmd.exe unquoted on Windows, so only allow characters that
// have no meaning to the shell. Package names and our fixed flags fit in this set.
const SAFE_SHELL_ARG = /^[A-Za-z0-9@._/=~:-]+$/;

function killProcessTree(child: ChildProcess) {
  // On Windows, killing the shell leaves the real process running underneath it.
  if (process.platform === 'win32' && child.pid !== undefined) {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      windowsHide: true,
    });
    return;
  }

  child.kill();
}

export function runProcess(
  command: string,
  args: string[],
  options: { cwd: string; signal?: AbortSignal; env?: Record<string, string> },
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const { cwd, signal } = options;
    const env = options.env ? { ...process.env, ...options.env } : undefined;

    if (signal?.aborted) {
      reject(new CancelledError());
      return;
    }

    let child: ChildProcess;

    if (process.platform === 'win32') {
      const unsafe = [command, ...args].find((arg) => !SAFE_SHELL_ARG.test(arg));

      if (unsafe !== undefined) {
        reject(new Error(`Refusing to pass unsafe argument to the shell: ${unsafe}`));
        return;
      }

      // Node refuses to spawn .cmd shims (npx, npm, pnpm, yarn) without a shell.
      child = spawn([command, ...args].join(' '), {
        cwd,
        env,
        shell: true,
        windowsHide: true,
      });
    } else {
      child = spawn(command, args, { cwd, env });
    }

    let stdout = '';
    let stderr = '';
    let settled = false;

    const settle = (fn: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      signal?.removeEventListener('abort', abortHandler);
      fn();
    };

    const abortHandler = () => {
      killProcessTree(child);
      settle(() => reject(new CancelledError()));
    };

    signal?.addEventListener('abort', abortHandler, { once: true });

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');

    child.stdout?.on('data', (data: string) => {
      stdout += data;
    });

    child.stderr?.on('data', (data: string) => {
      stderr += data;
    });

    child.on('error', (error) => {
      settle(() => reject(error));
    });

    child.on('close', (code) => {
      settle(() => resolve({ code, stdout, stderr }));
    });
  });
}
