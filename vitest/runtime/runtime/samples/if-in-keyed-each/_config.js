export default {
	get props() {
	return {
		items: [{ id: 1, name: 'one' }, { id: 2, name: 'two' }]
	};
},

	html: `
		<ul>
			<li>one</li>
			<li>two</li>
		</ul>
	`
};
