'use strict';

const assert = require('assert');
const db = require('./mocks/databasemock');
const topics = require('../src/topics');
const posts = require('../src/posts');
const user = require('../src/user');
const groups = require('../src/groups');
const categories = require('../src/categories');

const announcementViewers = require('../plugins/announcement-viewers/library');

describe('Announcement Viewers Plugin', () => {
	let adminUid;
	let globalModUid;
	let taUid;
	let studentUid;
	let student2Uid;
	let categoryId;
	let testTopicTid;
	let testPostPid;

	before(async () => {
		// Create admin
		adminUid = await user.create({ username: 'admin_viewers', password: '123456' });
		await groups.join('administrators', adminUid);

		// Create global moderator
		globalModUid = await user.create({ username: 'globalmod_viewers', password: '123456' });
		await groups.join('Global Moderators', globalModUid);

		// Create TA user
		taUid = await user.create({ username: 'ta_viewers', password: '123456' });
		// Create group if it doesn't exist
		const groupExists = await groups.exists('Teaching Assistants');
		if (!groupExists) {
			await groups.create({ name: 'Teaching Assistants' });
		}
		await groups.join('Teaching Assistants', taUid);

		// Create students
		studentUid = await user.create({ username: 'student_viewers', password: '123456' });
		student2Uid = await user.create({ username: 'student2_viewers', password: '123456' });

		// Create test category (announcements)
		const category = await categories.create({
			name: 'Announcements',
			description: 'Test announcements category',
		});
		categoryId = category.cid;

		// Initialize the plugin
		await announcementViewers.init({});
	});

	beforeEach(async () => {
		// Create a fresh announcement for each test
		const result = await topics.post({
			uid: adminUid,
			cid: categoryId,
			title: 'Test Announcement ' + Date.now(),
			content: 'Announcement content',
		});
		testTopicTid = result.topicData.tid;
		testPostPid = result.postData.pid;
	});

	// ==========================================
	// TEST: logView socket method
	// ==========================================
	describe('logView()', () => {
		const socketPlugins = require('../src/socket.io/plugins');

		it('should register logView socket method', () => {
			assert.ok(socketPlugins.announcementViewers);
			assert.strictEqual(typeof socketPlugins.announcementViewers.logView, 'function');
		});

		it('should reject unauthenticated users', async () => {
			const mockSocket = { uid: 0 };
			try {
				await socketPlugins.announcementViewers.logView(mockSocket, { pid: testPostPid });
				assert.fail('Should have thrown error');
			} catch (err) {
				assert.strictEqual(err.message, '[[error:not-logged-in]]');
			}
		});

		it('should reject requests without data', async () => {
			const mockSocket = { uid: studentUid };
			try {
				await socketPlugins.announcementViewers.logView(mockSocket, null);
				assert.fail('Should have thrown error');
			} catch (err) {
				assert.strictEqual(err.message, '[[error:invalid-data]]');
			}
		});

		it('should reject requests without pid', async () => {
			const mockSocket = { uid: studentUid };
			try {
				await socketPlugins.announcementViewers.logView(mockSocket, {});
				assert.fail('Should have thrown error');
			} catch (err) {
				assert.strictEqual(err.message, '[[error:invalid-data]]');
			}
		});

		it('should reject requests with invalid pid', async () => {
			const mockSocket = { uid: studentUid };
			try {
				await socketPlugins.announcementViewers.logView(mockSocket, { pid: 999999 });
				assert.fail('Should have thrown error');
			} catch (err) {
				assert.strictEqual(err.message, '[[error:invalid-data]]');
			}
		});

		it('should log view for student', async () => {
			const mockSocket = { uid: studentUid };
			const result = await socketPlugins.announcementViewers.logView(mockSocket, { pid: testPostPid });

			assert.strictEqual(result.logged, true);
			assert.ok(result.timestamp);
		});

		it('should not log duplicate views', async () => {
			const mockSocket = { uid: studentUid };

			// First view
			await socketPlugins.announcementViewers.logView(mockSocket, { pid: testPostPid });

			// Second view - should not log
			const result = await socketPlugins.announcementViewers.logView(mockSocket, { pid: testPostPid });

			assert.strictEqual(result.logged, false);
			assert.strictEqual(result.reason, 'already-viewed');
		});

		it('should not log views for admin', async () => {
			const mockSocket = { uid: adminUid };
			const result = await socketPlugins.announcementViewers.logView(mockSocket, { pid: testPostPid });

			assert.strictEqual(result.logged, false);
			assert.strictEqual(result.reason, 'staff-view');
		});

		it('should not log views for global moderator', async () => {
			const mockSocket = { uid: globalModUid };
			const result = await socketPlugins.announcementViewers.logView(mockSocket, { pid: testPostPid });

			assert.strictEqual(result.logged, false);
			assert.strictEqual(result.reason, 'staff-view');
		});

		it('should not log views for TA', async () => {
			const mockSocket = { uid: taUid };
			const result = await socketPlugins.announcementViewers.logView(mockSocket, { pid: testPostPid });

			assert.strictEqual(result.logged, false);
			assert.strictEqual(result.reason, 'staff-view');
		});

		it('should store view in database', async () => {
			const mockSocket = { uid: studentUid };
			await socketPlugins.announcementViewers.logView(mockSocket, { pid: testPostPid });

			const isViewer = await db.isSortedSetMember(`post:${testPostPid}:viewers`, studentUid);
			assert.strictEqual(isViewer, true);
		});

		it('should handle pid as string', async () => {
			const mockSocket = { uid: studentUid };
			const result = await socketPlugins.announcementViewers.logView(mockSocket, { pid: String(testPostPid) });

			assert.strictEqual(result.logged, true);
		});
	});

	// ==========================================
	// TEST: getViewers socket method
	// ==========================================
	describe('getViewers()', () => {
		const socketPlugins = require('../src/socket.io/plugins');

		it('should register getViewers socket method', () => {
			assert.strictEqual(typeof socketPlugins.announcementViewers.getViewers, 'function');
		});

		it('should reject unauthenticated users', async () => {
			const mockSocket = { uid: 0 };
			try {
				await socketPlugins.announcementViewers.getViewers(mockSocket, { pid: testPostPid });
				assert.fail('Should have thrown error');
			} catch (err) {
				assert.strictEqual(err.message, '[[error:not-logged-in]]');
			}
		});

		it('should reject students from viewing viewers list', async () => {
			const mockSocket = { uid: studentUid };
			try {
				await socketPlugins.announcementViewers.getViewers(mockSocket, { pid: testPostPid });
				assert.fail('Should have thrown error');
			} catch (err) {
				assert.strictEqual(err.message, '[[error:no-privileges]]');
			}
		});

		it('should reject requests without data', async () => {
			const mockSocket = { uid: adminUid };
			try {
				await socketPlugins.announcementViewers.getViewers(mockSocket, null);
				assert.fail('Should have thrown error');
			} catch (err) {
				assert.strictEqual(err.message, '[[error:invalid-data]]');
			}
		});

		it('should reject requests without pid', async () => {
			const mockSocket = { uid: adminUid };
			try {
				await socketPlugins.announcementViewers.getViewers(mockSocket, {});
				assert.fail('Should have thrown error');
			} catch (err) {
				assert.strictEqual(err.message, '[[error:invalid-data]]');
			}
		});

		it('should reject requests with invalid pid', async () => {
			const mockSocket = { uid: adminUid };
			try {
				await socketPlugins.announcementViewers.getViewers(mockSocket, { pid: 999999 });
				assert.fail('Should have thrown error');
			} catch (err) {
				assert.strictEqual(err.message, '[[error:invalid-data]]');
			}
		});

		it('should allow admin to get viewers', async () => {
			const mockSocket = { uid: adminUid };
			const result = await socketPlugins.announcementViewers.getViewers(mockSocket, { pid: testPostPid });

			assert.ok(result);
			assert.ok(Array.isArray(result.viewers));
			assert.strictEqual(typeof result.count, 'number');
		});

		it('should allow global moderator to get viewers', async () => {
			const mockSocket = { uid: globalModUid };
			const result = await socketPlugins.announcementViewers.getViewers(mockSocket, { pid: testPostPid });

			assert.ok(result);
			assert.ok(Array.isArray(result.viewers));
		});

		it('should allow TA to get viewers', async () => {
			const mockSocket = { uid: taUid };
			const result = await socketPlugins.announcementViewers.getViewers(mockSocket, { pid: testPostPid });

			assert.ok(result);
			assert.ok(Array.isArray(result.viewers));
		});

		it('should return empty list for post with no views', async () => {
			const mockSocket = { uid: adminUid };
			const result = await socketPlugins.announcementViewers.getViewers(mockSocket, { pid: testPostPid });

			assert.strictEqual(result.count, 0);
			assert.deepStrictEqual(result.viewers, []);
		});

		it('should return viewer list with user details', async () => {
			// Log a view first
			await socketPlugins.announcementViewers.logView({ uid: studentUid }, { pid: testPostPid });

			const mockSocket = { uid: adminUid };
			const result = await socketPlugins.announcementViewers.getViewers(mockSocket, { pid: testPostPid });

			assert.strictEqual(result.count, 1);
			assert.strictEqual(result.viewers[0].uid, studentUid);
			assert.ok(result.viewers[0].username);
			assert.ok(result.viewers[0].viewedAt);
		});

		it('should return multiple viewers', async () => {
			// Log views from multiple students
			await socketPlugins.announcementViewers.logView({ uid: studentUid }, { pid: testPostPid });
			await socketPlugins.announcementViewers.logView({ uid: student2Uid }, { pid: testPostPid });

			const mockSocket = { uid: adminUid };
			const result = await socketPlugins.announcementViewers.getViewers(mockSocket, { pid: testPostPid });

			assert.strictEqual(result.count, 2);
		});

		it('should not include staff in viewers list', async () => {
			// Try to log views (will be rejected for staff)
			await socketPlugins.announcementViewers.logView({ uid: adminUid }, { pid: testPostPid });
			await socketPlugins.announcementViewers.logView({ uid: studentUid }, { pid: testPostPid });

			const mockSocket = { uid: adminUid };
			const result = await socketPlugins.announcementViewers.getViewers(mockSocket, { pid: testPostPid });

			// Only student should be in the list
			assert.strictEqual(result.count, 1);
			assert.strictEqual(result.viewers[0].uid, studentUid);
		});

		it('should handle deleted users in viewers list', async () => {
			// First, log a view from a student
			await socketPlugins.announcementViewers.logView({ uid: studentUid }, { pid: testPostPid });

			// Manually add a fake/deleted user ID to the viewers set
			const fakeDeletedUid = 999999;
			await db.sortedSetAdd(`post:${testPostPid}:viewers`, Date.now(), fakeDeletedUid);

			// Now get viewers - should handle the deleted user gracefully
			const mockSocket = { uid: adminUid };
			const result = await socketPlugins.announcementViewers.getViewers(mockSocket, { pid: testPostPid });

			// Should only return the valid student, not the deleted user
			assert.strictEqual(result.count, 1);
			assert.strictEqual(result.viewers[0].uid, studentUid);
			// The deleted user (uid 999999) should be filtered out (return null)
		});
	});

	// ==========================================
	// TEST: getViewerCount socket method
	// ==========================================
	describe('getViewerCount()', () => {
		const socketPlugins = require('../src/socket.io/plugins');

		it('should register getViewerCount socket method', () => {
			assert.strictEqual(typeof socketPlugins.announcementViewers.getViewerCount, 'function');
		});

		it('should reject unauthenticated users', async () => {
			const mockSocket = { uid: 0 };
			try {
				await socketPlugins.announcementViewers.getViewerCount(mockSocket, { pid: testPostPid });
				assert.fail('Should have thrown error');
			} catch (err) {
				assert.strictEqual(err.message, '[[error:not-logged-in]]');
			}
		});

		it('should reject requests without pid', async () => {
			const mockSocket = { uid: adminUid };
			try {
				await socketPlugins.announcementViewers.getViewerCount(mockSocket, {});
				assert.fail('Should have thrown error');
			} catch (err) {
				assert.strictEqual(err.message, '[[error:invalid-data]]');
			}
		});

		it('should return count of 0 for new post', async () => {
			const mockSocket = { uid: adminUid };
			const result = await socketPlugins.announcementViewers.getViewerCount(mockSocket, { pid: testPostPid });

			assert.strictEqual(result.count, 0);
		});

		it('should return correct count after views', async () => {
			await socketPlugins.announcementViewers.logView({ uid: studentUid }, { pid: testPostPid });
			await socketPlugins.announcementViewers.logView({ uid: student2Uid }, { pid: testPostPid });

			const mockSocket = { uid: adminUid };
			const result = await socketPlugins.announcementViewers.getViewerCount(mockSocket, { pid: testPostPid });

			assert.strictEqual(result.count, 2);
		});
	});

	// ==========================================
	// TEST: appendViewerPrivileges hook
	// ==========================================
	describe('appendViewerPrivileges()', () => {
		it('should return data unchanged if topic is missing', async () => {
			const data = { uid: adminUid };
			const result = await announcementViewers.appendViewerPrivileges(data);
			assert.strictEqual(result.topic, undefined);
		});

		it('should set canViewViewers to true for admin', async () => {
			const data = {
				topic: { tid: testTopicTid },
				uid: adminUid,
			};

			const result = await announcementViewers.appendViewerPrivileges(data);
			assert.strictEqual(result.topic.canViewViewers, true);
		});

		it('should set canViewViewers to true for global moderator', async () => {
			const data = {
				topic: { tid: testTopicTid },
				uid: globalModUid,
			};

			const result = await announcementViewers.appendViewerPrivileges(data);
			assert.strictEqual(result.topic.canViewViewers, true);
		});

		it('should set canViewViewers to true for TA', async () => {
			const data = {
				topic: { tid: testTopicTid },
				uid: taUid,
			};

			const result = await announcementViewers.appendViewerPrivileges(data);
			assert.strictEqual(result.topic.canViewViewers, true);
		});

		it('should set canViewViewers to false for student', async () => {
			const data = {
				topic: { tid: testTopicTid },
				uid: studentUid,
			};

			const result = await announcementViewers.appendViewerPrivileges(data);
			assert.strictEqual(result.topic.canViewViewers, false);
		});

		it('should set canViewViewers to false for unauthenticated user', async () => {
			const data = {
				topic: { tid: testTopicTid },
				uid: 0,
			};

			const result = await announcementViewers.appendViewerPrivileges(data);
			assert.strictEqual(result.topic.canViewViewers, false);
		});

		it('should set canViewViewers to false when uid is undefined', async () => {
			const data = {
				topic: { tid: testTopicTid },
			};

			const result = await announcementViewers.appendViewerPrivileges(data);
			assert.strictEqual(result.topic.canViewViewers, false);
		});
	});

	// ==========================================
	// TEST: Edge cases
	// ==========================================
	describe('Edge cases', () => {
		const socketPlugins = require('../src/socket.io/plugins');

		it('should handle pid as undefined in logView', async () => {
			const mockSocket = { uid: studentUid };
			try {
				await socketPlugins.announcementViewers.logView(mockSocket, { pid: undefined });
				assert.fail('Should have thrown error');
			} catch (err) {
				assert.strictEqual(err.message, '[[error:invalid-data]]');
			}
		});

		it('should handle pid as null in getViewers', async () => {
			const mockSocket = { uid: adminUid };
			try {
				await socketPlugins.announcementViewers.getViewers(mockSocket, { pid: null });
				assert.fail('Should have thrown error');
			} catch (err) {
				assert.strictEqual(err.message, '[[error:invalid-data]]');
			}
		});

		it('should handle pid as 0 in getViewerCount', async () => {
			const mockSocket = { uid: adminUid };
			try {
				await socketPlugins.announcementViewers.getViewerCount(mockSocket, { pid: 0 });
				assert.fail('Should have thrown error');
			} catch (err) {
				// Either invalid-data or the post doesn't exist
				assert.ok(err.message);
			}
		});
	});
});








