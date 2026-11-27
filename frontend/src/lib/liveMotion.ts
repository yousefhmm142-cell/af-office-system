/**
 * Motion for every page, without touching each page's code:
 * - cards, rows and tiles rise softly into place as they scroll into view, a few at a time;
 * - figures count up from zero when first seen, and glide to their new value when they change
 *   (another month, another filter).
 * Nothing moves for people who asked their device for less motion, or when printing.
 */

const REVEAL = [
  '.nx-card', '.nx-stat', '.nxu-stat', '.nxu-card', '.nxu-row', '.nxb-card', '.nxp-tile', '.nxp-row', '.nxp-next',
  '.nxx-row', '.nxx-adv', '.nx-receipt', '.nxm-item', '.nxbd-shift', '.nxbd-mod', '.nx-doc', '.nx-log-row', '.nx-hero', '.nxp-hero',
  '.card', '.dash-kpi', '.af-attn', '.af-branch-today', '.tbl tbody tr', '.rows > .row', '.task-card', '.gen-list > li',
].join(',')

const COUNT = [
  '.nx-stat-value', '.nxu-stat b', '.dash-kpi-n', '.nxp-total strong', '.nx-leave-big strong', '.nx-donut-center b',
  '.af-hero-metrics b', '.nxb-today dd', '.nxp-net', '.nxx-amt', '.nx-receipt footer strong', '.pay-total b', '.fx-big-num',
].join(',')

const SKIP = '[role="dialog"], dialog, .dialog, .ai-panel, .nxm-thread, [data-no-motion]'
const NUMBER = /^(\D*?)(−|-)?([\d,]+(?:\.\d+)?)(\D*)$/

type Count = { node: Text; value: number; last: string; frame: number; seen: boolean; decimals: number; commas: boolean; pre: string; post: string; sign: string }

export function startLiveMotion(root: HTMLElement): () => void {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return () => {}
  document.documentElement.classList.add('live-motion')

  const counts = new WeakMap<Element, Count>()
  const revealed = new WeakSet<Element>()
  let queue: Element[] = []
  let flushing = 0

  // Elements that come into view in the same moment appear one after the other.
  const flush = () => {
    flushing = 0
    queue.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
    queue.forEach((el, i) => {
      const delay = Math.min(i, 10) * 45
      ;(el as HTMLElement).style.setProperty('--rv-delay', `${delay}ms`)
      el.classList.add('rv-in')
      // Once in place, hand the element back to its own hover and press effects.
      window.setTimeout(() => { el.classList.remove('rv', 'rv-in'); (el as HTMLElement).style.removeProperty('--rv-delay') }, delay + 800)
    })
    queue = []
  }

  const reveal = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue
      reveal.unobserve(e.target)
      queue.push(e.target)
    }
    if (queue.length && !flushing) flushing = requestAnimationFrame(flush)
  }, { rootMargin: '0px 0px -4% 0px', threshold: 0.04 })

  const countSeen = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue
      countSeen.unobserve(e.target)
      const c = counts.get(e.target)
      if (c && !c.seen) { c.seen = true; run(c, 0, c.value, 1100) }
    }
  }, { threshold: 0.3 })

  const format = (c: Count, v: number) => {
    const fixed = Math.abs(v).toFixed(c.decimals)
    const [int, dec] = fixed.split('.')
    const grouped = c.commas ? int!.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : int!
    return `${c.pre}${c.sign}${grouped}${dec ? `.${dec}` : ''}${c.post}`
  }

  function run(c: Count, from: number, to: number, ms: number) {
    cancelAnimationFrame(c.frame)
    const start = performance.now()
    const tick = (now: number) => {
      // Someone else (the page itself) wrote a new text meanwhile: let it be.
      if (c.node.data !== c.last) return
      const t = Math.min(1, (now - start) / ms)
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
      c.last = c.node.data = format(c, from + (to - from) * eased)
      if (t < 1) c.frame = requestAnimationFrame(tick)
    }
    c.frame = requestAnimationFrame(tick)
  }

  const parse = (text: string) => {
    if (/[:/]/.test(text) || /\d{4}-\d{2}/.test(text)) return null
    const m = NUMBER.exec(text.trim())
    if (!m) return null
    const raw = m[3]!
    const value = Number(raw.replace(/,/g, ''))
    if (!Number.isFinite(value)) return null
    return { pre: text.slice(0, text.indexOf(m[2] ?? raw)), sign: m[2] ?? '', value, decimals: raw.includes('.') ? raw.split('.')[1]!.length : 0, commas: raw.includes(','), post: m[4] ?? '' }
  }

  function watchCount(el: Element) {
    if (counts.has(el) || el.closest(SKIP)) return
    const node = [...el.childNodes].find((n): n is Text => n instanceof Text && /\d/.test(n.data))
    if (!node) return
    const p = parse(node.data)
    if (!p) return
    const c: Count = { node, value: p.value, last: '', frame: 0, seen: false, decimals: p.decimals, commas: p.commas, pre: p.pre, post: p.post, sign: p.sign }
    counts.set(el, c)
    c.last = node.data = format(c, 0)
    countSeen.observe(el)
  }

  // The page changed a figure (another month, a filter): glide from the old value to the new one.
  function recount(el: Element) {
    const c = counts.get(el)
    if (!c) return watchCount(el)
    const node = [...el.childNodes].find((n): n is Text => n instanceof Text && /\d/.test(n.data))
    if (!node) return
    if (node === c.node && node.data === c.last) return
    const p = parse(node.data)
    if (!p) { counts.delete(el); return }
    const from = c.node.data === c.last ? Number(c.last.replace(/[^\d.]/g, '')) || 0 : c.value
    Object.assign(c, { node, decimals: p.decimals, commas: p.commas, pre: p.pre, post: p.post, sign: p.sign, value: p.value })
    if (!c.seen) { c.last = node.data = format(c, 0); return }
    c.last = node.data = format(c, from)
    run(c, from, p.value, 700)
  }

  function scan(el: Element) {
    const add = (x: Element) => {
      if (revealed.has(x) || x.closest(SKIP)) return
      revealed.add(x)
      x.classList.add('rv')
      reveal.observe(x)
    }
    if (el.matches(REVEAL)) add(el)
    el.querySelectorAll(REVEAL).forEach(add)
    if (el.matches(COUNT)) watchCount(el)
    el.querySelectorAll(COUNT).forEach(watchCount)
  }

  scan(root)
  const mo = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'childList') {
        r.addedNodes.forEach((n) => { if (n instanceof Element) scan(n) })
        const host = r.target instanceof Element ? r.target.closest(COUNT) : null
        if (host) recount(host)
      } else if (r.type === 'characterData') {
        const host = r.target.parentElement?.closest(COUNT)
        if (host) recount(host)
      }
    }
  })
  mo.observe(root, { childList: true, subtree: true, characterData: true })

  return () => { mo.disconnect(); reveal.disconnect(); countSeen.disconnect(); document.documentElement.classList.remove('live-motion') }
}
