export type SnapshotPeriod = "week" | "month";
export type SnapshotSignal = "collected" | "overdue" | "students" | "invites" | "practice" | "lessons";

export const marketingFinance = {
  week: { label: "9–15 November 2026", collected: "$1,680", overdue: "$420", students: "28", invites: "3", practice: "4", lessons: "24 / 28" },
  month: { label: "November 2026", collected: "$5,040", overdue: "$630", students: "28", invites: "3", practice: "4", lessons: "72 / 84" },
  lists: {
    collected: [["Chen family", "$280 received"], ["Patel family", "$210 received"], ["Other families", "Included in total"]],
    overdue: [["Wang family", "$210 · 7 days overdue"], ["Smith family", "$210 · 3 days overdue"]],
    students: [["Lucy Chen", "Grade 2 · piano"], ["Mia Patel", "Grade 3 · piano"], ["Oliver Wang", "Grade 1 · piano"]],
    invites: [["Nguyen family", "Agreement to complete"], ["Taylor family", "Enrolment to complete"], ["Wilson family", "Invite not opened"]],
    practice: [["Oliver Wang", "No practice logged this week"], ["Noah Smith", "Below agreed practice goal"], ["Two more students", "A check-in would help"]],
    lessons: [["Delivered", "24 lessons"], ["Cancelled", "3 lessons"], ["No-show", "1 lesson"]],
  },
  tax: { grossCents: 3360000, stripeFeesCents: 67200, hours: 480, rateCents: 70, bookCents: 3500 },
};