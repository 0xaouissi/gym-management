import { useEffect, useState, type FormEvent } from 'react'
import {
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserRound,
  UserX,
  Users as UsersIcon,
  Ban,
  CircleCheck
} from 'lucide-react'
import type { Role, User } from '@shared/types'
import { ROLE_LABELS } from '@shared/constants'
import { formatDateTime } from '@shared/utils'
import { useSession } from '@renderer/hooks/useSession'
import { useAsyncData } from '@renderer/hooks/useAsyncData'
import { runAction } from '@renderer/lib/action'
import { PageHeader } from '@renderer/components/ui/page-header'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Badge } from '@renderer/components/ui/badge'
import { Card, CardContent } from '@renderer/components/ui/card'
import { StatCard } from '@renderer/components/ui/stat-card'
import { EmptyState } from '@renderer/components/ui/empty-state'
import { LoadingPanel } from '@renderer/components/ui/spinner'
import { ConfirmDialog } from '@renderer/components/ui/confirm-dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@renderer/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@renderer/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@renderer/components/ui/select'

const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,32}$/

const ROLE_HINTS: Record<Role, string> = {
  ADMIN: 'Full access — manages hardware, users, plans and audit logs.',
  RECEPTIONIST: 'Day-to-day work — members, cards, subscriptions, payments and access. Cannot change hardware configuration or manage users.'
}

function ErrorPanel({ message }: { message: string }): React.JSX.Element | null {
  if (!message) return null
  return <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{message}</p>
}

