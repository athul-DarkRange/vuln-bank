/**
 * ISB practice-environment notice.
 * A small dismissible toast, shown once per browser.
 */
(function () {
    'use strict';

    var KEY = 'isb_notice_ack';

    function acknowledged() {
        try { return !!localStorage.getItem(KEY); } catch (e) { return false; }
    }

    function remember() {
        try { localStorage.setItem(KEY, '1'); } catch (e) { /* storage unavailable */ }
    }

    function build() {
        if (acknowledged() || document.getElementById('isb-notice')) return;

        var style = document.createElement('style');
        style.textContent = [
            '#isb-notice{position:fixed;left:50%;bottom:1.25rem;z-index:3000;width:min(30rem,calc(100vw - 2rem));',
            'transform:translate(-50%,16px);opacity:0;transition:opacity 200ms var(--ease,ease),transform 200ms var(--ease,ease);}',
            '#isb-notice.is-visible{transform:translate(-50%,0);opacity:1;}',
            '#isb-notice .isb-notice-panel{display:flex;align-items:flex-start;gap:0.875rem;padding:1rem 1.125rem;',
            'background:var(--surface,#F8FAF9);color:var(--text-1,#0E1B1A);border:1px solid var(--border-2,#AEBBB6);',
            'border-left:3px solid var(--brass,#A8863A);border-radius:var(--r-md,6px);box-shadow:var(--shadow-lg,0 12px 32px rgba(14,27,26,0.14));',
            'font-family:var(--font-body,system-ui,sans-serif);}',
            '#isb-notice .isb-notice-text{flex:1;font-size:0.9375rem;line-height:1.5;color:var(--text-2,#33433F);}',
            '#isb-notice .isb-notice-title{display:block;font-family:var(--font-display,sans-serif);font-weight:700;color:var(--text-1,#0E1B1A);margin-bottom:0.125rem;}',
            '#isb-notice .isb-notice-btn{flex-shrink:0;min-height:40px;padding:0.5rem 1rem;font:600 0.9375rem var(--font-body,sans-serif);',
            'background:var(--brand,#0F5A52);color:var(--on-brand,#F4FAF8);border:1px solid var(--brand,#0F5A52);border-radius:var(--r-md,6px);cursor:pointer;}',
            '#isb-notice .isb-notice-btn:hover{background:var(--brand-dark,#0B4640);border-color:var(--brand-dark,#0B4640);}',
            '@media (max-width:480px){#isb-notice .isb-notice-panel{flex-direction:column;}#isb-notice .isb-notice-btn{align-self:stretch;min-height:44px;}}'
        ].join('');
        document.head.appendChild(style);

        var box = document.createElement('div');
        box.id = 'isb-notice';
        box.setAttribute('role', 'region');
        box.setAttribute('aria-label', 'Notice');
        box.innerHTML =
            '<div class="isb-notice-panel">' +
                '<div class="isb-notice-text"><span class="isb-notice-title">Practice environment</span>' +
                'ISB is a practice environment. Use made-up details — never real passwords or personal information.</div>' +
                '<button type="button" class="isb-notice-btn">Got it</button>' +
            '</div>';
        document.body.appendChild(box);

        box.querySelector('.isb-notice-btn').addEventListener('click', function () {
            remember();
            box.classList.remove('is-visible');
            setTimeout(function () { box.remove(); }, 220);
        });

        requestAnimationFrame(function () { box.classList.add('is-visible'); });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', build);
    } else {
        build();
    }
})();
