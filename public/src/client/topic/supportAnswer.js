'use strict';

define('forum/topic/supportAnswer', [
	'hooks',
	'alerts',
	'components',
], function (hooks, alerts, components) {
	const SupportAnswer = {};
	const BADGE_HTML = '<span class="badge bg-success rounded-1 supported-by-instructor-badge">Supported by Instructor</span>';

	function getPidFromButton(button) {
		return button.parents('[data-pid]').attr('data-pid');
	}

	function showBadgeOnPost(pid) {
		const postEl = components.get('post', 'pid', pid);
		if (!postEl.length) {
			return;
		}
		const header = postEl.find('.post-header .d-flex.gap-1.flex-wrap');
		if (header.find('.supported-by-instructor-badge').length) {
			return;
		}
		header.append(BADGE_HTML);
	}

	function hideBadgeOnPost(pid) {
		const postEl = components.get('post', 'pid', pid);
		postEl.find('.supported-by-instructor-badge').remove();
	}

	function invalidatePostMenu(pid) {
		const postEl = components.get('post', 'pid', pid);
		postEl.find('[component="post/tools"] .dropdown-menu')
			.removeAttr('data-loaded').html('');
	}

	SupportAnswer.init = function () {
		const container = components.get('topic');
		if (!container.length) {
			return;
		}

		container.off('click.supportAnswer', '[component="post/support-answer"]');
		container.on('click.supportAnswer', '[component="post/support-answer"]', function (e) {
			e.preventDefault();
			const pid = getPidFromButton($(this));
			if (!pid) {
				return;
			}
			socket.emit('plugins.taResolve.supportAnswer', { pid: pid }, function (err, data) {
				if (err) {
					return alerts.error(err.message || err);
				}
				if (data && data.supportedByInstructor === 1) {
					showBadgeOnPost(pid);
					invalidatePostMenu(pid);
				}
			});
		});

		container.off('click.supportAnswer', '[component="post/remove-support"]');
		container.on('click.supportAnswer', '[component="post/remove-support"]', function (e) {
			e.preventDefault();
			const pid = getPidFromButton($(this));
			if (!pid) {
				return;
			}
			socket.emit('plugins.taResolve.removeSupport', { pid: pid }, function (err, data) {
				if (err) {
					return alerts.error(err.message || err);
				}
				if (data && data.supportedByInstructor === 0) {
					hideBadgeOnPost(pid);
					invalidatePostMenu(pid);
				}
			});
		});
	};

	return SupportAnswer;
});
