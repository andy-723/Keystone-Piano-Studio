import type { Lang } from "@/mocks/types";
import type { TourId } from "@/services/tour";

export type TourText = { en: string; "zh-CN"?: string; vi?: string };
export type FamilyView = "news" | "home" | "chat" | "progress" | "invoices";

export type TourStep = {
  id: string;
  /** data-tour value of the element to highlight; null shows a centred card. */
  target: string | null;
  /** Studio tour: route to open before highlighting. Omitted = stay where the person is. */
  route?: string;
  /** Family tour: portal tab to open before highlighting. */
  view?: FamilyView;
  title: TourText;
  body: TourText;
  /** Last step only: offer another tour instead of a plain Finish. */
  offer?: { accept: TourText; decline: TourText; starts: TourId };
};

export function tourText(text: TourText, lang: Lang): string {
  return (lang === "en" ? undefined : text[lang]) ?? text.en;
}

/** For studio owners and teachers. Every target is a data-tour attribute on an existing screen. */
export const STUDIO_TOUR: TourStep[] = [
  {
    id: "welcome",
    target: null,
    title: {
      en: "Welcome to Keystone Music HQ",
      "zh-CN": "欢迎使用 Keystone Music HQ",
      vi: "Chào mừng đến với Keystone Music HQ",
    },
    body: {
      en: "This 3-minute tour follows the order you'll set up your studio: your details, terms and privacy, invoicing, enrolling students, courses, news and chat. Skip it any time and replay it from the ? button.",
      "zh-CN":
        "这段约 3 分钟的导览按工作室设置顺序进行：您的资料、条款与隐私、开票、招收学生、课程、动态和聊天。可随时跳过，也可从 ? 按钮重新开始。",
      vi: "Hướng dẫn khoảng 3 phút theo thứ tự thiết lập studio: thông tin của bạn, điều khoản và quyền riêng tư, hóa đơn, ghi danh học sinh, khóa học, tin tức và trò chuyện. Bỏ qua bất cứ lúc nào và xem lại từ nút ?.",
    },
  },
  {
    id: "details",
    target: "settings-profile",
    route: "/settings",
    title: {
      en: "Your studio details",
      "zh-CN": "工作室资料",
      vi: "Thông tin studio của bạn",
    },
    body: {
      en: "Start in Settings. Add your name, photo and Working with Children Check here. Your studio name and GST registration are further down the page.",
      "zh-CN":
        "从「设置」开始。在这里填写姓名、照片和儿童工作检查（Working with Children Check）。工作室名称和 GST 登记在页面更下方。",
      vi: "Bắt đầu ở Cài đặt. Thêm tên, ảnh và Working with Children Check tại đây. Tên studio và đăng ký GST nằm phía dưới trang.",
    },
  },
  {
    id: "terms",
    target: "terms-studio-details",
    route: "/settings/terms",
    title: { en: "Your studio terms", "zh-CN": "工作室条款", vi: "Điều khoản studio" },
    body: {
      en: "Fill in your legal name, ABN, fees and cancellation rules. Keystone builds your studio agreement from them, and families accept it when they enrol.",
      "zh-CN":
        "填写法定名称、ABN、费用和取消规则。Keystone 据此生成工作室协议，家庭在入学时接受。",
      vi: "Điền tên pháp lý, ABN, học phí và quy tắc hủy. Keystone tạo thỏa thuận studio từ đó; gia đình chấp nhận khi ghi danh.",
    },
  },
  {
    id: "privacy",
    target: "terms-privacy",
    route: "/settings/terms",
    title: { en: "Privacy", "zh-CN": "隐私", vi: "Quyền riêng tư" },
    body: {
      en: "This shows where Keystone stores family data and how long records are kept. Your privacy email goes in Studio details above, and your privacy policy PDF downloads from the top of the page.",
      "zh-CN":
        "这里说明 Keystone 如何存放家庭数据以及保留多久。隐私联系邮箱在上方「工作室详情」中填写；隐私政策 PDF 可从页面顶部下载。",
      vi: "Phần này cho biết Keystone lưu dữ liệu gia đình ở đâu và giữ bao lâu. Email quyền riêng tư nằm trong Chi tiết studio phía trên; PDF chính sách tải từ đầu trang.",
    },
  },
  {
    id: "payments",
    target: "settings-payment-details",
    route: "/settings",
    title: {
      en: "How families pay you",
      "zh-CN": "家庭如何付款",
      vi: "Gia đình thanh toán thế nào",
    },
    body: {
      en: "Add your bank details so they print on every invoice. Further down, connect Stripe for online payments and Xero (Pro plan) for your books.",
      "zh-CN":
        "填写银行账户信息，以便打印在每张账单上。再往下可连接 Stripe 收款，以及 Xero（Pro 方案）做账。",
      vi: "Thêm thông tin ngân hàng để in trên mọi hóa đơn. Phía dưới, kết nối Stripe để thanh toán online và Xero (gói Pro) cho sổ sách.",
    },
  },
  {
    id: "invoices",
    target: "invoices-actions",
    route: "/invoices",
    title: { en: "Invoices", "zh-CN": "账单", vi: "Hóa đơn" },
    body: {
      en: "Make a one-off invoice, or bill next term for every family at once. Keystone counts the lessons and leaves out public holidays.",
      "zh-CN":
        "可开一张单次账单，或一次性为所有家庭开具下学期账单。Keystone 会计入课程并排除公众假日。",
      vi: "Tạo hóa đơn một lần, hoặc tính phí học kỳ tới cho mọi gia đình cùng lúc. Keystone đếm buổi học và bỏ ngày lễ.",
    },
  },
  {
    id: "enrol",
    target: "enrol-student",
    route: "/students",
    title: { en: "Enrol a family", "zh-CN": "招收家庭", vi: "Ghi danh một gia đình" },
    body: {
      en: "Add a student and their family. Keystone sends the family an invite and a short intake form, and opens a private chat with them. Groups, next to it, let news reach the right families.",
      "zh-CN":
        "添加学生及其家庭。Keystone 会发送邀请和简短入学表，并打开私密聊天。旁边的「分组」可让动态送达对应家庭。",
      vi: "Thêm học sinh và gia đình. Keystone gửi lời mời cùng mẫu ghi danh ngắn, rồi mở trò chuyện riêng. Nhóm bên cạnh giúp tin tức đến đúng gia đình.",
    },
  },
  {
    id: "courses",
    target: "library-tabs",
    route: "/library",
    title: { en: "Course templates", "zh-CN": "课程模板", vi: "Mẫu khóa học" },
    body: {
      en: "Your Library (Settings, then Open library) holds course templates. Start a new course or copy one of ours, set the sections and pieces (weights add up to 100%), then Assign to students.",
      "zh-CN":
        "资料库（设置 → 打开资料库）存放课程模板。可新建或复制模板，设置分区与曲目（权重合计 100%），再分配给学生。",
      vi: "Thư viện (Cài đặt → Mở thư viện) chứa mẫu khóa học. Tạo mới hoặc sao chép mẫu của chúng tôi, đặt phần và bài (tổng trọng số 100%), rồi Gán cho học sinh.",
    },
  },
  {
    id: "news",
    target: "news-new-post",
    route: "/news",
    title: {
      en: "Share studio news",
      "zh-CN": "发布工作室动态",
      vi: "Chia sẻ tin studio",
    },
    body: {
      en: "Post news to the whole studio, your own students or a group.",
      "zh-CN": "可向全工作室、您的学生或某个分组发布动态。",
      vi: "Đăng tin cho cả studio, học sinh của bạn hoặc một nhóm.",
    },
  },
  {
    id: "chat",
    target: "chat-family-list",
    route: "/chat",
    title: {
      en: "Chat with families",
      "zh-CN": "与家庭聊天",
      vi: "Trò chuyện với gia đình",
    },
    body: {
      en: "Every enrolled family has its own private chat with the studio. Families get an alert when you write.",
      "zh-CN": "每个已入学家庭都有与工作室的私密聊天。您发消息时家庭会收到提醒。",
      vi: "Mỗi gia đình đã ghi danh có trò chuyện riêng với studio. Họ được báo khi bạn nhắn.",
    },
  },
  {
    id: "offer-setup",
    target: "settings-profile",
    route: "/settings",
    title: {
      en: "Ready to set up your studio?",
      "zh-CN": "准备好设置工作室了吗？",
      vi: "Sẵn sàng thiết lập studio?",
    },
    body: {
      en: "That's everything. Want a hand filling in your studio details, terms and payment details now? It walks you through each part, and you can stop any time.",
      "zh-CN":
        "导览到此结束。需要现在一起填写工作室资料、条款和付款信息吗？会逐步引导，您可随时停止。",
      vi: "Đó là tất cả. Muốn được hướng dẫn điền thông tin studio, điều khoản và thanh toán ngay? Từng bước một, và bạn có thể dừng bất cứ lúc nào.",
    },
    offer: {
      accept: { en: "Yes, help me", "zh-CN": "好的，帮我设置", vi: "Có, giúp tôi" },
      decline: { en: "Not now", "zh-CN": "以后再说", vi: "Để sau" },
      starts: "setup",
    },
  },
];

