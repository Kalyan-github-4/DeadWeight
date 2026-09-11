import { describe, expect, it } from 'vitest';
import { previewManifestAfterRemoval } from '../../src/actions/manifest';

describe('previewManifestAfterRemoval', () => {
  it('removes packages from every dependency section and keeps formatting', () => {
    const before = [
      '{',
      '    "name": "app",',
      '    "dependencies": {',
      '        "chalk": "^5.3.0",',
      '        "commander": "^12.0.0"',
      '    },',
      '    "devDependencies": {',
      '        "c8": "^10.1.0"',
      '    }',
      '}',
      '',
    ].join('\r\n');

    const after = previewManifestAfterRemoval(before, ['chalk', 'c8']);

    expect(after).toBe([
      '{',
      '    "name": "app",',
      '    "dependencies": {',
      '        "commander": "^12.0.0"',
      '    },',
      '    "devDependencies": {}',
      '}',
      '',
    ].join('\r\n'));
  });
});
