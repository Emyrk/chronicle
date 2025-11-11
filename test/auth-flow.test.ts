import { describe, it, expect, vi, beforeEach } from 'vitest'
import { signUp, signIn, signOut } from '@/server/actions/auth'
import { createClient } from '@/lib/supabase/server'

vi.mock('@/lib/supabase/server')
vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

describe('Authentication Flow', () => {
  const mockSupabase = {
    auth: {
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getUser: vi.fn(),
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createClient).mockResolvedValue(mockSupabase as any)
  })

  describe('signUp', () => {
    it('should create a new user account', async () => {
      mockSupabase.auth.signUp.mockResolvedValue({
        data: { user: { id: '123' } },
        error: null,
      })

      const result = await signUp({
        email: 'test@example.com',
        password: 'password123',
        fullName: 'Test User',
      })

      expect(mockSupabase.auth.signUp).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
        options: {
          data: {
            full_name: 'Test User',
          },
        },
      })
      expect(result).toEqual({ success: true })
    })

    it('should return error on signup failure', async () => {
      mockSupabase.auth.signUp.mockResolvedValue({
        data: null,
        error: { message: 'Email already exists' },
      })

      const result = await signUp({
        email: 'test@example.com',
        password: 'password123',
      })

      expect(result).toEqual({ error: 'Email already exists' })
    })
  })

  describe('signIn', () => {
    it('should sign in an existing user', async () => {
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: { id: '123' } },
        error: null,
      })

      const result = await signIn({
        email: 'test@example.com',
        password: 'password123',
      })

      expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      })
      expect(result).toEqual({ success: true })
    })

    it('should return error on invalid credentials', async () => {
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: null,
        error: { message: 'Invalid login credentials' },
      })

      const result = await signIn({
        email: 'test@example.com',
        password: 'wrongpassword',
      })

      expect(result).toEqual({ error: 'Invalid login credentials' })
    })
  })

  describe('signOut', () => {
    it('should sign out the current user', async () => {
      mockSupabase.auth.signOut.mockResolvedValue({
        error: null,
      })

      const result = await signOut()

      expect(mockSupabase.auth.signOut).toHaveBeenCalled()
      expect(result).toBeUndefined()
    })
  })
})