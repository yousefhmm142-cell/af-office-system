import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { api, ApiError } from '../../api/client'
import { useLoad } from '../../lib/useLoad'
import { ErrorBanner } from '../../ui/Field'
import type { SealData } from './model'

interface Person { id: string; name: string; is_active: boolean; field_worker: boolean }
type Payload = Omit<SealData, 'names' | 'sheets'> & { people: Person[]; historicalNames: Record<string, string>; sheetNames: Record<string, string> }
type Write = <T>(action: string, body: object) => Promise<T>

interface ImportResult { rolls: number; batches: number; used: number; skipped: number; ignored: number }

const LedgerContext = createContext<{
  data: SealData | undefined; importFiles: (body: object) => Promise<ImportResult>; technicians: {id: string; fullName: string}[]
  write: Write
} | null>(null)

export function SealLedger({ children }: { children: ReactNode }) {
  const ledger = useLoad<Payload>('/seals')
  const data = useMemo(() => ledger.data && {
    ...ledger.data, names: new Map([...Object.entries(ledger.data.historicalNames), ...ledger.data.people.map((person) => [person.id, person.name] as const)]),
    sheets: new Map(Object.entries(ledger.data.sheetNames)),
  }, [ledger.data])

  async function write<T>(action: string, body: object) {
    const response = await api<{ result: T }>(`/seals/${action}`, { method: 'POST', body })
    await ledger.reload()
    return response.result
  }

  async function importFiles(body: object) {
    const result = await api<ImportResult>('/seals/import', { method: 'POST', body })
    await ledger.reload()
    return result
  }

  return <LedgerContext.Provider value={{
    data: data ?? undefined, write, importFiles,
    technicians: (ledger.data?.people ?? []).filter((person) => person.is_active && person.field_worker)
      .map((person) => ({ id: person.id, fullName: person.name })),
  }}>
    <ErrorBanner text={ledger.error} />
    {(!ledger.error || data) && children}
  </LedgerContext.Provider>
}

function useLedger() {
  const ledger = useContext(LedgerContext)
  if (!ledger) throw new Error('SealLedger is missing')
  return ledger
}

export const useSealData = () => useLedger().data
export const useTechnicians = () => useLedger().technicians

export function useSealActions() {
  const { write, importFiles } = useLedger()
  return {
    importFiles: (body: object) => importFiles(body),
    addRoll: (from: number, to: number | null, date: string, note: string) => write<string>('add-roll', { from, to, date, note }),
    issueBatch: (technician: string | null, date: string, seals: number[], note = '') =>
      write<{ batch_id: string; batch_no: number; count: number }>('issue', { technician, date, seals, note }),
    assignBatch: (id: string, technician: string) => write('assign-batch', { id, technician }),
    deleteRoll: (id: string) => write('delete-roll', { id }),
    deleteBatch: (id: string) => write<number>('delete-batch', { id }),
    updateRoll: (id: string, date: string, note: string) => write('update-roll', { id, date, note }),
    updateBatch: (id: string, technician: string | null, date: string, add: number[], remove: number[]) =>
      write('update-batch', { id, technician, date, add, remove }),
    record: (number: number, status: string, date: string | null, details: string, board: string, task_id?: string | null) => write('record', { number, status, date, details, board, task_id }),
    returnToStock: (seals: number[]) => write<number>('return-to-stock', { seals }),
  }
}

export const sealErrorText = (e: unknown) => e instanceof ApiError ? Object.values(e.fields)[0] ?? e.message : 'تعذّر الحفظ. حاول مرة أخرى.'
