import qrcode from 'qrcode-generator'
import { MapPin, Plus, Printer, RefreshCw, Trash2, Wifi } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { api, ApiError } from '../../api/client'
import { useUser } from '../../app/auth'
import { useLoad } from '../../lib/useLoad'
import { useConfirm } from '../../ui/Confirm'
import { ErrorBanner, Switch } from '../../ui/Field'
import { Loading, PageHead } from '../../ui/PageHead'
import { Button, Pill } from '../../ui/primitives'
import { useToast } from '../../ui/Toast'
import { position, type Point } from './lib'

/** QR sheets of a branch: print, approve the office internet, optional distance check, new code. */
export function Points({ embeddedBranch }: { embeddedBranch?: string }) {
  const me = useUser()
  const [params] = useSearchParams()
  const branchId = embeddedBranch ?? params.get('branch_id') ?? String(me.branch?.id ?? '')
  const toast = useToast()
  const { data, error, loading, reload, setData } = useLoad<{ points: Point[]; my_ip: string }>(branchId ? `/attendance/points?branch_id=${branchId}` : null)
  const [busy, setBusy] = useState(false)

  async function add() {
    setBusy(true)
    try {
      await api('/attendance/points', { method: 'POST', body: { branch_id: Number(branchId), name: 'ورقة المكتب' } })
      void reload()
    } catch (e) { toast(e instanceof ApiError ? e.message : 'لم تُنشأ', 'danger') } finally { setBusy(false) }
  }

  const replace = (p: Point) => data && setData({ ...data, points: data.points.map((x) => (x.id === p.id ? p : x)) })

  const addButton = <Button variant="primary" icon={<Plus size={18} />} busy={busy} onClick={() => void add()}>ورقة جديدة</Button>

  return (
    <>
      {embeddedBranch ? (
        <div className="af-toolbar"><h2 className="af-h2">أوراق الحضور في المكتب</h2>{addButton}</div>
      ) : (
        <PageHead title="أوراق الـQR" eyebrow="الورقة المعلّقة في المكتب، يمسحها الموظف بجواله" actions={addButton} />
      )}
      <ErrorBanner text={error} />
      {loading && !data ? <Loading /> : data && (
        <div className="af-cards af-points">
          {data.points.map((p) => <PointCard key={p.id} point={p} myIp={data.my_ip} onChange={replace} />)}
          {data.points.length === 0 && <p className="eyebrow">لا توجد ورقة بعد. اضغط «ورقة جديدة».</p>}
        </div>
      )}
    </>
  )
}

