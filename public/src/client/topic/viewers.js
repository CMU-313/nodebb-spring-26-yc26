'use strict';

define('forum/topic/viewers', [], function (api) {
	const Viewers = {};

	Viewers.init = function () {
		// Only for admins/mods
		if (!app.user.isAdmin && !app.user.isGlobalMod) {
			return;
		}

		// Only show in announcements category (cid = 1)
		const cid = ajaxify.data.cid;
		if (cid !== 1) {
			$('[component="post/viewers-dropdown"]').remove();
			return;
		}

		// Load viewers when dropdown is opened
		$(document).on('shown.bs.dropdown', '[component="post/viewers-toggle"]', function () {
			const $btn = $(this);
			const $dropdown = $btn.closest('[component="post/viewers-dropdown"]');
			const $content = $dropdown.find('[component="post/viewers-content"]');
			const pid = $btn.attr('data-pid');

			// Only load once
			if ($dropdown.attr('data-loaded') === 'true') {
				return;
			}

			loadViewers(pid, $dropdown, $content);
		});

		// Track when current user views posts (if they're a student)
		if (!app.user.isAdmin && !app.user.isGlobalMod && app.user.uid) {
			trackPostView();
		}
	};

	function loadViewers(pid, $dropdown, $content) {
		// TODO: Replace with actual API call when backend is ready
		// For now, use mock data
		const mockViewers = generateMockViewers();

		$dropdown.attr('data-loaded', 'true');

		if (mockViewers.length === 0) {
			$content.html(`
				<li class="px-3 py-2 text-muted text-xs text-center">
					<i class="fa fa-inbox"></i> No views yet
				</li>
			`);
			updateViewerCount($dropdown, 0);
			return;
		}

		// Render viewer list
		const html = mockViewers.map(viewer => `
			<li class="px-2 py-2">
				<a href="${config.relative_path}/user/${viewer.userslug}" 
				   class="d-flex align-items-center gap-2 text-decoration-none viewer-item">
					<div class="flex-shrink-0">
						${buildAvatar(viewer, '28px', true)}
					</div>
					<div class="flex-grow-1 min-w-0">
						<div class="fw-semibold text-truncate">${viewer.displayname || viewer.username}</div>
						<div class="text-muted text-xs">${viewer.viewedTime}</div>
					</div>
				</a>
			</li>
		`).join('');

		$content.html(html);
		updateViewerCount($dropdown, mockViewers.length);
	}

	function updateViewerCount($dropdown, count) {
		const $countEl = $dropdown.find('[component="post/viewer-count"]');
		$countEl.text(`${count} view${count !== 1 ? 's' : ''}`);
	}

	function buildAvatar(user, size, rounded) {
		const picture = user.picture || `${config.relative_path}/assets/uploads/system/avatar-default.png`;
		const className = rounded ? 'rounded-circle' : '';
		return `<img src="${picture}" 
		             alt="${user.username}" 
		             class="${className}" 
		             style="width: ${size}; height: ${size}; object-fit: cover;">`;
	}

	function generateMockViewers() {
		// Mock data - replace with API call later
		// Only generate mock viewers if we're in dev/testing
		return [
			{
				uid: 2,
				username: 'student1',
				displayname: 'Ben N',
				picture: null,
				viewedTime: '2 hours ago',
			},
			{
				uid: 3,
				username: 'student2',
				displayname: 'Putt C',
				picture: null,
				viewedTime: '5 hours ago',
			},
			{
				uid: 4,
				username: 'student5',
				displayname: 'Raul M',
				picture: null,
				viewedTime: '1 day ago',
			},
		];
	}

	function trackPostView() {
		// Track that the current student viewed this announcement
		// For now, just log to console (backend will handle persistence later)
		const tid = ajaxify.data.tid;
		const pid = ajaxify.data.mainPid;
		
		console.log(`[Viewers] Student ${app.user.uid} viewed announcement topic ${tid}, post ${pid}`);
		
		// TODO: Send to backend API when ready
		// api.post(`/posts/${pid}/view`, {});
	}

	return Viewers;
});
