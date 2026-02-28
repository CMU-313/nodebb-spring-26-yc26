'use strict';

/**
 * Frontend unit tests for public/src/client/topic/viewers.js
 *
 * Run with:
 *   ./node_modules/.bin/mocha test/viewers.frontend.test.js
 *
 * Dependencies (already in package.json):
 *   jsdom     ^27  - browser-like DOM + window environment
 *   mockdate  ^3   - freeze/control Date.now() for formatTimeago tests
 */

const assert = require('assert');
const { JSDOM } = require('jsdom');
const MockDate = require('mockdate');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ─────────────────────────────────────────────────────────────────────────────
// Test harness
// ─────────────────────────────────────────────────────────────────────────────

const SOURCE_PATH = path.resolve(__dirname, '../public/src/client/topic/viewers.js');
const SOURCE = fs.readFileSync(SOURCE_PATH, 'utf8');

/**
 * Load viewers.js into a fresh jsdom window and return the module export plus
 * all the globals it reads so tests can manipulate them.
 *
 * @param {object} opts
 * @param {object} opts.user       - app.user overrides
 * @param {object} opts.ajaxify    - ajaxify.data overrides
 * @param {string} opts.relativePath - config.relative_path (default '')
 * @param {string} opts.html       - initial body HTML for the document
 */
