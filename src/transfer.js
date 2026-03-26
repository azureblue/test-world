export class TransferObject {
    /**
     * @param {any} data
     * @param {ArrayBuffer[]} transferList
     */
    constructor(data, transferList) {
        this.data = data;
        this.transferList = transferList;
    }
}
