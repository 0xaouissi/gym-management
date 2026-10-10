import type { AccessReason, ClientStatus, GymSettings, PaymentMethod, RfidCardStatus, Role, SubscriptionStatus } from './types'

export const APP_NAME = 'Gym Manager'

export const ACCESS_REASON_LABELS: Record<AccessReason, string> = {
  ACTIVE_SUBSCRIPTION: 'Active subscription',
  UNKNOWN_CARD: 'Unknown card',
  CARD_BLOCKED: 'Card blocked',
  CARD_REVOKED: 'Card revoked',
  CARD_LOST: 'Card reported lost',
  CLIENT_BLOCKED: 'Client blocked',
  CLIENT_INACTIVE: 'Client inactive',
  NO_SUBSCRIPTION: 'No subscription',
  SUBSCRIPTION_EXPIRED: 'Subscription expired',
  SUBSCRIPTION_SUSPENDED: 'Subscription suspended',
  SUBSCRIPTION_CANCELLED: 'Subscription cancelled'
}

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  BLOCKED: 'Blocked'
}

export const RFID_CARD_STATUS_LABELS: Record<RfidCardStatus, string> = {
  ACTIVE: 'Active',
  BLOCKED: 'Blocked',
  LOST: 'Lost',
  REVOKED: 'Revoked'
}

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  ACTIVE: 'Active',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
  SUSPENDED: 'Suspended'
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  BANK_TRANSFER: 'Bank transfer',
  OTHER: 'Other'
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrator',
  RECEPTIONIST: 'Receptionist'
}

export const DEFAULT_PLANS = [
  { name: '1 Week', description: 'One week access', durationValue: 1, durationUnit: 'WEEKS' as const, price: 700 },
  { name: '4 Weeks', description: 'Four weeks access', durationValue: 4, durationUnit: 'WEEKS' as const, price: 1800 },
  { name: '1 Month', description: 'One calendar month', durationValue: 1, durationUnit: 'MONTHS' as const, price: 2000 },
  { name: '3 Months', description: 'Three calendar months', durationValue: 3, durationUnit: 'MONTHS' as const, price: 5000 },
  { name: '6 Months', description: 'Six calendar months', durationValue: 6, durationUnit: 'MONTHS' as const, price: 9000 },
  { name: '12 Months', description: 'One full year', durationValue: 12, durationUnit: 'MONTHS' as const, price: 16000 }
]

export const DEFAULT_SETTINGS: GymSettings = {
  gymName: 'My Gym',
  gymAddress: '',
  gymPhone: '',
  gymLogo: '',
  currency: 'DZD',
  expirationWarningDays: 7,
  theme: 'dark',
  sounds: true,
  rfid: {
    mode: 'MOCK',
    deviceName: 'READER-01',
    serialPort: 'COM3',
    baudRate: 9600,
    tcpHost: '192.168.1.100',
    tcpPort: 4001,
    parser: 'LINE'
  },
  turnstile: {
    mode: 'MOCK',
    deviceName: 'TURNSTILE-01',
    openDurationSec: 5,
    httpUrl: 'http://192.168.1.150/api/open',
    httpMethod: 'GET',
    tcpHost: '192.168.1.150',
    tcpPort: 4002,
    openCommandHex: 'A0 01 01 A2',
    lockCommandHex: '',
    serialPort: 'COM4',
    baudRate: 9600,
    relayPulseMs: 500
  }
}

export const CURRENCIES = ['DZD', 'EUR', 'USD', 'MAD', 'TND', 'SAR', 'AED']

export const MOCK_DEFAULT_UID = 'AABBCCDDEE'

export const HARDWARE_RECONNECT_INTERVAL_MS = 10_000

export const SESSION_EVENT_CHANNEL = 'event:session'
