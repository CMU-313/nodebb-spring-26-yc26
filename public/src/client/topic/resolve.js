'use strict';

define('forum/topic/resolve', [], function () {
	const Resolve = {};

	Resolve.init = function () {
		// Only allow admins/moderators to use resolve button
		if (!app.user.isAdmin && !app.user.isGlobalMod) {
			return;
		}

		// Handle resolve button clicks
		$('[component="topic"]').on('click', '[component="post/resolve"]', function (e) {
			e.preventDefault();

			const $btn = $(this);
			const pid = $btn.attr('data-pid');
			const currentState = $btn.attr('data-resolved') === 'true';
			const newState = !currentState;

			// Update UI
			updateButtonUI($btn, newState);
			console.log('Toggled resolve state for post', pid, 'to', newState);
		});
	};

	function updateButtonUI($btn, resolved) {
		$btn.attr('data-resolved', resolved);

		const $icon = $btn.find('i');
		const $text = $btn.find('span');

		if (resolved) {
			// Mark as resolved - green checkmark
			$btn.addClass('resolved');
			$icon.removeClass('fa-circle-o text-muted').addClass('fa-check-circle text-success');
			if ($text.length) {
				$text.text('Resolved');
			}
			$btn.attr('title', 'Mark as Unresolved');
		} else {
			// Mark as unresolved - gray circle
			$btn.removeClass('resolved');
			$icon.removeClass('fa-check-circle text-success').addClass('fa-circle-o text-muted');
			if ($text.length) {
				$text.text('Unresolved');
			}
			$btn.attr('title', 'Mark as Resolved');
		}
	}

	return Resolve;
});