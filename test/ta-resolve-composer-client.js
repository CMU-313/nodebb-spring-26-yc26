'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const { JSDOM } = require('jsdom');

/**
 * Unit tests for the ta-resolve plugin client script: composer hook logic
 * that sets replyData.data.isAnonymous (quick reply) and submitData.composerData.isAnonymous
 * (full composer) so anonymous posting works without using write APIs.
 */

describe('TA Resolve – composer client hooks (anonymous posting)', () => {
	let dom;
	let mockHooks;
	let quickReplyListener;
	let submitListener;

	before(() => {
		dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
		const window = dom.window;
		const document = window.document;
		Object.defineProperty(document, 'readyState', { value: 'complete', configurable: true });

		const listeners = {};
		mockHooks = {
			on(name, fn) {
				listeners[name] = (listeners[name] || []).concat(fn);
				return this;
			},
			getListener(name) {
				const list = listeners[name];
				return list && list.length === 1 ? list[0] : list;
			},
		};

		const mockRequire = function (deps, cb) {
			if (Array.isArray(deps) && deps[0] === 'hooks') {
				cb(mockHooks);
			}
		};

		const scriptPath = path.join(__dirname, '../plugins/ta-resolve/public/ta-resolve-composer.js');
		const script = fs.readFileSync(scriptPath, 'utf8');
		const sandbox = { window, document, require: mockRequire };
		vm.createContext(sandbox);
		vm.runInContext(script, sandbox);

		quickReplyListener = mockHooks.getListener('filter:composer.quickreply.data');
		submitListener = mockHooks.getListener('filter:composer.submit');
		assert(quickReplyListener, 'filter:composer.quickreply.data listener should be registered');
		assert(submitListener, 'filter:composer.submit listener should be registered');
	});

	describe('filter:composer.quickreply.data', () => {
		it('should set data.isAnonymous to true when window.__taResolveQuickReplyAnonymous is true', () => {
			dom.window.__taResolveQuickReplyAnonymous = true;
			const replyData = { data: { tid: 1, content: 'test' } };
			const result = quickReplyListener(replyData);
			assert.strictEqual(result.data.isAnonymous, true);
			assert.strictEqual(result, replyData);
		});

		it('should set data.isAnonymous to false when window.__taResolveQuickReplyAnonymous is false', () => {
			dom.window.__taResolveQuickReplyAnonymous = false;
			const replyData = { data: { tid: 1, content: 'test' } };
			const result = quickReplyListener(replyData);
			assert.strictEqual(result.data.isAnonymous, false);
		});

		it('should set data.isAnonymous to false when window flag is unset', () => {
			dom.window.__taResolveQuickReplyAnonymous = undefined;
			const replyData = { data: { tid: 2, content: 'x' } };
			quickReplyListener(replyData);
			assert.strictEqual(replyData.data.isAnonymous, false);
		});

		it('should ensure data object exists and return same reference for quickreply payload', () => {
			dom.window.__taResolveQuickReplyAnonymous = true;
			const replyData = { data: { tid: 3 } };
			const result = quickReplyListener(replyData);
			assert.strictEqual(result, replyData);
			assert.strictEqual(result.data.isAnonymous, true);
		});
	});

	describe('filter:composer.submit', () => {
		function makeSubmitData(action, selectVal) {
			const composerEl = {
				find() {
					return selectVal === undefined ?
						{ length: 0 } :
						{ length: 1, val: () => selectVal };
				},
			};
			return {
				action,
				composerEl,
				composerData: {},
			};
		}

		it('should set composerData.isAnonymous to true for topics.post when dropdown is anonymous', () => {
			const submitData = makeSubmitData('topics.post', 'anonymous');
			const result = submitListener(submitData);
			assert.strictEqual(result.composerData.isAnonymous, true);
			assert.strictEqual(result, submitData);
		});

		it('should set composerData.isAnonymous to false for topics.post when dropdown is named', () => {
			const submitData = makeSubmitData('topics.post', 'named');
			submitListener(submitData);
			assert.strictEqual(submitData.composerData.isAnonymous, false);
		});

		it('should set composerData.isAnonymous to true for posts.reply when dropdown is anonymous', () => {
			const submitData = makeSubmitData('posts.reply', 'anonymous');
			submitListener(submitData);
			assert.strictEqual(submitData.composerData.isAnonymous, true);
		});

		it('should set composerData.isAnonymous to false for posts.reply when dropdown is named', () => {
			const submitData = makeSubmitData('posts.reply', 'named');
			submitListener(submitData);
			assert.strictEqual(submitData.composerData.isAnonymous, false);
		});

		it('should set isAnonymous to false when no select element is present', () => {
			const submitData = makeSubmitData('topics.post', undefined);
			submitListener(submitData);
			assert.strictEqual(submitData.composerData.isAnonymous, false);
		});

		it('should not modify submitData for actions other than topics.post and posts.reply', () => {
			const submitData = makeSubmitData('posts.edit', 'anonymous');
			submitData.composerData.existing = 'value';
			const result = submitListener(submitData);
			assert.strictEqual(result.composerData.existing, 'value');
			assert.strictEqual(result.composerData.isAnonymous, undefined);
		});

		it('should return submitData unchanged when composerEl or composerData is missing', () => {
			const noEl = { action: 'topics.post', composerData: {} };
			const resultNoEl = submitListener(noEl);
			assert.strictEqual(resultNoEl, noEl);
			assert.strictEqual(noEl.composerData.isAnonymous, undefined);

			const noData = { action: 'topics.post', composerEl: { find: () => ({ length: 1, val: () => 'anonymous' }) } };
			const resultNoData = submitListener(noData);
			assert.strictEqual(resultNoData, noData);
		});
	});
});
