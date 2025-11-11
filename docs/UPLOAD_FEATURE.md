# Battle Log Upload Feature

This feature allows authenticated users to upload World of Warcraft combat log files (.txt) to Supabase Storage.

## Architecture

1. **Frontend**: Uppy dashboard for drag-and-drop file uploads with resumable uploads via TUS protocol
2. **Storage**: Supabase Storage bucket `battle-logs` (public read, authenticated write)
3. **Database**: `battle_log_uploads` table tracks file metadata and parsing status
4. **Future**: Edge function will parse logs and insert parsed data into database

## Components

### BattleLogUploader
- Location: `components/features/uploads/battle-log-uploader.tsx`
- Features:
  - Drag-and-drop interface
  - Resumable uploads (TUS protocol)
  - File validation (.txt only, 50MB max)
  - Automatic database record creation on upload success
  - Toast notifications for success/error states

### UploadList
- Location: `components/features/uploads/upload-list.tsx`
- Features:
  - Display user's uploaded files in a table
  - Download files
  - Delete files (both storage and database)
  - Status badges (uploaded, processing, parsed, error)
  - File size formatting
  - Date formatting

## Database Schema

### `battle_log_uploads` table
```sql
CREATE TABLE battle_log_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  content_type TEXT DEFAULT 'text/plain',
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'processing', 'parsed', 'error')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Status Flow
1. `uploaded` - File successfully uploaded to storage
2. `processing` - Edge function is parsing the file (future)
3. `parsed` - Successfully parsed and data inserted (future)
4. `error` - Parsing failed, check `error_message` (future)

## Storage Bucket: `battle-logs`

### Policies
- **Public**: Yes (anyone can read/download files)
- **Insert**: Authenticated users only
- **Delete**: Users can only delete their own files
- **Update**: Users can only update their own files

## Setup Instructions

### 1. Apply Migrations
```bash
npx supabase db reset  # Apply all migrations
npx supabase gen types --local > types/supabase.ts  # Regenerate types
```

### 2. Environment Variables
Ensure these are set in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Install Dependencies
Already installed:
- `@uppy/core` - Core Uppy functionality
- `@uppy/react` - React components
- `@uppy/dashboard` - Uppy UI
- `@uppy/tus` - Resumable uploads

## Usage

### In a Page
```tsx
import { BattleLogUploader } from '@/components/features/uploads/battle-log-uploader'
import { UploadList } from '@/components/features/uploads/upload-list'

export default async function Page() {
  const supabase = await createClient()
  const { data: uploads } = await supabase
    .from('battle_log_uploads')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div>
      <BattleLogUploader />
      <UploadList uploads={uploads || []} />
    </div>
  )
}
```

### With Callbacks
```tsx
<BattleLogUploader
  onUploadComplete={(fileData) => {
    console.log('Upload complete:', fileData)
    // Trigger revalidation, show notification, etc.
  }}
/>
```

## Next Steps (Future Development)

1. **Edge Function for Parsing**
   - Create Supabase Edge Function to parse WoW combat logs
   - Trigger on file upload or database insert
   - Update status to `processing` → `parsed` or `error`
   - Insert parsed data into combat log tables

2. **Real-time Updates**
   - Add Supabase real-time subscription to `battle_log_uploads`
   - Update UI when parsing completes
   - Show progress notifications

3. **Enhanced Features**
   - Bulk upload support
   - File preview
   - Parsing progress indicator
   - Automatic retry on parsing failure
   - File validation (check if valid WoW log format)

## File Naming Convention

Files are stored with timestamp prefix:
```
battle-logs/
  └── {timestamp}-{original-filename}.txt
  
Example: 1699999999999-raid-log.txt
```

This prevents filename collisions and allows chronological sorting.

## Testing

### Manual Testing
1. Sign up/sign in to the application
2. Navigate to `/dashboard`
3. Drag and drop a .txt file or click to select
4. Verify upload progress
5. Check file appears in "Your Uploads" list
6. Test download and delete functionality

### Check Storage
```bash
npx supabase storage ls battle-logs
```

### Check Database
```sql
SELECT * FROM battle_log_uploads ORDER BY created_at DESC;
```