function PointCard({ point, myIp, onChange }: { point: Point; myIp: string; onChange(p: Point): void }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [busy, setBusy] = useState<string | null>(null)
  const url = `${window.location.origin}/a/${point.code}`
  const svg = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(url)
    qr.make()
    return qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true })
  }, [url])
  const onOffice = point.allowed_ips.includes(myIp)

  async function call(key: string, path: string, method: string, body?: unknown, ok?: string) {
    setBusy(key)
    try {
      const res = await api<{ point: Point }>(path, { method, body })
      onChange(res.point)
      if (ok) toast(ok)
    } catch (e) { toast(e instanceof ApiError ? (Object.values(e.fields)[0] ?? e.message) : 'لم يُحفظ', 'danger') } finally { setBusy(null) }
  }

  async function setPlace() {
    setBusy('place')
    const pos = await position()
    setBusy(null)
    if (!pos) return toast('تعذّر تحديد الموقع. اسمح بالوصول إلى الموقع في الجوال وحاول مرة أخرى.', 'danger')
    if (pos.acc > 100) return toast(`دقة الموقع ضعيفة (${Math.round(pos.acc)} م). حاول بالقرب من النافذة.`, 'danger')
    void call('place', `/attendance/points/${point.id}/location`, 'PUT', { lat: pos.lat, lng: pos.lng, radius_m: point.radius_m }, 'حُفظ موقع المكتب')
  }

  function print() {
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>${point.name}</title><style>body{font-family:Almarai,system-ui,sans-serif;text-align:center;padding:40px}h1{font-size:30px;margin:0 0 6px}p{font-size:18px;color:#555}.qr{width:420px;margin:24px auto}.qr svg{width:100%;height:auto}</style></head><body><h1>امسح لتسجيل الحضور والانصراف</h1><p>افتح كاميرا الجوال ووجّهها نحو المربع</p><div class="qr">${svg}</div><p>أبناء فارس أبو زايد</p><script>onload=()=>{print()}</script></body></html>`)
    w.document.close()
  }

  return (
    <section className="card glass af-pad af-point">
      <div className="af-row-between">
        <h2 className="af-h2">{point.name}</h2>
        {!point.is_active && <Pill tone="warn">متوقفة</Pill>}
      </div>
      <div className="af-qr" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="af-switches">
        <Button icon={<Printer size={16} />} onClick={print}>طباعة</Button>
        <Button icon={<RefreshCw size={16} />} busy={busy === 'rotate'} onClick={async () => {
          if (await confirm({ title: 'إنشاء ورقة برمز جديد؟', message: 'ستتوقف الورقة القديمة عن العمل، ويجب طباعة الجديدة وتعليقها.', confirmLabel: 'رمز جديد', danger: true }))
            void call('rotate', `/attendance/points/${point.id}/rotate`, 'POST', undefined, 'أُنشئ رمز جديد. اطبع الورقة.')
        }}>رمز جديد</Button>
        <Switch label="مفعّلة" on={point.is_active} disabled={busy === 'active'} onChange={(v) => void call('active', `/attendance/points/${point.id}`, 'PATCH', { is_active: v })} />
      </div>

      <h3 className="af-h3"><Wifi size={16} /> إنترنت المكتب</h3>
      <p className="eyebrow">افتح هذه الصفحة وأنت متصل بشبكة الواي فاي في المكتب، ثم اضغط «اعتماد». بعدها لا يُسجَّل الحضور بالـQR إلا من شبكة المكتب، ويبقى زر الحضور في النظام متاحاً من أي مكان.</p>
      <div className="af-switches">
        <Switch label="اشتراط شبكة المكتب" on={point.network_required} disabled={busy === 'net'} onChange={(v) => void call('net', `/attendance/points/${point.id}`, 'PATCH', { network_required: v })} />
        <Button variant={onOffice ? 'secondary' : 'primary'} busy={busy === 'addnet'} disabled={onOffice} onClick={() => void call('addnet', `/attendance/points/${point.id}/network`, 'POST', undefined, 'اعتُمدت شبكة المكتب')}>
          {onOffice ? 'هذه الشبكة معتمدة' : 'اعتماد الشبكة المتصل بها'}
        </Button>
      </div>
      <div className="rows">
        {point.allowed_ips.map((ip) => (
          <div key={ip} className="row af-kv">
            <span className="row-label num" dir="ltr">{ip}{ip === myIp ? ' (متصل بها الآن)' : ''}</span>
            <button type="button" className="icon-btn" aria-label={`حذف ${ip}`} onClick={() => void call(`rm${ip}`, `/attendance/points/${point.id}/network`, 'DELETE', { ip })}><Trash2 size={15} /></button>
          </div>
        ))}
        {point.allowed_ips.length === 0 && <p className="eyebrow">لا توجد شبكة معتمدة بعد، لذا يعمل الـQR من أي اتصال بالإنترنت.</p>}
      </div>

      <h3 className="af-h3"><MapPin size={16} /> مكان المكتب (اختياري)</h3>
      <p className="eyebrow">{point.has_location ? `يُسجَّل الحضور بالـQR ضمن ${point.radius_m} متر من المكتب فقط.` : 'دون موقع: لا يوجد تحقق من المسافة.'}</p>
      <div className="af-switches">
        <Button busy={busy === 'place'} icon={<MapPin size={16} />} onClick={() => void setPlace()}>اعتماد مكاني الحالي</Button>
        {point.has_location && <Button onClick={() => void call('clear', `/attendance/points/${point.id}/location`, 'PUT', { lat: null, lng: null }, 'أُلغي التحقق من المسافة')}>إلغاء التحقق</Button>}
      </div>
    </section>
  )
}
