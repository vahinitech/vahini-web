import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const PORT = 4173;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const TARGETS = [
  '/site/index.html',
  '/analyser/Vahini%20Analyser.html'
];

function isReadyOutput(text) {
  const out = text.toLowerCase();
  return out.includes('available on') || out.includes('http-server started');
}

async function waitForReady() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await fetch(`${BASE_URL}/site/index.html`, { method: 'HEAD' });
      if (res.ok) {
        return;
      }
    } catch {
      // Server may still be starting.
    }
    await delay(250);
  }
  throw new Error('Timed out waiting for local test server');
}

async function run() {
  const server = spawn('./node_modules/.bin/http-server', ['.', '-p', String(PORT), '-c-1'], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let startupLog = '';
  server.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    startupLog += text;
  });
  server.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    startupLog += text;
  });

  try {
    await waitForReady();

    for (const path of TARGETS) {
      const res = await fetch(`${BASE_URL}${path}`, { method: 'HEAD' });
      if (!res.ok) {
        throw new Error(`Expected 200 for ${path}, got ${res.status}`);
      }
      console.log(`PASS ${path} -> ${res.status}`);
    }
  } catch (err) {
    if (startupLog.trim()) {
      console.error(startupLog);
    }
    throw err;
  } finally {
    server.kill('SIGTERM');
  }
}

run().catch((err) => {
  console.error(`Smoke test failed: ${err.message}`);
  process.exit(1);
});