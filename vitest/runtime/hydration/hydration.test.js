// @vitest-environment jsdom
// TODO: https://github.com/capricorn86/happy-dom/issues/916

import * as path from 'path';
import * as fs from 'fs';
import * as svelte from '../../../compiler';
import { describe, assert, it, beforeAll } from 'vitest';
import { should_update_expected, try_load_config } from '../../helpers';
import { createRequire } from 'module';

import { assert_html_equal } from '../../html_equal';

const sveltePath = process.cwd();

let compileOptions = null;

const require = createRequire(import.meta.url);
describe('hydration', async () => {
	beforeAll(() => {
		require.extensions['.svelte'] = function (module, filename) {
			const options = Object.assign(
				{
					filename,
					hydratable: true,
					format: 'cjs',
					sveltePath
				},
				compileOptions
			);

			const { js } = svelte.compile(fs.readFileSync(filename, 'utf-8'), options);

			return module._compile(js.code, filename);
		};
	});

	async function runTest(dir) {
		if (dir[0] === '.') return;

		const config = await try_load_config(`${__dirname}/samples/${dir}/_config.js`);
		const solo = config.solo || /\.solo/.test(dir);

		const it_fn = config.skip ? it.skip : solo ? it.only : it;

		it_fn(dir, async () => {
			const cwd = path.resolve(`${__dirname}/samples/${dir}`);

			// TODO: Get rid of this
			// Do not introduce an await point here, it will break the test
			compileOptions = config.compileOptions || {};
			compileOptions.accessors = 'accessors' in config ? config.accessors : true;
			const SvelteComponent = require(`${cwd}/main.svelte`).default;
			// Do not introduce an await point here, it will break the test

			const target = window.document.body;
			const head = window.document.head;

			target.innerHTML = fs.readFileSync(`${cwd}/_before.html`, 'utf-8');

			let before_head;
			try {
				before_head = fs.readFileSync(`${cwd}/_before_head.html`, 'utf-8');
				head.innerHTML = before_head;
			} catch (err) {
				// continue regardless of error
			}

			const snapshot = config.snapshot ? config.snapshot(target) : {};

			const component = new SvelteComponent({
				target,
				hydrate: true,
				props: config.props
			});

			try {
				assert_html_equal(target.innerHTML, fs.readFileSync(`${cwd}/_after.html`, 'utf-8'));
			} catch (error) {
				if (should_update_expected()) {
					fs.writeFileSync(`${cwd}/_after.html`, target.innerHTML);
					console.log(`Updated ${cwd}/_after.html.`);
				} else {
					throw error;
				}
			}

			if (before_head) {
				try {
					const after_head = fs.readFileSync(`${cwd}/_after_head.html`, 'utf-8');
					assert_html_equal(head.innerHTML, after_head);
				} catch (error) {
					if (should_update_expected()) {
						fs.writeFileSync(`${cwd}/_after_head.html`, head.innerHTML);
						console.log(`Updated ${cwd}/_after_head.html.`);
					} else {
						throw error;
					}
				}
			}

			if (config.snapshot) {
				const snapshot_after = config.snapshot(target);
				for (const s in snapshot_after) {
					assert.ok(
						// Error logger borks because of circular references so use this instead
						snapshot_after[s] === snapshot[s],
						`Expected snapshot key "${s}" to have same value/reference`
					);
				}
			}

			if (config.test) {
				await config.test(
					{
						...assert,
						htmlEqual: assert_html_equal
					},
					target,
					snapshot,
					component,
					window
				);
			}

			component.$destroy();
			assert.equal(target.innerHTML, '');
		});
	}

	await Promise.all(fs.readdirSync(`${__dirname}/samples`).map((dir) => runTest(dir)));
});