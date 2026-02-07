'use strict';

define('forum/topic/resolve', ['api'], function (api) {
	const Resolve = {};

	Resolve.init = function () {
		// Handle resolve button clicks
		$('[component="topic"]').on('click', '[component="post/resolve"]', function (e) {
			e.preventDefault();
			
			const $btn = $(this);
			const pid = $btn.attr('data-pid');
			const currentState = $btn.attr('data-resolved') === 'true';
			const newState = !currentState;
			
			// For now, just update the UI (API endpoint doesn't exist yet)
			updateButtonUI($btn, newState);
			console.log('Toggled resolve state for post', pid, 'to', newState);
			
			// TODO: Uncomment when backend API is ready
			// api.put(`/posts/${pid}/resolve`, { resolved: newState })
			// 	.then(() => {
			// 		updateButtonUI($btn, newState);
			// 	})
			// 	.catch((err) => {
			// 		console.error('Error toggling resolve state:', err);
			// 		app.alertError('Failed to update resolve status');
			// 	});
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