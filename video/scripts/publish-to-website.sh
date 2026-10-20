#!/usr/bin/env bash
# Shrinks the rendered videos in out/ for the web and copies them, with a poster, into
# website/public/video/, where the website's home page plays them.
# Usage: scripts/publish-to-website.sh (after npm run render)
set -euo pipefail
cd "$(dirname "$0")/.."
dest=../website/public/video
mkdir -p "$dest"
for lang in zh en; do
  ffmpeg -loglevel error -y -i "out/tailnet-preview-$lang.mp4" -c:v libx264 -preset slow -crf 28 \
    -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 96k "$dest/tailnet-preview-$lang.mp4"
done
ffmpeg -loglevel error -y -ss 4 -i out/tailnet-preview-en.mp4 -frames:v 1 -vf scale=1280:-1 -q:v 4 "$dest/poster.jpg"
ls -l "$dest"
