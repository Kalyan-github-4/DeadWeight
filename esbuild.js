const esbuild = require("esbuild");

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started');
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				console.error(`    ${location.file}:${location.line}:${location.column}:`);
			});
			console.log('[watch] build finished');
		});
	},
};

async function main() {
	const contexts = await Promise.all([
		// The extension host bundle.
		esbuild.context({
			entryPoints: [
				'src/extension.ts'
			],
			bundle: true,
			format: 'cjs',
			minify: production,
			sourcemap: !production,
			sourcesContent: false,
			platform: 'node',
			outfile: 'dist/extension.js',
			external: ['vscode'],
			logLevel: 'silent',
			plugins: [
				/* add to the end of plugins array */
				esbuildProblemMatcherPlugin,
			],
		}),
		// The Connection Graph webview script (runs in the browser, bundles cytoscape).
		esbuild.context({
			entryPoints: ['src/webview/graph.ts'],
			bundle: true,
			format: 'iife',
			minify: production,
			sourcemap: !production,
			sourcesContent: false,
			platform: 'browser',
			target: 'es2022',
			outfile: 'dist/webview/graph.js',
			logLevel: 'silent',
			plugins: [esbuildProblemMatcherPlugin],
		}),
	]);
	if (watch) {
		await Promise.all(contexts.map((ctx) => ctx.watch()));
	} else {
		await Promise.all(contexts.map((ctx) => ctx.rebuild()));
		await Promise.all(contexts.map((ctx) => ctx.dispose()));
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
