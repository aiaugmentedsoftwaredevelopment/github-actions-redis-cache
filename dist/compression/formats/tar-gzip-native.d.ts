/**
 * Native Node.js Tar+Gzip compression format handler
 * Uses tar-stream and zlib for cross-platform compression without external tools
 */
import { CompressionFormat, CompressionHandler } from '../types';
export declare class TarGzipNativeHandler implements CompressionHandler {
    readonly format = CompressionFormat.TAR_GZIP;
    readonly priority = 200;
    detect(): Promise<boolean>;
    compress(paths: string[], outputFile: string, compressionLevel: number): Promise<void>;
    private addToTar;
    extract(archivePath: string, targetDir: string): Promise<void>;
}
//# sourceMappingURL=tar-gzip-native.d.ts.map