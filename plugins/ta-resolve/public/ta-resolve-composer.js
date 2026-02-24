'use strict';

(function () {
	window.__taResolveComposerAnonymous = false;

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
		wrapper.className = 'd-flex align-items-center gap-2';
		wrapper.innerHTML = '<label class="mb-0 small text-muted">Post as:</label>' +
			'<select data-component="composer-anonymous-toggle" class="form-select form-select-sm" style="width: auto;">' +
			'<option value="named">Show my name</option>' +
			'<option value="anonymous">Post anonymously</option>' +
			'</select>';
		btnRow.insertBefore(wrapper, btnRow.firstChild);
	}

	function init() {
		if (typeof require === 'undefined') {
			return;
		}
		require(['hooks'], function (hooks) {
			hooks.on('filter:composer.quickreply.data', function (replyData) {
				const container = document.querySelector('[component="topic/quickreply/container"]');
				if (container) {
					const select = container.querySelector('[data-component="composer-anonymous-toggle"]');
					if (select && select.value === 'anonymous') {
						replyData.data = replyData.data || {};
						replyData.data.isAnonymous = true;
					}
				}
				return replyData;
			});

			hooks.on('action:ajaxify.end', function () {
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

			hooks.on('filter:api.options', function (payload) {
				if (!payload || !payload.options) {
					return payload;
				}
				const options = payload.options;
				if (options.method !== 'POST' || !options.url || options.url.indexOf('/topics') === -1) {
					return payload;
				}
				if (window.__taResolveComposerAnonymous && options.data) {
					try {
						const body = typeof options.data === 'string' ? JSON.parse(options.data) : options.data;
						body.data = body.data || {};
						body.data.isAnonymous = true;
						options.data = typeof payload.options.data === 'string' ? JSON.stringify(body) : body;
					} catch (e) {
						// ignore
					}
				}
				return payload;
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
