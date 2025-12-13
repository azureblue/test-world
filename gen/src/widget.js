import { Element, PositionableElement } from "./base.js";
const PARAMS = new Float32Array(2048);
const PARAMS_READY = new Uint32Array(2048);
let PARAM_IDX = 0;


function getNewParamIndex() {
    PARAM_IDX++;
    if (PARAM_IDX >= PARAMS.length)
        throw "param idx too big";
    return (PARAM_IDX - 1);
}
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

let widgetIdCount = 0;

function newWidgetId() {
    return "widget-" + widgetIdCount++;
}

class Line extends Element {
    /**
     * @param {PositionableElement} from 
     * @param {PositionableElement} to 
     */
    constructor(from, to) {
        super(["line"], document.createElementNS(SVG_NAMESPACE, "line"));
        this.from = from;
        this.to = to;
        this.element.setAttribute('stroke', '#4e8cff');
        this.element.setAttribute('stroke-width', 3);
        this.updatePos();
    }

    updatePos() {
        this.setStart(...this.from.getScreenRect().middle());
        this.setEnd(...this.to.getScreenRect().middle());
    }

    setStart(x, y) {
        this.element.setAttribute("x1", x);
        this.element.setAttribute("y1", y);
    }

    setEnd(x, y) {
        this.element.setAttribute("x2", x);
        this.element.setAttribute("y2", y);
    }
}

class Connection {
    /**
     * 
     * @param {string} outWidgetId 
     * @param {number} outIdx 
     * @param {string} inWidgetId 
     * @param {number} inIdx 
     * @param {Line} line 
     */
    constructor(outWidgetId, outIdx, inWidgetId, inIdx, line) {
        this.outWidgetId = outWidgetId;
        this.outIdx = outIdx;
        this.inWidgetId = inWidgetId;
        this.inIdx = inIdx;
        this.line = line;
    }
}

export class WidgetConnection extends Element {

    constructor() {
        super(["widget-connections"], document.createElementNS(SVG_NAMESPACE, "svg"));
    }

    addConnection(outWidgetId, outIdx, inWidgetId, inIdx) {
        const wout = FunctionWidget.getById(outWidgetId);
        const win = FunctionWidget.getById(inWidgetId);
        const line = new Line(wout.outputValues[outIdx].outputElement.handle, win.inputParams[inIdx].paramElement.handle);
        this.add(line);
        return new Connection(outWidgetId, outIdx, inWidgetId, inIdx, line);
    }
}

export class WidgetContainer extends Element {
    #dragging = null;
    static #globalZIndex = 1;

    /** @type {{widgetId: string, paramIdx:number, handle: ParamHandle, input: Input}} */
    #selectedInput = null;
    /** @type {{widgetId: string, paramIdx:number, handle: ParamHandle, output: Output}} */
    #selectedOutput = null;

    /**@type {Map<string, Array<Connection> } */
    #widgetConnectionMap = new Map();

