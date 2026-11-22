import type { AppStrings } from "./index";

/**
 * Studio Snapshot, Tax Lite and Pro CFO labels. The reviewed tax wording in
 * `src/lib/tax-copy.ts` (GST, ATO, super and Stripe-fee statements) is deliberately not here:
 * it stays English until the tax reviewer signs off a translation.
 */
export const snapshotStrings: AppStrings = {
  "Create invoice": ["创建发票", "Tạo hóa đơn"],
  "Open invoices": ["打开发票", "Mở hóa đơn"],
  "Enrol a student": ["报名学生", "Ghi danh học sinh"],
  "Send invites": ["发送邀请", "Gửi lời mời"],
  "Open students": ["打开学生", "Mở học sinh"],
  "Mark attendance": ["记录出勤", "Điểm danh"],
  "On the roll": ["在册学生", "Đang theo học"],
  "Sent or opened": ["已发送或已打开", "Đã gửi hoặc đã mở"],
  "Quiet or below threshold": ["不活跃或低于阈值", "Ít hoạt động hoặc dưới ngưỡng"],
  Taught: ["已授课", "Đã dạy"],
  "No-show": ["未到", "Vắng không báo"],
  "Cancelled by studio": ["工作室取消", "Studio hủy"],
  "Late cancel": ["临时取消", "Hủy muộn"],
  "Invitation resent": ["邀请已重新发送", "Đã gửi lại lời mời"],
  "Could not resend invitation.": ["无法重新发送邀请。", "Không gửi lại được lời mời."],
  "Overdue reminder sent in family chat": [
    "逾期提醒已在家庭聊天中发送",
    "Đã gửi nhắc quá hạn trong trò chuyện gia đình",
  ],
  "Could not send reminder.": ["无法发送提醒。", "Không gửi được nhắc nhở."],
  "Studio snapshot": ["工作室概览", "Tổng quan studio"],
  "Studio Snapshot": ["工作室概览", "Tổng quan studio"],
  "Money in, money owed, who's active, who's stuck in enrol, and who needs a practice nudge — for {range}":
    [
      "收入、欠款、活跃学生、卡在报名环节的学生，以及需要练习提醒的学生 — {range}",
      "Tiền vào, tiền còn nợ, ai đang học, ai kẹt ở bước ghi danh, và ai cần nhắc luyện tập — cho {range}",
    ],
  "Money in, money owed, who's active, who's stuck in enrol, and who needs a practice nudge — for":
    [
      "收入、欠款、活跃学生、卡在报名环节的学生，以及需要练习提醒的学生 —",
      "Tiền vào, tiền còn nợ, ai đang học, ai kẹt ở bước ghi danh, và ai cần nhắc luyện tập — cho",
    ],
  "Snapshot range": ["概览范围", "Phạm vi tổng quan"],
  "This month": ["本月", "Tháng này"],
  "Snapshot tiles": ["概览卡片", "Các ô tổng quan"],
  "Nothing here yet.": ["这里还没有内容。", "Chưa có gì ở đây."],
  "No taught, cancelled or no-show marks in this range yet.": [
    "此范围内还没有已授课、取消或未到的记录。",
    "Chưa có buổi đã dạy, đã hủy hay vắng không báo trong khoảng này.",
  ],
  "Reminders go to the family chat with a payment link. They do not email or charge cards.": [
    "提醒会连同付款链接发送到家庭聊天。不会发送邮件，也不会扣卡。",
    "Nhắc nhở gửi vào trò chuyện gia đình kèm liên kết thanh toán. Không gửi email và không trừ thẻ.",
  ],
  "Received {date} · {amount}": ["{date} 收到 · {amount}", "Đã nhận {date} · {amount}"],
  Received: ["已收到", "Đã nhận"],
  "Open invoice": ["打开发票", "Mở hóa đơn"],
  "Send reminder in chat": ["在聊天中发送提醒", "Gửi nhắc nhở trong trò chuyện"],
  "Open student": ["打开学生", "Mở học sinh"],
  Resend: ["重新发送", "Gửi lại"],
  "Open lesson": ["打开课程", "Mở buổi học"],
  "Export CSV for this list": ["导出此列表的 CSV", "Xuất CSV cho danh sách này"],

  // Tax Lite
  "Enter a positive amount in dollars": ["请输入正数金额（澳元）", "Nhập số tiền dương bằng đô la"],
  "Choose the student whose family pays this cost": [
    "选择由其家庭支付此费用的学生",
    "Chọn học sinh có gia đình trả khoản chi phí này",
  ],
  "Cost logged and added to the family's draft invoice": [
    "费用已记录并加入家庭的发票草稿",
    "Đã ghi chi phí và thêm vào hóa đơn nháp của gia đình",
  ],
  "Expense logged": ["支出已记录", "Đã ghi chi phí"],
  "Could not log expense.": ["无法记录支出。", "Không ghi được chi phí."],
  "Admin time logged": ["行政时间已记录", "Đã ghi thời gian hành chính"],
  "Could not log admin time.": ["无法记录行政时间。", "Không ghi được thời gian hành chính."],
  "Hours confirmed": ["工时已确认", "Đã xác nhận số giờ"],
  "Could not confirm these lessons.": [
    "无法确认这些课程。",
    "Không xác nhận được các buổi học này.",
  ],
  "Enter kilometres driven": ["请输入行驶公里数", "Nhập số km đã lái"],
  "Kilometres logged": ["公里数已记录", "Đã ghi số km"],
  "Could not log kilometres.": ["无法记录公里数。", "Không ghi được số km."],
  "Accounting Lite": ["简易会计", "Kế toán gọn"],
  "Tax Lite": ["简易税务", "Thuế gọn"],
  "Tax Lite range": ["简易税务范围", "Phạm vi Thuế gọn"],
  "Year to date": ["年初至今", "Từ đầu năm đến nay"],
  "Full FY (1 Jul–30 Jun)": ["完整财年（7 月 1 日–6 月 30 日）", "Cả năm tài chính (1/7–30/6)"],
  "Gross tuition": ["学费总额", "Tổng học phí"],
  "No Stripe payments in this range yet": [
    "此范围内还没有 Stripe 付款",
    "Chưa có thanh toán Stripe trong khoảng này",
  ],
  "Stripe fees": ["Stripe 手续费", "Phí Stripe"],
  "Record a Stripe payment to see fees": [
    "记录一笔 Stripe 付款即可查看手续费",
    "Ghi một khoản thanh toán Stripe để xem phí",
  ],
  "Home studio (70c/hr)": ["家庭工作室（每小时 70 分）", "Studio tại nhà (70c/giờ)"],
  "No confirmed hours yet. Confirm lessons and log admin time below.": [
    "尚无已确认工时。请在下方确认课程并记录行政时间。",
    "Chưa có giờ đã xác nhận. Xác nhận buổi học và ghi thời gian hành chính bên dưới.",
  ],
  "· {count} lessons to confirm": ["· {count} 节课待确认", "· {count} buổi học cần xác nhận"],
  "Log billable client expense": ["记录可向客户收取的费用", "Ghi chi phí tính cho khách"],
  "Costs and costs passed on to families": [
    "费用及代家庭支付的费用",
    "Chi phí và chi phí chuyển cho gia đình",
  ],
  "Amount (AUD)": ["金额（澳元）", "Số tiền (AUD)"],
  Vendor: ["供应商", "Nhà cung cấp"],
  "Notes (optional)": ["备注（可选）", "Ghi chú (không bắt buộc)"],
  "Amount includes GST": ["金额含 GST", "Số tiền đã gồm GST"],
  Student: ["学生", "Học sinh"],
  "Choose student…": ["选择学生…", "Chọn học sinh…"],
  "Log expense": ["记录支出", "Ghi chi phí"],
  "Expense log": ["支出记录", "Nhật ký chi phí"],
  "No costs in this range yet. Log a studio cost, or a cost you pass on to a family, on the left.":
    [
      "此范围内还没有费用。请在左侧记录工作室费用或代家庭支付的费用。",
      "Chưa có chi phí trong khoảng này. Ghi chi phí studio, hoặc chi phí chuyển cho gia đình, ở bên trái.",
    ],
  "· passed on to the family (also income)": [
    "· 转由家庭支付（同时计为收入）",
    "· chuyển cho gia đình (cũng là thu nhập)",
  ],
  "Open draft invoice": ["打开发票草稿", "Mở hóa đơn nháp"],
  "Total logged:": ["已记录合计：", "Tổng đã ghi:"],
  "Home studio hours": ["家庭工作室工时", "Số giờ studio tại nhà"],
  "No lessons waiting to be confirmed.": [
    "没有待确认的课程。",
    "Không có buổi học nào chờ xác nhận.",
  ],
  "Week of {date}": ["{date} 当周", "Tuần {date}"],
  "Week of": ["当周：", "Tuần"],
  "Untick any lesson you did not teach from home.": [
    "请取消勾选任何不是在家中授课的课程。",
    "Bỏ chọn buổi học nào bạn không dạy tại nhà.",
  ],
  "Confirm this week": ["确认本周", "Xác nhận tuần này"],
  "Log admin time": ["记录行政时间", "Ghi thời gian hành chính"],
  Hours: ["小时", "Giờ"],
  "What it was for": ["用途", "Dùng cho việc gì"],
  "Invoices and planning": ["发票与计划", "Hóa đơn và lập kế hoạch"],
  "Kilometre log": ["公里记录", "Nhật ký km"],
  "Optional light log for school visits and mobile teaching, not a full logbook.": [
    "用于学校出访和流动教学的可选简易记录，不是完整的行车日志。",
    "Nhật ký gọn tùy chọn cho việc đến trường và dạy lưu động, không phải sổ nhật ký đầy đủ.",
  ],
  "No kilometres logged in this range.": [
    "此范围内没有记录公里数。",
    "Chưa ghi km nào trong khoảng này.",
  ],
  Kilometres: ["公里", "Km"],
  Purpose: ["目的", "Mục đích"],
  "Log kilometres": ["记录公里数", "Ghi số km"],
  "· estimate": ["· 估计", "· ước tính"],
  "Review before you export": ["导出前请检查", "Kiểm tra trước khi xuất"],
  "Check each category and amount.": [
    "请检查每个类别和金额。",
    "Kiểm tra từng danh mục và số tiền.",
  ],
  "EOFY summary exported": ["年终汇总已导出", "Đã xuất bản tổng kết cuối năm tài chính"],
  "Export EOFY summary for your accountant (CSV)": [
    "为会计师导出年终汇总（CSV）",
    "Xuất bản tổng kết cuối năm tài chính cho kế toán (CSV)",
  ],
  "Projected turnover saved": ["预计营业额已保存", "Đã lưu doanh thu dự kiến"],
  "GST threshold monitor": ["GST 门槛监测", "Theo dõi ngưỡng GST"],
  "Estimated GST turnover, past 12 months (payments received)": [
    "过去 12 个月估计的 GST 营业额（已收款）",
    "Doanh thu GST ước tính 12 tháng qua (đã nhận tiền)",
  ],
  "Estimated GST turnover for the past 12 months versus the $75,000 threshold": [
    "过去 12 个月估计 GST 营业额与 $75,000 门槛对比",
    "Doanh thu GST ước tính 12 tháng qua so với ngưỡng $75,000",
  ],
  "What you expect over the next 12 months ($)": [
    "未来 12 个月的预计金额（$）",
    "Dự kiến 12 tháng tới ($)",
  ],
  "Save estimate": ["保存估计", "Lưu ước tính"],
  "Next 12 months (your estimate): {amount}": [
    "未来 12 个月（您的估计）：{amount}",
    "12 tháng tới (ước tính của bạn): {amount}",
  ],
  "Next 12 months (your estimate):": [
    "未来 12 个月（您的估计）：",
    "12 tháng tới (ước tính của bạn):",
  ],
  "This is an estimate from payments recorded in Keystone and your own projection. It may not include all of your GST turnover.":
    [
      "这是根据 Keystone 中记录的付款和您自己的预测得出的估计，可能未包含您全部的 GST 营业额。",
      "Đây là ước tính từ các khoản thanh toán ghi trong Keystone và dự báo của bạn. Có thể chưa gồm toàn bộ doanh thu GST.",
    ],

  // Pro CFO
  "Net cash after Stripe fees and studio margin": [
    "扣除 Stripe 手续费后的净现金和工作室利润",
    "Tiền mặt ròng sau phí Stripe và biên lợi nhuận studio",
  ],
  "Unearned tuition and make-up credit liability": [
    "预收学费和补课额度负债",
    "Học phí chưa thực hiện và nghĩa vụ học bù",
  ],
  "GST threshold monitor with a next-12-months estimate": [
    "含未来 12 个月估计的 GST 门槛监测",
    "Theo dõi ngưỡng GST kèm ước tính 12 tháng tới",
  ],
  "Xero sync queue with retry": ["可重试的 Xero 同步队列", "Hàng chờ đồng bộ Xero có thử lại"],
  "Teacher payouts, remittance export and Xero bills": [
    "老师报酬、汇款导出和 Xero 账单",
    "Chi trả giáo viên, xuất chứng từ chuyển tiền và hóa đơn Xero",
  ],
  "Pro CFO": ["Pro 财务总监", "Pro CFO"],
  "Cash, margin and Xero ops": ["现金、利润和 Xero 操作", "Tiền mặt, biên lợi nhuận và Xero"],
  "Pro CFO is part of the Pro plan. Your Studio Snapshot and Tax Lite above stay on every plan.": [
    "Pro 财务总监属于 Pro 方案。上方的工作室概览和简易税务在所有方案中都可使用。",
    "Pro CFO thuộc gói Pro. Tổng quan studio và Thuế gọn ở trên có trong mọi gói.",
  ],
  "Upgrade to Pro": ["升级到 Pro", "Nâng cấp lên Pro"],
  "What Pro CFO adds": ["Pro 财务总监新增的功能", "Pro CFO có thêm gì"],
  "Pushed to Xero": ["已推送到 Xero", "Đã đẩy sang Xero"],
  "Retry failed — try again": ["重试失败 — 请再试一次", "Thử lại thất bại — hãy thử lần nữa"],
  "Could not retry Xero sync.": ["无法重试 Xero 同步。", "Không thử lại được đồng bộ Xero."],
  "Could not push bills.": ["无法推送账单。", "Không đẩy được hóa đơn."],
  Rolling: ["滚动", "Cuốn chiếu"],
  "pulse for owners — not a second ledger. Collected cash, overdue reminders and practice check-ins are in the Studio Snapshot above.":
    [
      "负责人速览 — 不是第二套账簿。已收现金、逾期提醒和练习问候在上方的工作室概览中。",
      "nhịp tình hình cho chủ studio — không phải sổ cái thứ hai. Tiền đã thu, nhắc quá hạn và hỏi thăm luyện tập nằm trong Tổng quan studio ở trên.",
    ],
  "CFO pulse ribbon": ["财务速览栏", "Dải nhịp tài chính"],
  "Net cash collected": ["净收现金", "Tiền mặt ròng đã thu"],
  "Studio margin": ["工作室利润", "Biên lợi nhuận studio"],
  "Solo net": ["个人净收入", "Ròng (một mình)"],
  "After {amount} teacher splits": [
    "扣除老师分成 {amount} 后",
    "Sau khi chia {amount} cho giáo viên",
  ],
  "After {amount} Tax Lite expenses": [
    "扣除简易税务支出 {amount} 后",
    "Sau {amount} chi phí Thuế gọn",
  ],
  "Unearned tuition": ["预收学费", "Học phí chưa thực hiện"],
  "Earned revenue and make-up credits": [
    "已实现收入和补课额度",
    "Doanh thu đã thực hiện và buổi học bù",
  ],
  Earned: ["已实现", "Đã thực hiện"],
  "Value of lessons delivered in this window": [
    "此期间已授课程的价值",
    "Giá trị các buổi đã dạy trong khoảng này",
  ],
  "Make-up credit liability": ["补课额度负债", "Nghĩa vụ học bù"],
  "No open make-up credits.": ["没有未使用的补课额度。", "Không có buổi học bù còn mở."],
  "Xero reconciliation queue": ["Xero 对账队列", "Hàng chờ đối soát Xero"],
  "Xero queue": ["Xero 队列", "Hàng chờ Xero"],
  "{count} open · mock sync, no live API poll": [
    "{count} 项未完成 · 模拟同步，未实时调用 API",
    "{count} mục mở · đồng bộ mô phỏng, không gọi API trực tiếp",
  ],
  "open · mock sync, no live API poll": [
    "项未完成 · 模拟同步，未实时调用 API",
    "mục mở · đồng bộ mô phỏng, không gọi API trực tiếp",
  ],
  "Queue is clear.": ["队列已清空。", "Hàng chờ trống."],
  Failed: ["失败", "Thất bại"],
  "Pending push": ["等待推送", "Chờ đẩy"],
  Synced: ["已同步", "Đã đồng bộ"],
  Retry: ["重试", "Thử lại"],
  "Teacher payouts": ["老师报酬", "Chi trả giáo viên"],
  Owner: ["负责人", "Chủ studio"],
  Contractor: ["合同工", "Nhà thầu"],
  "· keeps studio margin": ["· 保留工作室利润", "· giữ biên lợi nhuận studio"],
  "Remittance CSV exported": ["汇款 CSV 已导出", "Đã xuất CSV chứng từ chuyển tiền"],
  "Export remittance": ["导出汇款", "Xuất chứng từ chuyển tiền"],
  "Push Xero Bills": ["推送 Xero 账单", "Đẩy hóa đơn Xero"],
  "Studio snapshot could not be opened. Please refresh to try again.": [
    "无法打开工作室概览，请刷新后重试。",
    "Không mở được tổng quan studio. Vui lòng tải lại trang.",
  ],
  "Whole-studio money, Pro CFO, Tax Lite figures and enrol numbers are for owners and admins. Teachers stay on Today for the day-book and their roll.":
    [
      "全工作室的财务、Pro 财务总监、简易税务数据和报名人数仅供负责人和管理员查看。老师请使用“今天”查看日程簿和学生名单。",
      "Số liệu tiền của cả studio, Pro CFO, Thuế gọn và số ghi danh chỉ dành cho chủ studio và quản trị viên. Giáo viên dùng mục Hôm nay cho sổ lịch ngày và danh sách lớp.",
    ],
  "Back to Today": ["返回今天", "Quay lại Hôm nay"],
  "Opening studio snapshot…": ["正在打开工作室概览…", "Đang mở tổng quan studio…"],
  Snapshot: ["概览", "Tổng quan"],
};
