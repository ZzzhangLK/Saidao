(function () {
    'use strict';
    const root = document.getElementById('chatMoments');
    if (!root) return;
    const byId = (id) => document.getElementById(id);
    const sidebar = byId('chatSidebar');
    const time = (value) => new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
    let snapshot = null;
    let selected = null;
    let loading = false;
    let generation = 0;
    let lastFocus = null;

    function close() {
        root.hidden = true;
        byId('momentsOpen').setAttribute('aria-expanded', 'false');
        lastFocus?.focus({ preventScroll: true });
    }

    function render(data) {
        snapshot = data;
        const list = byId('momentsTopics');
        list.replaceChildren();
        const segments = data.segments || [];
        byId('momentsRange').textContent = data.start && data.end ? `${time(data.start)}-${time(data.end)} · 近 2 小时` : '近 2 小时';
        segments.forEach((segment) => {
            const item = document.createElement('li');
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'moments-topic';
            button.dataset.start = segment.start;
            const date = document.createElement('span');
            date.className = 'moment-date';
            date.textContent = `${time(segment.start)}-${time(segment.end)}`;
            const title = document.createElement('strong');
            title.textContent = segment.title;
            const summary = document.createElement('p');
            summary.className = 'moment-summary';
            summary.textContent = segment.summary || '';
            button.append(date, title, summary);
            if (Number.isInteger(segment.stats?.messageCount)) {
                const stats = document.createElement('div');
                stats.className = 'moment-stats';
                stats.title = '起止消息之间的时间段统计';
                const count = document.createElement('span');
                count.textContent = `消息 ${segment.stats.messageCount}`;
                stats.append(count);
                button.append(stats);
            }
            button.addEventListener('click', () => {
                if (!window.chatMomentReplay) return;
                close();
                window.chatMomentReplay.open(segment, data);
            });
            item.append(button);
            list.append(item);
        });
        const states = { loading: '时间线尚未生成', unavailable: 'AI 摘要暂不可用', error: '时间线暂不可用', stale: '更新延迟，显示上次生成结果' };
        byId('momentsStatus').textContent = states[data.status] || (segments.length ? '' : '近两小时暂无符合条件的话题');
        select(selected);
    }

    function select(start) {
        selected = start;
        root.querySelectorAll('[data-start]').forEach((button) => {
            const active = !!start && button.dataset.start === start;
            button.classList.toggle('is-selected', active);
            button.setAttribute('aria-pressed', String(active));
        });
    }

    async function refresh() {
        if (root.hidden || document.hidden || sidebar.classList.contains('collapsed')) return;
        const version = ++generation;
        loading = true;
        if (!snapshot) byId('momentsStatus').textContent = '时间线加载中';
        try {
            const result = await window.ApiEndpoints.chatMoments();
            if (String(result.code) !== '0' || !result.data) throw new Error('Invalid timeline');
            if (version === generation) render(result.data);
        } catch (error) {
            if (version === generation) byId('momentsStatus').textContent = '时间线加载失败';
        } finally {
            if (version === generation) loading = false;
        }
    }

    byId('momentsOpen').addEventListener('click', () => {
        lastFocus = document.activeElement;
        root.hidden = false;
        byId('momentsOpen').setAttribute('aria-expanded', 'true');
        byId('momentsClose').focus();
        refresh();
    });
    byId('momentsClose').addEventListener('click', close);
    root.addEventListener('click', (event) => { if (event.target === root) close(); });
    root.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
        if (event.key !== 'Tab') return;
        const buttons = Array.from(root.querySelectorAll('button:not(:disabled)'));
        const first = buttons[0];
        const last = buttons.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    byId('chatReplayBefore').addEventListener('click', () => window.chatMomentReplay?.page('before'));
    byId('chatReplayAfter').addEventListener('click', () => window.chatMomentReplay?.page('after'));
    byId('chatReplayLatest').addEventListener('click', () => window.chatMomentReplay?.latest());
    new MutationObserver(() => { if (sidebar.classList.contains('collapsed')) close(); })
        .observe(sidebar, { attributes: true, attributeFilter: ['class'] });
    const resize = new ResizeObserver(() => {
        sidebar.style.setProperty('--moments-header-height', `${sidebar.querySelector('.chat-header').offsetHeight}px`);
    });
    resize.observe(sidebar.querySelector('.chat-header'));
    const poll = () => { if (!loading) refresh(); };
    let timer = setInterval(poll, 60000);
    window.addEventListener('pagehide', () => clearInterval(timer));
    window.addEventListener('pageshow', (event) => { if (event.persisted) { timer = setInterval(poll, 60000); refresh(); } });
    window.ChatMoments = {
        select,
        invalidate() {
            generation++;
            loading = false;
            snapshot = null;
            render({ status: 'loading', buckets: [], segments: [] });
            refresh();
        }
    };
})();
