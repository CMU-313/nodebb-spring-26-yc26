'use strict';

define('forum/topic/approve', ['socket'], function (socket) {
	const Approve = {};
	const APPROVED_BADGE_CLASS = 'post-approved-badge';

	Approve.init = function () {
		// Only allow admins/moderators to approve answers
		if (!app.user.isAdmin && !app.user.isGlobalMod) {
			return;
		}

		const cid = ajaxify.data.cid;

		// Hide approve button if not in category 4
		if (cid !== 4) {
			$('[component="post/approve-answer-container"]').remove();
			return;
		}

		// Apply approval badge to posts that are already approved (e.g. on page load)
		$('[component="post"][data-approved="true"]').each(function () {
			updateApproveUI($(this), true);
		});

		// Listen for approval changes from other clients
		socket.on('event:post_approved', function (data) {
			if (!data || !data.pid) {
				return;
			}
			const $post = $('[component="post"][data-pid="' + data.pid + '"]');
			if ($post.length) {
				updateApproveUI($post, data.approved);
			}
		});

		// Add approve menu item when post menu is shown (if not already in template)
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

			// Add approve menu item (with components so updateApproveUI can find icon/text)
			const approveText = approved ? 'Unapprove answer' : 'Approve answer';
			const menuItem = $(`
				<li>
					<a class="dropdown-item rounded-1 d-flex align-items-center gap-2" component="post/approve-answer" role="menuitem" href="#" data-approved="${approved}">
						<span class="menu-icon"><i component="post/approve-icon" class="fa fa-fw text-secondary fa-check-circle"></i></span>
						<span component="post/approve-text">${approveText}</span>
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
			const previousState = approved;

			// Optimistic UI update
			updateApproveUI($post, newState);
			$link.closest('.dropdown').find('[data-bs-toggle="dropdown"]').dropdown('hide');

			socket.emit('posts.approveAnswer', { pid: pid, approved: newState }, function (err) {
				if (err) {
					updateApproveUI($post, previousState);
					app.alertError(err.message || '[[error:unknown]]');
				}
			});
		});
	};

	function updateApproveUI($post, approved) {
		$post.attr('data-approved', approved);

		const $menuLink = $post.find('[component="post/approve-answer"]');
		const $icon = $menuLink.find('[component="post/approve-icon"]');
		const $text = $menuLink.find('[component="post/approve-text"]');

		if ($menuLink.length) {
			$menuLink.attr('data-approved', approved);
		}
		if ($icon.length) {
			$icon.removeClass('fa-check-circle text-secondary fa-times-circle text-danger')
				.addClass(approved ? 'fa-times-circle text-danger' : 'fa-check-circle text-secondary');
		}
		if ($text.length) {
			$text.text(approved ? 'Remove approval' : 'Approve answer');
		}

		if (approved) {
			// Add "Supported by instructor" badge if not already present (theme may render it, or we add via JS)
			const approvalBadgeSelector = '.' + APPROVED_BADGE_CLASS + ', .badge.bg-success[title="This answer has been approved by an instructor"]';
			const hasApprovalBadge = $post.find(approvalBadgeSelector).length;
			if (!hasApprovalBadge) {
				const $postHeader = $post.find('.post-header .d-flex.gap-1.flex-wrap');
				if ($postHeader.length) {
					const badge = $('<span class="badge bg-success text-white d-inline-flex align-items-center gap-1 ' + APPROVED_BADGE_CLASS + '" title="This answer has been approved by an instructor"><i class="fa fa-check-circle"></i><span class="d-none d-md-inline">Supported by instructor</span></span>');
					const $anchor = $postHeader.find('a.fw-bold');
					if ($anchor.length) {
						$anchor.after(badge);
					} else {
						$postHeader.prepend(badge);
					}
				}
			}
		} else {
			$post.find('.' + APPROVED_BADGE_CLASS).remove();
			$post.find('.badge.bg-success[title="This answer has been approved by an instructor"]').remove();
		}
	}

	return Approve;
});