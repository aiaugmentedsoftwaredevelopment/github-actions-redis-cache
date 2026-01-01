/**
 * Compression module - Multi-format compression with auto-detection
 *
 * This module provides:
 * - Auto-detection of available compression tools
 * - Multiple format support (tar+gzip, zip, gzip)
 * - Automatic selection of best available format
 * - Format-specific handlers with unified interface
 * - Detection result caching for performance
 */

export * from './types';
export * from './detector';
export * from './factory';
export * from './formats';