/**
 * Offered at the end of the studio tour: walks an owner through the parts they fill in before
 * enrolling anyone. Never auto-starts; replay comes from the end of the studio tour.
 */
export const SETUP_TOUR: TourStep[] = [
  {
    id: "setup-profile",
    target: "settings-profile",
    route: "/settings",
    title: { en: "1. Your profile", "zh-CN": "1. 您的资料", vi: "1. Hồ sơ của bạn" },
    body: {
      en: "Type your name as families should see it, add a photo, and enter your Working with Children Check. Press Save profile, then Next.",
      "zh-CN":
        "填写家庭看到的姓名，添加照片，并输入儿童工作检查信息。点击「保存资料」，然后点「下一步」。",
      vi: "Nhập tên gia đình sẽ thấy, thêm ảnh và Working with Children Check. Nhấn Lưu hồ sơ, rồi Tiếp.",
    },
  },
  {
    id: "setup-terms-details",
    target: "terms-studio-details",
    route: "/settings/terms",
    title: {
      en: "2. Studio details for your terms",
      "zh-CN": "2. 条款中的工作室详情",
      vi: "2. Chi tiết studio cho điều khoản",
    },
    body: {
      en: "Enter your legal name, trading name, ABN, address, email, phone and privacy email. Each field saves when you move to the next one.",
      "zh-CN":
        "填写法定名称、营业名称、ABN、地址、邮箱、电话和隐私邮箱。移到下一项时会自动保存。",
      vi: "Nhập tên pháp lý, tên giao dịch, ABN, địa chỉ, email, điện thoại và email quyền riêng tư. Mỗi mục lưu khi bạn sang mục tiếp theo.",
    },
  },
  {
    id: "setup-terms-billing",
    target: "terms-billing",
    route: "/settings/terms",
    title: { en: "3. Billing rules", "zh-CN": "3. 计费规则", vi: "3. Quy tắc thanh toán" },
    body: {
      en: "Choose how often you bill, when invoices are due, any late fee, and how many weeks' notice a family gives to stop lessons.",
      "zh-CN":
        "选择开票频率、到期日、滞纳金，以及家庭停课需提前几周通知。",
      vi: "Chọn chu kỳ tính phí, hạn hóa đơn, phí trễ và số tuần báo trước khi gia đình dừng học.",
    },
  },
  {
    id: "setup-terms-lessons",
    target: "terms-lessons",
    route: "/settings/terms",
    title: {
      en: "4. Cancellations and make-ups",
      "zh-CN": "4. 取消与补课",
      vi: "4. Hủy buổi và học bù",
    },
    body: {
      en: "Set the cancellation notice and how many make-up lessons a family gets. Anything still missing is listed in red here.",
      "zh-CN":
        "设置取消通知时限以及每个家庭可补几节课。仍缺的内容会以红色列出。",
      vi: "Đặt thời hạn hủy và số buổi học bù mỗi gia đình được. Phần còn thiếu hiện màu đỏ tại đây.",
    },
  },
  {
    id: "setup-privacy",
    target: "terms-privacy",
    route: "/settings/terms",
    title: {
      en: "5. Privacy and extra terms",
      "zh-CN": "5. 隐私与额外条款",
      vi: "5. Quyền riêng tư và điều khoản thêm",
    },
    body: {
      en: "Read how family data is stored. Add any extra terms of your own in the box here; Keystone warns you if the wording needs a second look.",
      "zh-CN":
        "阅读家庭数据如何存放。可在此框添加您自己的额外条款；若措辞需要再核对，Keystone 会提示。",
      vi: "Đọc cách lưu dữ liệu gia đình. Thêm điều khoản riêng vào ô này; Keystone cảnh báo nếu cần xem lại lời văn.",
    },
  },
  {
    id: "setup-publish",
    target: "terms-publish",
    route: "/settings/terms",
    title: {
      en: "6. Publish your terms",
      "zh-CN": "6. 发布条款",
      vi: "6. Xuất bản điều khoản",
    },
    body: {
      en: "Check the live preview above, add a short summary and publish. New families accept this version when they enrol.",
      "zh-CN":
        "查看上方实时预览，填写简短摘要并发布。新家庭入学时会接受此版本。",
      vi: "Xem bản xem trước phía trên, thêm tóm tắt ngắn rồi xuất bản. Gia đình mới chấp nhận bản này khi ghi danh.",
    },
  },
  {
    id: "setup-payments",
    target: "settings-payment-details",
    route: "/settings",
    title: {
      en: "7. Your bank details",
      "zh-CN": "7. 银行账户信息",
      vi: "7. Thông tin ngân hàng",
    },
    body: {
      en: "Enter the account name, BSB and account number (or PayID) for invoices, then Save payment details.",
      "zh-CN":
        "填写账单用的账户名、BSB 和账号（或 PayID），然后保存付款信息。",
      vi: "Nhập tên tài khoản, BSB và số tài khoản (hoặc PayID) cho hóa đơn, rồi Lưu chi tiết thanh toán.",
    },
  },
  {
    id: "setup-done",
    target: null,
    title: {
      en: "Your studio is set up",
      "zh-CN": "工作室已设置完成",
      vi: "Studio đã được thiết lập",
    },
    body: {
      en: "Next, enrol your first family from Students. The ? button at the top replays the studio tour.",
      "zh-CN":
        "接下来可在「学生」中招收第一个家庭。顶部的 ? 按钮可重新查看工作室导览。",
      vi: "Tiếp theo, ghi danh gia đình đầu tiên từ Học sinh. Nút ? ở trên cùng xem lại hướng dẫn studio.",
    },
  },
];

