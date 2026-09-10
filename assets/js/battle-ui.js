(function () {
    'use strict';
    let popup = null, owner = null;
    const text = value => window.ChatQuoteUtils.plainText(String(value ?? ''));
    function close() {
        popup?.remove(); popup = null;
        owner?.removeAttribute('aria-describedby'); owner?.setAttribute('aria-expanded', 'false'); owner = null;
    }
    function createBadge(battle) {
        if (!battle || !['red', 'blue'].includes(battle.side)) return null;
        const button = document.createElement('button');
        button.type = 'button'; button.className = `battle-badge battle-${battle.side}`;
        button.title = '';
        button.textContent = battle.side === 'red' ? '红方' : '蓝方';
        button.setAttribute('aria-expanded', 'false');
        button.setAttribute('aria-label', `${button.textContent}：${text(battle.title)}，${text(battle.option)}`);
        const show = () => {
            close(); owner = button;
            popup = document.createElement('div'); popup.className = `battle-tooltip battle-${battle.side}`;
            popup.id = 'battleTooltip'; popup.setAttribute('role', 'tooltip');
            const title = document.createElement('strong'); title.textContent = text(battle.title);
            const option = document.createElement('p'); option.textContent = `${button.textContent} · ${text(battle.option)}`;
            popup.append(title, option); document.body.append(popup);
            const rect = button.getBoundingClientRect();
            popup.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - popup.offsetWidth - 8))}px`;
            popup.style.top = `${Math.max(8, Math.min(rect.bottom + 6, innerHeight - popup.offsetHeight - 8))}px`;
            button.setAttribute('aria-describedby', popup.id); button.setAttribute('aria-expanded', 'true');
        };
        button.addEventListener('mouseenter', () => { if (matchMedia('(hover: hover)').matches) show(); });
        button.addEventListener('mouseleave', () => { if (matchMedia('(hover: hover)').matches && owner === button) close(); });
        button.addEventListener('focus', show);
        button.addEventListener('blur', () => { if (owner === button) close(); });
        button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); show(); });
        return button;
    }
    document.addEventListener('click', event => { if (owner && event.target !== owner && !popup?.contains(event.target)) close(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.BattleUi = { createBadge };
})();
