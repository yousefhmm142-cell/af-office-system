import { useEffect } from 'react'

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · أبناء فارس أبو زايد`
  }, [title])
}
