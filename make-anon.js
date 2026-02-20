'use strict';

const nconf = require('nconf');
nconf.file({ file: 'config.json' });

const db = require('./src/database');

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