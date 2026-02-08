'use strict';

define('forum/topic/resolve', [], function () {
	const Resolve = {};

	Resolve.init = function () {
		// Only allow admins/moderators to use resolve button
		if (!app.user.isAdmin && !app.user.isGlobalMod) {
			return;
		}

		// Sort posts on page load (admins only)
		sortPostsByResolvedState();

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

			// Re-sort posts after toggle
			setTimeout(() => {
				sortPostsByResolvedState();
			}, 100);
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

	function sortPostsByResolvedState() {
		// Only sort for admins/moderators
		if (!app.user.isAdmin && !app.user.isGlobalMod) {
			console.log('Not admin/mod, skipping sort');
			return;
		}

		console.log('Starting sort...');
		const $postsContainer = $('[component="topic"]');
		console.log('Posts container:', $postsContainer.length);
		
		const $posts = $postsContainer.find('> [component="post"]');
		console.log('Found posts:', $posts.length);

		// Separate resolved and unresolved posts
		const unresolvedPosts = [];
		const resolvedPosts = [];

		$posts.each(function (index) {
			const $post = $(this);
			const $resolveBtn = $post.find('[component="post/resolve"]');
			const isResolved = $resolveBtn.attr('data-resolved') === 'true';
			
			console.log('Post', index, '- has button:', $resolveBtn.length, ', resolved:', isResolved);

			if ($resolveBtn.length && isResolved) {
				resolvedPosts.push($post);
			} else {
				unresolvedPosts.push($post);
			}
		});

		console.log('Unresolved:', unresolvedPosts.length, 'Resolved:', resolvedPosts.length);

		// Re-append posts: unresolved first, then resolved
		unresolvedPosts.forEach($post => $postsContainer.append($post));
		resolvedPosts.forEach($post => $postsContainer.append($post));

		console.log('Sorting complete!');
	}

	return Resolve;
});