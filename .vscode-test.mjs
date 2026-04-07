import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
	tests: [
		{
			files: 'out/test/**/*.test.js',
			srcDir: 'out',
		},
	],
	coverage: {
		includeAll: true,
		include: [
			'**/out/services/**',
			'**/out/providers/**',
			'**/out/utils/**',
		],
		exclude: [
			'**/out/test/**',
			'**/out/views/**',
			'**/*.map',
		],
		reporter: ['text', 'html', 'lcov', 'json-summary'],
		output: './coverage',
	},
});
