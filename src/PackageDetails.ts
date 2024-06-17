import { realpathSync } from "fs"
import { join, relative } from "./path"
import { spawnSafeSync } from "./spawnSafe"

export interface PackageDetails {
  humanReadablePathSpecifier: string
  pathSpecifier: string
  path: string
  /** Realpath to the install location, relative to the app path */
  realpath?: string
  name: string
  isNested: boolean
  packageNames: string[]
  repoRoot?: string
}

export interface PatchedPackageDetails extends PackageDetails {
  version: string
  patchFilename: string
  isDevOnly: boolean
  sequenceName?: string
  sequenceNumber?: number
}

export function parseNameAndVersion(
  str: string,
): {
  packageName: string
  version?: string
  sequenceName?: string
  sequenceNumber?: number
} | null {
  const parts = str
    .split("+")
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length === 0) {
    return null
  }
  if (parts.length === 1) {
    return { packageName: str }
  }
  const versionIndex = parts.findIndex((part) =>
    part.match(/^\d+\.\d+\.\d+.*$/),
  )
  if (versionIndex === -1) {
    const [scope, name] = parts
    return { packageName: `${scope}/${name}` }
  }
  const nameParts = parts.slice(0, versionIndex)
  let packageName
  switch (nameParts.length) {
    case 0:
      return null
    case 1:
      packageName = nameParts[0]
      break
    case 2:
      const [scope, name] = nameParts
      packageName = `${scope}/${name}`
      break
    default:
      return null
  }

  const version = parts[versionIndex]
  const sequenceParts = parts.slice(versionIndex + 1)
  if (sequenceParts.length === 0) {
    return { packageName, version }
  }

  // expect sequenceParts[0] to be a number, strip leading 0s
  const sequenceNumber = parseInt(sequenceParts[0].replace(/^0+/, ""), 10)
  if (isNaN(sequenceNumber)) {
    return null
  }
  switch (sequenceParts.length) {
    case 1: {
      return { packageName, version, sequenceNumber }
    }
    case 2: {
      return {
        packageName,
        version,
        sequenceName: sequenceParts[1],
        sequenceNumber,
      }
    }
    default: {
      return null
    }
  }
}

export function getPackageDetailsFromPatchFilename(
  params:
    | string
    | {
        patchFilename: string
        appPath: string
      },
): PatchedPackageDetails | null {
  const { patchFilename, appPath } =
    typeof params === "string"
      ? { patchFilename: params, appPath: undefined }
      : params
  const parts = patchFilename
    .replace(/(\.dev)?\.patch$/, "")
    .split("++")
    .map(parseNameAndVersion)
    .filter((x): x is NonNullable<typeof x> => x !== null)

  if (parts.length === 0) {
    return null
  }

  const lastPart = parts[parts.length - 1]

  if (!lastPart.version) {
    return null
  }

  const path = join(
    "node_modules",
    parts.map(({ packageName: name }) => name).join("/node_modules/"),
  )

  return {
    name: lastPart.packageName,
    version: lastPart.version,
    path,
    realpath: appPath && relative(appPath, realpathSync(join(appPath, path))),
    patchFilename,
    pathSpecifier: parts.map(({ packageName: name }) => name).join("/"),
    humanReadablePathSpecifier: parts
      .map(({ packageName: name }) => name)
      .join(" => "),
    isNested: parts.length > 1,
    packageNames: parts.map(({ packageName: name }) => name),
    isDevOnly: patchFilename.endsWith(".dev.patch"),
    sequenceName: lastPart.sequenceName,
    sequenceNumber: lastPart.sequenceNumber,
    repoRoot: appPath && findGitRoot(appPath),
  }
}

export function getPatchDetailsFromCliString(
  params:
    | string
    | {
        specifier: string
        appPath: string
      },
): PackageDetails | null {
  const { specifier, appPath } =
    typeof params === "string"
      ? { specifier: params, appPath: undefined }
      : params
  const parts = specifier.split("/")

  const packageNames = []

  let scope: string | null = null

  for (let i = 0; i < parts.length; i++) {
    if (parts[i].startsWith("@")) {
      if (scope) {
        return null
      }
      scope = parts[i]
    } else if (scope) {
      packageNames.push(`${scope}/${parts[i]}`)
      scope = null
    } else {
      packageNames.push(parts[i])
    }
  }

  const path = join("node_modules", packageNames.join("/node_modules/"))

  return {
    packageNames,
    path,
    realpath: appPath && relative(appPath, realpathSync(join(appPath, path))),
    name: packageNames[packageNames.length - 1],
    humanReadablePathSpecifier: packageNames.join(" => "),
    isNested: packageNames.length > 1,
    pathSpecifier: specifier,
    repoRoot: appPath && findGitRoot(appPath),
  }
}

function findGitRoot(cwd: string) {
  try {
    const result = spawnSafeSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
    })
    return result.stdout.toString().trim()
  } catch {
    return undefined
  }
}
