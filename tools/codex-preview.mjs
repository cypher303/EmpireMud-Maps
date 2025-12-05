#!/usr/bin/env node
// Helper script for Codex-driven visual inspections.
// It builds the Vite app and starts a preview server on an available port,
// preferring 4173. Designed for transient local inspection only.

import { build, preview } from 'vite';
import net from 'node:net';

const DEFAULT_PORT = 4173;
const MAX_PROBES = 10;

async function findOpenPort(startPort, maxProbes) {
  for (let i = 0; i < maxProbes; i += 1) {
    const candidate = startPort + i;
    const available = await isPortAvailable(candidate);
    if (available) {
      return candidate;
    }
  }
  throw new Error(`No open port found after checking ${maxProbes} options starting at ${startPort}.`);
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => {
        resolve(false);
      })
      .once('listening', () => {
        tester.once('close', () => resolve(true)).close();
      })
      .listen(port, '127.0.0.1');
  });
}

async function startPreview() {
  const port = await findOpenPort(DEFAULT_PORT, MAX_PROBES);

  console.log('Building fresh preview bundle...');
  await build();

  console.log(`Starting Vite preview on port ${port} (hosted on localhost).`);
  const server = await preview({ preview: { port, host: 'localhost' } });

  const localUrl = server.resolvedUrls?.local?.[0] ?? `http://localhost:${port}/`;

  console.log('\nPreview ready for Codex visual checks:');
  console.log(`- Local: ${localUrl}`);
  console.log('\nUse Ctrl+C to stop the preview when finished.');
}

startPreview().catch((error) => {
  console.error('Failed to launch Codex preview:');
  console.error(error);
  process.exitCode = 1;
});
