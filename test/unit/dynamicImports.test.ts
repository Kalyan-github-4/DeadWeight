import { describe, expect, it } from 'vitest';
import { extractDynamicImportPrefixes } from '../../src/engine/dynamicImports';

describe('extractDynamicImportPrefixes', () => {
  it('ignores plain string specifiers', () => {
    expect(extractDynamicImportPrefixes(`
      import('./a.js');
      require("./b");
      import(/* webpackChunkName: "c" */ './c.js');
      const x = await import(\`./d.js\`);
      require('./e', { with: {} });
    `)).toEqual([]);
  });

  it('keeps the static prefix of template literals and concatenation', () => {
    expect(extractDynamicImportPrefixes(`
      import(\`./plugins/\${name}.js\`);
      require('../locales/' + lang + '.js');
      import(\`dayjs/locale/\${lang}\`);
    `)).toEqual(['./plugins/', '../locales/', 'dayjs/locale/']);
  });

  it('reports fully computed specifiers with an empty prefix', () => {
    expect(extractDynamicImportPrefixes('const mod = require(moduleName);')).toEqual(['']);
    expect(extractDynamicImportPrefixes('await import(getPath())')).toEqual(['']);
  });

  it('skips method calls and empty calls', () => {
    expect(extractDynamicImportPrefixes('loader.import(x); obj.require(y); require()')).toEqual([]);
  });
});
