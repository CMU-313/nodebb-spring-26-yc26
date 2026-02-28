'use strict';

const nconf = require('nconf');
nconf.file({ file: 'config.json' });

const db = require('./src/database');

const isExplicitlyEnabled =
	process.env.MAKE_ANON_SCRIPT === 'true' ||
	process.env.MAKE_ANON_SCRIPT === '1' ||
	process.argv.includes('--allow-make-anon');

if (!isExplicitlyEnabled) {
	console.error(
		'Refusing to run make-anon.js without explicit opt-in.\n' +
		'Set MAKE_ANON_SCRIPT=1 (or MAKE_ANON_SCRIPT=true) or pass --allow-make-anon on the command line.'
	);
	process.exit(1);
}

const readline = require('readline');

async function confirmAction(topicId, postId) {
	return new Promise((resolve) => {
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		});

		const message = `About to mark topic ${topicId} and post ${postId} as anonymous. Type "yes" to confirm: `;
		rl.question(message, (answer) => {
			rl.close();
			resolve(answer.trim().toLowerCase() === 'yes');
		});
	});
}

db.init(async function (err) {
	if (err) {
		console.error('Database connection failed:', err);
		process.exit(1);
	}

	const args = process.argv.slice(2);
	if (args.length < 2) {
		console.error('Usage: node make-anon.js <topicId> <postId>');
		process.exit(1);
	}

	const topicId = Number(args[0]);
	const postId = Number(args[1]);

	if (!Number.isInteger(topicId) || topicId <= 0 || !Number.isInteger(postId) || postId <= 0) {
		console.error('Error: <topicId> and <postId> must be positive integers.');
		process.exit(1);
	}

	const confirmed = await confirmAction(topicId, postId);
	if (!confirmed) {
		console.log('Aborted: no changes were made.');
		process.exit(0);
	}
	await db.setObjectField(`topic:${topicId}`, 'isAnonymous', true);
	await db.setObjectField(`post:${postId}`, 'isAnonymous', true);

	console.log(`Success! Topic ${topicId} and Post ${postId} are now anonymous in the database.`);
	process.exit(0);
});