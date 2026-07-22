declare module 'html-to-docx' {
  function HTMLtoDOCX(
    htmlString: string,
    headerHTMLString: string | null,
    options?: Record<string, unknown>
  ): Promise<ArrayBuffer>;

  export default HTMLtoDOCX;
}
