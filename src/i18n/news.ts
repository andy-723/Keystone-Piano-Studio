import type { Lang } from '@/mocks/types';
const words = {
 news:['News','动态'],event:['Event','活动'],concert:['Concert','音乐会'],exam:['Exam','考试'],holiday:['Holiday','假日'],reminder:['Reminder','提醒'],
 pinned:['Pinned','置顶'],new:['New','新动态'],readMore:['Read more','阅读更多'],less:['Show less','收起'],gotIt:['Got it','知道了'],acknowledged:['Acknowledged','已确认'],message:['Message the teacher','给老师发消息'],calendar:['Add to calendar','添加到日历'],translate:['Translate — Coming soon','翻译 — 即将推出'],edited:['Edited','已编辑'],empty:['No studio updates yet.','暂无工作室动态。'],ago:['days ago','天前'],today:['Today','今天'],all:['All families','所有家庭'],attachments:['Attachments','附件'],close:['Close','关闭'],preview:['Family preview','家庭预览'],
} as const;
export function newsText(lang: Lang, key: keyof typeof words) { return words[key][lang === 'zh-CN' ? 1 : 0]; }