'use strict';

define('forum/topic/viewers', [], function () {
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
		// Call the real backend API
		socket.emit('plugins.announcementViewers.getViewers', { pid: pid }, function (err, data) {
			if (err) {
				$content.html(`
					<li class="px-3 py-2 text-danger text-xs text-center">
						<i class="fa fa-exclamation-circle"></i> Error loading viewers
					</li>
				`);
				console.error('[Viewers] Error loading viewers:', err);
				return;
			}

			$dropdown.attr('data-loaded', 'true');

			if (!data.viewers || data.viewers.length === 0) {
				$content.html(`
					<li class="px-3 py-2 text-muted text-xs text-center">
						<i class="fa fa-inbox"></i> No views yet
					</li>
				`);
				updateViewerCount($dropdown, 0);
				return;
			}

			// Render viewer list
			const html = data.viewers.map(function (viewer) {
				return `
					<li class="px-2 py-2">
						<a href="${config.relative_path}/user/${viewer.userslug}" 
						   class="d-flex align-items-center gap-2 text-decoration-none viewer-item">
							<div class="flex-shrink-0">
								${buildAvatar(viewer, '28px', true)}
							</div>
							<div class="flex-grow-1 min-w-0">
								<div class="fw-semibold text-truncate">${viewer.displayname || viewer.username}</div>
								<div class="text-muted text-xs">${formatTimeago(viewer.viewedAt)}</div>
							</div>
						</a>
					</li>
				`;
			}).join('');

			$content.html(html);
			updateViewerCount($dropdown, data.viewers.length);
		});
	}

	function updateViewerCount($dropdown, count) {
		const $countEl = $dropdown.find('[component="post/viewer-count"]');
		$countEl.text(count + ' view' + (count !== 1 ? 's' : ''));
	}

	function buildAvatar(user, size, rounded) {
		const picture = user.picture || config.relative_path + '/assets/uploads/system/avatar-default.png';
		const className = rounded ? 'rounded-circle' : '';
		return '<img src="' + picture + '" ' +
			'alt="' + user.username + '" ' +
			'class="' + className + '" ' +
			'style="width: ' + size + '; height: ' + size + '; object-fit: cover;">';
	}

	function formatTimeago(timestamp) {
		if (!timestamp) {
			return '';
		}
		const date = new Date(timestamp);
		const now = new Date();
		const diffMs = now - date;
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);

		if (diffMins < 1) {
			return 'Just now';
		} else if (diffMins < 60) {
			return diffMins + ' minute' + (diffMins !== 1 ? 's' : '') + ' ago';
		} else if (diffHours < 24) {
			return diffHours + ' hour' + (diffHours !== 1 ? 's' : '') + ' ago';
		} 
		return diffDays + ' day' + (diffDays !== 1 ? 's' : '') + ' ago';
		
	}

	function trackPostView() {
		// Track that the current student viewed this announcement
		const pid = ajaxify.data.mainPid;

		if (!pid) {
			return;
		}

		socket.emit('plugins.announcementViewers.logView', { pid: pid }, function (err, data) {
			if (err) {
				console.error('[Viewers] Error logging view:', err);
				return;
			}
			if (data.logged) {
				console.log('[Viewers] View logged successfully');
			} else {
				console.log('[Viewers] View not logged:', data.reason);
			}
		});
	}

	return Viewers;
});