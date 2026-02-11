'use strict';

define('forum/topic/resolve', [], function () {
	const Resolve = {};

	Resolve.init = function () {
		// Only allow admins/moderators to use resolve button
		// Change 1: Comment out so TA groups can interact with button
		// if (!app.user.isAdmin && !app.user.isGlobalMod) {
		// return;
		// }

		// Handle resolve button clicks
		$('[component="topic"]').on('click', '[component="post/resolve"]', function (e) {
			e.preventDefault();

			const $btn = $(this);
			// Change 2: Need the Topic ID for backend plugin.
			const tid = ajaxify.data.tid;

			const currentState = $btn.attr('data-resolved') === 'true';
			const newState = !currentState;

			// Update UI
			updateButtonUI($btn, newState);

			// CHANGE 3: CONNECT TO BACKEND 
			socket.emit('plugins.taResolve.toggle', { tid: tid }, function (err, data) {
				if (err) {
					// If the backend says "You aren't a Admin/TA/GlobalMod", show error
					// Testing
					// console.error('Socket error:', err); 
					app.alertError(err.message);
					
					// Revert the button (turn it back to gray)
					updateButtonUI($btn, !newState);
				} else {
					console.log('Backend confirmed resolve state:', data.isResolved);
				}
			});
		});
	};

	function updateButtonUI($btn, resolved) {
		// Debugging: Check if we are actually finding the elements
		const $icon = $btn.find('i');
		const $text = $btn.find('span');
		
		// Testing
		// console.log('Updating UI...', { 
		// resolved: resolved,
		// hasIcon: $icon.length > 0,
		// hasText: $text.length > 0,
		// });
		
		$btn.attr('data-resolved', resolved);

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