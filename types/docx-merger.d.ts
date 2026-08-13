declare module 'docx-merger' {
  export default class DocxMerger {
    constructor(options: Record<string, unknown>, files: Buffer[]);
    save(type: 'nodebuffer', callback: (data: Buffer) => void): void;
  }
}
