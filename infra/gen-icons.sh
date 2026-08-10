#!/usr/bin/env bash
# Rasterize public/favicon.svg into public/favicon.ico and public/apple-touch-icon.png.
# Run after changing favicon.svg. Requires headless Chrome and ImageMagick.
#
# Rendering goes through an <img> at an explicit pixel size on purpose: pointing a
# rasterizer at the standalone SVG lets the viewport drive layout, which is what
# produced the displaced, clipped icons this script replaced.
set -euo pipefail

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PUBLIC="$ROOT/public"

# The icon's own tile color, not the app background: the shamrock needs a dark
# ground to stay legible at 16px. Baked into the opaque icons so their inset
# padding blends into the tile drawn by the SVG. Keep in sync with the <rect>
# fill in public/favicon.svg.
BG="#121417"

for cmd in "$CHROME" magick; do
  command -v "$cmd" >/dev/null 2>&1 || [ -x "$cmd" ] || {
    echo "missing dependency: $cmd" >&2
    exit 1
  }
done

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cp "$PUBLIC/favicon.svg" "$WORK/icon.svg"

# render <size-px> <css-background> <padding-px> <output-png>
render() {
  local size="$1" bg="$2" pad="$3" out="$4"
  local inner=$((size - 2 * pad))
  cat > "$WORK/page.html" <<HTML
<body style="margin:0;width:${size}px;height:${size}px;background:${bg}">
<img src="icon.svg" width="${inner}" height="${inner}"
     style="display:block;margin:${pad}px">
</body>
HTML
  "$CHROME" --headless --disable-gpu --hide-scrollbars \
    --default-background-color=00000000 \
    --screenshot="$out" --window-size="${size},${size}" \
    "file://$WORK/page.html" >/dev/null 2>&1
  magick "$out" -crop "${size}x${size}+0+0" +repage "$out"
}

# Favicon frames: transparent, full bleed.
for size in 16 32 48; do
  render "$size" transparent 0 "$WORK/fav-$size.png"
done
magick "$WORK/fav-16.png" "$WORK/fav-32.png" "$WORK/fav-48.png" "$PUBLIC/favicon.ico"

# apple-touch-icon: opaque, and inset so iOS's rounded-corner mask doesn't clip it.
render 180 "$BG" 18 "$PUBLIC/apple-touch-icon.png"
magick "$PUBLIC/apple-touch-icon.png" -background "$BG" -alpha remove -alpha off \
  "$PUBLIC/apple-touch-icon.png"

# Manifest icons: opaque too, since launchers composite home-screen icons over
# arbitrary wallpaper. Same 10% inset as the Apple icon.
for size in 192 512; do
  render "$size" "$BG" $((size / 10)) "$PUBLIC/icon-$size.png"
  magick "$PUBLIC/icon-$size.png" -background "$BG" -alpha remove -alpha off \
    "$PUBLIC/icon-$size.png"
done

echo "wrote favicon.ico, apple-touch-icon.png, icon-192.png, icon-512.png in $PUBLIC"