/** For guardians in the family portal, in English and Simplified Chinese. */
export const FAMILY_TOUR: TourStep[] = [
  {
    id: "welcome",
    target: null,
    title: { en: "Welcome to your family portal", "zh-CN": "欢迎使用家庭门户", vi: "Chào mừng đến với cổng gia đình" },
    body: {
      en: "A quick look at where to find news, lessons, messages and invoices. It takes about a minute.",
      "zh-CN": "快速了解在哪里查看动态、课程、消息和账单，大约需要一分钟。", vi: "Xem nhanh nơi có tin tức, bài học, tin nhắn và hóa đơn — khoảng một phút.",
    },
  },
  {
    id: "news",
    target: "family-tab-news",
    view: "news",
    title: { en: "Studio news", "zh-CN": "工作室动态", vi: "Tin tức studio" },
    body: {
      en: "Announcements from your teacher appear here. Tap Got it so they know you've read it.",
      "zh-CN": "老师发布的通知会显示在这里。点击“知道了”，让老师知道您已阅读。", vi: "Thông báo của giáo viên hiển thị ở đây. Chạm \"Đã hiểu\" để giáo viên biết bạn đã đọc.",
    },
  },
  {
    id: "home",
    target: "family-tab-home",
    view: "home",
    title: { en: "Home", "zh-CN": "首页", vi: "Trang chủ" },
    body: {
      en: "Your next lesson, this week's practice and anything that needs you.",
      "zh-CN": "查看下一节课、本周练习以及需要您处理的事项。", vi: "Xem buổi học tới, luyện tập tuần này và những việc cần bạn xử lý.",
    },
  },
  {
    id: "chat",
    target: "family-tab-chat",
    view: "chat",
    title: { en: "Message your teacher", "zh-CN": "给老师发消息", vi: "Nhắn tin cho giáo viên" },
    body: {
      en: "Send messages, photos and voice notes to your teacher. Only your family and the studio can see them.",
      "zh-CN": "直接向老师发送文字、照片和语音。只有您的家庭和工作室能看到。", vi: "Gửi chữ, ảnh và tin nhắn thoại trực tiếp cho giáo viên. Chỉ gia đình bạn và studio thấy được.",
    },
  },
  {
    id: "progress",
    target: "family-tab-progress",
    view: "progress",
    title: { en: "Progress", "zh-CN": "学习进度", vi: "Tiến độ" },
    body: {
      en: "See how your child is going in each part of their course, and log practice.",
      "zh-CN": "查看孩子在课程各部分的进展，并记录练习时间。", vi: "Xem con tiến bộ thế nào ở từng phần của khóa học và ghi thời gian luyện tập.",
    },
  },
  {
    id: "invoices",
    target: "family-tab-invoices",
    view: "invoices",
    title: { en: "Invoices", "zh-CN": "账单", vi: "Hóa đơn" },
    body: {
      en: "View your invoices, and pay online if your studio has it turned on.",
      "zh-CN": "查看账单；如果工作室已开通，还可以在线付款。", vi: "Xem hóa đơn và thanh toán trực tuyến nếu studio đã bật tính năng này.",
    },
  },
  {
    id: "language",
    target: "family-language",
    title: { en: "English, 中文 or Tiếng Việt", "zh-CN": "English、中文 或 Tiếng Việt", vi: "English, 中文 hoặc Tiếng Việt" },
    body: {
      en: "Switch language any time. The whole portal follows your choice.",
      "zh-CN": "随时切换语言，整个门户都会使用您选择的语言。", vi: "Đổi ngôn ngữ bất cứ lúc nào; toàn bộ cổng sẽ dùng ngôn ngữ bạn chọn.",
    },
  },
  {
    id: "done",
    target: null,
    title: { en: "All set", "zh-CN": "完成", vi: "Hoàn tất" },
    body: {
      en: "Replay this tour any time from the ? button at the top.",
      "zh-CN": "随时可以点击顶部的 ? 按钮重新查看本导览。", vi: "Chạm nút ? ở trên cùng bất cứ lúc nào để xem lại hướng dẫn này.",
    },
  },
];

