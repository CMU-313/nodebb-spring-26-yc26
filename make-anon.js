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
db.init(async function (err) {
	if (err) {
		console.error('Database connection failed:', err);
		process.exit(1);
	}

	// Hardcoded IDs for testing purposes
	const topicId = 6;
	const postId = 8;

	await db.setObjectField(`topic:${topicId}`, 'isAnonymous', true);
	await db.setObjectField(`post:${postId}`, 'isAnonymous', true);

	console.log(`Success! Topic ${topicId} and Post ${postId} are now anonymous in the database.`);
	process.exit(0);
});