    constructor() {
        super(["widget-container"]);
        this.connections = this.add(new WidgetConnection());
        this.element.addEventListener("mousemove", ev => this.#onMouseMove(ev));
        this.element.addEventListener("mouseup", ev => this.#onMouseUp(ev));
        this.element.addEventListener("mouseleave", ev => this.#onMouseOut(ev));
        this.element.addEventListener("dragstart", ev => ev.preventDefault());
        this.element.addEventListener("drag", ev => ev.preventDefault());
        // this.element.addEventListener("mouseout", ev => this.#onMouseOut(ev));
    }

    connect(outWidgetId, outIdx, inWidgetId, inIdx) {
        const wout = FunctionWidget.getById(outWidgetId);
        const win = FunctionWidget.getById(inWidgetId);
        wout.outputValues[outIdx].outputElement.connected = true;
        win.inputParams[inIdx].paramElement.connected = true;
        const line = new Line(wout.outputValues[outIdx].outputElement.handle, win.inputParams[inIdx].paramElement.handle);
        const connection = new Connection(outWidgetId, outIdx, inWidgetId, inIdx, line);
        this.#widgetConnectionMap.get(win.id).push(connection);
        this.#widgetConnectionMap.get(wout.id).push(connection);
        this.connections.add(line);
    }
    /**
     * @param {FunctionWidget} widget 
     */
    addWidget(widget) {
        this.add(widget);
        this.#widgetConnectionMap.set(widget.id, []);
        widget.header.element.addEventListener("mousedown", ev => {
            this.#onWidgetHandleMouseDown(widget, ev);
        })
        widget.inputParams.forEach((inputParam, idx) => {
            const handle = inputParam.paramElement.handle;
            handle.element.addEventListener("mousedown", ev => {
                if (this.#selectedInput !== null) {
                    this.#selectedInput.handle.selected = false;
                    if (this.#selectedInput.handle === handle) {
                        this.#selectedInput = null;
                        return;
                    }
                }
                if (this.#selectedOutput?.widgetId === widget.id)
                    return;

                if (this.#selectedOutput !== null) {
                    this.connect(this.#selectedOutput.widgetId, this.#selectedOutput.paramIdx, widget.id, idx);
                    handle.selected = false;
                    this.#selectedInput = null;             
                    return;
                }

                this.#selectedInput = {
                    widgetId: widget.element.id,
                    paramIdx: idx,
                    handle: handle,
                    input: inputParam.input
                }
                handle.selected = true;
            })
        });

        widget.outputValues.forEach((outputValue, idx) => {
            const handle = outputValue.outputElement.handle;
            handle.element.addEventListener("mousedown", ev => {                
                if (this.#selectedOutput !== null) {
                    this.#selectedOutput.handle.selected = false;
                    if (this.#selectedOutput.handle === handle) {
                        this.#selectedOutput = null;
                        return;
                    }                   
                }
                if (this.#selectedInput?.widgetId === widget.id)
                    return;

                if (this.#selectedInput !== null) {
                    this.connect(widget.id, idx, this.#selectedInput.widgetId, this.#selectedInput.paramIdx);
                    this.#selectedInput.handle.selected = false;
                    this.#selectedInput = null;
                    return;
                }
                this.#selectedOutput = {
                    widgetId: widget.element.id,
                    paramIdx: idx,
                    handle: handle,
                    output: outputValue.output
                }
                handle.selected = true;;
            })
        });
    }

    /**
     * @param {Widget} widget 
     * @param {MouseEvent} ev 
     */
    #onWidgetHandleMouseDown(widget, ev) {
        document.body.classList.add('noselect');
        this.#dragging = {
            widget,
            mousePos: { x: ev.clientX, y: ev.clientY }
        }
        widget.element.style.zIndex = ++WidgetContainer.#globalZIndex;
    }

    /** @param {MouseEvent} ev  */
    #onMouseMove(ev) {
        ev.preventDefault();
        if (this.#dragging !== null) {
            const dx = ev.clientX - this.#dragging.mousePos.x;
            const dy = ev.clientY - this.#dragging.mousePos.y;
            this.#dragging.mousePos.x = ev.clientX;
            this.#dragging.mousePos.y = ev.clientY;

            /**@type {FunctionWidget} */
            const widget = this.#dragging.widget;            
            widget.x += dx;
            widget.y += dy;
            this.#widgetConnectionMap.get(widget.id).forEach(co => co.line.updatePos());

        }
    }

    #onMouseUp() {
        document.body.classList.remove('noselect');
        this.#dragging = null;
    }

    #onMouseOut() {
        document.body.classList.remove('noselect');
        this.#dragging = null;
    }

}
class WidgetHandle extends Element {
    constructor() {
        super(["widget-handle"]);
    }
}

class WidgetHeader extends Element {
    constructor(label) {
        super(["widget-header"]);
        this.handle = new WidgetHandle();
        this.add(this.handle);
        this.name = new Element(["name"]);
        this.name.element.textContent = label;
        this.add(this.name);
    }
}

class WidgetContent extends Element {
    constructor() {
        super(["widget-content"]);
        this.params = [];
    }

    add(element) {
        super.add(element);
    }
}

export class InputOutputType {
    static NORMILIZED = 0;
    static INT = 1;
    static FLOAT = 2;
}

export class OutputSpecification {
    #name;
    #type;

    constructor(name, type) {
        this.#name = name;
        this.#type = type;
    }

    get name() {
        return this.#name;
    }

    get type() {
        return this.#type;
    }
}

export class InputSpecification {
    #name;
    #type;
    #options

    constructor(name, type, {
        defaultVlue = 0.0
    } = {}) {
        this.#name = name;
        this.#type = type;
        this.#options = { defaultValue: defaultVlue }
    }

    get name() {
        return this.#name;
    }

    get options() {
        return this.#options;
    }

    get type() {
        return this.#type;
    }
}

export class Readable {
    read(i) {
        throw "not implemented";
    }
}

export class SingleValueSource extends Readable {
    #value;

    constructor(value) {
        this.#value = value;
    }

    setValue(value) {
        this.#value = value;
    }

    read(i) {
        return this.#value;
    }
}

export class ArraySource extends Readable {
    #array;

    /**
     * @param {ArrayLike<number>} array 
     */
    setArray(array) {
        this.#array = array;
    }

    read(i) {
        return this.#array[i];
    }
}

export class Input {
    #spec;
    /** @type {Readable} */
    #input;

