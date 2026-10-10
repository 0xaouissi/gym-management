import type { DurationUnit, PaymentStatus, SubscriptionStatus, SubscriptionWithDetails } from '@shared/types'

export interface SubscriptionDetailRow {
  id: number
  client_id: number
  plan_id: number
  start_date: string
  end_date: string
  status: SubscriptionStatus
  price: number
  payment_status: PaymentStatus
  is_renewal: number
  notes: string | null
  created_at: string
  updated_at: string
  plan_name: string
  plan_duration_value: number
  plan_duration_unit: DurationUnit
  client_name?: string
  paid_amount?: number
}

export function mapSubscriptionRow(row: SubscriptionDetailRow, clientName?: string): SubscriptionWithDetails {
  const paid = row.paid_amount ?? 0
  return {
    id: row.id,
    clientId: row.client_id,
    planId: row.plan_id,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    price: row.price,
    paymentStatus: row.payment_status,
    isRenewal: row.is_renewal === 1,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    planName: row.plan_name,
    planDurationValue: row.plan_duration_value,
    planDurationUnit: row.plan_duration_unit,
    clientName: clientName ?? row.client_name ?? '',
    paidAmount: paid,
    outstanding: Math.max(0, row.price - paid)
  }
}

export const SUB_DETAIL_COLUMNS = `
  s.*,
  p.name AS plan_name,
  p.duration_value AS plan_duration_value,
  p.duration_unit AS plan_duration_unit,
  cl.first_name || ' ' || cl.last_name AS client_name,
  IFNULL((SELECT SUM(pm.amount) FROM payments pm WHERE pm.subscription_id = s.id), 0) AS paid_amount
`

export const SUB_DETAIL_JOINS = `
  FROM subscriptions s
  JOIN subscription_plans p ON p.id = s.plan_id
  JOIN clients cl ON cl.id = s.client_id
`
