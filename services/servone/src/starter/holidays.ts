import core, { type Data, type Ref } from '@hcengineering/core'
import hr, { type PublicHoliday } from '@hcengineering/hr'
import { type SetupClient, systemFactory } from '../workflows/setup'

interface Holiday {
  title: string
  year: number
  month: number
  day: number
}

const VN_TZ_OFFSET = -420

export const VN_HOLIDAYS: Holiday[] = [
  ...[2026, 2027].flatMap((year): Holiday[] => [
    { title: 'Tết Dương lịch', year, month: 1, day: 1 },
    { title: 'Giải phóng miền Nam', year, month: 4, day: 30 },
    { title: 'Quốc tế Lao động', year, month: 5, day: 1 },
    { title: 'Quốc khánh', year, month: 9, day: 2 }
  ]),
  { title: 'Tết Nguyên đán (30 Tết)', year: 2026, month: 2, day: 16 },
  { title: 'Tết Nguyên đán (mùng 1)', year: 2026, month: 2, day: 17 },
  { title: 'Tết Nguyên đán (mùng 2)', year: 2026, month: 2, day: 18 },
  { title: 'Tết Nguyên đán (mùng 3)', year: 2026, month: 2, day: 19 },
  { title: 'Giỗ Tổ Hùng Vương', year: 2026, month: 4, day: 27 },
  { title: 'Tết Nguyên đán (30 Tết)', year: 2027, month: 2, day: 5 },
  { title: 'Tết Nguyên đán (mùng 1)', year: 2027, month: 2, day: 6 },
  { title: 'Tết Nguyên đán (mùng 2)', year: 2027, month: 2, day: 7 },
  { title: 'Tết Nguyên đán (mùng 3)', year: 2027, month: 2, day: 8 },
  { title: 'Giỗ Tổ Hùng Vương', year: 2027, month: 4, day: 16 }
]

const holidayId = (holiday: Holiday): Ref<PublicHoliday> =>
  `servone:holiday:vn:${holiday.year}-${holiday.month}-${holiday.day}` as Ref<PublicHoliday>

export async function seedHolidays (client: SetupClient): Promise<void> {
  const existing = await client.findAll(hr.class.PublicHoliday, { _id: { $in: VN_HOLIDAYS.map(holidayId) } })
  const known = new Set(existing.map((holiday) => holiday._id))
  for (const holiday of VN_HOLIDAYS) {
    const id = holidayId(holiday)
    if (known.has(id)) continue
    const fields: Data<PublicHoliday> = {
      title: holiday.title,
      description: '',
      date: { year: holiday.year, month: holiday.month - 1, day: holiday.day, offset: VN_TZ_OFFSET },
      department: hr.ids.Head
    }
    await client.tx(systemFactory.createTxCreateDoc(hr.class.PublicHoliday, core.space.Workspace, fields, id))
  }
}
