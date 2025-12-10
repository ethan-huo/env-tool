import { Command } from 'commander'
import { loadConfig } from '../config'
import { getEnvFilePath } from '../utils/dotenv'
import { c } from '../utils/color'

export const setCommand = new Command('set')
  .description('Set environment variable')
  .argument('<key>', 'variable name')
  .argument('<value>', 'variable value')
  .option('-e, --env <env>', 'environment: dev | prod | all', 'dev')
  .option('--plain', 'write as plain text (no encryption)', false)
  .action(async (key: string, value: string, options) => {
    const config = await loadConfig()
    const env = options.env as 'dev' | 'prod' | 'all'

    const envs: Array<'dev' | 'prod'> = env === 'all' ? ['dev', 'prod'] : [env]

    // Check for .env.keys
    const keysExists = await Bun.file('.env.keys').exists()
    if (!keysExists && !options.plain) {
      console.log(c.warn('.env.keys not found - writing plain text value'))
    }

    for (const e of envs) {
      const envPath = getEnvFilePath(config, e)

      try {
        const args = ['dotenvx', 'set', key, value, '-f', envPath]
        if (options.plain || !keysExists) {
          args.push('--plain')
        }

        const result = Bun.spawnSync(args, { stdout: 'pipe', stderr: 'pipe' })

        if (result.exitCode !== 0) {
          const stderr = result.stderr.toString()
          throw new Error(stderr || 'dotenvx set failed')
        }

        const displayValue = value.length > 30 ? value.slice(0, 27) + '...' : value
        console.log(c.success(`${e}: ${key}=${displayValue}`))
      } catch (error) {
        console.log(c.error(`${e}: ${(error as Error).message}`))
        process.exit(1)
      }
    }
  })
