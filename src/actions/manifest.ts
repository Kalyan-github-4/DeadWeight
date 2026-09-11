const DEPENDENCY_SECTIONS = ['dependencies', 'devDependencies', 'optionalDependencies'];

// The package.json the package manager should leave behind after uninstalling
// `packageNames`. Only used to render the preview diff; the real edit is done by
// the package manager itself.
export function previewManifestAfterRemoval(
  manifestText: string,
  packageNames: string[],
): string {
  const manifest = JSON.parse(manifestText) as Record<string, unknown>;

  for (const section of DEPENDENCY_SECTIONS) {
    const deps = manifest[section];

    if (!deps || typeof deps !== 'object') {
      continue;
    }

    for (const name of packageNames) {
      delete (deps as Record<string, unknown>)[name];
    }
  }

  const indent = /^[ \t]+(?=")/m.exec(manifestText)?.[0] ?? '  ';
  const newline = manifestText.includes('\r\n') ? '\r\n' : '\n';
  const trailing = /\r?\n$/.test(manifestText) ? newline : '';

  return JSON.stringify(manifest, null, indent).replace(/\n/g, newline) + trailing;
}
