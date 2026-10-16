export function fold (text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('vi').replace(/đ/g, 'd')
}
