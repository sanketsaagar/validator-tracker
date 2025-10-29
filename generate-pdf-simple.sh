#!/bin/bash

# Simple PDF generation using Chrome/Safari

HTML_FILE="/Users/ssaagar/Desktop/validator-stake-tracker/staking-analysis-report.html"
PDF_FILE="/Users/ssaagar/Desktop/validator-stake-tracker/staking-analysis-report.pdf"

echo "================================================================================"
echo "GENERATING PDF REPORT"
echo "================================================================================"
echo ""

# Check if Chrome is available
if [ -f "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]; then
    echo "Using Google Chrome to generate PDF..."
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
        --headless \
        --disable-gpu \
        --print-to-pdf="$PDF_FILE" \
        --no-pdf-header-footer \
        --print-to-pdf-no-header \
        "$HTML_FILE" 2>/dev/null

    if [ $? -eq 0 ]; then
        echo ""
        echo "================================================================================"
        echo "✅ PDF GENERATED SUCCESSFULLY"
        echo "================================================================================"
        echo ""
        echo "PDF saved to: $PDF_FILE"
        echo ""
        exit 0
    fi
fi

# Fallback: Instructions for manual conversion
echo "⚠️  Automated PDF generation not available."
echo ""
echo "Please generate PDF manually:"
echo "1. Open: $HTML_FILE"
echo "2. Press Command+P (Print)"
echo "3. Click 'Save as PDF' in the print dialog"
echo "4. Save to: $PDF_FILE"
echo ""
