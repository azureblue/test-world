import { blend, BLEND_MODE } from "../src/blend.js";
import { OpenSimplex2Noise } from "../src/noise/noise.js";
import { Curve, CurveEdit } from "./curve.js";

export function main() {
    const layerTypes = {
        "simplex noise 2": OpenSimplex2Noise
    };

    const layersContainer = document.getElementById('layers');
    const addLayerBtn = document.getElementById('addLayer');
    const renderBtn = document.getElementById('render');
    let layerIdCounter = 0;
    let soloLayerId = null;

    function createLayerElement(id) {
        const div = document.createElement('div');
        div.className = 'layer';
        div.dataset.id = id;
        div.dataset.enabled = 'true';

        const header = document.createElement('div');
        header.className = 'layer-header';

        const name = document.createElement('input');
        name.className = 'name';
        name.type = 'text';
        name.value = `Layer ${id}`;
        name.title = 'Click to rename layer';

        const moveUp = document.createElement('button');
        moveUp.textContent = '↑';
        moveUp.title = 'Move layer up';
        moveUp.addEventListener('click', () => {
            const prev = div.previousElementSibling;
            if (prev) {
                layersContainer.insertBefore(div, prev);
                updateCanvas();
            }
        });

        const moveDown = document.createElement('button');
        moveDown.textContent = '↓';
        moveDown.title = 'Move layer down';
        moveDown.addEventListener('click', () => {
            const next = div.nextElementSibling?.nextElementSibling;
            if (next) {
                layersContainer.insertBefore(div, next);
            } else {
                layersContainer.appendChild(div);
            }
            updateCanvas();
        });

        const toggle = document.createElement('button');
        toggle.className = 'toggle-btn enabled';
        toggle.title = 'Enable/Disable Layer';
        toggle.textContent = '●';
        toggle.addEventListener('click', () => {
            const enabled = div.dataset.enabled === 'true';
            div.dataset.enabled = (!enabled).toString();
            toggle.classList.toggle('enabled', !enabled);
            updateCanvas();
        });

        const solo = document.createElement('button');
        solo.className = 'solo-btn';
        solo.title = 'Render only this layer';
        solo.textContent = 'S';
        solo.addEventListener('click', () => {
            if (soloLayerId === id) {
                soloLayerId = null;
                solo.classList.remove('active');
            } else {
                soloLayerId = id;
                document.querySelectorAll('.solo-btn').forEach(btn => btn.classList.remove('active'));
                solo.classList.add('active');
            }
            updateCanvas();
        });

        const collapse = document.createElement('button');
        collapse.textContent = '-';
        collapse.title = 'Collapse/Expand';
        collapse.addEventListener('click', () => {
            div.classList.toggle('collapsed');
        });

        header.append(name, moveUp, moveDown, toggle, solo, collapse);
        div.appendChild(header);

        const content = document.createElement('div');
        content.className = 'layer-content';

        const typeSelect = document.createElement('select');
        typeSelect.name = 'type';
        for (const type in layerTypes) {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = type;
            typeSelect.appendChild(option);
        }
        content.appendChild(typeSelect);

        const paramContainer = document.createElement('div');
        paramContainer.className = 'params';
        content.appendChild(paramContainer);

        const blendLabel = document.createElement('label');
        blendLabel.textContent = 'Blending Mode:';
        const blendSelect = document.createElement('select');
        blendSelect.name = 'blend';
        Object.keys(BLEND_MODE).forEach(mode => {
            const option = document.createElement('option');
            option.value = mode;
            option.textContent = mode.toLowerCase();
            blendSelect.appendChild(option);
        });
        blendSelect.addEventListener('input', updateCanvas);
        blendLabel.appendChild(blendSelect);
        content.appendChild(blendLabel);
        const opacityLabel = document.createElement('div');
        opacityLabel.className = 'opacity-slider';
        const opacityInput = document.createElement('input');
        opacityInput.type = 'range';
        opacityInput.name = 'opacity';
        opacityInput.min = '0';
        opacityInput.max = '100';
        opacityInput.value = '100';
        const opacityValue = document.createElement('span');
        opacityValue.className = 'opacity-value';
        opacityValue.textContent = '100%';
        opacityInput.addEventListener('input', () => {
            opacityValue.textContent = opacityInput.value + '%';
            updateCanvas();
        });
        opacityLabel.appendChild(opacityInput);
        opacityLabel.appendChild(opacityValue);
        content.appendChild(opacityLabel);
        const curve = document.createElement("canvas");
        curve.classList.add("curve");
        curve.width = 90;
        curve.height = 60;
        content.appendChild(curve);
        curve.obj = new CurveEdit(curve);

        const removeBtn = document.createElement('button');
        removeBtn.textContent = 'Remove';
        removeBtn.className = 'removeLayer';
        removeBtn.addEventListener('click', () => {
            layersContainer.removeChild(div);
            updateCanvas();
        });
        content.appendChild(removeBtn);

        div.appendChild(content);

        function populateParams() {            
            div._noiseCObject = null;
            paramContainer.innerHTML = '';
            const type = typeSelect.value;
            const generatorClass = layerTypes[type];
            div._noiseCObject = new generatorClass();
            const params = generatorClass.parameters();
            for (const param of params) {
                const label = document.createElement('label');
                label.textContent = `${param.name}:`;
                const input = createInputForParameter(param);
                label.appendChild(input);
                paramContainer.appendChild(label);
            }
            updateCanvas();
        }

        typeSelect.addEventListener('change', populateParams);
        populateParams();

        return div;
    }

    function cleanFloat(val) {
        return parseFloat(parseFloat(val).toFixed(6)).toString();
    }


    function createInputForParameter(param) {
        let input;
        if (param.type === 'number') {
            input = document.createElement('input');
            input.type = 'number';
            input.step = param.increment;
            input.value = param.default;
            input.name = param.name;
            input.addEventListener('wheel', e => {
                e.preventDefault();
                const delta = Math.sign(e.deltaY) * -param.increment;
                const newVal = parseFloat(input.value) + delta;
                input.value = cleanFloat(newVal);
                updateCanvas();
            });
        } else if (param.type === 'string') {
            input = document.createElement('input');
            input.type = 'text';
            input.value = param.default;
            input.name = param.name;
        } else if (param.type === 'bool') {
            input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = param.default;
            input.name = param.name;
        }
        input.addEventListener('input', updateCanvas);
        return input;
    }

    addLayerBtn.addEventListener('click', () => {
        const id = layerIdCounter++;
        const layerEl = createLayerElement(id);
        layersContainer.insertBefore(layerEl, layersContainer.firstChild);
        updateCanvas();
    });

    renderBtn.addEventListener('click', () => {
        render();
    })

    function getLayerConfigs() {
        return Array.from(layersContainer.children).map(layer => {
            const id = parseInt(layer.dataset.id);
            const enabled = layer.dataset.enabled === 'true';
            if (!enabled && soloLayerId === null) return null;
            if (soloLayerId !== null && soloLayerId !== id) return null;

            const generator = layer._noiseCObject;
            const type = layer.querySelector('[name=type]').value;
            /**@type {CurveEdit} */
            const curve = layer.querySelector('.curve').obj;
            const blend = layer.querySelector('[name=blend]').value;
            const paramInputs = layer.querySelectorAll('.params input');
            const params = {};
            paramInputs.forEach(input => {
                if (input.type === 'checkbox') {
                    params[input.name] = input.checked;
                } else if (input.type === 'number') {
                    params[input.name] = parseFloat(input.value);
                } else {
                    params[input.name] = input.value;
                }
            });
            const opacitySlider = layer.querySelector('[name=opacity]');
            const opacity = opacitySlider ? parseFloat(opacitySlider.value) / 100 : 1;            
            return { generator, type, blend, params, opacity, curve: curve.createFunction() };
        }).filter(Boolean);
    }

    function updateCanvas() {
        // const canvas = document.getElementById('canvas');
        // const ctx = canvas.getContext('2d');
        // const config = getLayerConfigs();
        // renderNoiseLayers(ctx, config);
    }
    const data = new Float32Array(800 * 800);
    const current = new Uint32Array(800 * 800);
    const imageData = new ImageData(800, 800);
    function render() {
        data.fill(0.0);

        const canvas = document.getElementById('canvas');
        /**@type {CanvasRenderingContext2D} */
        const ctx = canvas.getContext('2d');        
        const config = getLayerConfigs();
        config.reverse();
        
        for (const layer of config) {
            const curve = layer.curve;
            const generator = layer.generator;
            generator.setParameters(layer.params);
            const blendMode = BLEND_MODE[layer.blend];
            for (let y = 0; y < 800; y++)
                for (let x = 0; x < 800; x++) {
                    const idx = y * 800 + x;
                    data[idx] = blend(data[idx], curve(generator.gen(x, y)), blendMode, layer.opacity);
                }
            
        }
        for (let i = 0; i < 800 * 800; i++) {
            imageData.data[i * 4] = data[i] * 255;
            imageData.data[i * 4 + 1] = data[i] * 255;
            imageData.data[i * 4 + 2] = data[i] * 255;
            imageData.data[i * 4 + 3] =  255;
        }
        ctx.putImageData(imageData, 0, 0);

    }
}