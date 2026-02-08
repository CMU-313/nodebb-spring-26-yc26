'use strict';

define('forum/topic/approve', [], function () {
	const Approve = {};

	Approve.init = function () {
		// Only allow admins/moderators to approve answers
		if (!app.user.isAdmin && !app.user.isGlobalMod) {
			return;
		}

		const cid = ajaxify.data.cid;

		/// Hide approve button if not in category 4
		if (cid !== 4) {
			$('[component="post/approve-answer-container"]').remove();
			return;
		}

		// Only allow admins/moderators to approve answers
		if (!app.user.isAdmin && !app.user.isGlobalMod) {
			$('[component="post/approve-answer-container"]').remove();
			return;
		}

		// Add approve menu item when post menu is shown
		$(document).on('shown.bs.dropdown', '[component="post/tools"]', function () {
			const $dropdown = $(this);
			const $post = $dropdown.closest('[component="post"]');
			const postIndex = parseInt($post.attr('data-index'), 10);

			// Only for reply posts (index > 0)
			if (postIndex === 0) {
				return;
			}

			const $menu = $dropdown.find('.dropdown-menu');
			const approved = $post.attr('data-approved') === 'true';

			// Check if already added
			if ($menu.find('[component="post/approve-answer"]').length) {
				return;
			}

			// Add approve menu item
			const approveText = approved ? 'Unapprove answer' : 'Approve answer';
			const menuItem = $(`
				<li>
					<a class="dropdown-item rounded-1 d-flex align-items-center gap-2" component="post/approve-answer" role="menuitem" href="#">
						<span class="menu-icon"><i class="fa fa-fw text-secondary fa-check-circle"></i></span> ${approveText}
					</a>
				</li>
			`);

			// Add after Edit button
			$menu.find('li').first().after(menuItem);
		});

		// Handle approve button clicks
		$(document).on('click', '[component="post/approve-answer"]', function (e) {
			e.preventDefault();

			const $link = $(this);
			const $post = $link.closest('[component="post"]');
			const pid = $post.attr('data-pid');
			const approved = $post.attr('data-approved') === 'true';
			const newState = !approved;

			// Update UI
			updateApproveUI($post, newState);
			console.log('Toggled approve state for post', pid, 'to', newState);

			// Close dropdown
			$link.closest('.dropdown').find('[data-bs-toggle="dropdown"]').dropdown('hide');
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