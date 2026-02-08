'use strict';

define('forum/topic/approve', [], function () {
	const Approve = {};

	Approve.init = function () {
		// Only admins / global mods
		if (!app.user.isAdmin && !app.user.isGlobalMod) {
			return;
		}
		// Clean up approve button on every page navigation (SPA-safe)
		$(window).on('action:ajaxify.start', function () {
			$('[component="post/approve-answer"]').closest('li').remove();
		});

		// Add approve menu item when post menu is shown
		$(document).on('shown.bs.dropdown', '[component="post/tools"]', function () {
			const cid = ajaxify.data.cid;
			const $dropdown = $(this);
			const $menu = $dropdown.find('.dropdown-menu');

			// ALWAYS remove first (SPA-safe)
			$menu.find('[component="post/approve-answer"]').closest('li').remove();

			// Only add for allowed categories
			if (!ALLOWED_CIDS.includes(cid)) {
				return;
			}

			const $post = $dropdown.closest('[component="post"]');
			const postIndex = parseInt($post.attr('data-index'), 10);

			if (postIndex === 0) {
				return;
			}

			const approved = $post.attr('data-approved') === 'true';
			const text = approved ? 'Unapprove answer' : 'Approve answer';

			const menuItem = $(`
				<li>
					<a class="dropdown-item d-flex align-items-center gap-2"
					component="post/approve-answer"
					href="#">
						<i class="fa fa-fw fa-check-circle text-secondary"></i>
						<span>${text}</span>
					</a>
				</li>
			`);

			$menu.find('li').first().after(menuItem);
		});


		// Handle approve clicks
		$(document).on('click', '[component="post/approve-answer"]', function (e) {
			e.preventDefault();

			// Safety check again
			if (ajaxify.data.cid !== 4) {
				return;
			}

			const $link = $(this);
			const $post = $link.closest('[component="post"]');
			const approved = $post.attr('data-approved') === 'true';

			updateApproveUI($post, !approved);

			$link.closest('.dropdown')
				.find('[data-bs-toggle="dropdown"]')
				.dropdown('hide');
		});

		// Clean up when navigating away from cid 4
		$(window).on('action:ajaxify.end', function () {
			if (ajaxify.data.cid !== 4) {
				$('[component="post/approve-answer"]').closest('li').remove();
			}
		});
	};


	function updateApproveUI($post, approved) {
		$post.attr('data-approved', approved);

		// Update menu item
		const $menuLink = $post.find('[component="post/approve-answer"]');
		const $icon = $menuLink.find('[component="post/approve-icon"]');
		const $text = $menuLink.find('[component="post/approve-text"]');

		$menuLink.attr('data-approved', approved);

		if (approved) {
			// Update menu to show "Remove approval"
			$icon.removeClass('fa-check-circle text-secondary').addClass('fa-times-circle text-danger');
			$text.text('Remove approval');

			// Add badge to post header if it doesn't exist
			const $postHeader = $post.find('.post-header .d-flex.gap-1.flex-wrap');
			if (!$postHeader.find('.badge.bg-success').length) {
				const badge = $('<span class="badge bg-success text-white d-inline-flex align-items-center gap-1" title="This answer has been approved by an instructor"><i class="fa fa-check-circle"></i><span class="d-none d-md-inline">Supported by instructor</span></span>');
				$postHeader.find('a.fw-bold').after(badge);
			}
		} else {
			// Update menu to show "Approve answer"
			$icon.removeClass('fa-times-circle text-danger').addClass('fa-check-circle text-secondary');
			$text.text('Approve answer');

			// Remove badge from post header
			$post.find('.badge.bg-success').remove();
		}
	}

	return Approve;
});