    /**
     * @param {InputSpecification} spec 
     */
    constructor(spec) {
        this.#spec = spec;
    }

    /**
     * @param {Readable} input 
     */
    set(input) {
        this.#input = input;
    }

    get spec() {
        return this.#spec;
    }

    read(i) {
        return this.#input.read(i);
    }
}

export class Writable {
    write(i, v) {
        throw "not implemented";
    }
}

export class DummyOutput extends Writable {
    write(i, v) {

    }
}

export class ArrayOutput extends Writable {
    #array;

    /**
     * @param {ArrayLike<number>} array 
     */
    setArray(array) {
        this.#array = array;
    }

    write(i, v) {
        this.#array[i] = v;
    }
}


export class Output {
    #spec;
    /** @type {Writable} */
    #output;

    /**
     * @param {OutputSpecification} spec 
     */
    constructor(spec) {
        this.#spec = spec;
    }

    /**
     * @param {Writable} output 
     */
    set(output) {
        this.#output = output;
    }

    write(i, v) {
        this.#output.write(i, v);
    }

    get spec() {
        return this.#spec;
    }
}

export class Node {

    #name;
    #ni
    #no;
    #inputs;
    #outputs;
    #functions;
    #tmpInputValues

    /**
     * @param {string} name 
     * @param {Array<InputSpecification>} inputSpecs 
     * @param {Array<OutputSpecification>} outputSpecs 
     * @param {Function} functions 
     */
    constructor(name, inputSpecs, outputSpecs, functions) {
        this.#name = name;
        this.#ni = inputSpecs.length;
        this.#no = outputSpecs.length;
        this.#inputs = inputSpecs.map(spec => new Input(spec));
        this.#outputs = outputSpecs.map(spec => new Output(spec));
        this.#tmpInputValues = new Float64Array(this.#ni);
        this.#functions = functions;
    }

