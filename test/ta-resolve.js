'use strict';

const assert = require('assert');
const posts = require('../src/posts');
const db = require('./mocks/databasemock');
const topics = require('../src/topics');
const user = require('../src/user');
const groups = require('../src/groups');
const categories = require('../src/categories');

const taResolve = require('../plugins/ta-resolve/library');

describe('TA Resolve Plugin', () => {
	let adminUid;
	let globalModUid;
	let taUid;
	let studentUid;
	let categoryId;
	let category4Id; // For category 4 specific tests

	before(async () => {
		// Create admin
		adminUid = await user.create({ username: 'admin_resolve', password: '123456' });
		await groups.join('administrators', adminUid);

		// Create global moderator
		globalModUid = await user.create({ username: 'globalmod_resolve', password: '123456' });
		await groups.join('Global Moderators', globalModUid);

		// Create TA user
		taUid = await user.create({ username: 'ta_resolve', password: '123456' });
		await groups.create({ name: 'Teaching Assistants' });
		await groups.join('Teaching Assistants', taUid);

		// Create student (regular user)
		studentUid = await user.create({ username: 'student_resolve', password: '123456' });

		// Create test category
		const category = await categories.create({
			name: 'Test Category',
			description: 'Test category',
		});
		categoryId = category.cid;

		// Create category with cid=4 for sorting tests
		// Note: You may need to create multiple categories to get cid=4
		const cat4 = await categories.create({
			name: 'Comments and Feedback',
			description: 'Category 4 for resolve sorting',
		});
		category4Id = cat4.cid;

		// Initialize the plugin
		await taResolve.init({});
	});

	// ==========================================
	// TEST: setTopicDefault
	// ==========================================
	describe('setTopicDefault()', () => {
		it('should set isResolved to 0 for new topics', async () => {
			const data = { topic: { tid: 1, title: 'Test' } };
			const result = await taResolve.setTopicDefault(data);
			assert.strictEqual(result.topic.isResolved, 0);
		});

		it('should return the data object', async () => {
			const data = { topic: { tid: 2 } };
			const result = await taResolve.setTopicDefault(data);
			assert.strictEqual(result, data);
		});

		it('should not modify other topic properties', async () => {
			const data = { topic: { tid: 3, title: 'My Title', content: 'My Content' } };
			const result = await taResolve.setTopicDefault(data);
			assert.strictEqual(result.topic.title, 'My Title');
			assert.strictEqual(result.topic.content, 'My Content');
		});
	});

	// ==========================================
	// TEST: init (socket toggle)
	// ==========================================
	describe('init() - Socket Toggle', () => {
		const socketPlugins = require('../src/socket.io/plugins');
		let testTid;

		beforeEach(async () => {
			// Create a fresh topic for each test
			const result = await topics.post({
				uid: adminUid,
				cid: categoryId,
				title: 'Toggle Test Topic ' + Date.now(),
				content: 'Test content',
			});
			testTid = result.topicData.tid;
		});

		it('should register taResolve.toggle socket method', () => {
			assert.ok(socketPlugins.taResolve);
			assert.ok(typeof socketPlugins.taResolve.toggle === 'function');
		});

		it('should reject unauthenticated users', async () => {
			const mockSocket = { uid: 0 };
			try {
				await socketPlugins.taResolve.toggle(mockSocket, { tid: testTid });
				assert.fail('Should have thrown error');
			} catch (err) {
				assert.strictEqual(err.message, '[[error:not-logged-in]]');
			}
		});

		it('should reject regular students', async () => {
			const mockSocket = { uid: studentUid };
			try {
				await socketPlugins.taResolve.toggle(mockSocket, { tid: testTid });
				assert.fail('Should have thrown error');
			} catch (err) {
				assert.strictEqual(err.message, '[[error:no-privileges]]');
			}
		});

		it('should allow admin to toggle', async () => {
			const mockSocket = { uid: adminUid };
			const result = await socketPlugins.taResolve.toggle(mockSocket, { tid: testTid });
			assert.strictEqual(result.isResolved, 1);
		});

		it('should allow global moderator to toggle', async () => {
			const mockSocket = { uid: globalModUid };
			const result = await socketPlugins.taResolve.toggle(mockSocket, { tid: testTid });
			assert.strictEqual(result.isResolved, 1);
		});

		it('should allow TA to toggle', async () => {
			const mockSocket = { uid: taUid };
			const result = await socketPlugins.taResolve.toggle(mockSocket, { tid: testTid });
			assert.strictEqual(result.isResolved, 1);
		});

		it('should toggle from resolved to unresolved', async () => {
			const mockSocket = { uid: adminUid };
            
			// First toggle: 0 -> 1
			let result = await socketPlugins.taResolve.toggle(mockSocket, { tid: testTid });
			assert.strictEqual(result.isResolved, 1);
            
			// Second toggle: 1 -> 0
			result = await socketPlugins.taResolve.toggle(mockSocket, { tid: testTid });
			assert.strictEqual(result.isResolved, 0);
		});

		it('should update sorted sets when resolving', async () => {
			const mockSocket = { uid: adminUid };
            
			await socketPlugins.taResolve.toggle(mockSocket, { tid: testTid });
            
			const isInResolved = await db.isSortedSetMember('topics:resolved', testTid);
			assert.strictEqual(isInResolved, true);
		});

		it('should update sorted sets when unresolving', async () => {
			const mockSocket = { uid: adminUid };
            
			// Resolve first
			await socketPlugins.taResolve.toggle(mockSocket, { tid: testTid });
			// Then unresolve
			await socketPlugins.taResolve.toggle(mockSocket, { tid: testTid });
            
			const isInUnresolved = await db.isSortedSetMember('topics:unresolved', testTid);
			assert.strictEqual(isInUnresolved, true);
		});
	});

	// ==========================================
	// TEST: checkIfResolved
	// ==========================================
	describe('checkIfResolved()', () => {
		let resolvedTopicTid;

		beforeEach(async () => {
			// Create a resolved topic for each test
			const result = await topics.post({
				uid: adminUid,
				cid: categoryId,
				title: 'Resolved Topic Test ' + Date.now(),
				content: 'Test content',
			});
			resolvedTopicTid = result.topicData.tid;
			await topics.setTopicField(resolvedTopicTid, 'isResolved', 1);
		});

		it('should unresolve topic when student replies to resolved topic', async () => {
			const data = {
				post: { tid: resolvedTopicTid, uid: studentUid },
			};

			await taResolve.checkIfResolved(data);

			const isResolved = await topics.getTopicField(resolvedTopicTid, 'isResolved');
			assert.strictEqual(parseInt(isResolved, 10), 0);
		});

		it('should keep topic resolved when admin replies', async () => {
			const data = {
				post: { tid: resolvedTopicTid, uid: adminUid },
			};

			await taResolve.checkIfResolved(data);

			const isResolved = await topics.getTopicField(resolvedTopicTid, 'isResolved');
			assert.strictEqual(parseInt(isResolved, 10), 1);
		});

		it('should keep topic resolved when global mod replies', async () => {
			const data = {
				post: { tid: resolvedTopicTid, uid: globalModUid },
			};

			await taResolve.checkIfResolved(data);

			const isResolved = await topics.getTopicField(resolvedTopicTid, 'isResolved');
			assert.strictEqual(parseInt(isResolved, 10), 1);
		});

		it('should keep topic resolved when TA replies', async () => {
			const data = {
				post: { tid: resolvedTopicTid, uid: taUid },
			};

			await taResolve.checkIfResolved(data);

			const isResolved = await topics.getTopicField(resolvedTopicTid, 'isResolved');
			assert.strictEqual(parseInt(isResolved, 10), 1);
		});

		it('should not change unresolved topic when student replies', async () => {
			// Create an unresolved topic
			const result = await topics.post({
				uid: adminUid,
				cid: categoryId,
				title: 'Unresolved Topic ' + Date.now(),
				content: 'Test content',
			});
			const unresolvedTid = result.topicData.tid;
			await topics.setTopicField(unresolvedTid, 'isResolved', 0);

			const data = {
				post: { tid: unresolvedTid, uid: studentUid },
			};

			await taResolve.checkIfResolved(data);

			const isResolved = await topics.getTopicField(unresolvedTid, 'isResolved');
			assert.strictEqual(parseInt(isResolved, 10), 0);
		});

		it('should return the data object', async () => {
			const data = {
				post: { tid: resolvedTopicTid, uid: studentUid },
			};

			const result = await taResolve.checkIfResolved(data);
			assert.strictEqual(result, data);
		});
	});


	// Add this inside your main describe block, after the existing tests:

	// ==========================================
	// TEST: supportAnswer socket method
	// ==========================================
	describe('supportAnswer socket method', () => {
		const socketPlugins = require('../src/socket.io/plugins');
		let testPostPid;
		let testTopicTid;

		beforeEach(async () => {
			// Create a topic with a reply post
			const topicResult = await topics.post({
				uid: studentUid,
				cid: categoryId,
				title: 'Support Answer Test ' + Date.now(),
				content: 'Original post content',
			});
			testTopicTid = topicResult.topicData.tid;

			// Create a reply post to test support on
			const replyResult = await topics.reply({
				uid: studentUid,
				tid: testTopicTid,
				content: 'Student answer to support ' + Date.now(),
			});
			testPostPid = replyResult.pid;
		});

		it('should register supportAnswer socket method', () => {
			assert.ok(socketPlugins.taResolve.supportAnswer);
			assert.strictEqual(typeof socketPlugins.taResolve.supportAnswer, 'function');
		});

		it('should reject unauthenticated users', async () => {
			const mockSocket = { uid: 0 };
			try {
				await socketPlugins.taResolve.supportAnswer(mockSocket, { pid: testPostPid });
				assert.fail('Should have thrown error');
			} catch (err) {
				assert.strictEqual(err.message, '[[error:not-logged-in]]');
			}
		});

		it('should reject non-admin users', async () => {
			const mockSocket = { uid: studentUid };
			try {
				await socketPlugins.taResolve.supportAnswer(mockSocket, { pid: testPostPid });
				assert.fail('Should have thrown error');
			} catch (err) {
				assert.strictEqual(err.message, '[[error:no-privileges]]');
			}
		});

		it('should reject TA users (admin only)', async () => {
			const mockSocket = { uid: taUid };
			try {
				await socketPlugins.taResolve.supportAnswer(mockSocket, { pid: testPostPid });
				assert.fail('Should have thrown error');
			} catch (err) {
				assert.strictEqual(err.message, '[[error:no-privileges]]');
			}
		});

		it('should reject requests without data', async () => {
			const mockSocket = { uid: adminUid };
			try {
				await socketPlugins.taResolve.supportAnswer(mockSocket, null);
				assert.fail('Should have thrown error');
			} catch (err) {
				assert.strictEqual(err.message, '[[error:invalid-data]]');
			}
		});

		it('should reject requests without pid', async () => {
			const mockSocket = { uid: adminUid };
			try {
				await socketPlugins.taResolve.supportAnswer(mockSocket, {});
				assert.fail('Should have thrown error');
			} catch (err) {
				assert.strictEqual(err.message, '[[error:invalid-data]]');
			}
		});

		it('should allow admin to support an answer', async () => {
			const mockSocket = { uid: adminUid };
			const result = await socketPlugins.taResolve.supportAnswer(mockSocket, { pid: testPostPid });
			
			assert.strictEqual(result.supportedByInstructor, 1);
		});

		it('should persist supportedByInstructor field in database', async () => {
			const mockSocket = { uid: adminUid };
			await socketPlugins.taResolve.supportAnswer(mockSocket, { pid: testPostPid });
			
			const fieldValue = await posts.getPostField(testPostPid, 'supportedByInstructor');
			assert.strictEqual(parseInt(fieldValue, 10), 1);
		});

		it('should remove support when remove flag is true', async () => {
			const mockSocket = { uid: adminUid };
			
			// First support the answer
			await socketPlugins.taResolve.supportAnswer(mockSocket, { pid: testPostPid });
			
			// Then remove support
			const result = await socketPlugins.taResolve.supportAnswer(mockSocket, { 
				pid: testPostPid, 
				remove: true, 
			});
			
			assert.strictEqual(result.supportedByInstructor, 0);
		});

		it('should persist removal in database', async () => {
			const mockSocket = { uid: adminUid };
			
			// Support then remove
			await socketPlugins.taResolve.supportAnswer(mockSocket, { pid: testPostPid });
			await socketPlugins.taResolve.supportAnswer(mockSocket, { pid: testPostPid, remove: true });
			
			const fieldValue = await posts.getPostField(testPostPid, 'supportedByInstructor');
			assert.strictEqual(parseInt(fieldValue, 10), 0);
		});
	});

	// ==========================================
	// TEST: removeSupport socket method
	// ==========================================
	describe('removeSupport socket method', () => {
		const socketPlugins = require('../src/socket.io/plugins');
		let testPostPid;

		beforeEach(async () => {
			const topicResult = await topics.post({
				uid: studentUid,
				cid: categoryId,
				title: 'Remove Support Test ' + Date.now(),
				content: 'Original post',
			});

			const replyResult = await topics.reply({
				uid: studentUid,
				tid: topicResult.topicData.tid,
				content: 'Reply to remove support from ' + Date.now(),
			});
			testPostPid = replyResult.pid;

			// Pre-support the answer
			await socketPlugins.taResolve.supportAnswer({ uid: adminUid }, { pid: testPostPid });
		});

		it('should register removeSupport socket method', () => {
			assert.ok(socketPlugins.taResolve.removeSupport);
			assert.strictEqual(typeof socketPlugins.taResolve.removeSupport, 'function');
		});

		it('should remove support from a supported answer', async () => {
			const mockSocket = { uid: adminUid };
			const result = await socketPlugins.taResolve.removeSupport(mockSocket, { pid: testPostPid });
			
			assert.strictEqual(result.supportedByInstructor, 0);
		});

		it('should call supportAnswer with remove: true', async () => {
			const mockSocket = { uid: adminUid };
			await socketPlugins.taResolve.removeSupport(mockSocket, { pid: testPostPid });
			
			const fieldValue = await posts.getPostField(testPostPid, 'supportedByInstructor');
			assert.strictEqual(parseInt(fieldValue, 10), 0);
		});
	});

	// ==========================================
	// TEST: addSupportAnswerTool hook
	// ==========================================
	describe('addSupportAnswerTool()', () => {
		let testPostPid;

		beforeEach(async () => {
			const topicResult = await topics.post({
				uid: studentUid,
				cid: categoryId,
				title: 'Add Tool Test ' + Date.now(),
				content: 'Original post',
			});

			const replyResult = await topics.reply({
				uid: studentUid,
				tid: topicResult.topicData.tid,
				content: 'Reply for tool test ' + Date.now(),
			});
			testPostPid = replyResult.pid;
		});

		it('should not add tool for unauthenticated users', async () => {
			const data = {
				uid: 0,
				pid: testPostPid,
				tools: [],
			};

			const result = await taResolve.addSupportAnswerTool(data);
			assert.strictEqual(result.tools.length, 0);
		});

		it('should not add tool for non-admin users', async () => {
			const data = {
				uid: studentUid,
				pid: testPostPid,
				tools: [],
			};

			const result = await taResolve.addSupportAnswerTool(data);
			assert.strictEqual(result.tools.length, 0);
		});

		it('should add "Support Answer" tool for admin on unsupported post', async () => {
			const data = {
				uid: adminUid,
				pid: testPostPid,
				tools: [],
			};

			const result = await taResolve.addSupportAnswerTool(data);
			
			assert.strictEqual(result.tools.length, 1);
			assert.strictEqual(result.tools[0].action, 'post/support-answer');
			assert.strictEqual(result.tools[0].html, 'Support Answer');
		});

		it('should add "Remove support" tool for admin on supported post', async () => {
			// First support the post
			await posts.setPostField(testPostPid, 'supportedByInstructor', 1);

			const data = {
				uid: adminUid,
				pid: testPostPid,
				tools: [],
			};

			const result = await taResolve.addSupportAnswerTool(data);
			
			assert.strictEqual(result.tools.length, 1);
			assert.strictEqual(result.tools[0].action, 'post/remove-support');
			assert.strictEqual(result.tools[0].html, 'Remove support');
		});

		it('should include correct icon for support action', async () => {
			const data = {
				uid: adminUid,
				pid: testPostPid,
				tools: [],
			};

			const result = await taResolve.addSupportAnswerTool(data);
			assert.strictEqual(result.tools[0].icon, 'fa-check-circle');
		});

		it('should include correct icon for remove support action', async () => {
			await posts.setPostField(testPostPid, 'supportedByInstructor', 1);

			const data = {
				uid: adminUid,
				pid: testPostPid,
				tools: [],
			};

			const result = await taResolve.addSupportAnswerTool(data);
			assert.strictEqual(result.tools[0].icon, 'fa-times-circle');
		});
	});

	// ==========================================
	// TEST: normalizeSupportedByInstructor hook
	// ==========================================
	describe('normalizeSupportedByInstructor()', () => {
		let testPostPid;

		beforeEach(async () => {
			const topicResult = await topics.post({
				uid: studentUid,
				cid: categoryId,
				title: 'Normalize Test ' + Date.now(),
				content: 'Original post',
			});

			const replyResult = await topics.reply({
				uid: studentUid,
				tid: topicResult.topicData.tid,
				content: 'Reply for normalize test ' + Date.now(),
			});
			testPostPid = replyResult.pid;
		});

		it('should return data unchanged if posts is null', async () => {
			const data = { posts: null };
			const result = await taResolve.normalizeSupportedByInstructor(data);
			assert.strictEqual(result.posts, null);
		});

		it('should return data unchanged if posts is undefined', async () => {
			const data = {};
			const result = await taResolve.normalizeSupportedByInstructor(data);
			assert.strictEqual(result.posts, undefined);
		});

		it('should return data unchanged if posts is not an array', async () => {
			const data = { posts: 'not an array' };
			const result = await taResolve.normalizeSupportedByInstructor(data);
			assert.strictEqual(result.posts, 'not an array');
		});

		it('should convert supportedByInstructor 1 to true', async () => {
			const data = { 
				posts: [{ 
					pid: testPostPid, 
					supportedByInstructor: 1,
					supportedByInstructorUid: 99, // Dummy UID to satisfy hasOwnProperty
					supportedByInstructorTime: 12345, // Dummy Time to satisfy hasOwnProperty
				}],
			};

			const result = await taResolve.normalizeSupportedByInstructor(data);
			assert.strictEqual(result.posts[0].supportedByInstructor, true);
		});

		it('should convert supportedByInstructor 0 to false', async () => {
			const data = {
				posts: [{ 
					pid: testPostPid, 
					supportedByInstructor: 0,
					supportedByInstructorUid: 99,
					supportedByInstructorTime: 12345,
				}],
			};

			const result = await taResolve.normalizeSupportedByInstructor(data);
			assert.strictEqual(result.posts[0].supportedByInstructor, false);
		});

		it('should convert supportedByInstructor "1" string to true', async () => {
			const data = {
				posts: [{ 
					pid: testPostPid, 
					supportedByInstructor: '1',
					supportedByInstructorUid: 99,
					supportedByInstructorTime: 12345,
				}],
			};

			const result = await taResolve.normalizeSupportedByInstructor(data);
			assert.strictEqual(result.posts[0].supportedByInstructor, true);
		});

		it('should convert undefined supportedByInstructor to false', async () => {
			const data = {
				posts: [{ 
					pid: testPostPid, 
					supportedByInstructor: undefined,
					supportedByInstructorUid: 99,
					supportedByInstructorTime: 12345,
				}],
			};
			
			const result = await taResolve.normalizeSupportedByInstructor(data);
			assert.strictEqual(result.posts[0].supportedByInstructor, false);
		});

		it('should convert null supportedByInstructor to false', async () => {
			const data = {
				posts: [{ 
					pid: testPostPid, 
					supportedByInstructor: null,
					supportedByInstructorUid: 99,
					supportedByInstructorTime: 12345,
				}],
			};
			
			const result = await taResolve.normalizeSupportedByInstructor(data);
			assert.strictEqual(result.posts[0].supportedByInstructor, false);
		});

		it('should fetch missing supportedByInstructor from database', async () => {
			// Set the field in database
			await posts.setPostField(testPostPid, 'supportedByInstructor', 1);

			// Pass post without the field
			const data = {
				posts: [{ pid: testPostPid }],
			};

			const result = await taResolve.normalizeSupportedByInstructor(data);
			assert.strictEqual(result.posts[0].supportedByInstructor, true);
		});

		it('should handle multiple posts', async () => {
			const data = {
				posts: [
					{ pid: 1, supportedByInstructor: 1, supportedByInstructorUid: 99, supportedByInstructorTime: 12345 },
					{ pid: 2, supportedByInstructor: 0, supportedByInstructorUid: 99, supportedByInstructorTime: 12345 },
					{ pid: 3, supportedByInstructor: null, supportedByInstructorUid: 99, supportedByInstructorTime: 12345 },
				],
			};
			
			const result = await taResolve.normalizeSupportedByInstructor(data);
			
			assert.strictEqual(result.posts[0].supportedByInstructor, true);
			assert.strictEqual(result.posts[1].supportedByInstructor, false);
			assert.strictEqual(result.posts[2].supportedByInstructor, false);
		});

		it('should handle null post in array', async () => {
			const data = {
				posts: [
					null, 
					{ 
						pid: testPostPid, supportedByInstructor: 1, 
						supportedByInstructorUid: 99, supportedByInstructorTime: 12345 ,
					},
				],
			};
			
			const result = await taResolve.normalizeSupportedByInstructor(data);
			assert.strictEqual(result.posts[0], null);
		});

	});

	describe('undefined branch coverage', () => {
		const socketPlugins = require('../src/socket.io/plugins');

		it('should handle uid explicitly set to undefined in appendTAPrivileges', async () => {
			const topicResult = await topics.post({
				uid: adminUid,
				cid: categoryId,
				title: 'Undefined UID Test ' + Date.now(),
				content: 'Test',
			});

			const data = {
				topic: { tid: topicResult.topicData.tid, posts: [] },
				uid: undefined, // explicitly undefined
			};

			const result = await taResolve.appendTAPrivileges(data);
			assert.strictEqual(result.topic.isTA, false);
		});

		it('should handle data.pid explicitly set to undefined in supportAnswer', async () => {
			const mockSocket = { uid: adminUid };
			try {
				await socketPlugins.taResolve.supportAnswer(mockSocket, { pid: undefined });
				assert.fail('Should have thrown');
			} catch (err) {
				assert.strictEqual(err.message, '[[error:invalid-data]]');
			}
		});
	});

	// ==========================================
	// TEST: normalizeSupportedByInstructorSummary hook
	// ==========================================
	describe('normalizeSupportedByInstructorSummary()', () => {
		it('should return data unchanged if posts is undefined', async () => {
			const data = {};
			const result = await taResolve.normalizeSupportedByInstructorSummary(data);
			assert.strictEqual(result.posts, undefined);
		});

		it('should return data unchanged if posts is not an array', async () => {
			const data = { posts: 'not an array' };
			const result = await taResolve.normalizeSupportedByInstructorSummary(data);
			assert.strictEqual(result.posts, 'not an array');
		});

		it('should convert supportedByInstructor 1 to true', async () => {
			const data = {
				posts: [{ pid: 1, supportedByInstructor: 1 }],
			};

			const result = await taResolve.normalizeSupportedByInstructorSummary(data);
			assert.strictEqual(result.posts[0].supportedByInstructor, true);
		});

		it('should convert supportedByInstructor 0 to false', async () => {
			const data = {
				posts: [{ pid: 1, supportedByInstructor: 0 }],
			};

			const result = await taResolve.normalizeSupportedByInstructorSummary(data);
			assert.strictEqual(result.posts[0].supportedByInstructor, false);
		});

		it('should handle null post in array', async () => {
			const data = {
				posts: [null, { pid: 1, supportedByInstructor: 1 }],
			};

			const result = await taResolve.normalizeSupportedByInstructorSummary(data);
			assert.strictEqual(result.posts[0], null);
			assert.strictEqual(result.posts[1].supportedByInstructor, true);
		});

		it('should handle multiple posts', async () => {
			const data = {
				posts: [
					{ pid: 1, supportedByInstructor: 1 },
					{ pid: 2, supportedByInstructor: 0 },
				],
			};

			const result = await taResolve.normalizeSupportedByInstructorSummary(data);
			
			assert.strictEqual(result.posts[0].supportedByInstructor, true);
			assert.strictEqual(result.posts[1].supportedByInstructor, false);
		});
	});

	// ==========================================
	// TEST: appendResolveStatusAndSort
	// ==========================================
	describe('appendResolveStatusAndSort()', () => {
		it('should return data unchanged if topics is empty', async () => {
			const data = { topics: [], uid: adminUid };
			const result = await taResolve.appendResolveStatusAndSort(data);
			assert.deepStrictEqual(result.topics, []);
		});

		it('should return data unchanged if topics is null', async () => {
			const data = { topics: null, uid: adminUid };
			const result = await taResolve.appendResolveStatusAndSort(data);
			assert.strictEqual(result.topics, null);
		});

		it('should return data unchanged if topics is undefined', async () => {
			const data = { uid: adminUid };
			const result = await taResolve.appendResolveStatusAndSort(data);
			assert.strictEqual(result.topics, undefined);
		});

		it('should append isResolved boolean to each topic', async () => {
			const topicResult = await topics.post({
				uid: adminUid,
				cid: categoryId,
				title: 'Status Test ' + Date.now(),
				content: 'Test content',
			});

			const data = {
				topics: [{ tid: topicResult.topicData.tid, cid: categoryId }],
				uid: adminUid,
			};

			const result = await taResolve.appendResolveStatusAndSort(data);
			assert.strictEqual(typeof result.topics[0].isResolved, 'boolean');
		});

		it('should set isResolved to false for unresolved topics', async () => {
			const topicResult = await topics.post({
				uid: adminUid,
				cid: categoryId,
				title: 'Unresolved Status Test ' + Date.now(),
				content: 'Test content',
			});
			await topics.setTopicField(topicResult.topicData.tid, 'isResolved', 0);

			const data = {
				topics: [{ tid: topicResult.topicData.tid, cid: categoryId }],
				uid: adminUid,
			};

			const result = await taResolve.appendResolveStatusAndSort(data);
			assert.strictEqual(result.topics[0].isResolved, false);
		});

		it('should set isResolved to true for resolved topics', async () => {
			const topicResult = await topics.post({
				uid: adminUid,
				cid: categoryId,
				title: 'Resolved Status Test ' + Date.now(),
				content: 'Test content',
			});
			await topics.setTopicField(topicResult.topicData.tid, 'isResolved', 1);

			const data = {
				topics: [{ tid: topicResult.topicData.tid, cid: categoryId }],
				uid: adminUid,
			};

			const result = await taResolve.appendResolveStatusAndSort(data);
			assert.strictEqual(result.topics[0].isResolved, true);
		});

		it('should sort unresolved before resolved for admin in category 4', async () => {
			// Create resolved topic
			const resolved = await topics.post({
				uid: adminUid,
				cid: category4Id,
				title: 'Resolved First ' + Date.now(),
				content: 'Test',
			});
			await topics.setTopicField(resolved.topicData.tid, 'isResolved', 1);

			// Create unresolved topic
			const unresolved = await topics.post({
				uid: adminUid,
				cid: category4Id,
				title: 'Unresolved Second ' + Date.now(),
				content: 'Test',
			});
			await topics.setTopicField(unresolved.topicData.tid, 'isResolved', 0);

			// Pass resolved first in array
			const data = {
				topics: [
					{ tid: resolved.topicData.tid, cid: 4 },
					{ tid: unresolved.topicData.tid, cid: 4 },
				],
				uid: adminUid,
			};

			const result = await taResolve.appendResolveStatusAndSort(data);
            
			// Unresolved should be first after sorting
			assert.strictEqual(result.topics[0].isResolved, false);
			assert.strictEqual(result.topics[1].isResolved, true);
		});

		it('should sort unresolved before resolved for TA in category 4', async () => {
			const resolved = await topics.post({
				uid: adminUid,
				cid: category4Id,
				title: 'TA Sort Resolved ' + Date.now(),
				content: 'Test',
			});
			await topics.setTopicField(resolved.topicData.tid, 'isResolved', 1);

			const unresolved = await topics.post({
				uid: adminUid,
				cid: category4Id,
				title: 'TA Sort Unresolved ' + Date.now(),
				content: 'Test',
			});
			await topics.setTopicField(unresolved.topicData.tid, 'isResolved', 0);

			const data = {
				topics: [
					{ tid: resolved.topicData.tid, cid: 4 },
					{ tid: unresolved.topicData.tid, cid: 4 },
				],
				uid: taUid,
			};

			const result = await taResolve.appendResolveStatusAndSort(data);
			assert.strictEqual(result.topics[0].isResolved, false);
		});

		it('should NOT sort for students in category 4', async () => {
			const resolved = await topics.post({
				uid: adminUid,
				cid: category4Id,
				title: 'Student No Sort Resolved ' + Date.now(),
				content: 'Test',
			});
			await topics.setTopicField(resolved.topicData.tid, 'isResolved', 1);

			const unresolved = await topics.post({
				uid: adminUid,
				cid: category4Id,
				title: 'Student No Sort Unresolved ' + Date.now(),
				content: 'Test',
			});
			await topics.setTopicField(unresolved.topicData.tid, 'isResolved', 0);

			const data = {
				topics: [
					{ tid: resolved.topicData.tid, cid: 4 },
					{ tid: unresolved.topicData.tid, cid: 4 },
				],
				uid: studentUid,
			};

			const result = await taResolve.appendResolveStatusAndSort(data);
            
			// Order should remain unchanged (resolved first)
			assert.strictEqual(result.topics[0].tid, resolved.topicData.tid);
		});

		it('should NOT sort for admin in non-category-4', async () => {
			const resolved = await topics.post({
				uid: adminUid,
				cid: categoryId, // Not category 4
				title: 'Non-Cat4 Resolved ' + Date.now(),
				content: 'Test',
			});
			await topics.setTopicField(resolved.topicData.tid, 'isResolved', 1);

			const unresolved = await topics.post({
				uid: adminUid,
				cid: categoryId,
				title: 'Non-Cat4 Unresolved ' + Date.now(),
				content: 'Test',
			});
			await topics.setTopicField(unresolved.topicData.tid, 'isResolved', 0);

			const data = {
				topics: [
					{ tid: resolved.topicData.tid, cid: categoryId },
					{ tid: unresolved.topicData.tid, cid: categoryId },
				],
				uid: adminUid,
			};

			const result = await taResolve.appendResolveStatusAndSort(data);
            
			// Order should remain unchanged
			assert.strictEqual(result.topics[0].tid, resolved.topicData.tid);
		});
	});

	// ==========================================
	// TEST: appendTAPrivileges
	// ==========================================
	describe('appendTAPrivileges()', () => {
		let testTopicTid;

		beforeEach(async () => {
			const result = await topics.post({
				uid: adminUid,
				cid: categoryId,
				title: 'TA Privileges Test ' + Date.now(),
				content: 'Test content',
			});
			testTopicTid = result.topicData.tid;
		});

		it('should return data unchanged if topic is missing', async () => {
			const data = { uid: adminUid };
			const result = await taResolve.appendTAPrivileges(data);
			assert.strictEqual(result.topic, undefined);
		});

		it('should set isTA to true for admin', async () => {
			const data = {
				topic: { tid: testTopicTid, posts: [] },
				uid: adminUid,
			};

			const result = await taResolve.appendTAPrivileges(data);
			assert.strictEqual(result.topic.isTA, true);
		});

		it('should set isTA to true for global moderator', async () => {
			const data = {
				topic: { tid: testTopicTid, posts: [] },
				uid: globalModUid,
			};

			const result = await taResolve.appendTAPrivileges(data);
			assert.strictEqual(result.topic.isTA, true);
		});

		it('should set isTA to true for TA group member', async () => {
			const data = {
				topic: { tid: testTopicTid, posts: [] },
				uid: taUid,
			};

			const result = await taResolve.appendTAPrivileges(data);
			assert.strictEqual(result.topic.isTA, true);
		});

		it('should set isTA to false for regular student', async () => {
			const data = {
				topic: { tid: testTopicTid, posts: [] },
				uid: studentUid,
			};

			const result = await taResolve.appendTAPrivileges(data);
			assert.strictEqual(result.topic.isTA, false);
		});

		it('should set isTA to false for unauthenticated user', async () => {
			const data = {
				topic: { tid: testTopicTid, posts: [] },
				uid: 0,
			};

			const result = await taResolve.appendTAPrivileges(data);
			assert.strictEqual(result.topic.isTA, false);
		});

		it('should set isTA to false when uid is undefined', async () => {
			const data = {
				topic: { tid: testTopicTid, posts: [] },
			};

			const result = await taResolve.appendTAPrivileges(data);
			assert.strictEqual(result.topic.isTA, false);
		});

		it('should append isResolved status to topic', async () => {
			await topics.setTopicField(testTopicTid, 'isResolved', 1);

			const data = {
				topic: { tid: testTopicTid, posts: [] },
				uid: adminUid,
			};

			const result = await taResolve.appendTAPrivileges(data);
			assert.strictEqual(result.topic.isResolved, true);
		});

		it('should set isTA on all posts', async () => {
			const data = {
				topic: {
					tid: testTopicTid,
					posts: [{ pid: 1 }, { pid: 2 }, { pid: 3 }],
				},
				uid: adminUid,
			};

			const result = await taResolve.appendTAPrivileges(data);
            
			result.topic.posts.forEach((post) => {
				assert.strictEqual(post.isTA, true);
			});
		});

		it('should set isResolved on all posts', async () => {
			await topics.setTopicField(testTopicTid, 'isResolved', 1);

			const data = {
				topic: {
					tid: testTopicTid,
					posts: [{ pid: 1 }, { pid: 2 }],
				},
				uid: adminUid,
			};

			const result = await taResolve.appendTAPrivileges(data);
            
			result.topic.posts.forEach((post) => {
				assert.strictEqual(post.isResolved, true);
			});
		});

		it('should handle topic with no posts array', async () => {
			const data = {
				topic: { tid: testTopicTid },
				uid: adminUid,
			};

			const result = await taResolve.appendTAPrivileges(data);
			assert.strictEqual(result.topic.isTA, true);
		});
	});

	// ==========================================
	// TEST: Error handling in catch blocks
	// ==========================================
	describe('Error handling - catch blocks', () => {
		let originalIsAdministrator;
		let originalIsGlobalModerator;
		let originalIsMember;
		let originalGetTopicsFields;
		let originalGetTopicField;

		// Save original functions before tests
		before(() => {
			originalIsAdministrator = user.isAdministrator;
			originalIsGlobalModerator = user.isGlobalModerator;
			originalIsMember = groups.isMember;
			originalGetTopicsFields = topics.getTopicsFields;
			originalGetTopicField = topics.getTopicField;
		});

		// Restore original functions after each test
		afterEach(() => {
			user.isAdministrator = originalIsAdministrator;
			user.isGlobalModerator = originalIsGlobalModerator;
			groups.isMember = originalIsMember;
			topics.getTopicsFields = originalGetTopicsFields;
			topics.getTopicField = originalGetTopicField;
		});

		it('should handle permission error in appendResolveStatusAndSort inner catch', async () => {
			// Create a valid topic
			const topicResult = await topics.post({
				uid: adminUid,
				cid: categoryId,
				title: 'Permission Error Test ' + Date.now(),
				content: 'Test content',
			});

			// Mock isAdministrator to throw an error
			user.isAdministrator = async () => {
				throw new Error('Mocked permission error');
			};

			// Use cid=4 to trigger the permission check path
			const data = {
				topics: [{ tid: topicResult.topicData.tid, cid: 4 }],
				uid: adminUid,
			};

			const result = await taResolve.appendResolveStatusAndSort(data);
            
			// Should return data without throwing
			assert.ok(result);
			assert.ok(Array.isArray(result.topics));
		});

		it('should handle outer error in appendResolveStatusAndSort', async () => {
			// Mock getTopicsFields to throw an error
			topics.getTopicsFields = async () => {
				throw new Error('Mocked database error');
			};

			const data = {
				topics: [{ tid: 1, cid: categoryId }],
				uid: adminUid,
			};

			const result = await taResolve.appendResolveStatusAndSort(data);
            
			// Should return data without throwing
			assert.ok(result);
		});

		it('should handle permission error in appendTAPrivileges inner catch', async () => {
			const topicResult = await topics.post({
				uid: adminUid,
				cid: categoryId,
				title: 'TA Priv Permission Error ' + Date.now(),
				content: 'Test content',
			});

			// Mock isAdministrator to throw an error
			user.isAdministrator = async () => {
				throw new Error('Mocked permission error');
			};

			const data = {
				topic: { tid: topicResult.topicData.tid, posts: [] },
				uid: adminUid,
			};

			const result = await taResolve.appendTAPrivileges(data);
            
			// Should return data with isTA = false (default when error occurs)
			assert.ok(result);
			assert.strictEqual(result.topic.isTA, false);
		});

		it('should handle outer error in appendTAPrivileges', async () => {
			// Mock getTopicField to throw an error
			topics.getTopicField = async () => {
				throw new Error('Mocked database error');
			};

			const data = {
				topic: { tid: 1, posts: [] },
				uid: adminUid,
			};

			const result = await taResolve.appendTAPrivileges(data);
            
			// Should return data without throwing
			assert.ok(result);
		});
	});

	// ==========================================
	// TEST: Anonymous Posting - Save Logic
	// ==========================================
	describe('Anonymous Posting - Save Logic', () => {
		it('should attach isAnonymous flag to new post', async () => {
			const mockData = {
				data: { isAnonymous: true },
				post: { content: 'Hello' },
			};
			const result = await taResolve.saveAnonymousPost(mockData);
			assert.strictEqual(result.post.isAnonymous, true);
		});

		it('should NOT attach flag if frontend does not send it', async () => {
			const mockData = {
				data: {},
				post: { content: 'Hello' },
			};
			const result = await taResolve.saveAnonymousPost(mockData);
			assert.strictEqual(result.post.isAnonymous, undefined);
		});

		it('should attach isAnonymous flag to new topic', async () => {
			const mockData = {
				data: { isAnonymous: true },
				topic: { title: 'New Question' },
			};
			const result = await taResolve.saveAnonymousTopic(mockData);
			assert.strictEqual(result.topic.isAnonymous, true);
		});
	});

	// ==========================================
	// TEST: Anonymous Posting - Obfuscation Logic
	// ==========================================
	describe('Anonymous Posting - Obfuscation Logic', () => {
		let testTopicTid;
		let authorUid;
		let otherStudentUid;

		beforeEach(async () => {
			// We need a specific author and a different student to test the views
			authorUid = studentUid; 
			otherStudentUid = await user.create({ username: 'other_student', password: 'password123' });

			const result = await topics.post({
				uid: authorUid,
				cid: categoryId,
				title: 'Secret Question',
				content: 'Do not tell anyone I asked this.',
			});
			testTopicTid = result.topicData.tid;
			await topics.setTopicField(testTopicTid, 'isAnonymous', true);
		});

		describe('obfuscateAnonymousPosts()', () => {
			it('should completely scrub author data for a NON-CREATOR student', async () => {
				const mockData = {
					uid: otherStudentUid, // A different student is viewing
					posts: [{
						isAnonymous: true,
						uid: authorUid,
						user: {
							uid: authorUid,
							username: 'student_resolve',
							userslug: 'student-resolve',
							picture: '/path/to/pic.jpg',
						},
					}],
				};

				const result = await taResolve.obfuscateAnonymousPosts(mockData);
				const post = result.posts[0];

				assert.strictEqual(post.uid, 0); 
				assert.strictEqual(post.user.uid, 0);
				assert.strictEqual(post.user.username, 'Anonymous'); // Updated to match Putt's spec
				assert.strictEqual(post.user.userslug, '');
				assert.strictEqual(post.user.picture, '');
			});

			it('should NOT scrub data for the POST CREATOR', async () => {
				const mockData = {
					uid: authorUid, // The author is viewing their own post
					posts: [{
						isAnonymous: true,
						uid: authorUid,
						user: {
							uid: authorUid,
							username: 'student_resolve',
							picture: '/path/to/pic.jpg',
						},
					}],
				};

				const result = await taResolve.obfuscateAnonymousPosts(mockData);
				const post = result.posts[0];

				// Data should be completely untouched
				assert.strictEqual(post.user.uid, authorUid); 
				assert.strictEqual(post.user.username, 'student_resolve'); 
				assert.strictEqual(post.user.picture, '/path/to/pic.jpg'); 
			});

			it('should NOT scrub data for a TA viewing an anonymous post', async () => {
				const mockData = {
					uid: taUid, // A TA is viewing the page
					posts: [{
						isAnonymous: true,
						uid: authorUid,
						user: {
							uid: authorUid,
							username: 'student_resolve',
							picture: '/path/to/pic.jpg',
						},
					}],
				};

				const result = await taResolve.obfuscateAnonymousPosts(mockData);
				const post = result.posts[0];

				assert.strictEqual(post.user.uid, authorUid); 
				assert.strictEqual(post.user.username, 'student_resolve'); 
			});
		});
	});

	// ==========================================
	// TEST: autoApproveAdminPosts
	// ==========================================
	describe('autoApproveAdminPosts()', () => {
		let testPostPid;

		beforeEach(async () => {
			const topicResult = await topics.post({
				uid: studentUid,
				cid: categoryId,
				title: 'Auto Approve Test ' + Date.now(),
				content: 'Test content',
			});
			const replyResult = await topics.reply({
				uid: studentUid,
				tid: topicResult.topicData.tid,
				content: 'Reply content',
			});
			testPostPid = replyResult.pid;
		});

		it('should return data unmodified if post or uid is missing', async () => {
			const data = { post: null };
			const result = await taResolve.autoApproveAdminPosts(data);
			assert.strictEqual(result, data);
		});

		it('should auto-approve post if user is admin', async () => {
			const data = { post: { uid: adminUid, pid: testPostPid } };
			const result = await taResolve.autoApproveAdminPosts(data);
			
			assert.strictEqual(result.post.supportedByInstructor, 1);
			assert.strictEqual(result.post.supportedByInstructorUid, adminUid);
		});

		it('should NOT auto-approve if user is a regular student', async () => {
			const data = { post: { uid: studentUid, pid: testPostPid } };
			const result = await taResolve.autoApproveAdminPosts(data);
			
			assert.strictEqual(result.post.supportedByInstructor, undefined);
		});

		it('should handle errors gracefully', async () => {
			// Mock user.isAdministrator to throw an error
			const originalIsAdmin = user.isAdministrator;
			user.isAdministrator = async () => { throw new Error('Mock permission error'); };
			
			const data = { post: { uid: adminUid, pid: testPostPid } };
			const result = await taResolve.autoApproveAdminPosts(data);
			
			// It should catch the error and return the data unmodified
			assert.strictEqual(result.post.supportedByInstructor, undefined); 
			
			user.isAdministrator = originalIsAdmin; // Restore function
		});
	});

	// ==========================================
	// TEST: normalizeSupportedByInstructorSummary - Anonymous Logic
	// ==========================================
	describe('normalizeSupportedByInstructorSummary() - Anonymous Obfuscation', () => {
		let otherStudentUid;

		before(async () => {
			otherStudentUid = await user.create({ username: 'summary_student_' + Date.now(), password: 'password123' });
		});

		it('should scrub author data for a NON-CREATOR student viewing summary', async () => {
			const mockData = {
				uid: otherStudentUid, // Different student viewing
				posts: [{
					uid: studentUid,
					isAnonymous: true,
					user: { uid: studentUid, username: 'student_resolve' },
				}],
			};

			const result = await taResolve.normalizeSupportedByInstructorSummary(mockData);
			const post = result.posts[0];

			assert.strictEqual(post.uid, 0);
			assert.strictEqual(post.user.uid, 0);
			assert.strictEqual(post.user.username, 'Anonymous');
		});

		it('should NOT scrub author data for Admin viewing summary', async () => {
			const mockData = {
				uid: adminUid,
				posts: [{
					uid: studentUid,
					isAnonymous: true,
					user: { uid: studentUid, username: 'student_resolve' },
				}],
			};

			const result = await taResolve.normalizeSupportedByInstructorSummary(mockData);
			assert.strictEqual(result.posts[0].uid, studentUid);
			assert.strictEqual(result.posts[0].user.username, 'student_resolve');
		});
	});

	// ==========================================
	// TEST: obfuscateAnonymousTopics
	// ==========================================
	describe('obfuscateAnonymousTopics()', () => {
		let testTopicTid;
		let otherStudentUid;

		beforeEach(async () => {
			otherStudentUid = await user.create({ username: 'topic_student_' + Date.now(), password: 'password123' });

			const result = await topics.post({
				uid: studentUid,
				cid: categoryId,
				title: 'Secret Topic ' + Date.now(),
				content: 'This is a sufficiently long secret topic content.',
			});
			testTopicTid = result.topicData.tid;
			await topics.setTopicField(testTopicTid, 'isAnonymous', 1);
		});

		it('should return early if topics array is empty', async () => {
			const data = { topics: [] };
			const result = await taResolve.obfuscateAnonymousTopics(data);
			assert.deepStrictEqual(result.topics, []);
		});

		it('should completely scrub author data for a NON-CREATOR student', async () => {
			const mockData = {
				uid: otherStudentUid,
				topics: [{
					tid: testTopicTid,
					uid: studentUid,
					isAnonymous: true,
					user: { uid: studentUid, username: 'student_resolve' },
				}],
			};

			const result = await taResolve.obfuscateAnonymousTopics(mockData);
			const topic = result.topics[0];

			assert.strictEqual(topic.uid, 0);
			assert.strictEqual(topic.user.uid, 0);
			assert.strictEqual(topic.user.username, 'Anonymous');
		});

		it('should NOT scrub data for the TOPIC CREATOR', async () => {
			const mockData = {
				uid: studentUid, // Creator is viewing
				topics: [{
					tid: testTopicTid,
					uid: studentUid,
					isAnonymous: true,
					user: { uid: studentUid, username: 'student_resolve' },
				}],
			};

			const result = await taResolve.obfuscateAnonymousTopics(mockData);
			assert.strictEqual(result.topics[0].uid, studentUid);
			assert.strictEqual(result.topics[0].user.username, 'student_resolve');
		});

		it('should NOT scrub data for a TA viewing anonymous topic', async () => {
			const mockData = {
				uid: taUid,
				topics: [{
					tid: testTopicTid,
					uid: studentUid,
					isAnonymous: true,
					user: { uid: studentUid, username: 'student_resolve' },
				}],
			};

			const result = await taResolve.obfuscateAnonymousTopics(mockData);
			assert.strictEqual(result.topics[0].uid, studentUid);
			assert.strictEqual(result.topics[0].user.username, 'student_resolve');
		});
	});
});