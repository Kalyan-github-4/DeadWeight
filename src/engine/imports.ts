import { extractDynamicImportPrefixes } from './dynamicImports';

// Import extraction for the connection graph. A lexical scan rather than a full
// parser: fast, dependency-free, and good for the forms real code uses. Missing an
// import can only make a file look less connected than it is, so the graph treats
// anything it can't follow as "maybe", never as "unused".

export type ImportKind = 'static' | 'type' | 'require' | 'dynamic';

export interface ImportRef {
  specifier: string;
  kind: ImportKind;
}

export interface ExtractedImports {
  imports: ImportRef[];
  dynamicPrefixes: string[];    // computed import()/require() paths; '' when fully computed
}

// Blanks out comments while keeping strings and templates, so the patterns below
// don't match commented-out imports. Offsets and line breaks are preserved.
export function stripComments(source: string): string {
  const out: string[] = [];
  const n = source.length;
  let i = 0;

  while (i < n) {
    const char = source[i];
    const next = source[i + 1];

    if (char === '/' && next === '/') {
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? n : end;
      out.push(' '.repeat(stop - i));
      i = stop;
    } else if (char === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? n : end + 2;
      out.push(source.slice(i, stop).replace(/[^\n]/g, ' '));
      i = stop;
    } else if (char === '"' || char === "'" || char === '`') {
      let j = i + 1;

      while (j < n && source[j] !== char) {
        if (source[j] === '\\') {
          j++;
        } else if (char !== '`' && source[j] === '\n') {
          break;  // unterminated quote (often a regex literal); stop at the line end
        }

        j++;
      }

      out.push(source.slice(i, j + 1));
      i = j + 1;
    } else {
      out.push(char);
      i++;
    }
  }

  return out.join('');
}

// import x from 'a' | import { x } from 'a' | import * as x from 'a' | import 'a' | import type { X } from 'a'
const IMPORT_FROM = /(?:^|[^\w$.])import\s+(type\s+)?(?:[\w$*{}\s,]+?\s+from\s*)?(['"])([^'"\n]+)\2/g;

// export * from 'a' | export * as x from 'a' | export { x } from 'a' | export type { X } from 'a'
const EXPORT_FROM = /(?:^|[^\w$.])export\s+(type\s+)?(?:\*(?:\s*as\s+[\w$]+)?|\{[^}]*\})\s*from\s*(['"])([^'"\n]+)\2/g;

// require('a') | import('a') | import(`a`) | import x = require('a')
const CALL = /(?:^|[^\w$.])(require|import)\s*\(\s*(?:(['"])([^'"\n]+)\2|`([^`$\\]*)`)\s*[,)]/g;

// require.resolve('a') loads nothing itself, but the file or package must exist.
const REQUIRE_RESOLVE = /(?:^|[^\w$.])require\.resolve\s*\(\s*(['"])([^'"\n]+)\1/g;

export function extractImports(source: string): ExtractedImports {
  const code = stripComments(source);
  const imports: ImportRef[] = [];

  for (const match of code.matchAll(IMPORT_FROM)) {
    imports.push({ specifier: match[3], kind: match[1] ? 'type' : 'static' });
  }

  for (const match of code.matchAll(EXPORT_FROM)) {
    imports.push({ specifier: match[3], kind: match[1] ? 'type' : 'static' });
  }

  for (const match of code.matchAll(CALL)) {
    imports.push({
      specifier: match[3] ?? match[4],
      kind: match[1] === 'require' ? 'require' : 'dynamic',
    });
  }

  for (const match of code.matchAll(REQUIRE_RESOLVE)) {
    imports.push({ specifier: match[2], kind: 'require' });
  }

  return {
    imports: imports.filter(({ specifier }) => specifier.trim() !== ''),
    dynamicPrefixes: extractDynamicImportPrefixes(code),
  };
}
