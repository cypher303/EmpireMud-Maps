#!/usr/bin/env bash
# Batch-convert common audio files in a directory to WebM/Opus at 192 kbps.
# Usage: tools/convert-audio-opus.sh [input_dir]
# Defaults to the project audio folder: public/audio/
# Requires: ffmpeg (brew install ffmpeg)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEFAULT_INPUT="${REPO_ROOT}/public/audio"

INPUT_DIR="${1:-${DEFAULT_INPUT}}"
BITRATE="${BITRATE:-192k}"

if [[ ! -d "${INPUT_DIR}" ]]; then
  echo "Input directory not found: ${INPUT_DIR}" >&2
  exit 1
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg not found. Install it first (e.g., brew install ffmpeg)." >&2
  exit 1
fi

echo "Converting audio under ${INPUT_DIR} to Opus/WebM at ${BITRATE}..."

# Use process substitution to keep ffmpeg from reading the find stream; -nostdin blocks it from consuming stdin.
while IFS= read -r -d '' src; do
  base="${src%.*}"
  out="${base}.webm"

  if [[ -f "${out}" ]]; then
    # Skip if an existing conversion is already newer than the source.
    if [[ "${src}" -ot "${out}" ]]; then
      echo "  -> ${out} (skip: existing conversion is newer)"
      continue
    fi

    # Preserve the existing conversion with a timestamped backup.
    stamp="$(date -r "${out}" +"%Y%m%d-%H%M%S")"
    backup="${base}_${stamp}.webm"
    if [[ -f "${backup}" ]]; then
      backup="${base}_${stamp}_$RANDOM.webm"
    fi
    echo "  preserving ${out} -> ${backup}"
    mv "${out}" "${backup}"
  fi

  echo "  -> ${out}"
  ffmpeg -nostdin -y -i "${src}" \
    -c:a libopus -b:a "${BITRATE}" -vbr on -compression_level 10 -application audio -cutoff 20000 \
    "${out}" >/dev/null
done < <(
  find "${INPUT_DIR}" -type f \
    \( -iname '*.wav' -o -iname '*.mp3' -o -iname '*.flac' -o -iname '*.aiff' -o -iname '*.m4a' \) \
    -print0
)

echo "Done."
