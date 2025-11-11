#!/bin/bash

# Setup script for battle log upload feature

echo "🚀 Setting up Battle Log Upload Feature..."
echo ""

# Check if Supabase is running
echo "📊 Checking Supabase status..."
if ! npx supabase status > /dev/null 2>&1; then
  echo "⚠️  Supabase is not running. Starting now..."
  npx supabase start
else
  echo "✅ Supabase is running"
fi

echo ""
echo "🗄️  Applying database migrations..."
npx supabase db reset

echo ""
echo "📝 Regenerating TypeScript types..."
npx supabase gen types --local > types/supabase.ts

echo ""
echo "✅ Setup complete!"
echo ""
echo "📖 Next steps:"
echo "   1. Run 'npm run dev' to start the development server"
echo "   2. Sign in at http://localhost:3000/signin"
echo "   3. Navigate to /dashboard to test file uploads"
echo ""
echo "📚 See UPLOAD_FEATURE.md for detailed documentation"
