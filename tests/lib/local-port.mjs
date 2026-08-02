/* SPDX-License-Identifier: LicenseRef-Vahini-Proprietary
 * © 2026 Vahini Technologies. All rights reserved.
 *
 * Port hygiene for the tests that spawn a local server.
 *
 * Two problems this solves, both seen for real:
 *
 * 1. An orphaned server holds the port. The harnesses killed their child only
 *    on the normal path, so Ctrl-C (or any signal) left http-server running
 *    forever and every later run died with EADDRINUSE.
 * 2. Worse than the crash: nothing checked whether the port was already taken.
 *    A stale server from an older checkout answers on the same port and serves
 *    ITS files, so the suite reports pass/fail against code that is not in the
 *    working tree. Failing fast beats testing the wrong thing quietly.
 */
import net from 'node:net';

export function portInUse(port, host = '0.0.0.0') {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', (e) => resolve(e.code === 'EADDRINUSE' || e.code === 'EACCES'));
    probe.once('listening', () => probe.close(() => resolve(false)));
    probe.listen(port, host);
  });
}

export async function assertPortFree(port, what, host = '0.0.0.0') {
  if (!(await portInUse(port, host))) return;
  throw new Error(
    `port ${port} is already in use, so ${what} cannot start.\n` +
    `  Something else is listening there -- usually a server orphaned by an\n` +
    `  interrupted test run. It would answer these requests with ITS files,\n` +
    `  so this run is aborted rather than testing the wrong tree.\n\n` +
    `  Free it:    lsof -ti tcp:${port} | xargs kill\n` +
    `  If stuck:   lsof -ti tcp:${port} | xargs kill -9\n` +
    `  Check:      lsof -i tcp:${port}`
  );
}

/* Tear the child down on every exit path, not just the happy one. Returns the
 * stop function so callers can also call it explicitly in their finally. */
export function stopOnExit(child) {
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    try { child.kill('SIGTERM'); } catch { /* already gone */ }
  };
  process.once('exit', stop);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.once(sig, () => { stop(); process.exit(sig === 'SIGINT' ? 130 : 143); });
  }
  return stop;
}
