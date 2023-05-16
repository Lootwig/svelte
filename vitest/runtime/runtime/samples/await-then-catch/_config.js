let fulfil;

let thePromise = new Promise((f) => {
	fulfil = f;
});

export default {
	get props() {
	return { thePromise };
},

	html: `
		<p>loading...</p>
	`,

	test({ assert, component, target }) {
		fulfil(42);

		return thePromise
			.then(() => {
				assert.htmlEqual(
					target.innerHTML,
					`
					<p>the value is 42</p>
				`
				);

				let reject;

				thePromise = new Promise((f, r) => {
					reject = r;
				});

				component.thePromise = thePromise;

				assert.htmlEqual(
					target.innerHTML,
					`
					<p>loading...</p>
				`
				);

				reject(new Error('something broke'));

				return thePromise.catch(() => {});
			})
			.then(() => {
				assert.htmlEqual(
					target.innerHTML,
					`
					<p>oh no! something broke</p>
				`
				);
			});
	}
};
