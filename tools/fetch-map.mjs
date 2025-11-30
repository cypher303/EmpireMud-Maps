import { createWriteStream, mkdirSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import http from 'node:http';
import https from 'node:https';

const DEFAULT_URL = 'https://empiremud.net/map.txt';
const destination = 'public/map.txt';
const MAX_REDIRECTS = 5;

function fetchFile(urlString, outputPath, redirectsRemaining = MAX_REDIRECTS) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const client = url.protocol === 'https:' ? https : http;

    const request = client.get(url, (response) => {
      const status = response.statusCode ?? 0;

      if (status >= 300 && status < 400 && response.headers.location) {
        if (redirectsRemaining <= 0) {
          reject(new Error(`Too many redirects while fetching ${urlString}`));
          return;
        }
        const nextUrl = new URL(response.headers.location, url).toString();
        response.resume();
        resolve(fetchFile(nextUrl, outputPath, redirectsRemaining - 1));
        return;
      }

      if (status >= 400) {
        reject(new Error(`Failed to fetch ${urlString}: ${status} ${response.statusMessage ?? ''}`.trim()));
        return;
      }

      mkdirSync(dirname(outputPath), { recursive: true });
      const writer = createWriteStream(outputPath);
      response.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
      response.on('error', reject);
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
