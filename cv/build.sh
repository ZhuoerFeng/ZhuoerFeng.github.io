#!/bin/bash
cd "$(dirname "$0")"
pdflatex -interaction=nonstopmode cv.tex && pdflatex -interaction=nonstopmode cv.tex
echo "Done: cv.pdf"
