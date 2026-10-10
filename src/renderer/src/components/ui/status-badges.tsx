import {
  CLIENT_STATUS_LABELS,
  RFID_CARD_STATUS_LABELS,
  SUBSCRIPTION_STATUS_LABELS
} from '@shared/constants'
import type { ClientStatus, PaymentStatus, RfidCardStatus, SubscriptionStatus, AccessResult } from '@shared/types'
import { Badge, type BadgeProps } from './badge'

const CLIENT_VARIANTS: Record<ClientStatus, BadgeProps['variant']> = {
  ACTIVE: 'success',
  INACTIVE: 'muted',
  BLOCKED: 'destructive'
}

const CARD_VARIANTS: Record<RfidCardStatus, BadgeProps['variant']> = {
  ACTIVE: 'success',
  BLOCKED: 'destructive',
  LOST: 'warning',
  REVOKED: 'muted'
}

const SUBSCRIPTION_VARIANTS: Record<SubscriptionStatus, BadgeProps['variant']> = {
  ACTIVE: 'success',
  EXPIRED: 'destructive',
  SUSPENDED: 'warning',
  CANCELLED: 'muted'
}

const PAYMENT_VARIANTS: Record<PaymentStatus, BadgeProps['variant']> = {
  PAID: 'success',
  PARTIAL: 'warning',
  UNPAID: 'destructive'
}

export function ClientStatusBadge({ status }: { status: ClientStatus }): React.JSX.Element {
  return <Badge variant={CLIENT_VARIANTS[status]}>{CLIENT_STATUS_LABELS[status]}</Badge>
}

export function CardStatusBadge({ status }: { status: RfidCardStatus }): React.JSX.Element {
  return <Badge variant={CARD_VARIANTS[status]}>{RFID_CARD_STATUS_LABELS[status]}</Badge>
}

export function SubscriptionStatusBadge({ status }: { status: SubscriptionStatus }): React.JSX.Element {
  return <Badge variant={SUBSCRIPTION_VARIANTS[status]}>{SUBSCRIPTION_STATUS_LABELS[status]}</Badge>
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }): React.JSX.Element {
  const labels: Record<PaymentStatus, string> = { PAID: 'Paid', PARTIAL: 'Partial', UNPAID: 'Unpaid' }
  return <Badge variant={PAYMENT_VARIANTS[status]}>{labels[status]}</Badge>
}

export function AccessResultBadge({ result }: { result: AccessResult }): React.JSX.Element {
  return (
    <Badge variant={result === 'ALLOWED' ? 'success' : 'destructive'}>{result === 'ALLOWED' ? 'Allowed' : 'Denied'}</Badge>
  )
}
