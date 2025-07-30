#!/bin/bash

# Fix for Docker node_modules and dependencies
echo "🔧 Fixing Docker dependencies..."

# Clean install with legacy peer deps to handle conflicts
npm install --legacy-peer-deps --no-optional

# Ensure react-colorful is properly installed
if [ ! -d "node_modules/react-colorful" ]; then
    echo "Installing react-colorful..."
    npm install react-colorful@5.6.1 --legacy-peer-deps
fi

# Clear any build cache
npm run clean 2>/dev/null || true

echo "✅ Dependencies fixed!"

# Start the original command
exec "$@"