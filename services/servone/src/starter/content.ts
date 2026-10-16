import type { Language } from '../workflows/templates'

// Hook above, dot below and horn only occur in Vietnamese among the scripts our signups use.
const VIETNAMESE_MARKS = /[̛̣̉]/
const VIETNAMESE_WORDS = new Set([
  'nguyen', 'tran', 'le', 'pham', 'hoang', 'huynh', 'phan', 'vu', 'vo', 'dang', 'bui', 'do', 'ho', 'ngo',
  'duong', 'ly', 'dinh', 'truong', 'trinh', 'luong', 'doan', 'quach', 'cong', 'tnhh'
])

export function pickLanguage (workspaceName: string, personName: string): Language {
  const decomposed = `${workspaceName} ${personName}`.normalize('NFD')
  if (/[đĐ]/.test(decomposed) || VIETNAMESE_MARKS.test(decomposed)) return 'vi'
  const words = decomposed.replace(/\p{M}/gu, '').toLowerCase().split(/[^a-z]+/)
  return words.some((word) => VIETNAMESE_WORDS.has(word)) ? 'vi' : 'en'
}

export function resolveLanguage (locale: string | null, workspaceName: string, personName: string): Language {
  return locale === 'vi' || locale === 'en' ? locale : pickLanguage(workspaceName, personName)
}

export const STARTER_KEYS = ['invite', 'project', 'sprint', 'managers', 'leave', 'meeting'] as const
export type StarterKey = typeof STARTER_KEYS[number]

export interface StarterIssue {
  title: string
  body: string
}

export interface StarterContent {
  project: { name: string, description: string }
  general: string
  random: string
  welcome: string
  issues: Record<StarterKey, StarterIssue>
}

export const STARTER: Record<Language, StarterContent> = {
  vi: {
    project: {
      name: 'Bắt đầu',
      description: 'Bốn việc giúp cả nhóm dùng Servone trong tuần đầu. Mỗi việc tự xong khi bạn làm thật. Xong thì lưu trữ hoặc xóa dự án này.'
    },
    general: 'Thông báo chung của cả công ty',
    random: 'Chuyện ngoài lề công việc',
    welcome: [
      '**Chào mừng đến với Servone.** Đây là nơi cả nhóm trò chuyện, giao việc, họp và chạy quy trình hằng ngày.',
      '',
      'Hai việc nên làm trước:',
      '1. Mời đồng nghiệp: Cài đặt > Thành viên > Mời đồng đội.',
      '2. Tạo dự án đầu tiên trong Dự án.',
      '',
      'Đang dùng ClickUp, Jira hoặc Asana? Vào Cài đặt > Nhập dữ liệu để chuyển công việc và danh sách người sang.',
      '',
      'Dự án Bắt đầu hướng dẫn từng bước. Kênh này dành cho thông báo chung; chuyện ngoài lề ở #random.',
      '',
      'Gặp lỗi? Bấm biểu tượng con bọ (**Báo lỗi**) ở cuối cột bên phải.'
    ].join('\n'),
    issues: {
      invite: {
        title: 'Mời một đồng nghiệp',
        body: 'Vào Cài đặt > Thành viên, bấm **Mời đồng đội**, dán email hoặc gửi đường dẫn. Đã có danh sách nhân viên thì dùng **Nhập từ CSV** trong Sơ đồ tổ chức. Việc này tự xong khi đồng nghiệp đầu tiên tham gia.'
      },
      project: {
        title: 'Tạo dự án đầu tiên của nhóm',
        body: 'Trong Dự án, tạo một dự án cho việc nhóm đang làm, thêm vài việc và giao cho từng người. Việc này tự xong khi dự án được tạo.'
      },
      sprint: {
        title: 'Bắt đầu sprint đầu tiên',
        body: 'Trong dự án vừa tạo, chọn **Thiết lập sprint**, kéo việc từ Backlog vào sprint rồi bấm **Bắt đầu sprint**. Việc này tự xong khi sprint bắt đầu. Nhóm không làm theo sprint thì đóng việc này.'
      },
      managers: {
        title: 'Chọn quản lý cho phòng ban',
        body: 'Trong Sơ đồ tổ chức, gán quản lý cho từng phòng ban. Đơn nghỉ phép và đề nghị sẽ đến quản lý để duyệt. Việc này tự xong khi một phòng ban có quản lý.'
      },
      leave: {
        title: 'Gửi thử một đơn nghỉ phép',
        body: 'Trong Lịch, bấm **Xin nghỉ**, chọn ngày và gửi. Đơn đến quản lý của bạn để duyệt và bạn hiện là vắng trong những ngày đó. Việc này tự xong khi đơn được gửi.'
      },
      meeting: {
        title: 'Lên lịch một cuộc họp',
        body: 'Tạo một sự kiện trong Lịch, chọn **Thêm cuộc họp video** và mời một đồng nghiệp. Đến giờ, cả hai bấm **Tham gia** trên sự kiện. Việc này tự xong khi sự kiện có cuộc họp video được tạo.'
      }
    }
  },
  en: {
    project: {
      name: 'Getting started',
      description: 'Four tasks to get your team working in Servone in the first week. Each one ticks itself when you do the real thing. Archive or delete this project when you are done.'
    },
    general: 'Company-wide announcements',
    random: 'Off-topic chat',
    welcome: [
      '**Welcome to Servone.** This is where your team chats, assigns work, meets and runs its daily processes.',
      '',
      'Two things to do first:',
      '1. Invite your teammates: Settings > Members > Invite teammate.',
      '2. Create your first project in Tracker.',
      '',
      'Coming from ClickUp, Jira or Asana? Go to Settings > Import to bring your tasks and people over.',
      '',
      'The Getting started project walks through each step. Use this channel for company-wide news and #random for everything else.',
      '',
      'Found a bug? Press the bug icon (**Report a bug**) at the bottom of the right-hand column.'
    ].join('\n'),
    issues: {
      invite: {
        title: 'Invite a teammate',
        body: 'Go to Settings > Members, press **Invite teammate**, paste emails or send the link. If you already have a staff list, use **Import from CSV** in the Org chart. This task ticks itself when your first teammate joins.'
      },
      project: {
        title: "Create your team's first project",
        body: 'In Tracker, create a project for work your team is doing now, add a few tasks and assign each one. This task ticks itself when the project is created.'
      },
      sprint: {
        title: 'Start your first sprint',
        body: 'In your new project, choose **Set up sprints**, drag tasks from the backlog into the sprint and press **Start sprint**. This task ticks itself when the sprint starts. If your team does not work in sprints, close this task.'
      },
      managers: {
        title: 'Set department managers',
        body: 'In the Org chart, set a manager for each department. Leave requests and internal requests go to the manager to approve. This task ticks itself when a department gets a manager.'
      },
      leave: {
        title: 'Send a test leave request',
        body: 'In Calendar, press **Request leave**, pick the days and send it. It goes to your manager to approve, and you show as off on those days. This task ticks itself when the request is sent.'
      },
      meeting: {
        title: 'Schedule a meeting',
        body: 'Create an event in Calendar, choose **Add video meeting** and invite a teammate. At the start time, both of you press **Join** on the event. This task ticks itself when an event with a video meeting is created.'
      }
    }
  }
}
