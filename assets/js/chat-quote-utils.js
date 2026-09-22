(function () {
    'use strict';

    function parse(content) {
        const template = document.createElement('template');
        template.innerHTML = String(content ?? ''); // Inert template: never attach or reuse parsed nodes.
        return template.content;
    }

    function plainText(content) {
        const fragment = parse(content);
        return fragment.children.length ? String(content ?? '') : fragment.textContent;
    }

    function safeUrl(value) {
        if (!value || value.length > 4096 || /[\u0000-\u0020\u007f]/.test(value)) return '';
        try {
            const url = new URL(value);
            return url.protocol === 'https:' && url.hostname && !url.username && !url.password && !url.hash ? url.href : '';
        } catch { return ''; }
    }

    function paintImage(container, blocked) {
        container.replaceChildren();
        const url = safeUrl(container.dataset.quoteImageUrl);
        if (blocked || !url) {
            container.textContent = '图片消息已隐藏';
            return;
        }
        const image = document.createElement('img');
        image.className = 'quote-image';
        image.src = url;
        image.alt = container.dataset.quoteImageAlt || '图片';
        image.loading = 'lazy';
        image.decoding = 'async';
        image.referrerPolicy = 'no-referrer';
        container.append(image);
    }

    function createContent(content, blocked = false) {
        const container = document.createElement('span');
        container.className = 'quote-body';
        const fragment = parse(content);
        const nodes = Array.from(fragment.childNodes).filter(node => node.nodeType !== Node.TEXT_NODE || node.textContent.trim());
        const image = nodes.length === 1 && nodes[0].nodeType === Node.ELEMENT_NODE && nodes[0].tagName === 'IMG' ? nodes[0] : null;
        const url = image && safeUrl(image.getAttribute('src'));
        if (url) {
            container.dataset.quoteImageUrl = url;
            container.dataset.quoteImageAlt = image.getAttribute('alt') || '';
            paintImage(container, blocked);
        } else {
            const text = plainText(content);
            container.textContent = text.slice(0, 50) + (text.length > 50 ? '…' : '');
        }
        return container;
    }

    function createReply(reply, blocked = false) {
        const quote = document.createElement('div');
        quote.className = 'message-quote';
        quote.dataset.messageId = String(reply.messageId ?? '');
        const row = document.createElement('div');
        row.className = 'quote-row';
        const author = document.createElement('span');
        author.className = 'quote-author';
        author.textContent = plainText(reply.uname) + ':';
        const content = createContent(reply.content, blocked);
        if (content.dataset.quoteImageUrl) {
            quote.classList.add('image-quote');
            quote.dataset.imageSrc = content.dataset.quoteImageUrl;
        }
        row.append(author, content);
        quote.append(row);
        return quote;
    }

    function setImagesBlocked(root, blocked) {
        root.querySelectorAll('[data-quote-image-url]').forEach(container => paintImage(container, blocked));
    }

    window.ChatQuoteUtils = { createReply, createContent, plainText, setImagesBlocked };
})();
