'use strict';

(function () {
	window.__taResolveComposerAnonymous = false;
	window.__taResolveQuickReplyAnonymous = false;

	function injectFullComposerDropdown(container) {
		if (!container || !container.length) {
			return;
		}
		if (container.find('[data-component="composer-anonymous-toggle"]').length) {
			return;
		}
		const $container = container.jquery ? container : $(container);
		const row = $('<div class="d-flex align-items-center gap-2 mb-2"></div>');
		row.html('<label class="mb-0 small text-muted">Post as:</label>' +
			'<select data-component="composer-anonymous-toggle" class="form-select form-select-sm" style="width: auto;">' +
			'<option value="named">Show my name</option>' +
			'<option value="anonymous">Post anonymously</option>' +
			'</select>');
		row.find('select').on('change', function () {
			window.__taResolveComposerAnonymous = this.value === 'anonymous';
		});
		$container.find('.composer-body').prepend(row).length || $container.prepend(row);
	}

	function injectQuickReplyDropdown() {
		const container = document.querySelector('[component="topic/quickreply/container"]');
		if (!container || container.querySelector('[data-component="composer-anonymous-toggle"]')) {
			return;
		}
		const noscriptRow = container.querySelector('[data-component="composer-anonymous-noscript"]');
		if (noscriptRow) {
			noscriptRow.classList.add('d-none');
		}
		const btnRow = container.querySelector('.d-flex.justify-content-end.gap-2');
		if (!btnRow) {
			return;
		}
		const wrapper = document.createElement('div');
		wrapper.className = 'dropdown';
		wrapper.setAttribute('data-component', 'composer-anonymous-toggle');
		wrapper.innerHTML =
			'<button class="btn btn-sm btn-ghost border dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">' +
			'<span data-component="composer-anonymous-toggle-label">Post as: Show my name</span>' +
			'</button>' +
			'<ul class="dropdown-menu dropdown-menu-end">' +
			'<li><button type="button" class="dropdown-item active" data-anonymous="0">Show my name</button></li>' +
			'<li><button type="button" class="dropdown-item" data-anonymous="1">Post anonymously</button></li>' +
			'</ul>';

		wrapper.querySelectorAll('.dropdown-item').forEach((item) => {
			item.addEventListener('click', function () {
				const isAnonymous = this.getAttribute('data-anonymous') === '1';
				window.__taResolveQuickReplyAnonymous = isAnonymous;
				const label = wrapper.querySelector('[data-component="composer-anonymous-toggle-label"]');
				if (label) {
					label.textContent = `Post as: ${isAnonymous ? 'Post anonymously' : 'Show my name'}`;
				}
				wrapper.querySelectorAll('.dropdown-item').forEach((btn) => {
					btn.classList.remove('active');
				});
				this.classList.add('active');
			});
		});

		btnRow.insertBefore(wrapper, btnRow.firstChild);
	}

	function init() {
		if (typeof require === 'undefined') {
			return;
		}
		require(['hooks'], function (hooks) {
			hooks.on('filter:composer.quickreply.data', function (replyData) {
				if (window.__taResolveQuickReplyAnonymous) {
					replyData.data = replyData.data || {};
					replyData.data.isAnonymous = true;
				}
				return replyData;
			});

			hooks.on('filter:composer.submit', function (submitData) {
				if (!submitData || !submitData.composerEl || !submitData.composerData) {
					return submitData;
				}
				if (submitData.action !== 'topics.post' && submitData.action !== 'posts.reply') {
					return submitData;
				}

				const select = submitData.composerEl.find('[data-component="composer-anonymous-toggle"]');
				if (select && select.length && select.val() === 'anonymous') {
					submitData.composerData.isAnonymous = true;
				}

				return submitData;
			});

			hooks.on('action:ajaxify.end', function () {
				window.__taResolveQuickReplyAnonymous = false;
				if (typeof ajaxify !== 'undefined' && ajaxify.data && ajaxify.data.template && ajaxify.data.template.topic) {
					injectQuickReplyDropdown();
				}
			});

			hooks.on('action:composer.enhance', function (data) {
				window.__taResolveComposerAnonymous = false;
				if (data && data.container) {
					injectFullComposerDropdown(data.container);
				}
			});
		});
	}

	if (typeof window !== 'undefined') {
		if (document.readyState === 'loading') {
			document.addEventListener('DOMContentLoaded', init);
		} else {
			init();
		}
	}
}());
