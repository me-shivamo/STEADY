#!/bin/bash
# usage: pdf2txt.sh in.pdf out.txt  -- ghostscript text extraction in SAFER mode
gs -dSAFER -dBATCH -dNOPAUSE -q -sDEVICE=txtwrite -sOutputFile="$2" "$1"
