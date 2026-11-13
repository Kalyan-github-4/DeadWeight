// Finds `import(...)` and `require(...)` calls whose specifier isn't a plain string
// literal. The static part before the first computed piece is kept as `prefix`:
//   import(`./locales/${lang}.js`)  -> './locales/'
//   require('./plugins/' + name)     -> './plugins/'
//   require(moduleName)              -> ''
// A lexical scan, not a parser: a match inside a comment or string only makes the
// result more conservative, which is the safe direction for this tool.

const CALL_PATTERN = /\b(?:import|require)\s*\(/g;

function skipTrivia(source: string, index: number): number {
  let i = index;

  while (i < source.length) {
    if (/\s/.test(source[i])) {
      i++;
    } else if (source.startsWith('/*', i)) {
      const end = source.indexOf('*/', i + 2);
      i = end === -1 ? source.length : end + 2;
    } else if (source.startsWith('//', i)) {
      const end = source.indexOf('\n', i + 2);
      i = end === -1 ? source.length : end + 1;
    } else {
      break;
    }
  }

  return i;
}

// Reads a quoted or template literal starting at `index`. For templates, stops at
// the first `${` and reports that the literal is incomplete.
function readLiteral(
  source: string,
  index: number,
): { text: string; end: number; interpolated: boolean } | undefined {
  const quote = source[index];
  let text = '';
  let i = index + 1;

  while (i < source.length) {
    const char = source[i];

    if (char === '\\') {
      text += source[i + 1] ?? '';
      i += 2;
    } else if (char === quote) {
      return { text, end: i + 1, interpolated: false };
    } else if (quote === '`' && source.startsWith('${', i)) {
      return { text, end: i, interpolated: true };
    } else if (char === '\n' && quote !== '`') {
      return undefined;
    } else {
      text += char;
      i++;
    }
  }

  return undefined;
}

export function extractDynamicImportPrefixes(source: string): string[] {
  const prefixes: string[] = [];

  for (const match of source.matchAll(CALL_PATTERN)) {
    // `foo.import(...)` and `foo.require(...)` are ordinary method calls.
    if (source[match.index - 1] === '.') {
      continue;
    }

    const argStart = skipTrivia(source, match.index + match[0].length);
    const first = source[argStart];

    if (first === ')' || first === undefined) {
      continue;
    }

    if (first !== '"' && first !== "'" && first !== '`') {
      prefixes.push('');
      continue;
    }

    const literal = readLiteral(source, argStart);

    if (!literal) {
      prefixes.push('');
      continue;
    }

    if (literal.interpolated) {
      prefixes.push(literal.text);
      continue;
    }

    const next = source[skipTrivia(source, literal.end)];

    if (next !== ')' && next !== ',') {
      prefixes.push(literal.text);
    }
  }

  return prefixes;
}
