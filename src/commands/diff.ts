import { dirname, resolve } from 'node:path'
import { Command } from 'commander'
import { loadConfig, type EnvType } from '../config'
import { getEnvFilePath, loadEnvFile, shouldExclude } from '../utils/dotenv'
import { getWranglerSecrets } from '../utils/sync-wrangler'
import { c, printTable, type TableColumn, type TableRow } from '../utils/color'

export const diffCommand = new Command('diff')
  .description('Compare environment variables with sync targets')
  .option('-e, --env <env>', 'environment: dev | prod', 'dev')
  .action(async (options) => {
    const config = await loadConfig()
    const env = options.env as EnvType

    if (!config.sync?.convex && !config.sync?.wrangler) {
      console.error('Error: no sync targets configured in env.config.ts')
      process.exit(1)
    }

    await diffAll(config, env)
  })

async function diffAll(
  config: Awaited<ReturnType<typeof loadConfig>>,
  env: EnvType
) {
  const envPath = getEnvFilePath(config, env)
  let envRecord: Record<string, string> = {}

  try {
    envRecord = await loadEnvFile(envPath)
  } catch {
    console.error(`Failed to load ${envPath}`)
    process.exit(1)
  }

  // 收集所有数据源
  const hasConvex = !!config.sync?.convex
  const hasWrangler = !!config.sync?.wrangler

  const convexRecord = hasConvex ? await getConvexEnv(env) : {}
  const wranglerKeys = hasWrangler
    ? await getWranglerSecretsForDiff(config, env)
    : new Set<string>()

  // 收集所有 keys
  const allKeys = new Set([
    ...Object.keys(envRecord),
    ...Object.keys(convexRecord),
    ...wranglerKeys,
  ])

  // 过滤排除的 keys
  const excludePatterns = [
    ...(config.sync?.convex?.exclude ?? []),
    ...(config.sync?.wrangler?.exclude ?? []),
  ]

  // 构建表格数据
  const envFileName = envPath.split('/').pop() ?? `.env.${env}`
  const columns: TableColumn[] = [
    { key: 'key', label: 'KEY' },
    { key: 'env', label: envFileName, width: 20 },
  ]

  if (hasConvex) {
    columns.push({ key: 'convex', label: 'convex', width: 20 })
  }
  if (hasWrangler) {
    columns.push({ key: 'wrangler', label: 'wrangler', width: 10 })
  }
  columns.push({ key: 'synced', label: 'synced' })

  const rows: TableRow[] = []

  for (const key of [...allKeys].sort()) {
    if (shouldExclude(key, excludePatterns)) continue

    const envVal = envRecord[key]
    const convexVal = hasConvex ? convexRecord[key] : undefined
    const wranglerExists = hasWrangler ? wranglerKeys.has(key) : undefined

    // 判断同步状态
    const { synced, issues } = checkSyncStatus({
      envVal,
      convexVal,
      wranglerExists,
      hasConvex,
      hasWrangler,
    })

    // 只显示有问题的行
    if (synced) continue

    const row: TableRow = {
      key,
      env: formatValue(envVal),
    }

    if (hasConvex) {
      const convexMatches = envVal === convexVal
      row.convex = convexMatches
        ? formatValue(convexVal)
        : c.yellow(formatValue(convexVal))
    }

    if (hasWrangler) {
      const wranglerMatches = envVal !== undefined && wranglerExists
      row.wrangler = wranglerExists
        ? wranglerMatches
          ? c.green('✓')
          : c.yellow('✓')
        : c.dim('─')
    }

    row.synced = c.red(`✗ ${issues.join(', ')}`)
    rows.push(row)
  }

  if (rows.length === 0) {
    console.log(c.success(`All ${allKeys.size} keys are in sync`))
    return
  }

  console.log(`\n${c.warn(`${rows.length} keys out of sync`)}\n`)
  printTable(columns, rows)
  console.log()
}

function checkSyncStatus(opts: {
  envVal: string | undefined
  convexVal: string | undefined
  wranglerExists: boolean | undefined
  hasConvex: boolean
  hasWrangler: boolean
}): { synced: boolean; issues: string[] } {
  const { envVal, convexVal, wranglerExists, hasConvex, hasWrangler } = opts
  const issues: string[] = []

  // .env 中没有，但其他地方有
  if (envVal === undefined) {
    if (hasConvex && convexVal !== undefined) {
      issues.push('removed locally')
    }
    if (hasWrangler && wranglerExists) {
      issues.push('removed locally')
    }
    return { synced: issues.length === 0, issues: [...new Set(issues)] }
  }

  // .env 中有，检查其他地方
  if (hasConvex && convexVal !== envVal) {
    if (convexVal === undefined) {
      issues.push('missing in convex')
    } else {
      issues.push('convex differs')
    }
  }

  if (hasWrangler && !wranglerExists) {
    issues.push('missing in wrangler')
  }

  return { synced: issues.length === 0, issues }
}

function formatValue(val: string | undefined): string {
  if (val === undefined) return c.dim('─')
  if (val.length <= 16) return val
  return `${val.slice(0, 6)}...${val.slice(-6)}`
}

async function getConvexEnv(env: EnvType): Promise<Record<string, string>> {
  const args =
    env === 'prod' ? ['convex', 'env', 'list', '--prod'] : ['convex', 'env', 'list']

  const result = Bun.spawnSync(args, { stdout: 'pipe', stderr: 'pipe' })

  if (result.exitCode !== 0) {
    return {}
  }

  const output = result.stdout.toString()
  const record: Record<string, string> = {}

  for (const line of output.split('\n')) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (match?.[1]) {
      record[match[1]] = match[2] ?? ''
    }
  }

  return record
}

async function getWranglerSecretsForDiff(
  config: Awaited<ReturnType<typeof loadConfig>>,
  env: EnvType
): Promise<Set<string>> {
  const wranglerConfig = config.sync?.wrangler
  if (!wranglerConfig) return new Set()

  const configPath = wranglerConfig.config ?? './wrangler.jsonc'
  const wranglerDir = dirname(resolve(configPath))

  return getWranglerSecrets(wranglerDir, wranglerConfig, env)
}
