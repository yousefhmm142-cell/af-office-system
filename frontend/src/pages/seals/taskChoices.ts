export interface SealTaskChoice {
  id: string; number: number; subscriber: string; work: string; completed_at: string | null
  technician_id: string | null; board: string; completed_on: string | null; task_status: string; task_on: string
  is_prepared: boolean; total_count?: number
}

const labels: Record<string, string> = {
  new: 'معيّنة لفني', sent: 'مرسلة', seen: 'تم الاطلاع', in_progress: 'قيد التنفيذ', done: 'منجزة',
}

export const choiceStatus = (task: SealTaskChoice) => task.is_prepared ? 'مجهّزة بدون فني' : labels[task.task_status] ?? '—'
