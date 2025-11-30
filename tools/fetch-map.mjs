import { createWriteStream, mkdirSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import http from 'node:http';
import https from 'node:https';

const DEFAULT_URL = 'http://empiremud.net/map.txt';
const destination = 'public/map.txt';

function fetchFile(urlString, outputPath) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const client = url.protocol === 'https:' ? https : http;

    const request = client.get(url, (response) => {
      if (response.statusCode && response.statusCode >= 400) {
        reject(new Error(`Failed to fetch ${urlString}: ${response.statusCode} ${response.statusMessage}`));
        return;
      }

      mkdirSync(dirname(outputPath), { recursive: true });
      const writer = createWriteStream(outputPath);
      response.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    request.on('error', reject);
  });
}

async function main() {
  const source = process.env.MAP_SOURCE_URL || DEFAULT_URL;
  console.log(`Downloading ${basename(source)} from ${source}`);
  try {
    await fetchFile(source, destination);
    console.log(`Saved to ${destination}`);
  } catch (error) {
    console.error('Unable to download map.txt automatically.');
    console.error(error instanceof Error ? error.message : error);
    console.error('If the upstream is blocked, download it manually and place it in public/map.txt.');
    process.exitCode = 1;
  }
}

main();
