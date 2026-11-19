import { spawn } from 'node:child_process';
import { c } from './log.js';

export class CommandError extends Error {
  constructor(public command: string, public code: number | null, public output: string) {
    super(`El comando falló (código ${code}): ${command}`);
  }
}

/** Cita un argumento para la shell del sistema. */
export function q(arg: string): string {
  return /[\s"&|<>^]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg;
}

/**
 * Ejecuta un comando mostrando su salida atenuada y guardando las últimas
 * líneas para poder explicar el error si falla.
 */
export function run(command: string, cwd: string, env: NodeJS.ProcessEnv = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    console.log(c.dim(`    $ ${command}`));
    const fullEnv = { ...process.env, ...env };
    // Las terminales de VS Code lo definen y hace que Electron arranque como Node.
    delete fullEnv.ELECTRON_RUN_AS_NODE;
    const child = spawn(command, { cwd, shell: true, env: fullEnv });
    let output = '';
    const onData = (chunk: Buffer) => {
      const text = chunk.toString();
      output = (output + text).slice(-20_000);
      if (process.env.TODO2TODO_VERBOSE) process.stdout.write(c.dim(text));
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (err) => reject(new CommandError(command, null, err.message)));
    child.on('close', (code) => {
      if (code === 0) resolve(output);
      else reject(new CommandError(command, code, output));
    });
  });
}
