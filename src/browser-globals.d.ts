interface Window {
  TWK?: Record<string, ((...args: unknown[]) => unknown) | undefined>;
  TakweenStudio?: {
    showMessage(title: string, message: string): void;
    navigateToPage(pageId: string): string;
    goBack(): string;
    showSheet(sheetId: string): { type: string; sheetId: string };
    hideSheet(sheetId: string): { type: string; sheetId: string };
    showToast(toastId: string): { type: string; toastId: string };
    showElement(elementId: string): { type: string; elementId: string };
    hideElement(elementId: string): { type: string; elementId: string };
  };
  electronWindow?: {
    minimize(): void;
    toggleMaximize(): void;
    close(): void;
    isMaximized(): Promise<boolean>;
    readPluginFile(relativePath: string): Promise<string>;
    savePlugin(plugin: import("./plugin-system.ts").PluginDefinition): Promise<void>;
    readAppFile(relativePath: string): Promise<Uint8Array>;
    saveExportFile(
      fileName: string,
      contents: string | Uint8Array,
    ): Promise<boolean>;
    setMenuLanguage(language: string): void;
    onMaximizedChange(callback: (maximized: boolean) => void): () => void;
    onMenuCommand(callback: (command: string) => void): () => void;
  };
}
 
interface JSZipObject {
  dir: boolean;
  _data?: { uncompressedSize?: number };
  async(type: "string"): Promise<string>;
}

declare class JSZip {
  static loadAsync(data: ArrayBuffer): Promise<JSZip>;
  files: Record<string, JSZipObject>;
  file(path: string): JSZipObject | null;
  file(
    path: string,
    data: string | ArrayBuffer,
    options?: { base64?: boolean },
  ): this;
  generateAsync(options: { type: "blob" }): Promise<Blob>;
}
