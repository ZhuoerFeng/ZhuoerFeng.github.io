#!/bin/bash
cd "$(dirname "$0")"
xelatex -interaction=nonstopmode cv_cn.tex && xelatex -interaction=nonstopmode cv_cn.tex
echo "Done: cv_cn.pdf"
