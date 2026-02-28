'use strict';

define('forum/topic/supportAnswer', [
	'hooks',
	'alerts',
	'components',
	'api',
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
		if (!header.length) {
			return;
		}
		// Remove any existing badges first
		header.find('.supported-by-instructor-badge').remove();
		// Add the badge
		header.append(BADGE_HTML);
	}

	function hideBadgeOnPost(pid) {
		const postEl = components.get('post', 'pid', pid);
		if (postEl.length) {
			postEl.find('.supported-by-instructor-badge').remove();
		}
	}

	function invalidatePostMenu(pid) {
		const postEl = components.get('post', 'pid', pid);
		if (postEl.length) {
			postEl.find('[component="post/tools"] .dropdown-menu')
				.removeAttr('data-loaded').html('');
		}
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
			const button = $(this);
			button.prop('disabled', true);
			
			socket.emit('plugins.taResolve.supportAnswer', { pid: pid }, function (err, data) {
				button.prop('disabled', false);
				
				if (err) {
					return alerts.error(err.message || err);
				}
				
				if (data && data.supportedByInstructor === 1) {
					showBadgeOnPost(pid);
					invalidatePostMenu(pid);
					alerts.success('Post marked as Supported by Instructor');
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
			const button = $(this);
			button.prop('disabled', true);
			
			socket.emit('plugins.taResolve.removeSupport', { pid: pid }, function (err, data) {
				button.prop('disabled', false);
				
				if (err) {
					return alerts.error(err.message || err);
				}
				
				if (data && data.supportedByInstructor === 0) {
					hideBadgeOnPost(pid);
					invalidatePostMenu(pid);
					alerts.success('Support removed from post');
				}
			});
		});
	};

	return SupportAnswer;
});
