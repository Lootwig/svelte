import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { rollup } from 'rollup';
import { pretty_print_browser_assertion, try_load_module } from '../../helpers';
import * as svelte from '../../../compiler';
import { beforeAll, describe, afterAll, assert } from 'vitest';

const internal = path.resolve('internal/index.mjs');
const index = path.resolve('index.mjs');

const main = fs.readFileSync(`${__dirname}/driver.js`, 'utf-8');
const browser_assert = fs.readFileSync(`${__dirname}/assert.js`, 'utf-8');

describe(
	'runtime (browser)',
	async (it) => {
		/** @type {import('@playwright/test').Browser} */
		let browser;

		beforeAll(async () => {
			browser = await chromium.launch();
			console.log('[runtime-browser] Launched browser');
		});

		afterAll(async () => {
			if (browser) await browser.close();
		});

		const failed = new Set();

		async function runTest(dir, hydrate) {
			if (dir[0] === '.') return;

			const config = await try_load_module(import(`./samples/${dir}/_config.js`));
			const solo = config.solo || /\.solo/.test(dir);
			const skip = config.skip || /\.skip/.test(dir);

			if (hydrate && config.skip_if_hydrate) return;

			const it_fn = skip ? it.skip : solo ? it.only : it;

			it_fn(`${dir} ${hydrate ? '(with hydration)' : ''}`, async () => {
				if (failed.has(dir)) {
					// this makes debugging easier, by only printing compiled output once
					throw new Error('skipping test, already failed');
				}

				const warnings = [];

				const bundle = await rollup({
					input: 'main',
					plugins: [
						{
							name: 'testing-runtime-browser',
							resolveId(importee) {
								if (importee === 'svelte/internal' || importee === './internal') {
									return internal;
								}

								if (importee === 'svelte') {
									return index;
								}

								if (importee === 'main') {
									return 'main';
								}

								if (importee === 'assert') {
									return 'assert';
								}
							},
							load(id) {
								if (id === 'assert') return browser_assert;

								if (id === 'main') {
									return main
										.replace('__HYDRATE__', hydrate ? 'true' : 'false')
										.replace(
											'__MAIN_DOT_SVELTE__',
											path.join(__dirname, 'samples', dir, 'main.svelte')
										)
										.replace('__CONFIG__', path.join(__dirname, 'samples', dir, '_config.js'));
								}
								return null;
							},
							transform(code, id) {
								if (id.endsWith('.svelte')) {
									const compiled = svelte.compile(code.replace(/\r/g, ''), {
										...config.compileOptions,
										hydratable: hydrate,
										immutable: config.immutable,
										accessors: 'accessors' in config ? config.accessors : true
									});

									const out_dir = `${__dirname}/samples/${dir}/_output/${
										hydrate ? 'hydratable' : 'normal'
									}`;
									const out = `${out_dir}/${path.basename(id).replace(/\.svelte$/, '.js')}`;

									if (fs.existsSync(out)) {
										fs.unlinkSync(out);
									}
									if (!fs.existsSync(out_dir)) {
										fs.mkdirSync(out_dir, { recursive: true });
									}

									fs.writeFileSync(out, compiled.js.code, 'utf8');

									compiled.warnings.forEach((w) => warnings.push(w));

									return compiled.js;
								}
							}
						}
					]
				});

				const generated_bundle = await bundle.generate({ format: 'iife', name: 'test' });

				function assertWarnings() {
					if (config.warnings) {
						assert.deepStrictEqual(
							warnings.map((w) => ({
								code: w.code,
								message: w.message,
								pos: w.pos,
								start: w.start,
								end: w.end
							})),
							config.warnings
						);
					} else if (warnings.length) {
						failed.add(dir);
						/* eslint-disable no-unsafe-finally */
						throw new Error('Received unexpected warnings');
					}
				}

				try {
					const page = await browser.newPage();
					page.on('console', (type) => {
						console[type.type()](type.text());
					});
					await page.setContent('<main></main>');
					await page.evaluate(generated_bundle.output[0].code);
					const test_result = await page.evaluate(`test(document.querySelector('main'))`);

					if (test_result) console.log(test_result);
					assertWarnings();
					await page.close();
				} catch (err) {
					failed.add(dir);
					pretty_print_browser_assertion(err.message);
					assertWarnings();
					throw err;
				}
			});
		}

		await Promise.all(
			fs.readdirSync(`${__dirname}/samples`).map(async (dir) => {
				await runTest(dir, false);
				await runTest(dir, true);
			})
		);
	},
	{ timeout: 20000 }
);