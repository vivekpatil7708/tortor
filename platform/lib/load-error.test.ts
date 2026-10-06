import { describe, expect, it, vi } from 'vitest'
import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LoadError } from '@/components/ui/load-error'

describe('load failure box (B8)', () => {
  it('says what failed instead of showing an empty page', () => {
    const html = renderToStaticMarkup(createElement(LoadError, { what: 'your UPI IDs', onRetry: () => {} }))

    expect(html).toContain('Couldn&#x27;t load your UPI IDs')
    expect(html).toContain('role="alert"')
    expect(html).toContain('<button type="button"')
  })

  it('tries again from its button', () => {
    const onRetry = vi.fn()
    const box = LoadError({ what: 'your links', onRetry }) as ReactElement<{ children: unknown[] }>
    const button = box.props.children.find(
      (child): child is ReactElement<{ onClick: () => void }> => (child as ReactElement)?.type === 'button'
    )

    button?.props.onClick()

    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
