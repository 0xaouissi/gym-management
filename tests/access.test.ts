import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@main/db/database'
import { MockTurnstileController } from '@main/hardware/MockTurnstileController'
import { AccessService } from '@main/services/access.service'
import { addDuration, todayISO } from '@shared/utils'
import { createCard, createClient, createSubscription, createTestDb } from './helpers'

const MAIN_UID = 'AABBCCDDEE'

function allowClient(db: Db, uid = MAIN_UID): { clientId: number; cardId: number } {
  const clientId = createClient(db, { firstName: 'Amina', lastName: 'Benali' })
  const card = createCard(db, clientId, { uid })
  createSubscription(db, clientId, { endDate: addDuration(todayISO(), 5, 'DAYS') })
  return { clientId, cardId: card.id }
}

describe('AccessService.validateAccess', () => {
  let db: Db
  let access: AccessService

  beforeEach(() => {
    db = createTestDb()
    access = new AccessService(db, () => null, () => 'test-device')
  })

  it('denies a blank UID as UNKNOWN_CARD', () => {
    expect(access.validateAccess('   ')).toEqual({ allowed: false, reason: 'UNKNOWN_CARD' })
  })

  it('denies an unregistered UID as UNKNOWN_CARD', () => {
    const decision = access.validateAccess('DEADBEEF01')
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toBe('UNKNOWN_CARD')
  })

  it('allows a client with an active subscription and returns the full decision', () => {
    const { clientId, cardId } = allowClient(db)
    const decision = access.validateAccess('aabbccddee')
    expect(decision).toMatchObject({
      allowed: true,
      reason: 'ACTIVE_SUBSCRIPTION',
      clientId,
      clientName: 'Amina Benali',
      cardId
    })
    expect(decision.subscriptionId).toBeGreaterThan(0)
    expect(decision.subscriptionEndDate).toBe(addDuration(todayISO(), 5, 'DAYS'))
  })

  it('normalizes separators and letter case in scanned UIDs', () => {
    allowClient(db, MAIN_UID)
    expect(access.validateAccess('AA:BB CC-DD-EE').allowed).toBe(true)
  })

  it('denies a blocked card as CARD_BLOCKED', () => {
    const clientId = createClient(db)
    createCard(db, clientId, { uid: 'BLOCKED001', status: 'BLOCKED' })
    expect(access.validateAccess('BLOCKED001')).toMatchObject({ allowed: false, reason: 'CARD_BLOCKED' })
  })

  it('denies a lost card as CARD_LOST', () => {
    const clientId = createClient(db)
    createCard(db, clientId, { uid: 'LOSTCARD01', status: 'LOST' })
    expect(access.validateAccess('LOSTCARD01')).toMatchObject({ allowed: false, reason: 'CARD_LOST' })
  })

  it('denies a revoked card as CARD_REVOKED', () => {
    const clientId = createClient(db)
    createCard(db, clientId, { uid: 'REVOKED001', status: 'REVOKED' })
    expect(access.validateAccess('REVOKED001')).toMatchObject({ allowed: false, reason: 'CARD_REVOKED' })
  })

  it('denies a blocked client as CLIENT_BLOCKED even with a valid card and subscription', () => {
    const clientId = createClient(db, { status: 'BLOCKED' })
    createCard(db, clientId, { uid: 'CLIENTBLK1' })
    createSubscription(db, clientId)
    expect(access.validateAccess('CLIENTBLK1')).toMatchObject({ allowed: false, reason: 'CLIENT_BLOCKED' })
  })

  it('denies an inactive client as CLIENT_INACTIVE', () => {
    const clientId = createClient(db, { status: 'INACTIVE' })
    createCard(db, clientId, { uid: 'INACTIVE001' })
    createSubscription(db, clientId)
    expect(access.validateAccess('INACTIVE001')).toMatchObject({ allowed: false, reason: 'CLIENT_INACTIVE' })
  })

  it('denies a client with no subscription as NO_SUBSCRIPTION', () => {
    const clientId = createClient(db)
    createCard(db, clientId, { uid: 'NOSUB00001' })
    expect(access.validateAccess('NOSUB00001')).toMatchObject({ allowed: false, reason: 'NO_SUBSCRIPTION' })
  })

  it('denies a cancelled subscription as SUBSCRIPTION_CANCELLED', () => {
    const clientId = createClient(db)
    createCard(db, clientId, { uid: 'CANCELLED01' })
    createSubscription(db, clientId, { endDate: addDuration(todayISO(), 15, 'DAYS'), status: 'CANCELLED' })
    expect(access.validateAccess('CANCELLED01')).toMatchObject({
      allowed: false,
      reason: 'SUBSCRIPTION_CANCELLED'
    })
  })

  it('denies a suspended subscription as SUBSCRIPTION_SUSPENDED', () => {
    const clientId = createClient(db)
    createCard(db, clientId, { uid: 'SUSPENDED01' })
    createSubscription(db, clientId, { endDate: addDuration(todayISO(), 15, 'DAYS'), status: 'SUSPENDED' })
    expect(access.validateAccess('SUSPENDED01')).toMatchObject({
      allowed: false,
      reason: 'SUBSCRIPTION_SUSPENDED'
    })
  })

  it('denies an expired subscription as SUBSCRIPTION_EXPIRED and reports the end date', () => {
    const clientId = createClient(db)
    createCard(db, clientId, { uid: 'EXPIRED001' })
    const past = addDuration(todayISO(), -3, 'DAYS')
    createSubscription(db, clientId, { endDate: past, status: 'EXPIRED' })
    expect(access.validateAccess('EXPIRED001')).toMatchObject({
      allowed: false,
      reason: 'SUBSCRIPTION_EXPIRED',
      subscriptionEndDate: past
    })
  })

  it('treats an ACTIVE subscription whose end date has passed as expired', () => {
    const clientId = createClient(db)
    createCard(db, clientId, { uid: 'STALESTAT1' })
    createSubscription(db, clientId, { endDate: addDuration(todayISO(), -1, 'DAYS'), status: 'ACTIVE' })
    expect(access.validateAccess('STALESTAT1')).toMatchObject({
      allowed: false,
      reason: 'SUBSCRIPTION_EXPIRED'
    })
  })

  it('uses the subscription with the latest end date when several exist', () => {
    const clientId = createClient(db)
    createCard(db, clientId, { uid: 'MULTISUB01' })
    createSubscription(db, clientId, { endDate: addDuration(todayISO(), -10, 'DAYS'), status: 'EXPIRED' })
    createSubscription(db, clientId, { endDate: addDuration(todayISO(), 20, 'DAYS'), status: 'ACTIVE' })
    expect(access.validateAccess('MULTISUB01').allowed).toBe(true)

    const otherClient = createClient(db)
    createCard(db, otherClient, { uid: 'MULTISUB02' })
    createSubscription(db, otherClient, { endDate: addDuration(todayISO(), 5, 'DAYS'), status: 'ACTIVE' })
    createSubscription(db, otherClient, { endDate: addDuration(todayISO(), 30, 'DAYS'), status: 'CANCELLED' })
    expect(access.validateAccess('MULTISUB02')).toMatchObject({
      allowed: false,
      reason: 'SUBSCRIPTION_CANCELLED'
    })
  })

  it('prefers a live card over a revoked card holding the same UID', () => {
    const oldOwner = createClient(db, { firstName: 'Old', lastName: 'Owner' })
    createCard(db, oldOwner, { uid: 'REISSUED01', status: 'REVOKED' })
    const newOwner = createClient(db, { firstName: 'New', lastName: 'Owner' })
    createCard(db, newOwner, { uid: 'REISSUED01' })
    createSubscription(db, newOwner)
    const decision = access.validateAccess('REISSUED01')
    expect(decision.allowed).toBe(true)
    expect(decision.clientId).toBe(newOwner)
  })
})

