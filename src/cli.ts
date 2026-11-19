#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { analyze, build } from './pipeline.js';
import { ALL_PLATFORMS, type AppConfig, type Platform, type Project } from './types.js';
import { CommandError } from './utils/exec.js';
import { c, log, printFindings } from './utils/log.js';

const HELP = `
${c.bold('todo2todo')} — convierte tu proyecto web en una app de escritorio o móvil

${c.bold('Uso')}
  todo2todo analyze <carpeta>              Revisa si el proyecto es compatible
  todo2todo build <carpeta> [opciones]     Genera las apps

${c.bold('Opciones de build')}
  -t, --target <lista>   Plataformas separadas por coma: ${ALL_PLATFORMS.join(', ')}
                         (por defecto: la de esta computadora + android)
  -n, --name <nombre>    Nombre visible de la app
      --id <id>          Identificador único, p.ej. com.miempresa.miapp
      --version <x.y.z>  Versión de la app
  -i, --icon <png>       Ícono PNG cuadrado (mínimo 1024x1024 recomendado)
  -o, --out <carpeta>    Dónde guardar los resultados (por defecto: ./out/<id>)
      --verbose          Muestra toda la salida de los comandos
`;

function hostDesktop(): Platform {
  return process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux';
}

function slug(text: string): string {
  const s = text.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');
  return /^[a-z]/.test(s) ? s : `app${s}`;
}

function humanize(name: string): string {
  return name.replace(/^@[^/]+\//, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function parsePlatforms(value: string | undefined): Platform[] {
  if (!value) return [hostDesktop(), 'android'];
  const list = value.split(',').map((s) => s.trim().toLowerCase());
  const invalid = list.filter((p) => !ALL_PLATFORMS.includes(p as Platform));
  if (invalid.length) throw new Error(`Plataforma desconocida: ${invalid.join(', ')}. Opciones: ${ALL_PLATFORMS.join(', ')}`);
  return [...new Set(list)] as Platform[];
}

function appConfig(project: Project, values: Record<string, string | boolean | undefined>): AppConfig {
  const name = (values.name as string) ?? project.pkg.productName ?? humanize(project.pkg.name ?? path.basename(project.root));
  const id = (values.id as string) ?? `com.todo2todo.${slug(name)}`;
  if (!/^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/.test(id)) {
    throw new Error(`El identificador "${id}" no es válido. Usa un formato como com.miempresa.miapp`);
  }
  const icon = values.icon ? path.resolve(values.icon as string) : undefined;
  if (icon && !fs.existsSync(icon)) throw new Error(`No se encontró el ícono: ${icon}`);
  return {
    name,
    id: id.toLowerCase(),
    version: (values.version as string) ?? project.pkg.version ?? '1.0.0',
    icon,
  };
}

async function main(): Promise<number> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      target: { type: 'string', short: 't' },
      name: { type: 'string', short: 'n' },
      id: { type: 'string' },
      version: { type: 'string' },
      icon: { type: 'string', short: 'i' },
      out: { type: 'string', short: 'o' },
      verbose: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  const [command, dir] = positionals;
  if (values.help || !command || !dir || !['analyze', 'build'].includes(command)) {
    console.log(HELP);
    return values.help ? 0 : 1;
  }
  if (values.verbose) process.env.TODO2TODO_VERBOSE = '1';

  log.step('Analizando el proyecto');
  const analysis = analyze(dir);
  printFindings(analysis.findings);
  const blocked = analysis.findings.some((f) => f.level === 'error');
  if (command === 'analyze') return blocked ? 1 : 0;
  if (blocked) {
    log.error('No se puede continuar hasta resolver los problemas marcados con ✖.');
    return 1;
  }

  const app = appConfig(analysis.project, values);
  const platforms = parsePlatforms(values.target);
  const outDir = values.out ?? path.join('out', app.id);
  log.info(c.dim(`App: ${app.name} (${app.id}) v${app.version} → ${platforms.join(', ')}`));

  const artifacts = await build(analysis, { app, platforms, outDir });

  log.step('Listo');
  for (const a of artifacts) {
    console.log(`  ${c.green('✔')} ${c.bold(a.platform.padEnd(8))} ${a.path}`);
    if (a.note) console.log(`    ${c.dim(a.note)}`);
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    log.error(err instanceof Error ? err.message : String(err));
    if (err instanceof CommandError) {
      console.error(c.dim(err.output.split('\n').slice(-25).join('\n')));
    }
    process.exit(1);
  },
);
