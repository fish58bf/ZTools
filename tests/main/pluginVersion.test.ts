import { describe, expect, it } from 'vitest'
import { comparePluginVersions } from '../../src/shared/pluginVersion'

describe('comparePluginVersions', () => {
  it('compares numeric versions and treats missing segments as zero', () => {
    expect(comparePluginVersions('1.2', '1.2.0')).toBe(0)
    expect(comparePluginVersions('v1.2.3', '1.3.0')).toBe(-1)
    expect(comparePluginVersions('2.0.0', '1.9.9')).toBe(1)
  })

  it('orders prerelease versions before stable versions', () => {
    expect(comparePluginVersions('1.3.0-beta.1', '1.3.0')).toBe(-1)
    expect(comparePluginVersions('1.3.0-beta.2', '1.3.0-beta.10')).toBe(-1)
  })

  it('returns null for malformed versions', () => {
    expect(comparePluginVersions('latest', '1.0.0')).toBeNull()
    expect(comparePluginVersions('1..0', '1.0.0')).toBeNull()
  })
})
