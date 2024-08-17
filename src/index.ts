/* eslint-disable n/no-process-env */
/* eslint-disable @typescript-eslint/no-unused-vars */
import dotenv from 'dotenv'
import fs from 'fs/promises'
import path from 'path'
import { defineCliApp, getFlagAsString, getFlagAsStringArray, log, spawn } from 'svag-cli-utils'
import { z } from 'zod'

const getPpOptions = async ({ cwd, flags }: { cwd: string; flags: Record<string, any> }) => {
  const envFilesPaths = getFlagAsStringArray({
    flags,
    keys: ['env', 'e'],
  })
  const normalizedEnvFilesPaths = envFilesPaths.map((envFilePath) => path.resolve(cwd, envFilePath))
  const envFilesValues = await (async () => {
    const envFilesValues = {} as Record<string, string>
    for (const envFilePath of normalizedEnvFilesPaths) {
      const envFileValues = dotenv.parse(await fs.readFile(envFilePath, 'utf8'))
      Object.assign(envFilesValues, envFileValues)
    }
    return envFilesValues
  })()
  const vaultTitle = getFlagAsString({
    flags,
    keys: ['vault', 'v'],
    coalesce: envFilesValues.OPENV_VAULT_TITLE || process.env.OPENV_VAULT_TITLE,
  })
  const recordTitle = getFlagAsString({
    flags,
    keys: ['record', 'r'],
    coalesce: envFilesValues.OPENV_RECORD_TITLE || process.env.OPENV_RECORD_TITLE,
  })
  const fieldTitle = getFlagAsString({
    flags,
    keys: ['field', 'n'],
    coalesce: envFilesValues.OPENV_NOTE_TITLE || process.env.OPENV_NOTE_TITLE,
  })
  const resultEnvFilePathRaw = getFlagAsString({
    flags,
    keys: ['output', 'o'],
    coalesce: envFilesValues.OPENV_ENV_FILE || process.env.OPENV_ENV_FILE,
  })
  const resultEnvFilePath = resultEnvFilePathRaw ? path.resolve(cwd, resultEnvFilePathRaw) : undefined
  const options = z
    .object({
      vaultTitle: z.string().min(1),
      recordTitle: z.string().min(1),
      fieldTitle: z.string().min(1),
      envFilePath: z.string().min(1),
    })
    .parse({
      vaultTitle,
      recordTitle,
      fieldTitle,
      envFilePath: resultEnvFilePath,
    })
  return options
}
type PPOptions = Awaited<ReturnType<typeof getPpOptions>>

const getVaultIdByName = async ({ vaultTitle, cwd }: { vaultTitle: string; cwd: string }) => {
  const list = await spawn({
    command: `op vault list`,
    verbose: false,
    cwd,
  })
  const lines = list.split('\n')
  const line = lines.find((line) => line.includes(vaultTitle))
  const vaultId = line?.split(/\s+/)[0]
  if (!vaultId) {
    throw new Error(`Vault with title "${vaultTitle}" not found`)
  }
  return vaultId
}

const getOpValue = async ({
  vaultTitle,
  recordTitle,
  fieldTitle,
  cwd,
}: {
  vaultTitle: string
  recordTitle: string
  fieldTitle: string
  cwd: string
}) => {
  const resultRaw = await spawn({
    command: `op item get "${recordTitle}" --vault "${vaultTitle}" --field "${fieldTitle}"`,
    cwd,
    verbose: false,
  })
  const result = resultRaw.trim().replace(/^"/, '').replace(/"$/, '')
  return result
}

const setOpValue = async ({
  vaultTitle,
  recordTitle,
  fieldTitle,
  value,
  cwd,
}: {
  vaultTitle: string
  recordTitle: string
  fieldTitle: string
  value: string
  cwd: string
}) => {
  const result = await spawn({
    command: `op item edit "${recordTitle}" --vault "${vaultTitle}" "${fieldTitle}=${value}"`,
    cwd,
    verbose: false,
  })
  return result
}

defineCliApp(async ({ cwd, command, args, argr, flags }) => {
  switch (command) {
    case 'pull': {
      const { fieldTitle, recordTitle, vaultTitle, envFilePath } = await getPpOptions({ cwd, flags })
      const result = await getOpValue({
        vaultTitle,
        recordTitle,
        fieldTitle,
        cwd,
      })
      await fs.writeFile(envFilePath, result)
      log.green(`Field "${fieldTitle}" from record "${recordTitle}" in vault "${vaultTitle}" saved to "${envFilePath}"`)
      break
    }

    case 'push': {
      const { fieldTitle, recordTitle, vaultTitle, envFilePath } = await getPpOptions({ cwd, flags })
      const value = await fs.readFile(envFilePath, 'utf8')
      if (!value) {
        throw new Error(`Value from "${envFilePath}" is empty`)
      }
      await setOpValue({
        vaultTitle,
        recordTitle,
        fieldTitle,
        value,
        cwd,
      })
      log.green(
        `Field "${fieldTitle}" in record "${recordTitle}" in vault "${vaultTitle}" updated by value from "${envFilePath}"`
      )
      break
    }

    case 'h': {
      log.black(`Commands:
      pull -e <envFilePath> -v <vaultTitle> -r <recordTitle> -n <fieldTitle> -o <resultEnvFilePath>
      (pull field from 1password)

      push -e <envFilePath> -v <vaultTitle> -r <recordTitle> -n <fieldTitle> -o <resultEnvFilePath>
      (push field to 1password)

      h — help
      `)
      break
    }

    default: {
      log.red('Unknown command:', command)
      break
    }
  }
})
