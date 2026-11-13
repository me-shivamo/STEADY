#!/bin/bash
# OCR every Domino's nutrition image in 3 variants (raw gray x3, threshold 120, threshold 150; digit whitelist) for cross-checking manual transcription.
B=/tmp/claude-1000/-home-shivam-STEADY/7ffc6d5c-cce2-4f02-be37-170c43cc84e5/scratchpad/brands
cd $B/work/dominos/ocr2 || exit 1
for f in $B/dl/dominos/mni/MNI-*.jpg; do
  n=$(basename "$f" .jpg)
  ffmpeg -loglevel error -y -i "$f" -vf "scale=iw*3:ih*3:flags=lanczos,format=gray" "$B/work/dominos/ocr2/${n}_g.png"
  tesseract "$B/work/dominos/ocr2/${n}_g.png" "$B/work/dominos/ocr2/${n}_g" --psm 6 tsv >/dev/null 2>&1
  for th in 120 150 180; do
    ffmpeg -loglevel error -y -i "$f" -vf "scale=iw*3:ih*3:flags=lanczos,format=gray,lut=y='if(lt(val\,$th)\,0\,255)'" "$B/work/dominos/ocr2/${n}_t$th.png"
    tesseract "$B/work/dominos/ocr2/${n}_t$th.png" "$B/work/dominos/ocr2/${n}_t$th" --psm 6 -c tessedit_char_whitelist='0123456789.%' tsv >/dev/null 2>&1
  done
  rm -f "$B/work/dominos/ocr2/${n}"_*.png
done
echo done
