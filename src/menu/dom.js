// Small helpers building the menus' elements (menu/worldMenu.js, menu/gameMenu.js); the styles are in style.css.

/**
 * @param {string} tag
 * @param {string} [className]
 * @param {...(Node | string)} children
 * @returns {HTMLElement}
 */
export function element(tag, className = "", ...children) {
    const e = document.createElement(tag);
    if (className !== "")
        e.className = className;
    e.append(...children);
    return e;
}

/**
 * @param {string} text
 * @param {(() => void) | null} [onClick]
 * @returns {HTMLButtonElement}
 */
export function button(text, onClick = null) {
    const b = element("button", "", text);
    b.type = "button";
    if (onClick !== null)
        b.addEventListener("click", onClick);
    return b;
}

/**
 * @param {string} type
 * @param {string} value
 * @returns {HTMLInputElement}
 */
export function input(type, value) {
    const i = element("input");
    i.type = type;
    i.value = value;
    return i;
}

/** a control with its name above it */
export function label(text, control) {
    return element("label", "", element("span", "", text), control);
}
