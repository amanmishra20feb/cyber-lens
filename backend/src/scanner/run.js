import { spawn } from 'node:child_process';

const MAX_OUTPUT = 64 * 1024 * 1024;

// The engines read code from strangers' repos, so they only get these variables, never our secrets.
const KEEP = ['PATH', 'HOME', 'USER', 'TMPDIR', 'LANG', 'LC_ALL', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY'];
const safeEnv = (extra) => ({ ...Object.fromEntries(KEEP.filter((k) => process.env[k] !== undefined).map((k) => [k, process.env[k]])), GIT_TERMINAL_PROMPT: '0', ...extra });

// Runs a program without a shell and never rejects: a failure comes back as code -1.
// `detached` puts it in its own process group, so killing -pid also stops the helpers semgrep starts.
export function run(cmd, args, { timeout, env, signal } = {}) {
  return new Promise((resolve) => {
    const out = [];
    let size = 0;
    let stderr = '';
    let stopped = ''; // why we killed it
    const child = spawn(cmd, args, { env: safeEnv(env), detached: true });
    const kill = (why) => {
      stopped ||= why;
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already exited */ }
    };
    const timer = timeout && setTimeout(() => kill(`timed out after ${Math.round(timeout / 1000)} s`), timeout);
    const onAbort = () => kill('cancelled');
    if (signal?.aborted) onAbort();
    else signal?.addEventListener('abort', onAbort, { once: true });
    const finish = (result) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolve(result);
    };

    child.stdout.on('data', (d) => { size += d.length; if (size <= MAX_OUTPUT) out.push(d); });
    child.stderr.on('data', (d) => { if (stderr.length < 20_000) stderr += d; });
    child.on('error', (e) => finish({ code: -1, stdout: '', stderr: e.code === 'ENOENT' ? `${cmd} is not installed` : e.message }));
    child.on('close', (code) =>
      finish({
        code: stopped ? -1 : code,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: stopped || (size > MAX_OUTPUT ? 'output too large' : stderr),
      }),
    );
  });
}
