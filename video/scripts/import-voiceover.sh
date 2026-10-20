#!/usr/bin/env bash
# Copies voice-over takes made elsewhere (such as ElevenLabs) into public/voiceover/<lang>/,
# normalizing their loudness, and records their lengths in src/voiceover.json.
# Usage: scripts/import-voiceover.sh <lang> <dir with <id>.mp3 files>
set -euo pipefail
lang=$1
src=$(cd "$2" && pwd)
cd "$(dirname "$0")/.."
mkdir -p "public/voiceover/$lang"
for f in "$src"/*.mp3; do
  id=$(basename "$f" .mp3)
  ffmpeg -loglevel error -y -i "$f" -af loudnorm=I=-16:TP=-1.5 -ar 44100 -b:a 128k "public/voiceover/$lang/$id.mp3"
  seconds=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "public/voiceover/$lang/$id.mp3")
  node -e '
    const fs = require("fs")
    const [lang, id, seconds] = process.argv.slice(1)
    const all = JSON.parse(fs.readFileSync("src/voiceover.json", "utf8"))
    all[lang][id] = Math.round(Number(seconds) * 100) / 100
    fs.writeFileSync("src/voiceover.json", JSON.stringify(all, null, 2) + "\n")
  ' "$lang" "$id" "$seconds"
  echo "$lang $id $seconds"
done
