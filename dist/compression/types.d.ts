/**
 * Compression module types and interfaces
 */
export declare enum CompressionFormat {
    TAR_GZIP = "tar+gzip",
    ZIP = "zip",
    GZIP = "gzip",
    LZ4 = "lz4"
}
export interface CompressionHandler {
    /**
     * Format identifier
     */
    readonly format: CompressionFormat;
    /**
     * Priority for auto-selection (higher = preferred)
     * tar+gzip: 100 (best compression, most compatible)
     * zip: 50 (good compatibility, Windows-friendly)
     * gzip: 25 (basic compression, limited to single files)
     */
    readonly priority: number;
    /**
     * Detect if this compression tool is available on the system
     */
    detect(): Promise<boolean>;
    /**
     * Compress files/directories into an archive
     * @param paths - Array of file/directory paths to compress
     * @param outputFile - Path where archive should be created
     * @param compressionLevel - Compression level (1-9, where 9 = best compression)
     */
    compress(paths: string[], outputFile: string, compressionLevel: number): Promise<void>;
    /**
     * Extract archive to target directory
     * @param archivePath - Path to archive file
     * @param targetDir - Directory where files should be extracted
     */
    extract(archivePath: string, targetDir: string): Promise<void>;
}
export interface DetectionResult {
    format: CompressionFormat;
    available: boolean;
    command: string;
    version?: string;
}
export interface CompressionOptions {
    /**
     * Compression level (1-9)
     */
    level: number;
    /**
     * Working directory for relative paths
     */
    workingDir: string;
    /**
     * Whether to follow symbolic links
     */
    followSymlinks?: boolean;
    /**
     * Verbose output for debugging
     */
    verbose?: boolean;
}
//# sourceMappingURL=types.d.ts.map