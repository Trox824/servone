const COPY_MARK = ':of:'

// Stock refs are hex ids or plugin:kind:Name, so none contain COPY_MARK; kept import-free for front, services and scripts.
export function baseTypeOf<T extends string> (id: T): T {
  const at = id.indexOf(COPY_MARK)
  return at < 0 ? id : (id.slice(0, at) as T)
}

export function ownerOf (id: string): string | undefined {
  const at = id.lastIndexOf(COPY_MARK)
  return at < 0 ? undefined : id.slice(at + COPY_MARK.length)
}

// Always built from the root base, so copying a copy never chains ids.
export function copyIdOf<T extends string> (base: T, project: string): T {
  return `${baseTypeOf(base)}${COPY_MARK}${project}` as T
}
