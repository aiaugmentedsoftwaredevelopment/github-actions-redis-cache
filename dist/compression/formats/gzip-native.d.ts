/**
 * Native Node.js Gzip compression format handler
 * Uses tar-stream and zlib for cross-platform compression without external tools
 * Note: This creates a tar.gz archive (tar + gzip), same as the shell-based gzip handler
 */
import { CompressionFormat, CompressionHandler } from '../types';
export declare class GzipNativeHandler implements CompressionHandler {
    readonly format = CompressionFormat.GZIP;
    readonly priority = 100;
    detect(): Promise<boolean>;
    compress(paths: string[], outputFile: string, compressionLevel: number): Promise<void>;
    private addToTar;
    extract(archivePath: string, targetDir: string): Promise<void>;
}
//# sourceMappingURL=gzip-native.d.ts.map