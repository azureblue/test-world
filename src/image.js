import { Resources, checkParseInt } from "./utils.js";
export class ImagePixels {
    #imageData;

    /**
     * @param {ImageData} imageData 
     */
    constructor(imageData) {
        this.#imageData = imageData;
    }

    get width() {
        return this.#imageData.width;
    }

    get height() {
        return this.#imageData.height;
    }

    subImage(x, y, width, height) {
        const dst = new ImageData(width, height);
        const srcData = this.#imageData.data;
        const dstData = dst.data;

        for (let row = 0; row < height; row++) {
            const srcY = y + row;
            const srcW = this.#imageData.width;
            const srcRowOffset = srcY * srcW * 4;
            const dstRowOffset = row * width * 4;
            for (let col = 0; col < width; col++) {
                const srcX = x + col;
                const sIdx = srcRowOffset + srcX * 4;
                const dIdx = dstRowOffset + col * 4;
                dstData[dIdx] = srcData[sIdx];
                dstData[dIdx + 1] = srcData[sIdx + 1];
                dstData[dIdx + 2] = srcData[sIdx + 2];
                dstData[dIdx + 3] = srcData[sIdx + 3];
            }
        }
        return new ImagePixels(dst);
    }
    
    copy() {
        const srcData = this.#imageData.data;
        const dst = new ImageData(this.#imageData.width, this.#imageData.height);
        const dstData = dst.data;
        dstData.set(srcData);
        return new ImagePixels(dst);
    }

    async toImageBitmap() {
        return await createImageBitmap(this.#imageData);
    }

}

export class ImageArray {
    #imageArray;
    #elementWidth;
    #elementHeight;
    #cols;
    #rows;

    /**
     * @param {ImagePixels} imageArray
     * @param {number} elementWidth 
     * @param {number} elementHeight 
     */
    constructor(imageArray, elementWidth, elementHeight) {
        this.#imageArray = imageArray;
        this.#elementWidth = elementWidth;
        this.#elementHeight = elementHeight;
        this.#cols = Math.floor(imageArray.width / elementWidth);
        this.#rows = Math.floor(imageArray.height / elementHeight);
    }

    get cols() {
        return this.#cols;
    }

    get rows() {
        return this.#rows;
    }

    /**
     * @param {number} x 
     * @param {number} y 
     */
    getImage(x, y) {
        if (x < 0 || x >= this.#cols)
            throw "x out of bounds";
        if (y < 0 || y >= this.#rows)
            throw "y out of bounds";
        const px = x * this.#elementWidth;
        const py = y * this.#elementHeight;
        return this.#imageArray.subImage(px, py, this.#elementWidth, this.#elementHeight);
    }
}

export class ImageResources {
    #imageMap;

    /**
     * @param {Map<string, ImageArray>} imageMap 
     */
    constructor(imageMap) {
        this.#imageMap = imageMap;
    }

    /**
     * @param {string} name 
     * @return {ImagePixels}
     */
    getImage(name) {
        // "grass,row=0,col=1" grass,0,1
        const parts = name.split(",");
        const baseName = parts[0];
        const imageArray = this.#imageMap.get(baseName);
        if (!imageArray)
            throw "src image not found: " + baseName;
        let x = 0;
        let y = 0;
        if (parts.length === 1) {
            return this.#imageMap.get(name);
        } else if (parts.length === 2) {
            const arg = parts[1];
            const argVal = checkParseInt(arg);
            y = Math.floor(argVal / imageArray.cols);
            x = argVal % imageArray.cols;
        }
        else if (parts.length === 3) {
            const args = parts.slice(1);
            args.forEach(arg => {
                if (arg.includes("=")) {
                    const [left, value] = arg.split("=");
                    if (left.startsWith("r") || left.startsWith("y")) {
                        y = parseInt(value);
                    } else if (left.startsWith("c") || left.startsWith("x")) {
                        x = parseInt(value);
                    }
                } else {
                    y = parseInt(arg);
                }
            });
        } else {
            throw "invalid image name format " + name;
        }

        return imageArray.getImage(x, y)
    }

    static #offscreenCanvas = new OffscreenCanvas(1, 1);

    /**
     * @param {Array<{name: string, src: string, elementWidth: number, elementHeight: number}>} imageList 
     */
    static async init(imageList) {
        /**@type {Map<string, ImageArray>} */
        const imageMap = new Map();

        await Promise.all(imageList.map(async imageSrc => {
            const name = imageSrc.name;
            const src = imageSrc.src;
            const image = await Resources.loadImage(src)
            const imagePixels = ImageResources.#convertToImagePixels(image);
            imageMap.set(name, new ImageArray(imagePixels, imageSrc.elementWidth, imageSrc.elementHeight));
        }));

        return new ImageResources(imageMap);
    }

    static #convertToImagePixels(imageBitmap) {
        const canvas = ImageResources.#offscreenCanvas;
        canvas.width = imageBitmap.width;
        canvas.height = imageBitmap.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imageBitmap, 0, 0);
        const imageData = ctx.getImageData(0, 0, imageBitmap.width, imageBitmap.height);
        return new ImagePixels(imageData);
    }
}
