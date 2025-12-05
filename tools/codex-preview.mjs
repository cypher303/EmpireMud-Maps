#!/usr/bin/env node
// Helper script for Codex-driven visual inspections.
// It builds the Vite app and starts a preview server on 0.0.0.0:8080,
// matching the reliable command we've been using in the Codex environment.

import { build, preview } from 'vite';

const HOST = '0.0.0.0';
const PORT = 8080;

async function startPreview() {
  console.log('Building fresh preview bundle...');
  await build();

  console.log(`Starting Vite preview on ${HOST}:${PORT}.`);
  const server = await preview({ preview: { port: PORT, host: HOST } });

  const localUrl = server.resolvedUrls?.local?.[0] ?? `http://${HOST}:${PORT}/`;

  console.log('\nPreview ready for Codex visual checks:');
  console.log(`- Local: ${localUrl}`);
  console.log('\nUse Ctrl+C to stop the preview when finished.');
}

startPreview().catch((error) => {
  console.error('Failed to launch Codex preview:');
  console.error(error);
  process.exitCode = 1;
});
