'use strict';

const db = require('../../database');
const batch = require('../../batch');

module.exports = {
	name: 'Add approved field to posts (default false)',
	timestamp: Date.UTC(2025, 2, 1),
	method: async function () {
		const { progress } = this;

		const postCount = await db.sortedSetCard('posts:pid');
		progress.total = postCount;

		await batch.processSortedSet('posts:pid', async (pids) => {
			const keys = pids.map(pid => `post:${pid}`);
			const postData = await db.getObjectsFields(keys, ['approved']);

			const keysToSet = keys.filter((_, idx) => {
				const val = postData[idx].approved;
				return val === undefined || val === null || val === '';
			});

			if (keysToSet.length > 0) {
				await db.setObjectField(keysToSet, 'approved', '0');
			}
			progress.incr(pids.length);
		}, {
			progress,
			batch: 500,
		});
	},
};
