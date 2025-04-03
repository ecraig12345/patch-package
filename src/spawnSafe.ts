import { sync as spawnSync } from "cross-spawn"
import { SpawnOptions } from "child_process"

export interface SpawnSafeOptions extends SpawnOptions {
  throwOnError?: boolean
  maxBuffer?: number
}

const defaultOptions: SpawnSafeOptions = {
  throwOnError: true,
}

export const spawnSafeSync = (
  command: string,
  args: string[] = [],
  options?: SpawnSafeOptions,
) => {
  const mergedOptions = Object.assign({}, defaultOptions, options)
  const result = spawnSync(command, args, options)
  if (result.error || result.status !== 0) {
    const message =
      `command failed: ${[command, ...args].join(" ")} (cwd: ${
        mergedOptions.cwd
      })\n` +
      `stdout:\n${result.stdout.toString()}\nstderr:\n${result.stderr.toString()}`
    if (mergedOptions.throwOnError) {
      throw new Error(message)
    } else {
      console.log(message)
    }
  }
  return result
}
