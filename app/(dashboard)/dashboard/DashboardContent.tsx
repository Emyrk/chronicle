'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { signOut } from '@/server/actions/auth'

export interface DashboardContentProps {
  user: {
    email?: string
    id?: string
  } | null
  onSignOut?: () => void
}

export function DashboardContent({ user, onSignOut }: DashboardContentProps) {
  const handleSignOut = onSignOut || (() => signOut())

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <form action={handleSignOut}>
          <Button variant="outline" type="submit">
            Sign Out
          </Button>
        </form>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Welcome!</CardTitle>
          <CardDescription>
            You are signed in as {user?.email}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            User ID: {user?.id}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
