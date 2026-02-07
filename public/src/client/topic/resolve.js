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
			
			// Call API to toggle resolve state
			api.put(`/posts/${pid}/resolve`, { resolved: newState })
				.then(() => {
					// Update button UI on success
					updateButtonUI($btn, newState);
				})
				.catch((err) => {
					console.error('Error toggling resolve state:', err);
					app.alertError('Failed to update resolve status');
				});
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
			$text.text('Resolved');
			$btn.attr('title', 'Mark as Unresolved');
		} else {
			// Mark as unresolved - gray circle
			$btn.removeClass('resolved');
			$icon.removeClass('fa-check-circle text-success').addClass('fa-circle-o text-muted');
			$text.text('Unresolved');
			$btn.attr('title', 'Mark as Resolved');
		}
	}

	return Resolve;
});

