import { Element } from "./base.js";
import { Color } from "./color.js";
import { Pos } from "./geom.js";

/**
 * @enum {Symbol}
 */
export const SettingType = Object.freeze({
    INTEGER: Symbol(),
    REAL: Symbol(),
    COLOR: Symbol(),
    POS: Symbol(),
    TEXT: Symbol()
});

class ValueMapper {
    constructor(decoder = x => x, encoder = x => "" + x) {
        this.encode = encoder;
        this.decode = decoder;
    }
}

export const ValueMappers = Object.freeze({
    [SettingType.INTEGER]: new ValueMapper(Number.parseInt),
    [SettingType.REAL]: new ValueMapper(Number.parseFloat),
    [SettingType.COLOR]: new ValueMapper(Color.fromStyle, Color.toStyle),
    [SettingType.POS]: new ValueMapper(val => {
        val = val.trim();
        val = val.substring(1, val.length - 1);
        const posArray = val.split(",");
        return new Pos(parseInt(posArray[0].trim()), parseInt(posArray[1].trim()));
    }, p => `(${p.x}, ${p.y})`),
    [SettingType.TEXT]: new ValueMapper()
});

export const InputParams = Object.freeze({
    [SettingType.INTEGER]: {type: "number"},
    [SettingType.REAL]: {type: "number"},
    [SettingType.COLOR]: {type: "color"},
    [SettingType.POS]: {type: "text", pattern: `[\\(\\[{][0-9]+, *[0-9]+[\\)\\]}]`},
    [SettingType.CHECK]: {type: "checkbox"},
    [SettingType.TEXT]: {type: "text"}
});



var newSettingWrapper = () => newElement("div", { class: SettingElement.wrapperClass });
var newSettingLabel = labelText => newElement("label", { class: SettingElement.labelClass }, labelText);
export function newElement(tag, attr, txt){
    var el = document.createElement(tag);
    el.setAttribute("id", genId());
    if (attr)
        Object.keys(attr).forEach(pr => el.setAttribute(pr, attr[pr]));
    if (txt)
        el.textContent = txt;
    return el;
};

var getId = el => el.getAttribute("id");
var elemById = id => document.getElementById(id);
var forEachEntry = (obj, action) => Object.keys(obj).forEach(pr => action(pr, obj[pr]));
var checkNoIdInAttrMap = (obj) => {
    if (obj == null)
        return;

    if (obj["id"])
        throw "Id attribute must not be specified.";
};
var genId = () => "setting_##_" + SettingElement.idCount++;

function MultiSetting(elements, resultProvider) {
    var elem = newSettingWrapper();
    elements.forEach(el => elem.appendChild(el));

    this.getSettingElement = () => elem;
    this.get = () => resultProvider();
}

export class SettingsGroup extends Element{
    constructor(label) {
        super("div", ["settings-group"]);
        this.label = document.createElement("div");
        this.label.classList.add("label");
        this.label.innerText = label;
        this.element.appendChild(this.label);
        /**
         * @type {Array<Element}
         */
        this.settings = [];
    }

    /**
     * @param {Element} settingElement
     */
    addSettingElement(settingElement) {
        this.settings.push(settingElement);
        settingElement.addToParentOrDOM(this.element);
    }

    removeAllSettings() {
        this.settings.forEach(setting => setting.remove());
        this.settings = [];
    }
}

class InputSetting extends Element {
    constructor(labelText, inputAttributes, valueMapper = new ValueMapper()) {
        super(newSettingWrapper());
        checkNoIdInAttrMap(inputAttributes);

        if (labelText)
            this.element.appendChild(newSettingLabel(labelText));

            /**
             * @type {HTMLInputElement}
             */
        this.input = this.element.appendChild(newElement("input", inputAttributes));
        this.valueMapper = valueMapper;
    }

    getValue() {
        return this.valueMapper.decode(this.input.value);
    }

    setValue(val) {
        this.input.value = this.valueMapper.encode(val);
    }
};

export class CheckBox extends Element {
    constructor(labelText, checked = false, onChange = null) {
        super(newSettingWrapper());

        if (labelText)
            this.element.appendChild(newSettingLabel(labelText));
            /**
             * @type {HTMLInputElement}
             */
        this.input = this.element.appendChild(newElement("input", {
            type: "checkbox"
        }));

        this.input.checked = checked;
        if (onChange !== null)
            this.input.addEventListener("input", (ev) => onChange(this.getValue(), ev));
    }

    getValue() {
        return this.input.checked;
    }
}

export class ActionButton extends Element {
    constructor(label, action) {
        super("input", ["button", "action"]);
        this.element.value = label;
        this.element.type = "button";
        this.element.addEventListener("click", ev => action(ev));
    }
    // <input type="button" style="float: left; margin: 5px;" value="Generate" onclick="generate()">
}

export class InputSettingElement extends InputSetting {
    /**
     * @param {string} label
     * @param {SettingType} type
     * @callback changeAction
     * @param {*} defaultValue
     * @param {*} range
     * @param {number} step
     */
    constructor(label, type, changeAction, value, attributes = {}) {
        super(label, {...InputParams[type], ...attributes}, ValueMappers[type]);
        this.setValue(value);
        if (changeAction != null)
            this.element.addEventListener("change", ev => {
                changeAction(this.getValue(), ev);
            });
    }
}


const SettingElement = {};

SettingElement.wrapperClass = "setting_wrapper";
SettingElement.labelClass = "setting_label";
SettingElement.idCount = 0;


export class SelectSetting extends Element {
    constructor(labelText, valueTextMap, valueMapper, changeListener, value, selectAttrs) {
        super(newSettingWrapper());
        checkNoIdInAttrMap(selectAttrs);
        if (labelText)
            this.element.appendChild(newSettingLabel(labelText));
        var select = this.element.appendChild(newElement("select", selectAttrs));
        forEachEntry(valueTextMap, (va, txt) => select.appendChild(newElement("option", { value: va }, txt)));
        if (changeListener != null) {
            select.addEventListener("change", ev => changeListener(this.getValue(), ev));
        }
        if (value != null)
            select.value = value;

        this.getSettingElement = () => elem;
        this.getValue = () => valueMapper(select.value);
        this.fireChange = () => select.dispatchEvent(new Event("change"));
    }
}
