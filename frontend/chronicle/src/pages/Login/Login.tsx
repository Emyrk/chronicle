import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/Card/Card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/Alert/Alert"
import { MagicLogo } from "@/components/MagicLogo"
import { useAuthProviders } from "@/api/queries"
import { useAuth } from "@/hooks/useAuth"

const DISCORD_URL = "https://discord.gg/gz97ABFVAj"

export function Login() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const { data: providers = [], isLoading: providersLoading, isError: providersError, error: providersErrorMsg } = useAuthProviders()
  const loading = (authLoading || providersLoading) && !providersError
  const authError = searchParams.get("error")

  const resetToken = searchParams.get("reset_token")
  const [mode, setMode] = useState<"login" | "register" | "forgot" | "reset">(resetToken ? "reset" : "login")
  const [email, setEmail] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [formError, setFormError] = useState<string | null>(null)
  const [formErrorDetail, setFormErrorDetail] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null)
  const [resending, setResending] = useState(false)
  const [resendMessage, setResendMessage] = useState<string | null>(null)
  const [forgotSent, setForgotSent] = useState(false)

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/", { replace: true })
    }
  }, [isAuthenticated, navigate])

  const handleOAuthLogin = (providerName: string) => {
    const params = new URLSearchParams(window.location.search)
    let redirectUri = params.get("from")
    if (!redirectUri && document.referrer) {
      try {
        const referrerUrl = new URL(document.referrer)
        if (referrerUrl.origin === window.location.origin) {
          redirectUri = referrerUrl.pathname + referrerUrl.search
        }
      } catch {
        // Invalid referrer URL, ignore
      }
    }
    redirectUri = redirectUri || "/"
    window.location.assign(`/auth/${providerName}?from=${encodeURIComponent(redirectUri)}`)
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    setFormErrorDetail(null)

    if (mode === "register" && password !== confirmPassword) {
      setFormError("Passwords do not match.")
      return
    }

    setSubmitting(true)

    try {
      const endpoint = mode === "register"
        ? "/auth/password/register"
        : "/auth/password/login"

      const body = mode === "register"
        ? { email, username, password }
        : { email, password }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const data = await response.json()

      if (!response.ok) {
        setFormError(data.message || "An error occurred.")
        setFormErrorDetail(data.detail || null)
        return
      }

      if (mode === "register") {
        // Show "check your email" screen; user is logged in but should verify
        setRegisteredEmail(email)
        return
      }

      // Login: session cookie is set by the server, reload to pick it up
      window.location.href = "/"
    } catch {
      setFormError("Network error. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  const handleResendVerification = async () => {
    if (!registeredEmail) return
    setResending(true)
    setResendMessage(null)
    try {
      const response = await fetch("/auth/password/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: registeredEmail }),
      })
      const data = await response.json()
      if (response.status === 429) {
        setResendMessage(data.message || "Please wait before requesting again.")
      } else {
        setResendMessage("Verification email sent!")
      }
    } catch {
      setResendMessage("Failed to resend. Please try again.")
    } finally {
      setResending(false)
    }
  }
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    setFormErrorDetail(null)
    setSubmitting(true)

    try {
      await fetch("/auth/password/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      // Always show success regardless of response (don't leak email existence)
      setForgotSent(true)
    } catch {
      setFormError("Network error. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    setFormErrorDetail(null)

    if (password !== confirmPassword) {
      setFormError("Passwords do not match.")
      return
    }

    setSubmitting(true)

    try {
      const response = await fetch("/auth/password/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: resetToken, password }),
      })

      const data = await response.json()

      if (!response.ok) {
        setFormError(data.message || "An error occurred.")
        setFormErrorDetail(data.detail || null)
        return
      }

      // Redirect to login with success message
      window.location.href = "/login?password_reset=1"
    } catch {
      setFormError("Network error. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }


  return (
    <div className="flex min-h-svh flex-col items-center justify-center pb-50">
      <div className="w-full max-w-md space-y-8 px-4">
        <div className="text-center">
          <MagicLogo
            src="/c/chronicle/ChronicleLogoCenter.svg"
            alt="Chronicle Logo"
            className="mx-auto h-80 w-80"
          />
        </div>

        <Card className="p-8">
          {searchParams.get("verified") === "1" && (
            <Alert className="mb-4">
              <AlertTitle>Email verified!</AlertTitle>
              <AlertDescription>
                Your email has been verified. You can now sign in.
              </AlertDescription>
            </Alert>
          )}
          {searchParams.get("password_reset") === "1" && (
            <Alert className="mb-4">
              <AlertTitle>Password reset!</AlertTitle>
              <AlertDescription>
                Your password has been reset. You can now sign in.
              </AlertDescription>
            </Alert>
          )}


          {authError === "invalid_token" && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>
                Verification link is invalid or expired. Please request a new one.
              </AlertDescription>
            </Alert>
          )}

          {authError === "not_in_discord" && (
            <Alert className="mb-4">
              <AlertTitle>Join Discord first</AlertTitle>
              <AlertDescription>
                You need to join our Discord server before signing in. {" "}
                <a href={DISCORD_URL} target="_blank" rel="noreferrer" className="underline">
                  Join Discord
                </a>
              </AlertDescription>
            </Alert>
          )}
          {authError === "signups_disabled" && (
            <Alert variant="destructive" className="mb-4">
              <AlertTitle>Signups Disabled</AlertTitle>
              <AlertDescription>
                New account registration is currently disabled. Please try again later.
              </AlertDescription>
            </Alert>
          )}


          {formError && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>
                {formError}
                {formErrorDetail && (
                  <span className="mt-1 block font-mono text-xs whitespace-pre-wrap break-all">{formErrorDetail}</span>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Post-registration: Check your email */}
          {registeredEmail ? (
            <div className="space-y-4 text-center">
              <h2 className="text-lg font-semibold">Check your email</h2>
              <p className="text-sm text-muted-foreground">
                We sent a verification link to <strong>{registeredEmail}</strong>.
                <br />
                You can continue using Chronicle, but please verify your email.
              </p>
              {resendMessage && (
                <p className="text-sm text-muted-foreground">{resendMessage}</p>
              )}
              <div className="flex gap-2 justify-center">
                <Button variant="outline" onClick={handleResendVerification} disabled={resending}>
                  {resending ? "Sending..." : "Resend email"}
                </Button>
                <Button onClick={() => { window.location.href = "/" }}>
                  Continue
                </Button>
              </div>
            </div>
          ) : forgotSent ? (
            <div className="space-y-4 text-center">
              <h2 className="text-lg font-semibold">Check your email</h2>
              <p className="text-sm text-muted-foreground">
                If an account exists with that email, we&apos;ve sent a password reset link.
              </p>
              <Button variant="outline" onClick={() => { setMode("login"); setForgotSent(false); setFormError(null); setFormErrorDetail(null) }}>
                Back to sign in
              </Button>
            </div>
          ) : mode === "forgot" ? (
          <>
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <h2 className="text-lg font-semibold text-center">Forgot Password</h2>
            <p className="text-sm text-center text-muted-foreground">
              Enter your email and we&apos;ll send you a link to reset your password.
            </p>

            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="you@example.com"
              />
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Sending..." : "Send Reset Link"}
            </Button>

            <p className="text-sm text-center text-muted-foreground">
              <button
                type="button"
                onClick={() => { setMode("login"); setFormError(null); setFormErrorDetail(null) }}
                className="underline text-foreground"
              >
                Back to sign in
              </button>
            </p>
          </form>
          </>) : mode === "reset" ? (
          <>
          <form onSubmit={handleResetPassword} className="space-y-4">
            <h2 className="text-lg font-semibold text-center">Reset Password</h2>
            <p className="text-sm text-center text-muted-foreground">
              Enter your new password.
            </p>

            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-1">
                New Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Min 8 characters"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium mb-1">
                Confirm New Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Re-enter password"
              />
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Resetting..." : "Reset Password"}
            </Button>

            <p className="text-sm text-center text-muted-foreground">
              <button
                type="button"
                onClick={() => { window.location.href = "/login" }}
                className="underline text-foreground"
              >
                Back to sign in
              </button>
            </p>
          </form>
          </>) : (
          <>
          {/* Email/Password Form */}
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <h2 className="text-lg font-semibold text-center">
              {mode === "login" ? "Sign In" : "Create Account"}
            </h2>

            {mode === "register" && (
              <div>
                <label htmlFor="username" className="block text-sm font-medium mb-1">
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Your username"
                />
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Min 8 characters"
              />
            </div>

            {mode === "register" && (
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium mb-1">
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Re-enter password"
                />
              </div>
            )}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting
                ? "Loading..."
                : mode === "login"
                  ? "Sign In"
                  : "Create Account"
              }
            </Button>

            <p className="text-sm text-center text-muted-foreground">
              {mode === "login" ? (
                <>
                  Don&apos;t have an account?{" "}
                  <button
                    type="button"
                    onClick={() => { setMode("register"); setFormError(null); setFormErrorDetail(null); setConfirmPassword("") }}
                    className="underline text-foreground"
                  >
                    Register
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => { setMode("login"); setFormError(null); setFormErrorDetail(null) }}
                    className="underline text-foreground"
                  >
                    Sign in
                  </button>
                </>
              )}
            </p>

            {mode === "login" && (
              <p className="text-sm text-center">
                <button
                  type="button"
                  onClick={() => { setMode("forgot"); setFormError(null); setFormErrorDetail(null) }}
                  className="text-muted-foreground hover:text-foreground underline text-xs"
                >
                  Forgot password?
                </button>
              </p>
            )}
          </form>

          {/* OAuth Providers Divider */}
          {!loading && !providersError && providers.length > 0 && (
            <>
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">or</span>
                </div>
              </div>

              <div className="space-y-3">
                {providers.map((provider) => (
                  <Button
                    key={provider}
                    onClick={() => handleOAuthLogin(provider)}
                    className="w-full"
                    variant="outline"
                  >
                    <span className="capitalize">Sign in with {provider}</span>
                  </Button>
                ))}
              </div>
            </>
          )}

          {loading && (
            <div className="text-center text-muted-foreground mt-4">
              Loading...
            </div>
          )}

          {providersError && (
            <Alert variant="destructive" className="mt-4">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>
                {providersErrorMsg?.message || "Failed to load authentication providers"}
              </AlertDescription>
            </Alert>
          )}
          </>
          )}
        </Card>
      </div>
    </div>
  )
}
