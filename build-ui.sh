#!/bin/bash
set -e

# 1. Navigate to the Angular source directory
cd "$(dirname "$0")/web-src"

# 2. Build the Angular Application for Production
echo "🚀 Building Angular production bundle..."
npm run build -- --base-href=/admin/

# 3. Clean Go's target embed directories
echo "🧹 Cleaning old Go embedded assets..."
rm -rf ../web/static/*
rm -rf ../web/templates/*

# 4. Copy the compiled outputs to Go's directories
echo "📦 Transferring compiled bundles..."
# In Angular 19/20, outputPath "dist/web-src" creates a "browser" folder inside
cp dist/web-src/browser/index.html ../web/templates/index.html
cp -r dist/web-src/browser/* ../web/static/
rm -f ../web/static/index.html

echo "✅ UI integration staging completed successfully!"
