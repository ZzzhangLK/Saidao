(function () {
    'use strict';
    const trigger = document.getElementById('pollsOpen');
    if (!trigger) return;
    const dialog = document.createElement('dialog');
    dialog.className = 'poll-dialog';
    dialog.setAttribute('aria-labelledby', 'pollTitle');
    dialog.innerHTML = `<header class="poll-header"><i class="fas fa-square-poll-vertical poll-icon" aria-hidden="true"></i>
        <h2 id="pollTitle">红蓝掰头</h2><button id="pollCreateToggle" type="button" hidden>＋ 发起掰头</button>
        <button id="pollClose" type="button" aria-label="关闭掰头">×</button></header>
        <div class="poll-status" id="pollStatus" role="status" aria-live="polite"></div>
        <div class="poll-body"><main class="poll-main" id="pollMain"></main>
        <aside class="poll-history"><details id="pollHistoryPanel"><summary>掰头列表</summary><div class="poll-history-list" id="pollHistory"></div></details></aside></div>`;
    document.body.append(dialog);
    const byId = id => document.getElementById(id);
    const node = (tag, className, text) => {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (text !== undefined) el.textContent = text;
        return el;
    };
    let data = null, selectedId = null, creating = false, pending = false, flight = null;
    let refreshAgain = false, lastFocus = null, clockOffset = 0;
    let activeDeadlines = [];
    let quotaRefreshRequested = null;
    const selections = new Map();
    const mobileHistory = window.matchMedia('(max-width: 768px)');
    const historyPanel = byId('pollHistoryPanel');
    historyPanel.open = !mobileHistory.matches;
    mobileHistory.addEventListener('change', () => { historyPanel.open = !mobileHistory.matches; });
    const plain = value => window.ChatQuoteUtils.plainText(String(value ?? ''));
    const now = () => Date.now() + clockOffset;
    const active = poll => !!poll?.active && new Date(poll.endsAt).getTime() > now();
    const currentPolls = () => data?.activePolls ?? (data?.current ? [data.current] : []);
    const allPolls = () => data ? [...currentPolls(), ...data.recent] : [];
    const duration = seconds => Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
    const date = value => new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
    function status(message = '', error = false) {
        byId('pollStatus').textContent = message;
        byId('pollStatus').classList.toggle('is-error', error);
    }
    function unwrap(response) {
        if (String(response?.code) !== '0') throw new Error(response?.message || '请求失败，请重试');
        return response.data;
    }
    function tick() {
        const remaining = activeDeadlines.map(value => new Date(value).getTime() - now()).filter(value => value > 0);
        const badge = byId('pollsBadge');
        badge.hidden = !remaining.length;
        badge.textContent = remaining.length ? duration(Math.ceil(Math.min(...remaining) / 1000)) : '';
        badge.title = remaining.length ? '最近一场掰头将在 ' + badge.textContent + ' 后结束' : '';
        if (!dialog.open) return;
        if (data?.quotaResetsAt && Date.parse(data.quotaResetsAt) <= now() && quotaRefreshRequested !== data.quotaResetsAt) {
            quotaRefreshRequested = data.quotaResetsAt; refresh();
        }
        const countdown = byId('pollCountdown');
        if (!countdown) return;
        const poll = allPolls().find(p => p.id === selectedId);
        if (!poll) return;
        const seconds = Math.max(0, Math.ceil((new Date(poll.endsAt).getTime() - now()) / 1000));
        countdown.textContent = seconds ? `剩余 ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : '掰头已结束';
        if (!seconds && poll.active && countdown.dataset.expired !== 'true') {
            if (!pending) status();
            countdown.dataset.expired = 'true';
            const submit = byId('pollSubmit');
            if (submit) submit.disabled = true;
            dialog.querySelectorAll('.battle-side input').forEach(input => { input.disabled = true; });
            refresh();
        }
    }
    async function refresh() {
        // WebSocket notifications update the closed button without loading the
        // full poll page; only an open dialog needs the list request.
        if (document.hidden || !dialog.open) return;
        if (flight) { refreshAgain = true; return flight; }
        flight = (async () => {
            try {
                const result = unwrap(await window.ApiEndpoints.chatPolls());
                data = result;
                activeDeadlines = currentPolls().map(poll => poll.endsAt);
                clockOffset = new Date(result.serverTime).getTime() - Date.now();
                if (!pending && !allPolls().some(p => p.id === selectedId)) selectedId = result.current?.id ?? result.recent[0]?.id ?? null;
                if (!result.canCreate) creating = false;
                tick();
                if (dialog.open) {
                    if (!pending) render();
                    if (byId('pollStatus').dataset.loadError === 'true') status();
                    delete byId('pollStatus').dataset.loadError;
                }
            } catch (error) {
                if (dialog.open) {
                    status(`掰头加载失败：${error.message}，可点击刷新重试。`, true);
                    byId('pollStatus').dataset.loadError = 'true';
                    if (!data) {
                        const retry = node('button', 'poll-primary', '刷新掰头');
                        retry.type = 'button'; retry.onclick = refresh;
                        byId('pollMain').replaceChildren(retry);
                    }
                }
            }
        })();
        await flight;
        flight = null;
        if (refreshAgain) { refreshAgain = false; return refresh(); }
    }
    function handleUpdate(update) {
        if (!update || update.type !== 'pollUpdate') return;
        const serverTime = Date.parse(update.serverTime);
        if (Number.isFinite(serverTime)) clockOffset = serverTime - Date.now();
        if (typeof update.active === 'boolean' && update.endsAt) {
            activeDeadlines = update.active ? [update.endsAt] : [];
            tick();
        }
        if (dialog.open) refresh();
    }
    function render() {
        const toggle = byId('pollCreateToggle');
        toggle.hidden = false;
        const atCapacity = currentPolls().filter(active).length >= 1;
        toggle.disabled = pending;
        toggle.textContent = creating ? '返回掰头' : '＋ 发起掰头';
        toggle.title = atCapacity ? '已有一场进行中，请等待结束' : '登录且未被封禁可发起，每天限一次';
        renderHistory();
        if (creating) {
            if (!byId('pollCreateForm')) renderCreate();
            updateCreateQuota();
            return;
        }
        const poll = allPolls().find(p => p.id === selectedId);
        const main = byId('pollMain');
        const focused = document.activeElement;
        const focusedChoice = focused?.matches('.battle-side input') ? focused.value : null;
        const focusedSubmit = focused?.id === 'pollSubmit';
        main.replaceChildren();
        if (!poll) {
            const empty = node('div', 'poll-empty');
            empty.append(node('h3', '', '现在还没有掰头'), node('p', 'poll-help', data.canCreate ? '发起一个话题，让聊天室一起选。' : '有新掰头时，入口会显示结束倒计时。'));
            main.append(empty); return;
        }
        const isActive = active(poll), voted = poll.myOptions.length > 0;
        const eyebrow = node('div', 'poll-eyebrow');
        eyebrow.append(node('span', 'poll-state' + (isActive ? '' : ' is-ended'), isActive ? '进行中' : '已结束'), node('span', '', '红蓝对决 · 单选'));
        if (isActive) { const timer = node('span'); timer.id = 'pollCountdown'; eyebrow.append(timer); }
        else eyebrow.append(node('span', '', date(poll.endsAt)));
        eyebrow.append(node('span', 'battle-creator', '发起人：' + plain(poll.creatorName || (poll.creatorId ? '用户 #' + poll.creatorId : '未知发起人'))));
        main.append(eyebrow, node('h3', 'poll-question', plain(poll.question)), node('p', 'poll-help', voted ? '你已参与，下方标记了你的选择。' : isActive ? '选择你支持的一方，每人只能提交一次；站队后可查看双方比例。' : '掰头已结束，感谢每一份选择。'));
        const choices = node('div', 'poll-choices battle-choices');
        const chosen = selections.get(poll.id) || new Set();
        const results = voted || !isActive;
        const showProgress = results && poll.resultsVisible !== false && Array.isArray(poll.counts);
        const redPercent = showProgress && poll.totalVoters ? Math.round(1000 * poll.counts[0] / poll.totalVoters) / 10 : 0;
        const percentages = [redPercent, poll.totalVoters ? Math.round(1000 - redPercent * 10) / 10 : 0];
        poll.options.slice(0, 2).forEach((option, index) => {
            const mine = poll.myOptions.includes(index);
            const label = node('label', 'battle-side ' + (index === 0 ? 'battle-red' : 'battle-blue') + (mine ? ' is-mine' : ''));
            const check = document.createElement('input'); check.type = 'radio'; check.name = 'poll-option'; check.value = String(index);
            check.checked = voted ? mine : chosen.has(index); check.disabled = results || pending;
            check.addEventListener('change', () => {
                chosen.clear(); chosen.add(index); selections.set(poll.id, chosen);
                byId('pollSubmit').disabled = pending || !active(poll);
            });
            const indicator = node('span', 'battle-choice-indicator', '✓'); indicator.setAttribute('aria-hidden', 'true');
            label.append(check, indicator, node('span', 'battle-side-name', index === 0 ? '红方' : '蓝方'));
            label.append(node('strong', 'battle-option-text', plain(option)));
            if (showProgress) label.append(node('small', '', percentages[index] + '%' + (mine ? ' · 已支持' : '')));
            else if (mine) label.append(node('small', '', '已支持'));
            choices.append(label);
        });
        const versus = node('div', 'battle-score');
        const redBar = node('span', 'battle-red-bar');
        redBar.style.width = (showProgress && poll.totalVoters ? Math.max(0, Math.min(100, poll.counts[0] / poll.totalVoters * 100)) : 50) + '%';
        versus.append(redBar);
        const footer = node('div', 'poll-footer');
        footer.append(node('small', '', `${poll.totalVoters} 人参与`));
        if (!results) {
            const submit = node('button', 'poll-primary', pending ? '提交中…' : '确认站队');
            submit.type = 'button'; submit.id = 'pollSubmit'; submit.disabled = pending || !chosen.size;
            submit.onclick = () => vote(poll.id, Array.from(chosen));
            footer.append(submit);
        }
        main.append(choices);
        if (showProgress) main.append(versus);
        main.append(footer);
        tick();
        if (focusedChoice !== null) main.querySelector(`input[value="${focusedChoice}"]`)?.focus({ preventScroll: true });
        if (focusedSubmit) byId('pollSubmit')?.focus({ preventScroll: true });
    }
    function renderHistory() {
        const history = byId('pollHistory');
        const focusedId = history.contains(document.activeElement) ? document.activeElement.dataset.pollId : null;
        history.replaceChildren();
        history.append(node('h3', 'poll-history-heading', '进行中 · ' + currentPolls().filter(active).length + '/1'));
        allPolls().forEach((poll, index) => {
            if (index === currentPolls().length) history.append(node('h3', '', '最近 10 场结果'));
            const button = node('button'); button.type = 'button'; button.dataset.pollId = String(poll.id);
            button.disabled = pending;
            button.setAttribute('aria-pressed', String(!creating && poll.id === selectedId));
            const meta = node('div', 'poll-history-meta');
            meta.append(node('span', 'poll-state' + (active(poll) ? '' : ' is-ended'), active(poll) ? '进行中' : '已结束'),
                node('small', '', (active(poll) ? '' : date(poll.endsAt) + ' · ') + poll.totalVoters + ' 人参与'));
            button.append(node('strong', '', plain(poll.question)), meta);
            button.onclick = () => { creating = false; selectedId = poll.id; status(); render(); if (mobileHistory.matches) historyPanel.open = false; };
            history.append(button);
        });
        if (!allPolls().length) history.append(node('p', 'poll-help', '暂无掰头记录'));
        if (focusedId) history.querySelector(`[data-poll-id="${focusedId}"]`)?.focus({ preventScroll: true });
    }
    async function vote(id, choices) {
        if (pending) return;
        pending = true; status(); render();
        try {
            unwrap(await window.ApiEndpoints.voteChatPoll(id, choices));
            selections.delete(id); status('站队成功，掰头期间发言将显示你的阵营。');
        } catch (error) { status(error.message, true); }
        finally { await refresh(); pending = false; if (dialog.open && data) render(); }
    }
    function updateCreateQuota() {
        const label = byId('battleCreateQuota');
        if (!label) return;
        const remaining = data?.remainingCreates;
        label.textContent = '今日剩余发起次数：' + (Number.isInteger(remaining) ? remaining + ' / 1' : '加载中…') + ' · 每天北京时间 00:00 刷新';
        const submit = byId('battleCreateSubmit');
        submit.disabled = pending || !data?.canCreate || remaining !== 1;
        submit.textContent = pending ? '发起中…' : remaining === 0 ? '今日次数已用完' : '发起掰头';
    }
    function renderCreate() {
        const main = byId('pollMain');
        main.innerHTML = `<form class="poll-create" id="pollCreateForm"><p class="poll-help battle-create-quota" id="battleCreateQuota" role="status"></p>
            <label>掰头标题<textarea name="question" required maxlength="100" placeholder="这件事，你站哪一边？"></textarea></label>
            <label class="battle-red">红方观点<input name="redOption" required maxlength="20" placeholder="红方支持什么？"></label>
            <label class="battle-blue">蓝方观点<input name="blueOption" required maxlength="20" placeholder="蓝方支持什么？"></label>
            <label>持续时长<select name="durationMinutes"><option value="5">5 分钟</option><option value="10">10 分钟</option><option value="30">30 分钟</option></select></label>
            <p class="poll-help" style="margin:0">登录且未被封禁可发起。同一账号、IP 或设备每天仅可发起一次；全局同时只能进行一场。</p>
            <button class="poll-primary" id="battleCreateSubmit" type="submit">发起掰头</button></form>`;
        byId('pollCreateForm').onsubmit = async event => {
            event.preventDefault(); if (pending) return;
            if (data?.remainingCreates !== 1) { window.Toast.show('今日发起次数已用完，每天北京时间 00:00 刷新', 'warning'); return; }
            const form = event.currentTarget;
            const input = { question: form.elements.question.value.trim(), options: [form.elements.redOption.value.trim(), form.elements.blueOption.value.trim()], durationMinutes: Number(form.elements.durationMinutes.value), multiple: false };
            if (!input.question || input.options.some(s => !s) || new Set(input.options).size !== input.options.length) {
                status('内容和选项不能为空，选项不能重复。', true); return;
            }
            pending = true; status();
            form.querySelectorAll('button, input, textarea, select').forEach(el => { el.disabled = true; });
            byId('pollCreateToggle').disabled = true;
            try {
                selectedId = unwrap(await window.ApiEndpoints.createChatPoll(input));
                creating = false; status('掰头已发起，聊天室即将收到通知。');
            } catch (error) { status(error.message, true); }
            finally {
                await refresh();
                pending = false;
                form.querySelectorAll('button, input, textarea, select').forEach(el => { el.disabled = false; });
                if (dialog.open && data) render();
            }
        };
    }
    async function open(id) {
        if (id) { selectedId = id; creating = false; }
        if (!dialog.open) {
            if (!pending) status();
            historyPanel.open = !mobileHistory.matches;
            lastFocus = document.activeElement;
            dialog.showModal(); trigger.setAttribute('aria-expanded', 'true'); byId('pollClose').focus();
        }
        if (data) render(); else status('正在加载掰头…');
        await refresh();
        if (id && data && !allPolls().some(poll => poll.id === id)) status('这场掰头已不在最近 10 场记录中，当前显示最新掰头。');
        if (byId('pollStatus').textContent === '正在加载掰头…') status();
    }
    trigger.addEventListener('click', () => open());
    byId('pollClose').onclick = () => dialog.close();
    byId('pollCreateToggle').onclick = () => {
        if (pending) return;
        if (!creating && currentPolls().some(active)) {
            status();
            window.Toast.show('当前掰头正在进行，请等待结束后再发起。', 'warning');
            return;
        }
        if (!creating && !data?.canCreate) { status('请登录未被封禁的账号后发起掰头。', true); return; }
        creating = !creating; status(); render();
        if (creating) byId('pollCreateForm').elements.question.focus();
    };
    dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
    dialog.addEventListener('close', () => { trigger.setAttribute('aria-expanded', 'false'); lastFocus?.focus({ preventScroll: true }); });
    document.addEventListener('click', event => { const button = event.target.closest('.poll-chat-link[data-poll-id]'); if (button) open(Number(button.dataset.pollId)); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && dialog.open) refresh(); });
    let ticker;
    function startTimers() { clearInterval(ticker); ticker = setInterval(tick, 1000); }
    window.addEventListener('pagehide', () => { clearInterval(ticker); });
    window.addEventListener('pageshow', event => { if (event.persisted) startTimers(); });
    window.ChatPolls = { open, refresh, handleUpdate };
    // 掰头状态由聊天室的 pollUpdate WebSocket 消息触发 refresh；这里只负责本地倒计时。
    startTimers();
})();