describe('RFID card business rules', () => {
  it('prevents two live cards from sharing the same UID', () => {
    const db = createTestDb()
    const first = createClient(db)
    const second = createClient(db)
    createCard(db, first, { uid: MAIN_UID })
    expect(() => createCard(db, second, { uid: MAIN_UID })).toThrow()
  })

  it('allows a UID to be re-issued after the previous card was revoked', () => {
    const db = createTestDb()
    const first = createClient(db)
    const second = createClient(db)
    createCard(db, first, { uid: MAIN_UID, status: 'REVOKED' })
    expect(() => createCard(db, second, { uid: MAIN_UID })).not.toThrow()
  })
})

describe('AccessService.processScan', () => {
  let db: Db
  let turnstile: MockTurnstileController
  let access: AccessService

  beforeEach(async () => {
    db = createTestDb()
    turnstile = new MockTurnstileController()
    await turnstile.connect()
    access = new AccessService(db, () => turnstile, () => 'TS-1000-A')
  })

  it('opens the turnstile and logs ALLOWED for a valid scan', async () => {
    const { clientId } = allowClient(db)
    const outcome = await access.processScan(MAIN_UID)
    expect(outcome.decision.allowed).toBe(true)
    expect(outcome.turnstileOpened).toBe(true)
    expect(outcome.turnstileError).toBeUndefined()
    expect(turnstile.openCount).toBe(1)
    expect(outcome.deviceId).toBe('TS-1000-A')

    const log = db.get<{
      client_id: number
      rfid_uid: string
      result: string
      reason: string
      device_id: string
    }>('SELECT client_id, rfid_uid, result, reason, device_id FROM access_logs WHERE id = ?', [outcome.logId])
    expect(log).toEqual({
      client_id: clientId,
      rfid_uid: MAIN_UID,
      result: 'ALLOWED',
      reason: 'ACTIVE_SUBSCRIPTION',
      device_id: 'TS-1000-A'
    })
  })

  it('keeps the turnstile closed but still logs a denied scan', async () => {
    const outcome = await access.processScan('DEADBEEF99')
    expect(outcome.decision.allowed).toBe(false)
    expect(outcome.turnstileOpened).toBe(false)
    expect(outcome.turnstileError).toBeUndefined()
    expect(turnstile.openCount).toBe(0)

    const log = db.get<{ result: string; reason: string }>(
      'SELECT result, reason FROM access_logs WHERE id = ?',
      [outcome.logId]
    )
    expect(log).toEqual({ result: 'DENIED', reason: 'UNKNOWN_CARD' })
  })

  it('stores the normalized UID in the access log', async () => {
    allowClient(db)
    const outcome = await access.processScan('  aa:bb-cc:dd-ee ')
    expect(outcome.uid).toBe(MAIN_UID)
    const log = db.get<{ rfid_uid: string }>('SELECT rfid_uid FROM access_logs WHERE id = ?', [outcome.logId])
    expect(log?.rfid_uid).toBe(MAIN_UID)
  })

  it('logs the attempt even when no turnstile controller is available', async () => {
    allowClient(db)
    const noHardware = new AccessService(db, () => null, () => null)
    const outcome = await noHardware.processScan(MAIN_UID)
    expect(outcome.decision.allowed).toBe(true)
    expect(outcome.turnstileOpened).toBe(false)
    expect(outcome.turnstileError).toBeTruthy()
    const count = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM access_logs')
    expect(count?.n).toBe(1)
  })

  it('records a turnstile failure without losing the access log', async () => {
    allowClient(db)
    const offline = new MockTurnstileController()
    const offlineAccess = new AccessService(db, () => offline, () => 'TS-1000-A')
    const outcome = await offlineAccess.processScan(MAIN_UID)
    expect(outcome.turnstileOpened).toBe(false)
    expect(outcome.turnstileError).toContain('not connected')
    const log = db.get<{ result: string }>('SELECT result FROM access_logs WHERE id = ?', [outcome.logId])
    expect(log?.result).toBe('ALLOWED')
  })

  it('reports today totals for entries and denials', async () => {
    allowClient(db)
    await access.processScan(MAIN_UID)
    await access.processScan('DEADBEEF99')
    expect(access.today()).toEqual({ entries: 1, denied: 1 })
    expect(access.recent(5)).toHaveLength(2)
    expect(access.logs({ result: 'DENIED' }).items).toHaveLength(1)
  })
})
