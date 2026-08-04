#!/usr/bin/env bash
#
# Pre-seed the Gradle distribution into the wrapper cache.
#
# Why this exists: gradlew downloads Gradle itself before it can build anything,
# and gradle-wrapper.properties caps that download with networkTimeout=10000.
# services.gradle.org 307-redirects to GitHub's release-asset CDN, and the 10s
# budget applies to connecting to *that* host - which from some networks takes
# longer, killing the build before a single line compiles. curl has no such cap.
#
# Safe to re-run: exits immediately if the distribution is already cached.
#
set -euo pipefail

cd "$(dirname "$0")/.."

PROPS="android/gradle/wrapper/gradle-wrapper.properties"
if [ ! -f "$PROPS" ]; then
  echo "No $PROPS - run 'npx expo prebuild -p android' first, or just run the"
  echo "build once so EAS generates the android/ folder, then re-run this."
  exit 1
fi

# distributionUrl escapes its colon as '\:' in .properties format
URL=$(grep '^distributionUrl=' "$PROPS" | cut -d= -f2- | sed 's|\\:|:|g')
ZIP=$(basename "$URL")        # e.g. gradle-8.14.3-bin.zip
NAME="${ZIP%.zip}"            # e.g. gradle-8.14.3-bin

# Gradle picks the cache dir as base36(md5(distributionUrl)) - see
# org.gradle.wrapper.PathAssembler#getHash. Reproducing it lets us seed the
# cache without first triggering a failed download to create the directory.
HASH=$(python3 -c "
import hashlib, sys
d = hashlib.md5(sys.argv[1].encode()).digest()
n = int.from_bytes(d, 'big')
digits = '0123456789abcdefghijklmnopqrstuvwxyz'
s = ''
while n:
    n, r = divmod(n, 36)
    s = digits[r] + s
print(s or '0')
" "$URL")

DEST="$HOME/.gradle/wrapper/dists/$NAME/$HASH"

if [ -f "$DEST/$ZIP.ok" ]; then
  echo "Already seeded: $DEST"
  exit 0
fi

echo "Seeding $NAME"
echo "  from: $URL"
echo "  into: $DEST"

mkdir -p "$DEST"
rm -f "$DEST"/*.part "$DEST"/*.lck

curl -L --fail --retry 5 --retry-delay 3 --connect-timeout 30 --max-time 900 \
  -o "$DEST/$ZIP" "$URL"

python3 -c "
import zipfile, sys
z = zipfile.ZipFile(sys.argv[1])
bad = z.testzip()
if bad:
    raise SystemExit('corrupt zip entry: ' + bad)
z.extractall(sys.argv[2])
print('unpacked', len(z.namelist()), 'entries')
" "$DEST/$ZIP" "$DEST"

chmod +x "$DEST"/*/bin/gradle

# The wrapper trusts this marker file and skips downloading entirely.
touch "$DEST/$ZIP.ok"

echo "Seeded. Verifying:"
"$DEST"/*/bin/gradle --version | grep -E '^Gradle'
