/**
 * Live exam layout: full-screen, NO sidebar. The CBT engine agent owns everything inside
 * (top bar, question, palette, bottom bar). Keep this layout chrome-free.
 */
export default function ExamLayout({ children }: { children: React.ReactNode }) {
  return <div className="fixed inset-0 overflow-auto bg-card">{children}</div>;
}
