#!/usr/bin/env bash
cd /Users/scott/WebstormProjects/Empire-Maps-Multiple-Projects/Empire-Maps || exit 1
npm run generate:textures -- --force --purge

# node --import tsx tools/generate-textures.ts --force --purge