import { bookingLine, bookingLook } from '../state'
import { resourceTextOf } from '../strings'

const booked = (state: string | undefined): { _id: string, servoneResource?: string, servoneBookingState?: string } => ({ _id: 'e1', servoneResource: 'res-room', servoneBookingState: state })

describe('booking look', () => {
  it('dashes a pending booking and strikes the ones that no longer hold the slot', () => {
    expect(bookingLook(booked('pending'))).toEqual({ resource: 'res-room', state: 'pending', isPending: true, isVoid: false })
    expect(bookingLook(booked('confirmed'))).toEqual({ resource: 'res-room', state: 'confirmed', isPending: false, isVoid: false })
    for (const state of ['rejected', 'expired', 'cancelled']) expect(bookingLook(booked(state))).toMatchObject({ isPending: false, isVoid: true })
  })

  it('ignores events without a resource or with an unknown state', () => {
    expect(bookingLook({ _id: 'e1', servoneBookingState: 'pending' })).toBeUndefined()
    expect(bookingLook(booked('approved'))).toBeUndefined()
    expect(bookingLook(booked(undefined))).toBeUndefined()
  })
})

describe('booking line', () => {
  it('names who the pending booking waits for', () => {
    expect(bookingLine(resourceTextOf('vi'), 'Phòng họp lớn', 'pending', 'Lan')).toBe('Phòng họp lớn · Chờ Lan duyệt')
    expect(bookingLine(resourceTextOf('en'), 'Big room', 'pending', 'Lan')).toBe('Big room · Waiting for Lan')
  })

  it('falls back to the state label', () => {
    expect(bookingLine(resourceTextOf('vi'), 'Xe 7 chỗ', 'pending', undefined)).toBe('Xe 7 chỗ · Chờ duyệt')
    expect(bookingLine(resourceTextOf('vi'), 'Xe 7 chỗ', 'expired', 'Lan')).toBe('Xe 7 chỗ · Hết hạn')
  })
})
