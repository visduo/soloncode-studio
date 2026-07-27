export function isTerminalControlSequence(data) {
    return data !== "\r" && data !== "\u007f" && data !== "\t" && /[\u0000-\u001f\u007f]/.test(data);
}

export function getLastTerminalInputChar(input) {
    return Array.from(input).at(-1) || "";
}

export function removeLastTerminalInputChar(input) {
    const chars = Array.from(input);
    chars.pop();
    return chars.join("");
}

export function getTerminalCharWidth(char) {
    if (!char) return 0;
    if (/^[\u0300-\u036f\ufe00-\ufe0f]$/.test(char)) return 0;
    return /[^\u0000-\u00ff]/.test(char) ? 2 : 1;
}
