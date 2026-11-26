import {ArrowDown, ArrowLeft, CheckCheck, ClipboardList, GitMerge, MessageSquareText, Stamp, UserRound, Wrench} from 'lucide-react'
import {useState} from 'react'

const examples = {
 later: {label:'الختم بعد المهمة', title:'سجّل المكتب الإنجاز، ثم سُجّل الختم', text:'المهمة #33 منجزة. عند تسجيل الختم من «تسجيل الأختام والبحث» تُختار المهمة #33، فيُربط الختم بها، ويبقى العدد عملاً واحداً.', seal:'223516', status:'المهمة #33 · الختم 223516'},
 earlier: {label:'الإنجاز من الختم', title:'اختير ختم المهمة وحُفظ معها', text:'اختيار المهمة المعلّقة ثم «حفظ وإنجاز المهمة» يُنجز الطلب ويربط الختم به في العملية نفسها. والمهمة المجهّزة دون فني تُسند إلى صاحب الختم عند الحفظ. أما تسجيل ختم دون اختيار مهمة فلا يُنجز أي طلب.', seal:'223516', status:'المهمة #33 · الختم 223516'},
 none: {label:'عمل دون ختم', title:'شدّ كابل، ولم يحتج الفني إلى ختم', text:'يُسجَّل الإنجاز وتُترك خانة الأختام فارغة. المهمة منجزة ومحسوبة كاملة، ولا ينقصها شيء.', seal:'دون ختم', status:'المهمة #33 · دون ختم'},
} as const
type Example = keyof typeof examples

/** A semantic, responsive map; everything here is an illustrative example, not customer data. */
export function WorkMap(){
 const [example,setExample]=useState<Example>('later')
 const chosen=examples[example]
 return <section id="g-work-map" className="work-map card" aria-labelledby="work-map-title">
  <header className="wm-head">
   <span className="wm-eyebrow"><GitMerge size={16}/> خريطة العمل · من الطلب إلى الكشف</span>
   <h2 id="work-map-title">مهمة وختم… وعمل يُحسب مرة واحدة.</h2>
   <p>المهمة هي الطلب، والختم رقم القطعة المستخدمة. يُربطان عندما يكونان للعمل نفسه، والختم ليس شرطاً للإنجاز.</p>
  </header>
  <div className="wm-examples" role="group" aria-label="جرّب مثالاً على مسار العمل">
   {(Object.keys(examples) as Example[]).map(key=><button key={key} type="button" aria-pressed={example===key} onClick={()=>setExample(key)}>{examples[key].label}</button>)}
  </div>
  <div className="wm-canvas">
   <ol className="wm-start">
    <li><span className="wm-icon"><ClipboardList size={23}/></span><small>01 · المكتب</small><h3>جهّز الطلب</h3><p>المشترك ونوع العمل والمكان.<br/>ويأخذ رقماً ثابتاً مثل <bdi>#33</bdi>.</p><ArrowLeft className="wm-next" size={22} aria-hidden="true"/></li>
    <li><span className="wm-icon"><MessageSquareText size={23}/></span><small>02 · الإرسال</small><h3>أعطِه لفني أو أكثر</h3><p>داخل النظام أو عبر واتساب. وفي المهمة المشتركة يصل الطلب إلى كل فني.</p><ArrowLeft className="wm-next" size={22} aria-hidden="true"/></li>
    <li><span className="wm-icon"><UserRound size={23}/></span><small>03 · الميدان</small><h3>الفني ينفّذ العمل</h3><p>يكتب في الدفتر، أو يسجّل من «مهامي» إن كان معه جوال.</p></li>
   </ol>
   <div className="wm-junction"><span>هل استُخدم ختم؟</span><ArrowDown size={22} aria-hidden="true"/></div>
   <div className="wm-lanes">
    <article className="wm-lane" data-current={example==='none'}>
     <header><Wrench size={23}/><div><small>المسار الأول</small><h3>لا، العمل دون ختم</h3></div></header>
     <p>من زر «تم»: سجّل ما أُنجز واترك الأختام فارغة.</p>
     <div className="wm-outcome"><CheckCheck size={19}/><b>إنجاز كامل يُحسب عادياً</b></div>
     <span className="wm-lane-note">مثل شدّ كابل أو أي عمل لا يحتاج إلى ختم.</span>
    </article>
    <article className="wm-lane" data-current={example!=='none'}>
     <header><Stamp size={23}/><div><small>المسار الثاني</small><h3>نعم، استُخدم ختم</h3></div></header>
     <div className="wm-choices"><p>رقم الختم يُكتب مع «تم الإنجاز»</p><span>أو</span><p>المحاسبة تختار المهمة وتحفظ ختمها</p></div>
     <div className="wm-match"><GitMerge size={19}/><b>يُربط الختم بالمهمة المختارة</b><ul><li>البحث برقم المهمة</li><li>أو باسم المشترك</li><li>أو بنوع العمل</li><li>أو برقم الطبلون</li></ul></div>
     <span className="wm-lane-note">يشمل البحث المهام القديمة والجديدة. والختم المسجّل مع الإنجاز يظهر عند المحاسبة، فلا يُسجَّل استخدامه مرة أخرى.</span>
    </article>
   </div>
   <div className="wm-merge" aria-hidden="true"><ArrowDown size={24}/></div>
   <div className="wm-result">
    <div><span className="wm-eyebrow">04 · النتيجة</span><h3>سجل واضح، وعدّ دون تكرار</h3><p>يبقى رقم المهمة ثابتاً، وتظهر الأختام معها، ويجمع الكشف العمل حسب نوعه ويوم إنجازه.</p></div>
    <div className="wm-ticket"><span>مثال توضيحي</span><b><bdi>{chosen.status}</bdi></b><span>{example==='none'?'شد كابل':'صيانة كابل'}</span><strong>1 <small>عمل منجز</small></strong></div>
   </div>
  </div>
  <div className="wm-story" aria-live="polite" aria-atomic="true"><b>{chosen.title}</b><p>{chosen.text}</p></div>
  <div className="wm-notes">
   <p><b>مهمتان متشابهتان في اليوم نفسه؟</b> لا يختار النظام بالتخمين؛ المحاسبة تحدّد رقم المهمة.</p>
   <p><b>عمل ليس له طلب سابق؟</b> يُحسب تسجيل المحاسبة عملاً مستقلاً. وتعدّد الأختام للعمل نفسه لا يضاعف إنجازه.</p>
   <p><b>من يضغط «تم»؟</b> موظف المكتب، أو الفني لمهمته الفردية من «مهامي». وتُنجز المحاسبة أيضاً المهمة المختارة عند حفظ ختمها. وللمهمة المشتركة إنجاز واحد يُحسب لكل فني فيها.</p>
   <p><b>الإنترنت مقطوع؟</b> يُحفظ إنجاز الفني على جواله ويُرسل عند عودة الاتصال. أما تسجيل الأختام فيحتاج إلى الإنترنت.</p>
  </div>
 </section>
}
