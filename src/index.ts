/* eslint-disable n/no-process-env */
/* eslint-disable @typescript-eslint/no-unused-vars */
import dotenv from 'dotenv'
import fs from 'fs/promises'
import path from 'path'
import { defineCliApp, getFlagAsString, getFlagAsStringArray, log, spawn } from 'svag-cli-utils'
import { z } from 'zod'

const getEnvFilesValues = async ({ envFilesPaths, cwd }: { envFilesPaths: string[]; cwd: string }) => {
  const normalizedEnvFilesPaths = envFilesPaths.map((envFilePath) => path.resolve(cwd, envFilePath))
  const envFilesValues = await (async () => {
    const envFilesValues = {} as Record<string, string>
    for (const envFilePath of normalizedEnvFilesPaths) {
      const envFileValues = dotenv.parse(await fs.readFile(envFilePath, 'utf8'))
      Object.assign(envFilesValues, envFileValues)
    }
    return envFilesValues
  })()
  return envFilesValues
}

const getEnvContentValues = async ({ envContent, cwd }: { envContent: string; cwd: string }) => {
  const envContentValues = dotenv.parse(envContent)
  return envContentValues
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

// const setOpValue = async ({
//   vaultTitle,
//   recordTitle,
//   fieldTitle,
//   value,
//   cwd,
// }: {
//   vaultTitle: string
//   recordTitle: string
//   fieldTitle: string
//   value: string
//   cwd: string
// }) => {
//   const result = await spawn({
//     command: `op item edit "${recordTitle}" --vault "${vaultTitle}" "${fieldTitle}=${value}"`,
//     cwd,
//     verbose: false,
//   })
//   return result
// }

defineCliApp(async ({ cwd, command, args, argr, flags }) => {
  switch (command) {
    case 'pull': {
      const envFilesPaths = getFlagAsStringArray({
        flags,
        keys: ['env', 'e'],
      })
      const envFilesValues = await getEnvFilesValues({ envFilesPaths, cwd })

      const { vaultTitle, recordTitle, fieldTitle, resultEnvFilePathRaw } = z
        .object({
          vaultTitle: z.string().min(1),
          recordTitle: z.string().min(1),
          fieldTitle: z.string().min(1),
          resultEnvFilePathRaw: z.string().optional(),
        })
        .parse({
          vaultTitle: getFlagAsString({
            flags,
            keys: ['vault', 'v'],
            coalesce: envFilesValues.OPENV_VAULT_TITLE || process.env.OPENV_VAULT_TITLE,
          }),
          recordTitle: getFlagAsString({
            flags,
            keys: ['record', 'r'],
            coalesce: envFilesValues.OPENV_RECORD_TITLE || process.env.OPENV_RECORD_TITLE,
          }),
          fieldTitle: getFlagAsString({
            flags,
            keys: ['field', 'i'],
            coalesce: envFilesValues.OPENV_NOTE_TITLE || process.env.OPENV_NOTE_TITLE,
          }),
          resultEnvFilePathRaw: getFlagAsString({
            flags,
            keys: ['file', 'f'],
            coalesce: envFilesValues.OPENV_ENV_FILE || process.env.OPENV_ENV_FILE,
          }),
        })
      const resultEnvFilePath = resultEnvFilePathRaw ? path.resolve(cwd, resultEnvFilePathRaw) : undefined
      const result = await getOpValue({
        vaultTitle,
        recordTitle,
        fieldTitle,
        cwd,
      })
      if (resultEnvFilePath) {
        await fs.writeFile(resultEnvFilePath, result)
        log.green(
          `Field "${fieldTitle}" from record "${recordTitle}" in vault "${vaultTitle}" saved to "${resultEnvFilePath}"`
        )
      } else {
        log.normal(result)
      }
      break
    }

    case 'push': {
      throw new Error('Update value in 1password by hand for safety')
      // const value = await fs.readFile(resultEnvFilePath, 'utf8')
      // if (!value) {
      //   throw new Error(`Value from "${resultEnvFilePath}" is empty`)
      // }
      // await setOpValue({
      //   vaultTitle,
      //   recordTitle,
      //   fieldTitle,
      //   value,
      //   cwd,
      // })
      // log.green(
      //   `Field "${fieldTitle}" in record "${recordTitle}" in vault "${vaultTitle}" updated by value from "${resultEnvFilePath}"`
      // )
      // break
    }

    case 'line': {
      const envFilesPaths = getFlagAsStringArray({
        flags,
        keys: ['env', 'e'],
      })
      const envFilesValues = await getEnvFilesValues({ envFilesPaths, cwd })
      const resultEnvFilePathRaw = getFlagAsString({
        flags,
        keys: ['file', 'f'],
        coalesce: envFilesValues.OPENV_ENV_FILE || process.env.OPENV_ENV_FILE,
      })
      const before = getFlagAsString({
        flags,
        keys: ['before', 'b'],
        coalesce: '',
      })
      const after = getFlagAsString({
        flags,
        keys: ['after', 'a'],
        coalesce: '',
      })
      const resultEnvContent = await (async () => {
        if (resultEnvFilePathRaw) {
          const resultEnvFilePath = path.resolve(cwd, resultEnvFilePathRaw)
          return await fs.readFile(resultEnvFilePath, 'utf8')
        } else {
          const { vaultTitle, recordTitle, fieldTitle, resultEnvFilePathRaw } = z
            .object({
              vaultTitle: z.string().min(1),
              recordTitle: z.string().min(1),
              fieldTitle: z.string().min(1),
              resultEnvFilePathRaw: z.string().optional(),
            })
            .parse({
              vaultTitle: getFlagAsString({
                flags,
                keys: ['vault', 'v'],
                coalesce: envFilesValues.OPENV_VAULT_TITLE || process.env.OPENV_VAULT_TITLE,
              }),
              recordTitle: getFlagAsString({
                flags,
                keys: ['record', 'r'],
                coalesce: envFilesValues.OPENV_RECORD_TITLE || process.env.OPENV_RECORD_TITLE,
              }),
              fieldTitle: getFlagAsString({
                flags,
                keys: ['field', 'i'],
                coalesce: envFilesValues.OPENV_NOTE_TITLE || process.env.OPENV_NOTE_TITLE,
              }),
            })
          return await getOpValue({
            vaultTitle,
            recordTitle,
            fieldTitle,
            cwd,
          })
        }
      })()

      const envValues = await getEnvContentValues({ envContent: resultEnvContent, cwd })
      const result = Object.entries(envValues)
        // .map(([key, value]) => `${key}="${value.replace(/"/g, '\\"').replace(/(\s)/g, '\\$1')}"`)
        .map(([key, value]) => `${key}="${value.replace(/"/g, '\\"')}"`)
        .join(' ')
      log.normal(before + result + after)
      break
    }

    case 'h': {
      log.black(`Commands:
      pull -e <envFilePath> -v <vaultTitle> -r <recordTitle> -i <fieldTitle> -f <resultEnvFilePath>
      (pull field from 1password)

      push -e <envFilePath> -v <vaultTitle> -r <recordTitle> -i <fieldTitle> -f <resultEnvFilePath>
      (push field to 1password) (disabled)

      line -e <envFilePath> -o <resultEnvFilePath>
      (print envs in one line separated by space with format KEY1="VALUE1" KEY2="VALUE2" ...)

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
