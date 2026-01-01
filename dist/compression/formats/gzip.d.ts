/**
 * Gzip compression format handler
 * Basic fallback option - limited to single file compression
 * Note: This is a simplified implementation that creates a tar-less gzip archive
 */
import { CompressionFormat, CompressionHandler } from '../types';
export declare class GzipHandler implements CompressionHandler {
    readonly format = CompressionFormat.GZIP;
    readonly priority = 25;
    detect(): Promise<boolean>;
    compress(paths: string[], outputFile: string, compressionLevel: number): Promise<void>;
    extract(archivePath: string, targetDir: string): Promise<void>;
}
//# sourceMappingURL=gzip.d.ts.map