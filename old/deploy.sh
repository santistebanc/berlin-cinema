#!/bin/bash

echo "🚀 Building Berlin Cinema App..."

# Build the app
cd berlin-cinema-app
npm run build

if [ $? -eq 0 ]; then
    echo "✅ Build successful!"
    echo "📁 Build files created in berlin-cinema-app/dist/"
    echo ""
    echo "🌐 To deploy to a free service:"
    echo "1. Push to GitHub: git push origin main"
    echo "2. Enable GitHub Pages in your repository settings"
    echo "3. Or use Netlify: drag & drop the 'dist' folder to netlify.com"
    echo "4. Or use Vercel: npx vercel --prod"
    echo ""
    echo "🔧 To test locally:"
    echo "cd berlin-cinema-app/dist && python3 -m http.server 8000"
    echo "Then open http://localhost:8000 in your browser"
else
    echo "❌ Build failed!"
    exit 1
fi
