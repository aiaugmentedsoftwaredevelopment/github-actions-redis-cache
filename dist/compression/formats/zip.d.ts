/**
 * ZIP compression format handler
 * Fallback option with good Windows compatibility
 */
import { CompressionFormat, CompressionHandler } from '../types';
export declare class ZipHandler implements CompressionHandler {
    readonly format = CompressionFormat.ZIP;
    readonly priority = 50;
    detect(): Promise<boolean>;
    compress(paths: string[], outputFile: string, compressionLevel: number): Promise<void>;
    extract(archivePath: string, targetDir: string): Promise<void>;
}
//# sourceMappingURL=zip.d.ts.map