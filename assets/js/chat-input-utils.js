(function (global) {
    function shouldSendOnChatKeydown(event) {
        return event.key === 'Enter' && event.ctrlKey !== true;
    }

    function shouldInsertLineBreakOnChatKeydown(event) {
        return event.key === 'Enter' && event.ctrlKey === true;
    }

    function getAutoGrowMetrics({ scrollHeight, minHeight, maxHeight }) {
        const height = Math.max(minHeight, Math.min(scrollHeight, maxHeight));

        return {
            height,
            overflowY: scrollHeight > maxHeight ? 'auto' : 'hidden',
        };
    }

    function shouldShowVoiceEntry({ value, hasVoiceDraft }) {
        return !hasVoiceDraft && String(value || '').trim() === '';
    }

    function normalizeCommonEmojiLineBreaks(root) {
        root.querySelectorAll('img.chat-emoji.common').forEach(image => {
            const next = image.nextSibling;
            // The server's emoji HTML template appends one newline after the tag.
            if (next?.nodeType === 3) next.textContent = next.textContent.replace(/^\r?\n/, '');
        });
    }

    const api = {
        normalizeCommonEmojiLineBreaks,
        shouldSendOnChatKeydown,
        shouldInsertLineBreakOnChatKeydown,
        getAutoGrowMetrics,
        shouldShowVoiceEntry,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

    global.ChatInputUtils = api;
})(typeof window !== 'undefined' ? window : globalThis);