    process(n) {
        for (let i = 0; i < n; i++) {
            for (let p = 0; p < this.#ni; p++)
                this.#tmpInputValues[p] = this.#inputs[p].read(i);

            for (let o = 0; o < this.#no; o++)
                this.#outputs[i].write(i, this.#functions[o](this.#tmpInputValues));
        }
    }

    get ni() {
        return this.#ni;
    }

    get no() {
        return this.#no;
    }

    getInput(n) {
        return this.#inputs[n];
    }

    getOutput(n) {
        return this.#outputs[n];
    }

    get name() {
        return this.#name;
    }
}

export class FunctionWidget extends PositionableElement {
    /**@returns {FunctionWidget} */
    static getById(id) {
        return document.getElementById(id)?._obj;
    }

    #node;

    /**
     * @param {Node} node 
     */
    constructor(node) {
        super(["widget"]);
        this.element.id = newWidgetId();
        this.element._obj = this;
        this.node = node;
        this.header = new WidgetHeader(node.name);
        this.add(this.header);
        this.content = new WidgetContent();
        this.add(this.content);
        this.inputParams = [];
        this.outputValues = [];
        for (let i = 0; i < node.ni; i++) {
            const input = node.getInput(i);
            const paramElement = new InputParamElement(input.spec, (value) => {
                input.set(new SingleValueSource(value));
            });
            this.content.add(paramElement);
            this.inputParams.push({ paramElement, input });
        }
        for (let i = 0; i < node.no; i++) {
            const output = node.getOutput(i);
            const outputElement = new OutputValueElement(output.spec);
            this.content.add(outputElement);
            this.outputValues.push({ outputElement, output });
        }
        this.tmpBuf = new Float32Array(this.inputParams.length);
    }

    get id() {
        return this.element.id;
    }
}

export class Widget extends PositionableElement {
    /**
     * @param {string} name 
     * @param {Array<string>} classList 
     */
    constructor(name, classList = []) {
        super([...classList, "widget"]);
        classList = [...classList, "widget"];
    }
}


const PARAM_TYPE = {
    NORMALIZED_NUMBER: 0
}

class ParamHandle extends Element {
    constructor(isInput = true) {
        super(["widget-param-handle", isInput ? "widget-param-handle-input" : "widget-param-handle-output"]);
    }

    set selected(v) {
        if (v)
            this.element.classList.add("selected");
        else
            this.element.classList.remove("selected");
    }

    get selected() {
        return this.element.classList.contains("selected");
    }
}

class ParamLabel extends Element {
    constructor(text) {
        super(["widget-param-label"]);
        this.element.textContent = text;
    }
}

export class InputOutput {
    #type
    #value
    constructor(type, val) {
        this.#type = type;
        this.#value = val;
    }

    get type() {
        return this.#type;
    }

    get value() {
        return this.#value;
    }

    set value(val) {
        this.#value = val;
    }
}

class NormalizedInputParam extends Element {
    constructor(name) {
        super(["widget-param", "param-input"]);
        this.handle = this.add(new ParamHandle(true));
        this.label = this.add(new ParamLabel(name));
    }
}

class NormalizedOutputParam extends Element {
    constructor(name) {
        super(["widget-param", "param-output"]);
        this.label = this.add(new ParamLabel(name));
        this.handle = this.add(new ParamHandle(false));
    }
}

const PARAMETER_TYPE = {
    INPUT: 0,
    INPUT_FIXED: 1,
    OUTPUT: 2,
    OUTPUT_FIXED: 3
}

class ParamConfig {
    constructor(type, name) {
        this.type = type;
        this.name = name;
    }

    isInput() {
        return this.type < 2;
    }
}

class InputParamElement extends Element {

    #userInputVisible = true;
    /**
     * @param {InputSpecification} spec 
     */
    constructor(spec, onInputHandler) {
        super(["widget-param", "param-input"]);
        this._obj = this;
        this.handle = this.add(new ParamHandle(true));
        this.label = this.add(new ParamLabel(spec.name));
        this.input = this.add(new InputElement(spec, onInputHandler))
    }

    get userInputVisible() {
        return this.#userInputVisible;
    }

    set userInputVisible(isVisible) {
        this.#userInputVisible = isVisible;
        this.input.setEnabled(isVisible);
    }


    get connected() {
        return this.handle.element.classList.contains("connected")
    }

    set connected(v) {
        if (v) {
            this.handle.selected = false;
            this.handle.element.classList.add("connected");
        }
        else
            this.handle.element.classList.remove("connected");
    }
}

class OutputValueElement extends Element {
    /**
     * @param {OutputSpecification} spec 
     */
    constructor(spec) {
        super(["widget-param", "param-output"]);
        this.label = this.add(new ParamLabel(spec.name));
        this.handle = this.add(new ParamHandle(false));
    }

    get connected() {
        return this.handle.element.classList.contains("connected")
    }

    set connected(v) {
        if (v) {
            // this.handle.selected = false;
            this.handle.element.classList.add("connected");
        }
        else
            this.handle.element.classList.remove("connected");
    }
}


class InputElement extends Element {
    /**@param {InputSpecification} spec  */
    constructor(spec, onInputHandler) {
        super(["widget-param", "user-input"], "input")
        /**@type {HTMLInputElement} */
        const element = this.element;
        this.#configureInputForParameter(element, spec, onInputHandler);
    }

    setEnabled(enabled) {
        if (enabled)
            this.element.classList.remove("disabled");
        else
            this.element.classList.add("disabled");
    }

    get value() {
        return this.element.value;
    }

    set value(v) {
        this.element.value = v;
    }

    /**
     * @param {HTMLInputElement} element 
     * @param {InputSpecification} spec 
     */
    #configureInputForParameter(element, spec, onInputHandler) {
        if (spec.type === InputOutputType.NORMILIZED) {
            element.type = 'number';
            element.step = 0.01;
            element.value = spec.options.defaultValue;
            element.name = spec.name;
            element.min = "0";
            element.max = "1";
            element.addEventListener('wheel', e => {
                e.preventDefault();
                const delta = Math.sign(e.deltaY) * -0.01;
                const newVal = parseFloat(element.value) + delta;
                element.value = this.cleanFloat(newVal);
            });
            element.addEventListener("input", ev => {
                onInputHandler(ev.target.value);
            })
        } else {
            throw "unsupported type: " + spec.type;
        }
    }

    get value() {
        return this.element.value;
    }

    cleanFloat(val) {
        return parseFloat(parseFloat(val).toFixed(5)).toString();
    }
}

class EditabledOutputParam extends Element {
    constructor(name) {
        super(["widget-param", "param-output"]);
        this.label = this.add(new ParamLabel(name));
        this.input = this.add(new ParamLabel(name));
        this.handle = this.add(new ParamHandle(false));
    }
}

export class InOutWidget extends Widget {
    constructor() {
        super("asdasd");
        this.parama = this.content.add(new NormalizedInputParam("param 1"));
        this.paramb = this.content.add(new NormalizedInputParam("param 2"));
        this.paramc = this.content.add(new NormalizedOutputParam("param 3"));
    }
}

export class MultiplierWidget extends Widget {
    constructor() {
        super("Multiply", []);
        this.parama = this.content.add(new FixedOutputParam("parasadfasdfm a", new InputElement({ name: "asd", default: 0.2, type: "number" })));
        this.paramb = this.content.add(new FixedOutputParam("pa", new InputElement({ name: "asd2", default: 0.2, type: "number" })));
    }
}
