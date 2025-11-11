import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { signOut } from '@/server/actions/auth'
import { BattleLogUploader } from '@/components/features/uploads/battle-log-uploader'
import { UploadList } from '@/components/features/uploads/upload-list'
import { Separator } from '@/components/ui/separator'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch user's uploads
  const { data: uploads } = await supabase
    .from('battle_log_uploads')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Battle Log Manager</h1>
          <p className="text-muted-foreground mt-1">
            Upload and manage your World of Warcraft combat logs
          </p>
        </div>
        <form action={signOut}>
          <Button variant="outline" type="submit">
            Sign Out
          </Button>
        </form>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload Battle Log</CardTitle>
          <CardDescription>
            Upload your .txt combat log files. Files are stored securely and will be parsed automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BattleLogUploader />
        </CardContent>
      </Card>

      <div>
        <h2 className="text-2xl font-bold mb-4">Your Uploads</h2>
        <UploadList uploads={uploads || []} />
      </div>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>Account Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div>
              <span className="font-medium">Email:</span>{' '}
              <span className="text-muted-foreground">{user?.email}</span>
            </div>
            <div>
              <span className="font-medium">User ID:</span>{' '}
              <span className="text-muted-foreground font-mono text-xs">{user?.id}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}