function CreateUserDialog({
  open,
  onOpenChange,
  onSaved
}: {
  open: boolean
  onOpenChange(open: boolean): void
  onSaved(): void | Promise<void>
}): React.JSX.Element {
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<Role>('RECEPTIONIST')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setUsername('')
    setFullName('')
    setRole('RECEPTIONIST')
    setPassword('')
    setConfirm('')
    setError('')
  }, [open])

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setError('')
    if (!USERNAME_PATTERN.test(username.trim())) {
      setError('Username must be 3-32 characters using letters, numbers, dot, dash or underscore.')
      return
    }
    if (fullName.trim().length < 2) {
      setError('Enter the staff member full name.')
      return
    }
    if (password.length < 4) {
      setError('Password must be at least 4 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setBusy(true)
    try {
      const result = await runAction(
        window.api.users.create({ username: username.trim(), password, fullName: fullName.trim(), role }),
        'User created'
      )
      if (result.ok) {
        onOpenChange(false)
        await onSaved()
      } else {
        setError(result.error ?? 'Unable to create the user.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add staff account</DialogTitle>
          <DialogDescription>
            Passwords are hashed before they are stored — nobody, including administrators, can read them back.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="user-full-name">Full name *</Label>
            <Input
              id="user-full-name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Samir Belkacem"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="user-username">Username *</Label>
            <Input
              id="user-username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="samir"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="user-role">Role</Label>
            <Select value={role} onValueChange={(value) => setRole(value as Role)}>
              <SelectTrigger id="user-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="RECEPTIONIST">{ROLE_LABELS.RECEPTIONIST}</SelectItem>
                <SelectItem value="ADMIN">{ROLE_LABELS.ADMIN}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">{ROLE_HINTS[role]}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="user-password">Password *</Label>
              <Input
                id="user-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user-confirm">Confirm password *</Label>
              <Input
                id="user-confirm"
                type="password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>
          <ErrorPanel message={error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create account'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditUserDialog({
  user,
  onOpenChange,
  onSaved
}: {
  user: User | null
  onOpenChange(open: boolean): void
  onSaved(): void | Promise<void>
}): React.JSX.Element {
  const open = user !== null
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<Role>('RECEPTIONIST')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) return
    setFullName(user.fullName)
    setRole(user.role)
    setError('')
  }, [user])

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (!user) return
    setError('')
    if (fullName.trim().length < 2) {
      setError('Enter the staff member full name.')
      return
    }
    setBusy(true)
    try {
      const result = await runAction(
        window.api.users.update(user.id, { fullName: fullName.trim(), role }),
        'User updated'
      )
      if (result.ok) {
        onOpenChange(false)
        await onSaved()
      } else {
        setError(result.error ?? 'Unable to update the user.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {user?.username}</DialogTitle>
          <DialogDescription>Change the display name or role of this staff account.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-user-name">Full name *</Label>
            <Input id="edit-user-name" value={fullName} onChange={(event) => setFullName(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-user-role">Role</Label>
            <Select value={role} onValueChange={(value) => setRole(value as Role)}>
              <SelectTrigger id="edit-user-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="RECEPTIONIST">{ROLE_LABELS.RECEPTIONIST}</SelectItem>
                <SelectItem value="ADMIN">{ROLE_LABELS.ADMIN}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">{ROLE_HINTS[role]}</p>
          </div>
          <ErrorPanel message={error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ResetPasswordDialog({
  user,
  onOpenChange
}: {
  user: User | null
  onOpenChange(open: boolean): void
}): React.JSX.Element {
  const open = user !== null
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) return
    setPassword('')
    setConfirm('')
    setError('')
  }, [user])

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (!user) return
    setError('')
    if (password.length < 4) {
      setError('Password must be at least 4 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setBusy(true)
    try {
      const result = await runAction(window.api.users.resetPassword(user.id, password), 'Password reset')
      if (result.ok) {
        onOpenChange(false)
      } else {
        setError(result.error ?? 'Unable to reset the password.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reset password for {user?.username}</DialogTitle>
          <DialogDescription>
            Set a new password for this account. The existing password is hashed and cannot be recovered — this replaces
            it.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="reset-password">New password *</Label>
            <Input
              id="reset-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reset-confirm">Confirm new password *</Label>
            <Input
              id="reset-confirm"
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              autoComplete="new-password"
            />
          </div>
          <ErrorPanel message={error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Resetting…' : 'Reset password'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function UsersPage(): React.JSX.Element {
  const { user: currentUser } = useSession()
  const users = useAsyncData(() => window.api.users.list(), [])

  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<User | null>(null)
  const [resetTarget, setResetTarget] = useState<User | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null)
  const [disableTarget, setDisableTarget] = useState<User | null>(null)

  const all = users.data ?? []
  const query = search.trim().toLowerCase()
  const filtered = query
    ? all.filter(
        (item) =>
          item.username.toLowerCase().includes(query) ||
          item.fullName.toLowerCase().includes(query) ||
          ROLE_LABELS[item.role].toLowerCase().includes(query)
      )
    : all

  const admins = all.filter((item) => item.role === 'ADMIN').length
  const receptionists = all.filter((item) => item.role === 'RECEPTIONIST').length
  const disabled = all.filter((item) => !item.isActive).length

  const enableUser = async (target: User): Promise<void> => {
    const result = await runAction(window.api.users.update(target.id, { isActive: true }), 'User enabled')
    if (result.ok) await users.refresh()
  }

  const reload = (): void => {
    void users.refresh()
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Users"
        description="Staff accounts that can sign in to this workstation. Roles control what each person may do."
        actions={
          <>
            <Button variant="outline" onClick={reload}>
              <RefreshCw className="mr-2 size-4" />
              Refresh
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 size-4" />
              Add user
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Staff accounts" value={String(all.length)} icon={UsersIcon} />
        <StatCard label="Administrators" value={String(admins)} icon={ShieldCheck} />
        <StatCard label="Receptionists" value={String(receptionists)} icon={UserCheck} />
        <StatCard label="Disabled" value={String(disabled)} icon={UserX} tone={disabled > 0 ? 'warning' : 'default'} />
      </div>

      <Card>
        <CardContent className="pt-5">
          <div className="mb-4 flex items-center gap-2">
            <div className="relative min-w-56 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name, username or role…"
                className="pl-9"
              />
            </div>
          </div>

          {users.loading ? (
            <LoadingPanel label="Loading users…" />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={UserRound}
              title={query ? 'No users match your search' : 'No staff accounts yet'}
              description={
                query
                  ? 'Try a different name, username or role.'
                  : 'Add a staff account so a colleague can sign in to this workstation.'
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((item) => {
                  const isSelf = currentUser?.id === item.id
                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <p className="text-sm font-medium">
                          {item.fullName}
                          {isSelf ? <span className="ml-2 text-xs text-muted-foreground">(you)</span> : null}
                        </p>
                        <p className="font-mono text-xs text-muted-foreground">@{item.username}</p>
                      </TableCell>
                      <TableCell>
                        <Badge variant={item.role === 'ADMIN' ? 'default' : 'muted'}>{ROLE_LABELS[item.role]}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={item.isActive ? 'success' : 'muted'}>
                          {item.isActive ? 'Active' : 'Disabled'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDateTime(item.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              Manage
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditTarget(item)}>
                              <Pencil className="mr-2 size-4" />
                              Edit details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setResetTarget(item)}>
                              <KeyRound className="mr-2 size-4" />
                              Reset password
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {item.isActive ? (
                              <DropdownMenuItem
                                disabled={isSelf}
                                title={isSelf ? 'You cannot disable your own account' : undefined}
                                onClick={() => setDisableTarget(item)}
                              >
                                <Ban className="mr-2 size-4" />
                                Disable
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => void enableUser(item)}>
                                <CircleCheck className="mr-2 size-4" />
                                Enable
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              disabled={isSelf}
                              title={isSelf ? 'You cannot delete your own account' : undefined}
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeleteTarget(item)}
                            >
                              <Trash2 className="mr-2 size-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} onSaved={reload} />
      <EditUserDialog user={editTarget} onOpenChange={(open) => !open && setEditTarget(null)} onSaved={reload} />
      <ResetPasswordDialog user={resetTarget} onOpenChange={(open) => !open && setResetTarget(null)} />

      <ConfirmDialog
        open={disableTarget !== null}
        onOpenChange={(open) => !open && setDisableTarget(null)}
        title={`Disable ${disableTarget?.fullName ?? 'this user'}?`}
        description="The account keeps its history but can no longer sign in until it is enabled again."
        confirmLabel="Disable user"
        destructive
        onConfirm={async () => {
          if (!disableTarget) return
          const result = await runAction(
            window.api.users.update(disableTarget.id, { isActive: false }),
            'User disabled'
          )
          if (result.ok) {
            setDisableTarget(null)
            await users.refresh()
          }
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.fullName ?? 'this user'}?`}
        description="This permanently removes the staff account. Audit history keeps the username, but the account cannot be restored."
        confirmLabel="Delete user"
        destructive
        onConfirm={async () => {
          if (!deleteTarget) return
          const result = await runAction(window.api.users.delete(deleteTarget.id), 'User deleted')
          if (result.ok) {
            setDeleteTarget(null)
            await users.refresh()
          }
        }}
      />
    </div>
  )
}
