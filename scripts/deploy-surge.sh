#!/bin/bash

# Quick deployment script for Surge.sh
# Free static hosting - no signup required

echo "================================================================================"
echo "DEPLOYING TO SURGE.SH"
echo "================================================================================"
echo ""

# Check if surge is installed
if ! command -v surge &> /dev/null; then
    echo "Installing Surge CLI..."
    npm install -g surge
    echo ""
fi

# Create a temporary deployment directory
DEPLOY_DIR="./surge-deploy"
rm -rf "$DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR"

# Copy the HTML file as index.html
cp staking-analysis-report.html "$DEPLOY_DIR/index.html"

echo "Deploying your staking analysis report..."
echo ""

# Deploy to surge with a random subdomain
cd "$DEPLOY_DIR"
surge --domain https://polygon-staking-$(date +%s).surge.sh

echo ""
echo "================================================================================"
echo "✅ DEPLOYMENT COMPLETE"
echo "================================================================================"
echo ""
echo "Your page is now live and can be accessed by anyone with the URL above!"
echo "The page will remain active and free to access."
echo ""
echo "Note: Surge.sh keeps sites online indefinitely unless you remove them."
echo ""

# Clean up
cd ..
rm -rf "$DEPLOY_DIR"
