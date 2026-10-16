interface TreeType {
  _id: string
  extends?: string
}

export function treeRoots<T extends TreeType> (types: T[]): T[] {
  const listed = new Set(types.map((it) => it._id))
  return types.filter((it) => it.extends === undefined || !listed.has(it.extends))
}
