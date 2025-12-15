
export interface AppSettings {
  threshold: number;
  scale: number;
  imageSize: number; // Controls the size of the image on the canvas (10-100%)
  smooth: number; // Bitmap smoothing
  vectorSmoothing: number; // Vector path smoothing
  stencilMode: boolean;
  bezierMode: boolean;
  bridgeWidth: number;
  makerName: string;
}

export interface ImageDimensions {
  width: number;
  height: number;
}

export type MaskGrid = boolean[][];

export interface ProcessedResult {
  mask: MaskGrid;
  internalWidth: number;
  internalHeight: number;
  previewUrl?: string; // Data URL for the preview if needed externally
}

// Global types for File System Access API (Native Save As Dialog)
declare global {
  interface Window {
    showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
  }
}

export interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: FilePickerAcceptType[];
  excludeAcceptAllOption?: boolean;
}

export interface FilePickerAcceptType {
  description?: string;
  accept: Record<string, string[]>;
}

export interface FileSystemFileHandle {
  createWritable(): Promise<FileSystemWritableFileStream>;
}

export interface FileSystemWritableFileStream extends WritableStream {
  write(data: Blob | string | BufferSource): Promise<void>;
  close(): Promise<void>;
}
