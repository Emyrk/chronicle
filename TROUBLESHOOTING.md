# Troubleshooting Guide

## Error: "Module not found: Can't resolve '@uppy/react'"

This error occurs when the Uppy dependencies haven't been installed in your local environment.

### Solution

After pulling the `file-upload-remote` branch, you need to install the new dependencies:

```bash
npm install
```

This will install:
- `@uppy/core@^5.1.1`
- `@uppy/react@^5.1.1`
- `@uppy/dashboard@^5.0.4`
- `@uppy/tus@^5.0.2`

### Verify Installation

Check that the packages are installed:

```bash
ls node_modules/@uppy/
# Should show: core, dashboard, react, tus, etc.
```

### Full Setup Steps

If you're setting up from scratch:

```bash
# 1. Pull the branch
git fetch origin
git checkout file-upload-remote

# 2. Install dependencies
npm install

# 3. Start Supabase
npx supabase start

# 4. Apply migrations
npx supabase db reset

# 5. Generate types
npx supabase gen types --local > types/supabase.ts

# 6. Start dev server
npm run dev
```

## Other Common Issues

### Issue: Supabase not started

**Error**: `supabase start is not running`

**Solution**:
```bash
npx supabase start
```

### Issue: Types not generated

**Error**: TypeScript errors about missing types

**Solution**:
```bash
npx supabase gen types --local > types/supabase.ts
```

### Issue: Migration errors

**Error**: Migration fails to apply

**Solution**:
```bash
# Reset and reapply all migrations
npx supabase db reset
```

### Issue: Upload fails with 401 Unauthorized

**Cause**: User not authenticated or session expired

**Solution**:
- Sign out and sign back in
- Check that `.env.local` has correct Supabase credentials

### Issue: CSS not loading for Uppy

**Symptom**: Upload component appears unstyled

**Cause**: Uppy CSS imports not working

**Solution**: The CSS is imported in `battle-log-uploader.tsx`:
```tsx
import '@uppy/core/dist/style.min.css'
import '@uppy/dashboard/dist/style.min.css'
```

If still not working, verify CSS files exist:
```bash
ls node_modules/@uppy/core/dist/style.min.css
ls node_modules/@uppy/dashboard/dist/style.min.css
```

## Need More Help?

Check the main documentation: `UPLOAD_FEATURE.md`