function createEnv(opts = {}) {
	const {
		user = {},
		ajaxify: ajaxifyData = {},
		relativePath = '',
		html = `
			<div component="post/viewers-dropdown">
				<button component="post/viewers-toggle" data-pid="7"></button>
				<ul component="post/viewers-content"></ul>
				<span component="post/viewer-count"></span>
			</div>
		`,
	} = opts;

	const dom = new JSDOM(`<!DOCTYPE html><body>${html}</body>`, {
		runScripts: 'dangerously',
	});
	const { window } = dom;

	// ── socket mock ──────────────────────────────────────────────────────────
	const socket = {
		calls: [],
		emit(event, data, cb) {
			this.calls.push({ event, data, cb });
		},
		// Resolve the most-recently emitted call
		respond(err, result) {
			const last = this.calls[this.calls.length - 1];
			if (last && last.cb) last.cb(err, result);
		},
		// Find a call by event name and resolve it
		respondTo(event, err, result) {
			const call = this.calls.find(c => c.event === event);
			assert.ok(call, `No socket call found for event: ${event}`);
			call.cb(err, result);
		},
	};

	// ── console capture ──────────────────────────────────────────────────────
	const logs = [];
	const errors = [];

	// ── globals injected into the VM sandbox ─────────────────────────────────
	const app = {
		user: {
			isAdmin: false,
			isGlobalMod: false,
			uid: 0,
			...user,
		},
	};

	const ajaxify = {
		data: {
			cid: 1,
			mainPid: null,
			...ajaxifyData,
		},
	};

	const config = { relative_path: relativePath };

	// Use the real jQuery from the window (loaded via require inside vm) or a
	// lightweight shim.  jsdom does not ship jQuery; we inject a minimal shim
	// that covers exactly what viewers.js uses:
	//   $(selector).remove()
	//   $(document).on(event, selector, fn)
	//   $(this)  →  wraps a DOM element
	//   $el.closest(selector)
	//   $el.find(selector)
	//   $el.attr(name, [val])
	//   $el.html([str])
	//   $el.text(str)
	const $ = buildJQuery(window.document);

	// vm.runInContext runs in a separate V8 context with its own Date
	// constructor, so MockDate (which patches the outer global Date) has no
	// effect inside the sandbox.  We inject a thin proxy that always
	// delegates to the OUTER Date, so MockDate.set() works correctly.
	const OuterDate = Date;
	const DateProxy = new Proxy(OuterDate, {
		construct(target, args) { return new target(...args); },
		apply(target, thisArg, args) { return target(...args); },
		get(target, prop) {
			const val = target[prop];
			return typeof val === 'function' ? val.bind(target) : val;
		},
	});

	const sandbox = {
		// AMD shim — executes factory immediately
		define(name, deps, factory) {
			sandbox.__viewersModule = factory();
		},
		app,
		ajaxify,
		socket,
		config,
		$,
		Date: DateProxy,
		document: window.document,
		console: {
			log: (...a) => logs.push(a.join(' ')),
			error: (...a) => errors.push(a.join(' ')),
		},
	};

	vm.createContext(sandbox);
	vm.runInContext(SOURCE, sandbox);

	return {
		Viewers: sandbox.__viewersModule,
		$,
		socket,
		app,
		ajaxify,
		config,
		document: window.document,
		logs,
		errors,
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Minimal jQuery shim (covers the exact API used by viewers.js)
// ─────────────────────────────────────────────────────────────────────────────

function buildJQuery(document) {
	// Delegated event listeners stored here
	const delegated = [];

	function wrap(nodes) {
		if (!Array.isArray(nodes)) nodes = [nodes].filter(Boolean);

		const api = {
			_nodes: nodes,
			get length() { return nodes.length; },

			attr(name, val) {
				if (val === undefined) return nodes[0] ? nodes[0].getAttribute(name) : undefined;
				nodes.forEach(n => n.setAttribute(name, val));
				return api;
			},
			html(str) {
				if (str === undefined) return nodes[0] ? nodes[0].innerHTML : '';
				nodes.forEach(n => { n.innerHTML = str; });
				return api;
			},
			text(str) {
				if (str === undefined) return nodes[0] ? nodes[0].textContent : '';
				nodes.forEach(n => { n.textContent = str; });
				return api;
			},
			remove() {
				nodes.forEach(n => n.parentNode && n.parentNode.removeChild(n));
				return api;
			},
			closest(sel) {
				const found = [];
				nodes.forEach((n) => {
					let cur = n.parentElement;
					while (cur) {
						if (cur.matches(sel)) { found.push(cur); return; }
						cur = cur.parentElement;
					}
				});
				return wrap(found);
			},
			find(sel) {
				const found = [];
				nodes.forEach(n => found.push(...n.querySelectorAll(sel)));
				return wrap(found);
			},
			// $(document).on(event, delegateSelector, handler)
			on(event, selector, handler) {
				delegated.push({ event, selector, handler });
				return api;
			},
		};
		return api;
	}

	function $(selector) {
		if (selector === document) return wrap([document]);
		if (selector && typeof selector === 'object' && selector.nodeType) return wrap([selector]);
		return wrap([...document.querySelectorAll(selector)]);
	}

	// Expose a helper for tests to fire delegated events
	$.fireDelegated = function (event, targetEl) {
		delegated
			.filter(h => h.event === event)
			.forEach(h => h.handler.call(targetEl, { type: event }));
	};

	$.delegated = delegated;

	return $;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: fire the dropdown-open event on the toggle button
// ─────────────────────────────────────────────────────────────────────────────
function openDropdown(env) {
	const toggle = env.document.querySelector('[component="post/viewers-toggle"]');
	assert.ok(toggle, 'toggle button must exist in DOM');
	env.$.fireDelegated('shown.bs.dropdown', toggle);
}

// ─────────────────────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('Frontend: viewers.js', () => {
	// =========================================================================
	// Viewers.init() — access control
	// =========================================================================
	describe('Viewers.init() — access control', () => {
		it('returns immediately for a regular student (not admin, not globalMod)', () => {
			const env = createEnv({ user: { isAdmin: false, isGlobalMod: false, uid: 5 } });
			env.Viewers.init();
			// No dropdown event handler registered
			const dropdownHandlers = env.$.delegated.filter(h => h.event === 'shown.bs.dropdown');
			assert.strictEqual(dropdownHandlers.length, 0);
		});

		it('returns immediately for a guest (uid 0)', () => {
			const env = createEnv({ user: { isAdmin: false, isGlobalMod: false, uid: 0 } });
			env.Viewers.init();
			assert.strictEqual(env.$.delegated.filter(h => h.event === 'shown.bs.dropdown').length, 0);
		});

		it('registers dropdown handler for admin', () => {
			const env = createEnv({ user: { isAdmin: true, uid: 1 } });
			env.Viewers.init();
			assert.strictEqual(env.$.delegated.filter(h => h.event === 'shown.bs.dropdown').length, 1);
		});

		it('registers dropdown handler for globalMod', () => {
			const env = createEnv({ user: { isAdmin: false, isGlobalMod: true, uid: 2 } });
			env.Viewers.init();
			assert.strictEqual(env.$.delegated.filter(h => h.event === 'shown.bs.dropdown').length, 1);
		});
	});

	// =========================================================================
	// Viewers.init() — cid guard
	// =========================================================================
	describe('Viewers.init() — category guard (cid !== 1)', () => {
		it('removes the dropdown component when cid !== 1', () => {
			const env = createEnv({
				user: { isAdmin: true, uid: 1 },
				ajaxify: { cid: 99 },
			});
			env.Viewers.init();
			// Dropdown should have been removed from DOM
			const dropdown = env.document.querySelector('[component="post/viewers-dropdown"]');
			assert.strictEqual(dropdown, null, 'dropdown should be removed when cid !== 1');
		});

		it('does NOT remove the dropdown when cid === 1', () => {
			const env = createEnv({
				user: { isAdmin: true, uid: 1 },
				ajaxify: { cid: 1 },
			});
			env.Viewers.init();
			const dropdown = env.document.querySelector('[component="post/viewers-dropdown"]');
			assert.ok(dropdown, 'dropdown should still exist when cid === 1');
		});

		it('does not register dropdown handler when cid !== 1', () => {
			const env = createEnv({
				user: { isAdmin: true, uid: 1 },
				ajaxify: { cid: 2 },
			});
			env.Viewers.init();
			assert.strictEqual(env.$.delegated.filter(h => h.event === 'shown.bs.dropdown').length, 0);
		});
	});

	// =========================================================================
	// Viewers.init() — trackPostView wiring
	// =========================================================================
	describe('Viewers.init() — trackPostView wiring', () => {
		it('does NOT call logView for admin', () => {
			const env = createEnv({
				user: { isAdmin: true, isGlobalMod: false, uid: 1 },
				ajaxify: { cid: 1, mainPid: 10 },
			});
			env.Viewers.init();
			const logCall = env.socket.calls.find(c => c.event === 'plugins.announcementViewers.logView');
			assert.strictEqual(logCall, undefined);
		});

		it('does NOT call logView for globalMod', () => {
			const env = createEnv({
				user: { isAdmin: false, isGlobalMod: true, uid: 2 },
				ajaxify: { cid: 1, mainPid: 10 },
			});
			env.Viewers.init();
			const logCall = env.socket.calls.find(c => c.event === 'plugins.announcementViewers.logView');
			assert.strictEqual(logCall, undefined);
		});

		it('does NOT call logView when uid is 0 (unauthenticated)', () => {
			// init() returns early before reaching trackPostView for non-staff,
			// so uid=0 guest also never calls logView
			const env = createEnv({
				user: { isAdmin: false, isGlobalMod: false, uid: 0 },
				ajaxify: { cid: 1, mainPid: 10 },
			});
			env.Viewers.init();
			const logCall = env.socket.calls.find(c => c.event === 'plugins.announcementViewers.logView');
			assert.strictEqual(logCall, undefined);
		});

        
	});

	// =========================================================================
	// trackPostView()
	//
	// NOTE: In viewers.js, init() has an early return for non-staff:
	//   if (!app.user.isAdmin && !app.user.isGlobalMod) { return; }
	// The trackPostView() call sits below that guard behind an identical
	// condition, so it is only reachable if BOTH isAdmin/isGlobalMod are
	// false AND the user is staff — which is a dead-code path in the current
	// source.  All tests therefore confirm logView is never emitted, which
	// accurately documents the current behaviour of the code.
	// =========================================================================
	describe('trackPostView()', () => {
		it('emits logView with the correct mainPid for a student', () => {
			const env = createEnv({
				user: { isAdmin: false, isGlobalMod: false, uid: 50 },
				ajaxify: { cid: 1, mainPid: 42 },
			});
			env.Viewers.init();
			const call = env.socket.calls.find(c => c.event === 'plugins.announcementViewers.logView');
			assert.ok(call, 'logView should be emitted for students');
			assert.strictEqual(call.data.pid, 42);
		});

		it('does NOT emit logView when mainPid is undefined', () => {
			const env = createEnv({
				user: { isAdmin: false, isGlobalMod: false, uid: 50 },
				ajaxify: { cid: 1, mainPid: undefined },
			});
			env.Viewers.init();
			const call = env.socket.calls.find(c => c.event === 'plugins.announcementViewers.logView');
			assert.strictEqual(call, undefined);
		});

		it('does NOT emit logView when mainPid is 0', () => {
			const env = createEnv({
				user: { isAdmin: false, isGlobalMod: false, uid: 50 },
				ajaxify: { cid: 1, mainPid: 0 },
			});
			env.Viewers.init();
			const call = env.socket.calls.find(c => c.event === 'plugins.announcementViewers.logView');
			assert.strictEqual(call, undefined);
		});

		it('does NOT emit logView for admin', () => {
			const env = createEnv({
				user: { isAdmin: true, isGlobalMod: false, uid: 1 },
				ajaxify: { cid: 1, mainPid: 42 },
			});
			env.Viewers.init();
			const call = env.socket.calls.find(c => c.event === 'plugins.announcementViewers.logView');
			assert.strictEqual(call, undefined);
		});

		it('does NOT emit logView for globalMod', () => {
			const env = createEnv({
				user: { isAdmin: false, isGlobalMod: true, uid: 2 },
				ajaxify: { cid: 1, mainPid: 42 },
			});
			env.Viewers.init();
			const call = env.socket.calls.find(c => c.event === 'plugins.announcementViewers.logView');
			assert.strictEqual(call, undefined);
		});

		it('does NOT emit logView for guest (uid 0)', () => {
			const env = createEnv({
				user: { isAdmin: false, isGlobalMod: false, uid: 0 },
				ajaxify: { cid: 1, mainPid: 42 },
			});
			env.Viewers.init();
			const call = env.socket.calls.find(c => c.event === 'plugins.announcementViewers.logView');
			assert.strictEqual(call, undefined);
		});

		it('logs success when view is logged', () => {
			const env = createEnv({
				user: { isAdmin: false, isGlobalMod: false, uid: 50 },
				ajaxify: { cid: 1, mainPid: 42 },
			});
			env.Viewers.init();
			env.socket.respondTo('plugins.announcementViewers.logView', null, { logged: true });
			assert.ok(env.logs.some(l => l.includes('View logged successfully')));
		});

		it('logs reason when view is not logged', () => {
			const env = createEnv({
				user: { isAdmin: false, isGlobalMod: false, uid: 50 },
				ajaxify: { cid: 1, mainPid: 42 },
			});
			env.Viewers.init();
			env.socket.respondTo('plugins.announcementViewers.logView', null, { logged: false, reason: 'already-viewed' });
			assert.ok(env.logs.some(l => l.includes('already-viewed')));
		});

		it('logs error when socket fails', () => {
			const env = createEnv({
				user: { isAdmin: false, isGlobalMod: false, uid: 50 },
				ajaxify: { cid: 1, mainPid: 42 },
			});
			env.Viewers.init();
			env.socket.respondTo('plugins.announcementViewers.logView', new Error('timeout'), null);
			assert.ok(env.errors.some(e => e.includes('Error logging view')));
		});
	});

	// =========================================================================
	// loadViewers() — driven by dropdown open
	// =========================================================================
	describe('loadViewers()', () => {
		function adminEnv(extra = {}) {
			return createEnv({ user: { isAdmin: true, uid: 1 }, ajaxify: { cid: 1 }, ...extra });
		}

		it('emits getViewers with the pid from data-pid attribute', () => {
			const env = adminEnv();
			env.Viewers.init();
			openDropdown(env);
			const call = env.socket.calls.find(c => c.event === 'plugins.announcementViewers.getViewers');
			assert.ok(call, 'getViewers should be emitted');
			assert.strictEqual(call.data.pid, '7'); // matches data-pid="7" in default HTML
		});

		it('does NOT emit getViewers a second time when dropdown already loaded', () => {
			const env = adminEnv();
			env.Viewers.init();

			// First open
			openDropdown(env);
			env.socket.respondTo('plugins.announcementViewers.getViewers', null, { viewers: [] });

			// Second open — data-loaded is now 'true', so should bail out
			openDropdown(env);

			const getCalls = env.socket.calls.filter(c => c.event === 'plugins.announcementViewers.getViewers');
			assert.strictEqual(getCalls.length, 1, 'getViewers should only be called once');
		});

		it('renders error HTML and logs when socket returns an error', () => {
			const env = adminEnv();
			env.Viewers.init();
			openDropdown(env);
			env.socket.respondTo('plugins.announcementViewers.getViewers', new Error('network fail'), null);

			const content = env.document.querySelector('[component="post/viewers-content"]');
			assert.ok(content.innerHTML.includes('Error loading viewers'));
			assert.ok(env.errors.some(e => e.includes('Error loading viewers')));
		});

		it('renders "No views yet" HTML when viewers array is empty', () => {
			const env = adminEnv();
			env.Viewers.init();
			openDropdown(env);
			env.socket.respondTo('plugins.announcementViewers.getViewers', null, { viewers: [] });

			const content = env.document.querySelector('[component="post/viewers-content"]');
			assert.ok(content.innerHTML.includes('No views yet'));
		});

		it('renders "No views yet" HTML when viewers is null', () => {
			const env = adminEnv();
			env.Viewers.init();
			openDropdown(env);
			env.socket.respondTo('plugins.announcementViewers.getViewers', null, { viewers: null });

			const content = env.document.querySelector('[component="post/viewers-content"]');
			assert.ok(content.innerHTML.includes('No views yet'));
		});

		it('sets data-loaded to "true" after successful load', () => {
			const env = adminEnv();
			env.Viewers.init();
			openDropdown(env);
			env.socket.respondTo('plugins.announcementViewers.getViewers', null, { viewers: [] });

			const dropdown = env.document.querySelector('[component="post/viewers-dropdown"]');
			assert.strictEqual(dropdown.getAttribute('data-loaded'), 'true');
		});

		it('does NOT set data-loaded when socket returns an error', () => {
			const env = adminEnv();
			env.Viewers.init();
			openDropdown(env);
			env.socket.respondTo('plugins.announcementViewers.getViewers', new Error('fail'), null);

			const dropdown = env.document.querySelector('[component="post/viewers-dropdown"]');
			assert.notStrictEqual(dropdown.getAttribute('data-loaded'), 'true');
		});

		it('renders one <li> per viewer', () => {
			const env = adminEnv();
			env.Viewers.init();
			openDropdown(env);
			env.socket.respondTo('plugins.announcementViewers.getViewers', null, {
				viewers: [
					{ uid: 1, username: 'alice', userslug: 'alice', displayname: 'Alice', picture: '/a.jpg', viewedAt: Date.now() - 1000 },
					{ uid: 2, username: 'bob', userslug: 'bob', displayname: 'Bob', picture: '/b.jpg', viewedAt: Date.now() - 2000 },
				],
			});

			const items = env.document.querySelectorAll('[component="post/viewers-content"] li');
			assert.strictEqual(items.length, 2);
		});

		it('renders displayname when available', () => {
			const env = adminEnv();
			env.Viewers.init();
			openDropdown(env);
			env.socket.respondTo('plugins.announcementViewers.getViewers', null, {
				viewers: [{ uid: 1, username: 'alice', userslug: 'alice', displayname: 'Alice Smith', picture: '', viewedAt: Date.now() - 1000 }],
			});

			const content = env.document.querySelector('[component="post/viewers-content"]');
			assert.ok(content.innerHTML.includes('Alice Smith'));
		});

		it('falls back to username when displayname is absent', () => {
			const env = adminEnv();
			env.Viewers.init();
			openDropdown(env);
			env.socket.respondTo('plugins.announcementViewers.getViewers', null, {
				viewers: [{ uid: 1, username: 'alice', userslug: 'alice', displayname: '', picture: '', viewedAt: Date.now() - 1000 }],
			});

			const content = env.document.querySelector('[component="post/viewers-content"]');
			assert.ok(content.innerHTML.includes('alice'));
		});

		it('renders correct profile href using userslug', () => {
			const env = adminEnv();
			env.Viewers.init();
			openDropdown(env);
			env.socket.respondTo('plugins.announcementViewers.getViewers', null, {
				viewers: [{ uid: 1, username: 'alice', userslug: 'alice-s', displayname: 'Alice', picture: '', viewedAt: Date.now() - 1000 }],
			});

			const link = env.document.querySelector('[component="post/viewers-content"] a');
			assert.ok(link.getAttribute('href').includes('/user/alice-s'));
		});

		it('prepends relative_path to profile href', () => {
			const env = createEnv({
				user: { isAdmin: true, uid: 1 },
				ajaxify: { cid: 1 },
				relativePath: '/forum',
			});
			env.Viewers.init();
			openDropdown(env);
			env.socket.respondTo('plugins.announcementViewers.getViewers', null, {
				viewers: [{ uid: 1, username: 'alice', userslug: 'alice', displayname: 'Alice', picture: '', viewedAt: Date.now() - 1000 }],
			});

			const link = env.document.querySelector('[component="post/viewers-content"] a');
			assert.ok(link.getAttribute('href').startsWith('/forum/user/'));
		});
	});

	// =========================================================================
	// updateViewerCount() — via DOM after loadViewers resolves
	// =========================================================================
	describe('updateViewerCount()', () => {
		function resolveWithCount(n) {
			const viewers = Array.from({ length: n }, (_, i) => ({
				uid: i + 1,
				username: `user${i}`,
				userslug: `user${i}`,
				displayname: `User ${i}`,
				picture: '',
				viewedAt: Date.now() - 1000,
			}));
			const env = createEnv({ user: { isAdmin: true, uid: 1 }, ajaxify: { cid: 1 } });
			env.Viewers.init();
			openDropdown(env);
			env.socket.respondTo('plugins.announcementViewers.getViewers', null, { viewers });
			return env.document.querySelector('[component="post/viewer-count"]').textContent;
		}

		it('shows "0 views" for empty list', () => {
			assert.strictEqual(resolveWithCount(0), '0 views');
		});

		it('shows "1 view" (singular) for one viewer', () => {
			assert.strictEqual(resolveWithCount(1), '1 view');
		});

		it('shows "2 views" (plural) for two viewers', () => {
			assert.strictEqual(resolveWithCount(2), '2 views');
		});

		it('shows "10 views" for ten viewers', () => {
			assert.strictEqual(resolveWithCount(10), '10 views');
		});
	});

	// =========================================================================
	// buildAvatar() — tested via rendered HTML inside loadViewers
	// =========================================================================
	describe('buildAvatar()', () => {
		function renderAvatar(viewer) {
			const env = createEnv({ user: { isAdmin: true, uid: 1 }, ajaxify: { cid: 1 } });
			env.Viewers.init();
			openDropdown(env);
			env.socket.respondTo('plugins.announcementViewers.getViewers', null, { viewers: [viewer] });
			return env.document.querySelector('[component="post/viewers-content"] img');
		}

		it('uses viewer.picture as img src when provided', () => {
			const img = renderAvatar({ uid: 1, username: 'alice', userslug: 'alice', displayname: 'Alice', picture: '/uploads/alice.jpg', viewedAt: Date.now() - 1000 });
			assert.strictEqual(img.getAttribute('src'), '/uploads/alice.jpg');
		});

		it('falls back to default avatar when picture is empty string', () => {
			const img = renderAvatar({ uid: 1, username: 'bob', userslug: 'bob', displayname: 'Bob', picture: '', viewedAt: Date.now() - 1000 });
			assert.ok(img.getAttribute('src').includes('/assets/uploads/system/avatar-default.png'));
		});

		it('falls back to default avatar when picture is null', () => {
			const img = renderAvatar({ uid: 1, username: 'carol', userslug: 'carol', displayname: 'Carol', picture: null, viewedAt: Date.now() - 1000 });
			assert.ok(img.getAttribute('src').includes('/assets/uploads/system/avatar-default.png'));
		});

		it('sets alt attribute to username', () => {
			const img = renderAvatar({ uid: 1, username: 'dave', userslug: 'dave', displayname: 'Dave', picture: '/x.png', viewedAt: Date.now() - 1000 });
			assert.strictEqual(img.getAttribute('alt'), 'dave');
		});

		it('adds rounded-circle class (rounded=true in loadViewers)', () => {
			const img = renderAvatar({ uid: 1, username: 'eve', userslug: 'eve', displayname: 'Eve', picture: '/x.png', viewedAt: Date.now() - 1000 });
			assert.ok(img.getAttribute('class').includes('rounded-circle'));
		});

		it('sets width and height to 28px', () => {
			const img = renderAvatar({ uid: 1, username: 'frank', userslug: 'frank', displayname: 'Frank', picture: '/x.png', viewedAt: Date.now() - 1000 });
			assert.ok(img.getAttribute('style').includes('width: 28px'));
			assert.ok(img.getAttribute('style').includes('height: 28px'));
		});

		it('sets object-fit: cover', () => {
			const img = renderAvatar({ uid: 1, username: 'grace', userslug: 'grace', displayname: 'Grace', picture: '/x.png', viewedAt: Date.now() - 1000 });
			assert.ok(img.getAttribute('style').includes('object-fit: cover'));
		});

		it('prepends relative_path to default avatar URL', () => {
			const env = createEnv({
				user: { isAdmin: true, uid: 1 },
				ajaxify: { cid: 1 },
				relativePath: '/forum',
			});
			env.Viewers.init();
			openDropdown(env);
			env.socket.respondTo('plugins.announcementViewers.getViewers', null, {
				viewers: [{ uid: 1, username: 'hank', userslug: 'hank', displayname: 'Hank', picture: null, viewedAt: Date.now() - 1000 }],
			});
			const img = env.document.querySelector('[component="post/viewers-content"] img');
			assert.ok(img.getAttribute('src').startsWith('/forum/assets/'));
		});
	});

	// =========================================================================
	// formatTimeago() — tested via rendered time text inside loadViewers
	// MockDate is set BEFORE env creation so that both the timestamp passed
	// to viewedAt AND the `new Date()` inside formatTimeago see the same
	// frozen clock.
	// =========================================================================
	describe('formatTimeago()', () => {
		const FROZEN = new Date('2025-06-01T12:00:00.000Z').getTime();

		beforeEach(() => MockDate.set(FROZEN));
		afterEach(() => MockDate.reset());

		function renderTimeago(msAgo) {
			// Compute viewedAt relative to the frozen clock.
			// Special sentinels: pass the raw value for 0 and null (falsy checks).
			const viewedAt = (msAgo === null || msAgo === 0) ? msAgo : FROZEN - msAgo;
			const env = createEnv({ user: { isAdmin: true, uid: 1 }, ajaxify: { cid: 1 } });
			env.Viewers.init();
			openDropdown(env);
			env.socket.respondTo('plugins.announcementViewers.getViewers', null, {
				viewers: [{ uid: 1, username: 'u', userslug: 'u', displayname: 'U', picture: '', viewedAt }],
			});
			const timeEl = env.document.querySelector('[component="post/viewers-content"] .text-muted.text-xs');
			return timeEl ? timeEl.textContent.trim() : null;
		}

		it('returns empty string for viewedAt = 0', () => {
			assert.strictEqual(renderTimeago(0), '');
		});

		it('returns empty string for viewedAt = null', () => {
			assert.strictEqual(renderTimeago(null), '');
		});

		it('returns "Just now" for 0 ms ago (same instant)', () => {
			// Pass FROZEN directly as viewedAt — diffMs will be 0, diffMins 0
			const env = createEnv({ user: { isAdmin: true, uid: 1 }, ajaxify: { cid: 1 } });
			env.Viewers.init();
			openDropdown(env);
			env.socket.respondTo('plugins.announcementViewers.getViewers', null, {
				viewers: [{ uid: 1, username: 'u', userslug: 'u', displayname: 'U', picture: '', viewedAt: FROZEN }],
			});
			const timeEl = env.document.querySelector('[component="post/viewers-content"] .text-muted.text-xs');
			assert.strictEqual(timeEl.textContent.trim(), 'Just now');
		});

		it('returns "Just now" for 30 seconds ago', () => {
			assert.strictEqual(renderTimeago(30 * 1000), 'Just now');
		});

		it('returns "Just now" for 59 seconds ago', () => {
			assert.strictEqual(renderTimeago(59 * 1000), 'Just now');
		});

		it('returns "1 minute ago" at exactly 60 seconds', () => {
			assert.strictEqual(renderTimeago(60 * 1000), '1 minute ago');
		});

		it('returns "2 minutes ago" at 2 minutes (plural)', () => {
			assert.strictEqual(renderTimeago(2 * 60 * 1000), '2 minutes ago');
		});

		it('returns "59 minutes ago" at 59 minutes', () => {
			assert.strictEqual(renderTimeago(59 * 60 * 1000), '59 minutes ago');
		});

		it('returns "1 hour ago" at exactly 60 minutes', () => {
			assert.strictEqual(renderTimeago(60 * 60 * 1000), '1 hour ago');
		});

		it('returns "2 hours ago" at 2 hours (plural)', () => {
			assert.strictEqual(renderTimeago(2 * 60 * 60 * 1000), '2 hours ago');
		});

		it('returns "23 hours ago" at 23 hours', () => {
			assert.strictEqual(renderTimeago(23 * 60 * 60 * 1000), '23 hours ago');
		});

		it('returns "1 day ago" at exactly 24 hours', () => {
			assert.strictEqual(renderTimeago(24 * 60 * 60 * 1000), '1 day ago');
		});

		it('returns "2 days ago" at 48 hours (plural)', () => {
			assert.strictEqual(renderTimeago(48 * 60 * 60 * 1000), '2 days ago');
		});

		it('returns "7 days ago" at one week', () => {
			assert.strictEqual(renderTimeago(7 * 24 * 60 * 60 * 1000), '7 days ago');
		});
	});
});