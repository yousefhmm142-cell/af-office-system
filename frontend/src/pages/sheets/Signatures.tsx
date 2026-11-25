import { CircleCheck, Clock, WifiOff } from 'lucide-react'
import { stamp } from '../../lib/dates'
import type { SheetMeta } from './workflow'

/** The paper's signature line: who sent it and when, who approved it and when. */
export function Signatures({ sheet, names, sender }: { sheet: SheetMeta; names: Map<string, string>; sender: string }) {
  return (
    <div className="sign">
      <div>
        <span className={`sign-ico ${sheet.submittedAt ? 'ok' : 'wait'}`}>{sheet.submittedAt ? <CircleCheck size={18} /> : <Clock size={18} />}</span>
        <div>
          <b>{sheet.submittedAt ? `أرسله ${names.get(sheet.submittedBy ?? '') ?? sender}` : 'لم يُرسل بعد'}</b>
          <span>
            {sheet.submittedAt ? stamp(sheet.submittedAt) : "—"} · بتوقيت الخادم
            {sheet.recordedOffline && <><WifiOff size={13} className="inline-ico" /> أُرسل بدون اتصال</>}
          </span>
        </div>
      </div>
      <div>
        <span className={`sign-ico ${sheet.approvedAt ? 'ok' : 'wait'}`}>{sheet.approvedAt ? <CircleCheck size={18} /> : <Clock size={18} />}</span>
        <div>
          <b>{sheet.approvedAt ? `اعتمده ${names.get(sheet.approvedBy ?? '') ?? 'المدير'}` : 'اعتماد المدير'}</b>
          <span>{sheet.approvedAt ? stamp(sheet.approvedAt) : sheet.status === 'returned' ? 'أُعيد فتحه' : 'بانتظار الاعتماد'}</span>
        </div>
      </div>
    </div>
  )
}
