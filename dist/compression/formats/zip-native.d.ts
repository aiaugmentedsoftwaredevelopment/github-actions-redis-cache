/**
 * Native Node.js ZIP compression format handler
 * Uses archiver and unzipper for cross-platform compression without external tools
 */
import { CompressionFormat, CompressionHandler } from '../types';
export declare class ZipNativeHandler implements CompressionHandler {
    readonly format = CompressionFormat.ZIP;
    readonly priority = 150;
    detect(): Promise<boolean>;
    compress(paths: string[], outputFile: string, compressionLevel: number): Promise<void>;
    extract(archivePath: string, targetDir: string): Promise<void>;
}
//# sourceMappingURL=zip-native.d.ts.map