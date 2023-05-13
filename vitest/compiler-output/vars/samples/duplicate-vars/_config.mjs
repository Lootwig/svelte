export default {

	/**
	 * @param {import("vitest").assert} assert
	 */
	test(assert, vars) {
		assert.deepEqual(vars, [
			{
				name: 'foo',
				injected: false,
				export_name: null,
				module: true,
				mutated: false,
				reassigned: false,
				referenced: false,
				referenced_from_script: false,
				writable: true
			},
			{
				name: 'foo',
				injected: false,
				export_name: null,
				module: false,
				mutated: false,
				reassigned: false,
				referenced: true,
				referenced_from_script: false,
				writable: true
			}
		]);
	}
};
