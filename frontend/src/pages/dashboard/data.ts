import { createContext, useContext } from 'react'
import type { Generator, SiteReport } from '../generation/model'
import type { SheetStatus } from '../sheets/workflow'

export interface FeedEvent { id: string; kind: string; at: string; who: string; text: string; route: string }
export interface TeamMember { id: number; name: string; title: string | null }
interface TaskActivity {
  id: number; status: string; type: string | null; createdAt: string; startedAt: string | null; completedAt: string | null; assignees: number[]
}
export interface Operations {
  reports: SiteReport[]
  generators: Generator[]
  sheets: { sheet_date: string; status: SheetStatus }[]
  waitingReports: string[]
  tasks: TaskActivity[]
  presentYesterday: number
  team: TeamMember[]
  active: TeamMember[]
  events: FeedEvent[]
}

export const OperationsContext = createContext<Operations | null>(null)
export const useOperations = () => useContext(OperationsContext)
