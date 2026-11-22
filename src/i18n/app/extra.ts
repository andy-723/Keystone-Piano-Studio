import type { AppStrings } from "./index";

/** Counts, statuses and short labels found by checking every screen in 中文 and VI. */
export const extraStrings: AppStrings = {
  // Counts and short phrases built from numbers
  "{n} days ago": ["{n} 天前", "{n} ngày trước"],
  "{n} day ago": ["{n} 天前", "{n} ngày trước"],
  "{n} days overdue": ["逾期 {n} 天", "Quá hạn {n} ngày"],
  "{n} day overdue": ["逾期 {n} 天", "Quá hạn {n} ngày"],
  "Invoice {n} days overdue": ["发票逾期 {n} 天", "Hóa đơn quá hạn {n} ngày"],
  "{n} min lesson": ["{n} 分钟课程", "Buổi học {n} phút"],
  "{n}-minute lesson": ["{n} 分钟课程", "Buổi học {n} phút"],
  "{n} paid invoices": ["{n} 张已付发票", "{n} hóa đơn đã thanh toán"],
  "{n} paid invoice": ["{n} 张已付发票", "{n} hóa đơn đã thanh toán"],
  "{n} open": ["{n} 项未结", "{n} đang mở"],
  "{n} taught": ["已授课 {n} 节", "Đã dạy {n}"],
  "{n} cancelled": ["已取消 {n} 节", "Đã hủy {n}"],
  "{n} no-show": ["未到 {n} 次", "Vắng không báo {n}"],
  "{n} rows.": ["{n} 行。", "{n} dòng."],
  "{n} row.": ["{n} 行。", "{n} dòng."],
  "{n} Stripe payments": ["{n} 笔 Stripe 付款", "{n} khoản thanh toán Stripe"],
  "{n} Stripe payment": ["{n} 笔 Stripe 付款", "{n} khoản thanh toán Stripe"],
  "{n} holidays skipped": ["已跳过 {n} 个假日", "Đã bỏ qua {n} ngày lễ"],
  "{n} holiday skipped": ["已跳过 {n} 个假日", "Đã bỏ qua {n} ngày lễ"],
  "{n} of {total} families accepted": [
    "{total} 个家庭中已有 {n} 个接受",
    "{n} trên {total} gia đình đã chấp nhận",
  ],
  "{n} families": ["{n} 个家庭", "{n} gia đình"],
  "{n} family": ["{n} 个家庭", "{n} gia đình"],
  "{n} students": ["{n} 名学生", "{n} học sinh"],
  "{n} student": ["{n} 名学生", "{n} học sinh"],
  "{n} acknowledged": ["{n} 个已确认", "{n} đã xác nhận"],
  "{n} red": ["{n} 个红色", "{n} đỏ"],
  "{n} yellow": ["{n} 个黄色", "{n} vàng"],
  "{n} unread chat messages": ["{n} 条未读聊天消息", "{n} tin nhắn chưa đọc"],
  "{n} unread": ["{n} 条未读", "{n} chưa đọc"],
  "{n} prepaid lessons not yet delivered": [
    "{n} 节已预付但尚未上的课程",
    "{n} buổi đã trả trước nhưng chưa dạy",
  ],
  "{n} confirmed hrs · {a} teaching + {b} admin": [
    "已确认 {n} 小时 · 授课 {a} + 行政 {b}",
    "{n} giờ đã xác nhận · {a} dạy + {b} hành chính",
  ],
  "{n} contractors": ["{n} 名合同工", "{n} nhà thầu"],
  "{n} weeks in a row": ["连续 {n} 周", "{n} tuần liên tiếp"],
  "Missed {n} weeks in a row": ["连续缺课 {n} 周", "Vắng {n} tuần liên tiếp"],
  "No practice logged in {n} days": ["{n} 天没有练习记录", "Không có luyện tập nào trong {n} ngày"],
  "Practice down by half this month": ["本月练习量减少一半", "Luyện tập tháng này giảm một nửa"],
  "Question {n} of {total}": ["第 {n} 题，共 {total} 题", "Câu {n} / {total}"],
  "Step {n} of {total}": ["第 {n} 步，共 {total} 步", "Bước {n} / {total}"],
  "Term {term} {year}": ["{year} 年第 {term} 学期", "Học kỳ {term} năm {year}"],
  "Add lesson {when}": ["添加课程 {when}", "Thêm buổi học {when}"],
  "{name}, {when}, {n} minutes": ["{name}，{when}，{n} 分钟", "{name}, {when}, {n} phút"],
  "Upload picture for {name}": ["为 {name} 上传照片", "Tải ảnh lên cho {name}"],
  "{name} initials": ["{name} 的姓名缩写", "Chữ viết tắt của {name}"],
  "{name} family": ["{name} 家", "Gia đình {name}"],
  "Teacher ({name})": ["老师（{name}）", "Giáo viên ({name})"],
  "Teacher (": ["老师（", "Giáo viên ("],
  "Visa ending {n}": ["尾号 {n} 的 Visa 卡", "Visa đuôi {n}"],
  "Studio closed {when}, {name}": ["工作室 {when} 休息，{name}", "Studio nghỉ {when}, {name}"],

  // Single words
  students: ["名学生", "học sinh"],
  student: ["名学生", "học sinh"],
  family: ["个家庭", "gia đình"],
  day: ["天", "ngày"],
  min: ["分钟", "phút"],
  hrs: ["小时", "giờ"],
  each: ["每项", "mỗi"],
  credit: ["贷记", "ghi có"],
  yellow: ["黄色", "vàng"],
  red: ["红色", "đỏ"],
  weekly: ["每周", "hằng tuần"],
  once: ["一次", "một lần"],
  awaiting: ["等待中", "đang chờ"],
  accepted: ["已接受", "đã chấp nhận"],
  reaccept_needed: ["需重新接受", "cần chấp nhận lại"],
  pending: ["待处理", "đang chờ"],
  checklist: ["清单", "danh sách"],
  text: ["文字", "văn bản"],
  video: ["视频", "video"],
  audio: ["音频", "âm thanh"],
  link: ["链接", "liên kết"],
  "· incl. GST": ["· 含 GST", "· gồm GST"],
  "GST on": ["GST 开启", "Bật GST"],
  "Personal repertoire": ["个人曲目", "Bản nhạc riêng"],
  "Read more": ["阅读更多", "Đọc thêm"],
  "Practice video placeholder": ["练习视频占位", "Chỗ giữ video luyện tập"],
  "Xero connected (mock) · GST health OK": [
    "Xero 已连接（模拟）· GST 状态正常",
    "Đã kết nối Xero (mô phỏng) · GST ổn",
  ],
  "{amount} gross · {fees} Stripe fees": [
    "总额 {amount} · Stripe 手续费 {fees}",
    "Tổng {amount} · phí Stripe {fees}",
  ],
  "Revenue collected drill-down": ["已收收入明细", "Chi tiết doanh thu đã thu"],

  // Tax Lite expense categories (labels only)
  "Teaching materials & pass-throughs": [
    "教材与代付费用",
    "Tài liệu dạy học và chi phí chuyển cho gia đình",
  ],
  "Instruments & gear": ["乐器与设备", "Nhạc cụ và thiết bị"],
  "Repairs & consumables": ["维修与耗材", "Sửa chữa và vật tư tiêu hao"],
  "Software & subscriptions": ["软件与订阅", "Phần mềm và đăng ký"],
  "Commercial rent & venue hire": ["商业租金与场地租用", "Thuê mặt bằng và địa điểm"],
  "Other deductible": ["其他可抵扣项", "Khoản khấu trừ khác"],

  // States and territories
  VIC: ["维多利亚州", "VIC"],
  NSW: ["新南威尔士州", "NSW"],
  QLD: ["昆士兰州", "QLD"],
  TAS: ["塔斯马尼亚州", "TAS"],
  ACT: ["首都领地", "ACT"],
  SA: ["南澳大利亚州", "SA"],
  WA: ["西澳大利亚州", "WA"],
  NT: ["北领地", "NT"],

  // Sign-in scene
  "Tap anywhere for music": ["轻触任意处播放音乐", "Chạm vào bất kỳ đâu để nghe nhạc"],
  "Mute Für Elise": ["将《致爱丽丝》静音", "Tắt tiếng Für Elise"],
  "Play Für Elise": ["播放《致爱丽丝》", "Phát Für Elise"],
  "Mute music": ["静音", "Tắt nhạc"],
  "Play music": ["播放音乐", "Phát nhạc"],
  "A Nutcracker street parade: toy soldiers, sugar plum fairy, mice, children and a donkey fill an old street while a nutcracker plays a grand piano. When the music starts, the pianist, the crowd and the donkey turn to colour, then the street settles back to sepia.":
    [
      "胡桃夹子街头游行：玩具士兵、糖梅仙子、老鼠、孩子和一头驴挤满老街，一个胡桃夹子在弹三角钢琴。音乐响起时，钢琴家、人群和驴变成彩色，随后街道又回到复古棕色。",
      "Cuộc diễu hành Kẹp Hạt Dẻ trên phố: lính đồ chơi, tiên mận đường, chuột, trẻ em và một chú lừa tràn ngập con phố cổ trong khi kẹp hạt dẻ chơi đại dương cầm. Khi nhạc vang lên, nghệ sĩ, đám đông và chú lừa chuyển sang có màu, rồi con phố trở lại màu nâu cổ điển.",
    ],
  "min/week": ["分钟/周", "phút/tuần"],
  "Keystone Music HQ · New studio": [
    "Keystone Music HQ · 新工作室",
    "Keystone Music HQ · Studio mới",
  ],
  "Privacy notice": ["隐私声明", "Thông báo quyền riêng tư"],
  "Read the privacy policy": ["阅读隐私政策", "Đọc chính sách quyền riêng tư"],
  "Don't agree? Message {name}": ["不同意？给 {name} 发消息", "Không đồng ý? Nhắn tin cho {name}"],
  "Type a question, e.g. how do I resend an invite": [
    "输入问题，例如：如何重新发送邀请",
    "Nhập câu hỏi, ví dụ: làm sao gửi lại lời mời",
  ],

  // Studio terms settings: address search, public holidays, tuning, clause editor (PR #89)
  "Address suggestions by Google": ["地址建议由 Google 提供", "Gợi ý địa chỉ do Google cung cấp"],
  "Privacy email (optional)": ["隐私联系邮箱（可选）", "Email về quyền riêng tư (không bắt buộc)"],
  "Leave blank and privacy requests go to your studio email.": [
    "留空则隐私请求将发送到您的工作室邮箱。",
    "Để trống thì yêu cầu về quyền riêng tư sẽ gửi đến email của studio.",
  ],
  "Financial retention: {n} years": ["财务记录保存：{n} 年", "Lưu hồ sơ tài chính: {n} năm"],
  years: ["年", "năm"],
  "Public holidays": ["公共假期", "Ngày lễ"],
  "Piano tuning (recommended to families)": [
    "钢琴调音（向家庭建议）",
    "Lên dây đàn piano (khuyến nghị cho gia đình)",
  ],
  "once a year": ["每年一次", "mỗi năm một lần"],
  "twice a year": ["每年两次", "mỗi năm hai lần"],
  "every three months": ["每三个月一次", "ba tháng một lần"],
  "Words in [square brackets] are filled in from your answers:": [
    "[方括号] 中的内容会根据您的回答自动填写：",
    "Các từ trong [ngoặc vuông] được điền từ câu trả lời của bạn:",
  ],
  "not answered yet": ["尚未回答", "chưa trả lời"],
  "To change an answer, use Review fill-in questions or the settings above. Keep the brackets so the clause updates when your answers change.":
    [
      "如需更改回答，请使用“检查填写问题”或上方的设置。请保留方括号，以便回答更改时条款自动更新。",
      "Để đổi câu trả lời, hãy dùng Xem lại các câu hỏi cần điền hoặc phần cài đặt ở trên. Giữ nguyên dấu ngoặc để điều khoản tự cập nhật khi câu trả lời thay đổi.",
    ],
  "How families will read it": ["家庭看到的内容", "Gia đình sẽ đọc như sau"],
  "You're responsible for edited wording. We recommend getting your own advice.": [
    "您需对修改后的措辞负责。我们建议您自行咨询专业意见。",
    "Bạn chịu trách nhiệm về câu chữ đã sửa. Chúng tôi khuyên bạn nên tự tham khảo ý kiến chuyên môn.",
  ],

  // Stripe Connect and Xero settings (merged from main 20 Nov)
  "Stripe could not be opened. Please try again.": [
    "无法打开 Stripe，请重试。",
    "Không mở được Stripe. Vui lòng thử lại.",
  ],
  "Xero connected. Choose your accounts below.": [
    "已连接 Xero。请在下方选择您的账户。",
    "Đã kết nối Xero. Hãy chọn tài khoản bên dưới.",
  ],
  "Xero could not be connected. Please try again.": [
    "无法连接 Xero，请重试。",
    "Không kết nối được Xero. Vui lòng thử lại.",
  ],
  "Xero connection cancelled.": ["已取消连接 Xero。", "Đã hủy kết nối Xero."],
  "Xero could not be opened. Please try again.": [
    "无法打开 Xero，请重试。",
    "Không mở được Xero. Vui lòng thử lại.",
  ],
  "Families pay your studio directly through your own Stripe account. Money goes straight to you; Stripe charges you its standard fees and Keystone takes nothing.":
    [
      "家庭通过您自己的 Stripe 账户直接向您的工作室付款。款项直接进入您的账户；Stripe 向您收取标准手续费，Keystone 不收取任何费用。",
      "Gia đình thanh toán trực tiếp cho studio qua tài khoản Stripe của bạn. Tiền chuyển thẳng cho bạn; Stripe thu phí tiêu chuẩn của họ và Keystone không lấy gì.",
    ],
  "Online payments are being switched on for Keystone. You can link Stripe soon.": [
    "Keystone 正在开通在线付款。您很快就可以关联 Stripe。",
    "Keystone đang bật thanh toán trực tuyến. Bạn sẽ sớm liên kết được Stripe.",
  ],
  "Stripe still needs some details or is checking them. Continue setup to finish; families see bank details until then.":
    [
      "Stripe 仍需要一些信息或正在核实。请继续设置以完成；在此之前家庭会看到银行转账信息。",
      "Stripe vẫn cần thêm thông tin hoặc đang kiểm tra. Hãy tiếp tục thiết lập để hoàn tất; trước đó gia đình sẽ thấy thông tin chuyển khoản ngân hàng.",
    ],
  "Xero is being switched on for Keystone. You can connect it soon.": [
    "Keystone 正在开通 Xero。您很快就可以连接。",
    "Keystone đang bật Xero. Bạn sẽ sớm kết nối được.",
  ],
  "Xero connections are full right now. Contact support and we'll open one for you.": [
    "Xero 连接名额目前已满。请联系支持，我们会为您开通。",
    "Hiện đã hết suất kết nối Xero. Hãy liên hệ hỗ trợ và chúng tôi sẽ mở cho bạn.",
  ],
  "Opening Xero…": ["正在打开 Xero…", "Đang mở Xero…"],
  "Reconnect Xero": ["重新连接 Xero", "Kết nối lại Xero"],
  "Xero accounts saved": ["Xero 账户已保存", "Đã lưu tài khoản Xero"],
  "Xero accounts could not be saved. Please try again.": [
    "无法保存 Xero 账户，请重试。",
    "Không lưu được tài khoản Xero. Vui lòng thử lại.",
  ],
  "Xero sync could not run. Please try again.": [
    "Xero 同步无法运行，请重试。",
    "Không chạy được đồng bộ Xero. Vui lòng thử lại.",
  ],
  "Xero needs reconnecting. Press Reconnect Xero below.": [
    "Xero 需要重新连接。请点击下方的“重新连接 Xero”。",
    "Cần kết nối lại Xero. Hãy bấm Kết nối lại Xero bên dưới.",
  ],
  "Sent invoices and payments go to Xero every 15 minutes. Drafts never do.": [
    "已发送的发票和付款每 15 分钟同步到 Xero。草稿不会同步。",
    "Hóa đơn đã gửi và các khoản thanh toán được chuyển sang Xero mỗi 15 phút. Bản nháp thì không.",
  ],
  "Income account for lessons": ["课程收入账户", "Tài khoản thu nhập cho buổi học"],
  "Bank account families pay into": [
    "家庭付款的银行账户",
    "Tài khoản ngân hàng gia đình chuyển tiền vào",
  ],
  "Save accounts": ["保存账户", "Lưu tài khoản"],
  "Sending to Xero…": ["正在发送到 Xero…", "Đang gửi sang Xero…"],
};
