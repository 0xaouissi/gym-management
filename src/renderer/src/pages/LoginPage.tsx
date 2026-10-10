import { useState, type FormEvent } from 'react'
import { Dumbbell, LockKeyhole, ShieldCheck, UserPlus } from 'lucide-react'
import { APP_NAME } from '@shared/constants'
import { useSession } from '@renderer/hooks/useSession'
import { describeError } from '@renderer/lib/utils'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'

function ErrorBanner({ message }: { message: string }): React.JSX.Element {
  return (
    <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  )
}

function SetupForm(): React.JSX.Element {
  const { setupAdmin } = useSession()
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [gymName, setGymName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setError('')
    if (username.trim().length < 3) {
      setError('Username must be at least 3 characters long.')
      return
    }
    if (fullName.trim().length < 2) {
      setError('Enter the administrator full name.')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters long.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setBusy(true)
    try {
      const result = await setupAdmin({
        username: username.trim(),
        password,
        fullName: fullName.trim(),
        gymName: gymName.trim() || undefined
      })
      if (!result.ok) setError(result.error ?? 'Unable to create the administrator account.')
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="setup-fullname">Full name</Label>
        <Input
          id="setup-fullname"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          placeholder="e.g. Karim Bensalem"
          autoFocus
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="setup-username">Username</Label>
        <Input
          id="setup-username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="admin"
          autoComplete="username"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="setup-gym">Gym name (optional)</Label>
        <Input
          id="setup-gym"
          value={gymName}
          onChange={(event) => setGymName(event.target.value)}
          placeholder="Iron House Gym"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="setup-password">Password</Label>
          <Input
            id="setup-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="setup-confirm">Confirm password</Label>
          <Input
            id="setup-confirm"
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            autoComplete="new-password"
          />
        </div>
      </div>
      {error ? <ErrorBanner message={error} /> : null}
      <Button type="submit" className="w-full" disabled={busy}>
        <ShieldCheck className="size-4" />
        {busy ? 'Creating account…' : 'Create administrator account'}
      </Button>
      <p className="text-xs text-muted-foreground">
        Passwords are hashed before they are stored — the app never keeps a plain-text copy.
      </p>
    </form>
  )
}

function LoginForm(): React.JSX.Element {
  const { login } = useSession()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const result = await login(username.trim(), password)
      if (!result.ok) setError(result.error ?? 'Invalid credentials.')
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="login-username">Username</Label>
        <Input
          id="login-username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          autoFocus
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="login-password">Password</Label>
        <Input
          id="login-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
        />
      </div>
      {error ? <ErrorBanner message={error} /> : null}
      <Button type="submit" className="w-full" disabled={busy}>
        <LockKeyhole className="size-4" />
        {busy ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  )
}

export function LoginPage(): React.JSX.Element {
  const { needsSetup } = useSession()

  return (
    <div className="flex h-full items-center justify-center bg-background px-6">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Dumbbell className="size-7" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">{APP_NAME}</h1>
            <p className="text-sm text-muted-foreground">
              {needsSetup
                ? 'First run — create the administrator account to get started.'
                : 'Sign in to manage clients, subscriptions and access control.'}
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {needsSetup ? <UserPlus className="size-4 text-primary" /> : <LockKeyhole className="size-4 text-primary" />}
              {needsSetup ? 'Administrator setup' : 'Sign in'}
            </CardTitle>
            <CardDescription>
              {needsSetup
                ? 'This account has full access, including hardware configuration.'
                : 'Works fully offline — access decisions are made on this computer.'}
            </CardDescription>
          </CardHeader>
          <CardContent>{needsSetup ? <SetupForm /> : <LoginForm />}</CardContent>
        </Card>
      </div>
    </div>
  )
}
