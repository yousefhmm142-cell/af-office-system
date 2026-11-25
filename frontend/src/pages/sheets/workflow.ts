import type { Tone } from '../../ui/primitives'

export type SheetStatus = 'draft' | 'submitted' | 'returned' | 'approved'

export interface SheetMeta {
  id: string
  status: SheetStatus
  createdBy: string
  submittedBy: string | null
  submittedAt: string | null
  approvedBy: string | null
  approvedAt: string | null
  returnedReason: string | null
  /** Sent while the phone had no internet; the manager sees a mark. */
  recordedOffline: boolean
  updatedAt: string
  /**
   * The updatedAt the server has. Any change on this device moves updatedAt on, so a sheet with
   * syncedAt !== updatedAt still has something to send (data/sync.ts). Unused in demo mode.
   */
  syncedAt?: string
}

export const statusInfo: Record<SheetStatus, { label: string; tone: Tone }> = {
  draft: { label: 'قيد التعبئة', tone: 'neutral' },
  submitted: { label: 'مُغلق، بانتظار الاعتماد', tone: 'warn' },
  returned: { label: 'أُعيد فتحه', tone: 'danger' },
  approved: { label: 'مُغلق ومعتمد', tone: 'ok' },
}

export const isEditableStatus = (s: SheetStatus) => s === 'draft' || s === 'returned'

export const newId = () => crypto.randomUUID()

export function blankMeta(createdBy: string, now: string): Omit<SheetMeta, 'id'> {
  return {
    status: 'draft',
    createdBy,
    submittedBy: null,
    submittedAt: null,
    approvedBy: null,
    approvedAt: null,
    returnedReason: null,
    recordedOffline: false,
    updatedAt: now,
  }
}