export const TOURS: Record<TourId, TourStep[]> = {
  studio: STUDIO_TOUR,
  family: FAMILY_TOUR,
  setup: SETUP_TOUR,
};

type ControlKey =
  "start" | "notNow" | "next" | "back" | "skip" | "finish" | "replay" | "stepOf" | "label";
const CONTROLS: Record<ControlKey, TourText> = {
  start: { en: "Start tour", "zh-CN": "开始导览", vi: "Bắt đầu hướng dẫn" },
  notNow: { en: "Not now", "zh-CN": "以后再说", vi: "Để sau" },
  next: { en: "Next", "zh-CN": "下一步", vi: "Tiếp" },
  back: { en: "Back", "zh-CN": "上一步", vi: "Quay lại" },
  skip: { en: "Skip tour", "zh-CN": "跳过导览", vi: "Bỏ qua hướng dẫn" },
  finish: { en: "Finish", "zh-CN": "完成", vi: "Hoàn tất" },
  replay: { en: "Take the tour", "zh-CN": "查看导览", vi: "Xem hướng dẫn" },
  stepOf: { en: "Step {n} of {total}", "zh-CN": "第 {n} 步，共 {total} 步", vi: "Bước {n} / {total}" },
  label: { en: "Guided tour", "zh-CN": "导览", vi: "Hướng dẫn" },
};

export function tourControl(
  key: ControlKey,
  lang: Lang,
  values: Record<string, number> = {},
): string {
  let text = tourText(CONTROLS[key], lang);
  for (const [name, value] of Object.entries(values))
    text = text.replaceAll(`{${name}}`, String(value));
  return text;
}
