import { toCsv } from './csv'

const SAMPLE_ROWS = [
  ['Họ tên', 'Email', 'Chức danh', 'Phòng ban', 'Email quản lý'],
  ['Nguyễn Văn An', 'an.nguyen@example.com', 'Giám đốc', 'Ban giám đốc', ''],
  ['Trần Thị Bình', 'binh.tran@example.com', 'Trưởng phòng kinh doanh', 'Kinh doanh', 'an.nguyen@example.com'],
  ['Lê Hoàng Cường', 'cuong.le@example.com', 'Nhân viên kinh doanh', 'Kinh doanh', 'binh.tran@example.com'],
  ['Phạm Thu Dung', 'dung.pham@example.com', 'Nhân viên kinh doanh', 'Kinh doanh', 'binh.tran@example.com'],
  ['Hoàng Minh Đức', 'duc.hoang@example.com', 'Trưởng phòng kỹ thuật', 'Kỹ thuật', 'an.nguyen@example.com'],
  ['Vũ Thị Hà', 'ha.vu@example.com', 'Kỹ sư phần mềm', 'Kỹ thuật', 'duc.hoang@example.com'],
  ['Đặng Quốc Huy', 'huy.dang@example.com', 'Kỹ sư phần mềm', 'Kỹ thuật', 'duc.hoang@example.com'],
  ['Bùi Ngọc Lan', 'lan.bui@example.com', 'Kế toán trưởng', 'Kế toán', 'an.nguyen@example.com'],
  ['Đỗ Thị Mai', 'mai.do@example.com', 'Kế toán viên', 'Kế toán', 'lan.bui@example.com'],
  ['Ngô Thanh Phong', 'phong.ngo@example.com', 'Chuyên viên nhân sự, tuyển dụng', 'Ban giám đốc', 'an.nguyen@example.com']
]

export const SAMPLE_CSV = toCsv(SAMPLE_ROWS)
export const SAMPLE_FILE_NAME = 'servone-nhan-vien-mau.csv'
