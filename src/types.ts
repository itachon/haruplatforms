export type Platform = 'windows' | 'mac' | 'linux' | 'android' | 'ios';

export const DESKTOP: Platform[] = ['windows', 'mac', 'linux'];
export const MOBILE: Platform[] = ['android', 'ios'];
export const ALL_PLATFORMS: Platform[] = [...DESKTOP, ...MOBILE];

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

export interface PackageJson {
  name?: string;
  productName?: string;
  version?: string;
  description?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export interface Project {
  root: string;
  pkg: PackageJson;
  packageManager: PackageManager;
}

export type FindingLevel = 'ok' | 'info' | 'warn' | 'error';

/** Resultado del análisis, escrito para alguien sin conocimientos técnicos. */
export interface Finding {
  level: FindingLevel;
  message: string;
  hint?: string;
}

export interface Adapter {
  id: string;
  detect(project: Project): boolean;
  /** Nombre legible, p.ej. "Vue 3 + Vite". */
  describe(project: Project): string;
  analyze(project: Project): Finding[];
  /** Instala dependencias, compila y devuelve la ruta absoluta del sitio estático. */
  build(project: Project, outDir: string): Promise<string>;
}

export interface AppConfig {
  name: string;
  id: string;
  version: string;
  icon?: string;
}

export interface Artifact {
  platform: Platform;
  path: string;
  note?: string;
}
