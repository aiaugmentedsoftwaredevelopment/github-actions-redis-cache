/**
 * Tar+Gzip compression format handler
 * Default and preferred compression format for best compatibility and compression ratio
 */
import { CompressionFormat, CompressionHandler } from '../types';
export declare class TarGzipHandler implements CompressionHandler {
    readonly format = CompressionFormat.TAR_GZIP;
    readonly priority = 100;
    detect(): Promise<boolean>;
    compress(paths: string[], outputFile: string, compressionLevel: number): Promise<void>;
    extract(archivePath: string, targetDir: string): Promise<void>;
}
//# sourceMappingURL=tar-gzip.d.ts.map