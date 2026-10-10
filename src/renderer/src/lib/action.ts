import { toast } from 'sonner'
import type { ActionResult } from '@shared/types'
import { describeError } from './utils'

export async function runAction<T>(
  promise: Promise<ActionResult<T>>,
  successMessage?: string
): Promise<ActionResult<T>> {
  try {
    const result = await promise
    if (result.ok) {
      if (successMessage) toast.success(successMessage)
    } else {
      toast.error(result.error ?? 'The action could not be completed')
    }
    return result
  } catch (error) {
    const message = describeError(error)
    toast.error(message || 'The action could not be completed')
    return { ok: false, error: message }
  }
}

export async function runExport(
  promise: Promise<ActionResult<{ path: string }>>,
  label = 'File'
): Promise<void> {
  const result = await runAction(promise, `${label} exported`)
  if (!result.ok && result.error === 'Save cancelled') {
    toast.dismiss()
  }
}
