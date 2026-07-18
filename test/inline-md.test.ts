import { describe, expect, it } from 'vitest'
import { renderInlineMd } from '../src/shared/lib/inline-md.ts'

describe('renderInlineMd', () => {
  it('renders inline code and bold', () => {
    expect(renderInlineMd('Take `.env` out **without deleting it**.')).toBe(
      'Take <code>.env</code> out <strong>without deleting it</strong>.'
    )
  })

  it('escapes HTML before rendering: authored copy can never inject markup', () => {
    expect(renderInlineMd('<img src=x onerror=alert(1)> & `a<b`')).toBe(
      '&lt;img src=x onerror=alert(1)&gt; &amp; <code>a&lt;b</code>'
    )
  })

  it('leaves plain text untouched', () => {
    expect(renderInlineMd('nothing special here')).toBe('nothing special here')
  })
})
