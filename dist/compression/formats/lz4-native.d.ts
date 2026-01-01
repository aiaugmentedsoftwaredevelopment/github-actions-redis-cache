/**
 * Native Node.js LZ4 compression format handler
 * Uses lz4js for ultra-fast compression without external tools
 */
import { CompressionFormat, CompressionHandler } from '../types';
export declare class Lz4NativeHandler implements CompressionHandler {
    readonly format = CompressionFormat.LZ4;
    readonly priority = 50;
    detect(): Promise<boolean>;
    compress(paths: string[], outputFile: string, compressionLevel: number): Promise<void>;
    private addToTar;
    extract(archivePath: string, targetDir: string): Promise<void>;
}
//# sourceMappingURL=lz4-native.d.ts.map