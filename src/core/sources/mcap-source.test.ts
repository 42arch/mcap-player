import { describe, expect, it } from 'vitest'
import { createRemoteMcapSource } from './mcap-source'

describe('createRemoteMcapSource', () => {
  it('normalizes a remote MCAP URL and derives its display name', () => {
    expect(createRemoteMcapSource(' https://example.com/data/My%20Run.mcap?token=secret ')).toEqual({
      kind: 'remote',
      url: 'https://example.com/data/My%20Run.mcap?token=secret',
      name: 'My Run.mcap',
    })
  })

  it.each([
    '',
    'not-a-url',
    'file:///tmp/run.mcap',
    'https://example.com/run.bag',
  ])('rejects unsupported input: %s', (value) => {
    expect(() => createRemoteMcapSource(value)).toThrow()
  })
})
