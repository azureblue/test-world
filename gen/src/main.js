import { FunctionWidget, InputOutputType, InputSpecification, Node, OutputSpecification, WidgetContainer } from "./widget.js";

export function main() {

    let widgetContainer = new WidgetContainer();
    widgetContainer.addToParentOrDOM();

    widgetContainer.addWidget(new FunctionWidget(new Node("test", [
        new InputSpecification("in1", InputOutputType.NORMILIZED, { defaultVlue: 0 }),
        new InputSpecification("in2", InputOutputType.NORMILIZED, { defaultVlue: 1 }),
    ], [
        new OutputSpecification("out1", InputOutputType.NORMILIZED)
    ], [])));

    widgetContainer.addWidget(new FunctionWidget(new Node("test2", [
        new InputSpecification("in1", InputOutputType.NORMILIZED, { defaultVlue: 0 }),
    ], [
        new OutputSpecification("out1", InputOutputType.NORMILIZED)
    ], [])));

}
