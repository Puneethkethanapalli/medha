declare module 'expo-pdf-text-extract' {
  export function isAvailable(): boolean;
  export function extractText(filePath: string): Promise<string>;
  export function getPageCount(filePath: string): Promise<number>;
  export function extractTextFromPage(filePath: string, pageNumber: number): Promise<string>;
  export function extractTextWithInfo(filePath: string): Promise<{
    text: string;
    pageCount: number;
    success: boolean;
    error?: string;
  }>;
}
