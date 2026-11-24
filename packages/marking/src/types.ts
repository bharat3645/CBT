/** Minimal, framework-free types. The exam engine owns attempts/responses; we only need these shapes. */

export type QuestionType = 'mcq_single' | 'mcq_multi' | 'numeric';

export type NumericTolerance =
  | { mode: 'exact' }
  | { mode: 'abs'; value: number }
  | { mode: 'rel'; value: number }; // fraction, e.g. 0.01 = 1%

export interface MarkingRule {
  /** marks for a fully correct answer (+m) */
  correct: number;
  /** penalty magnitude for a wrong answer (n >= 0). Stored positive, subtracted. */
  wrong: number;
  /** multi-correct partial marking. Omit or mode 'none' = all-or-nothing. */
  partial?: {
    mode: 'none' | 'per_correct_option';
    perCorrect: number;
    /** what happens if ANY wrong option is selected in a multi-correct question */
    onWrongOption: 'negative' | 'zero';
  };
}

export interface QuestionKey {
  questionId: string;
  type: QuestionType;
  sectionId: string;
  topicId?: string | null;
  /** option ids for MCQ */
  correctOptions?: string[];
  /** numeric answer(s) */
  numeric?: { value: number; alternates?: number[]; tolerance: NumericTolerance };
  marking: MarkingRule;
  /** key corrected as "question dropped": 'award_all' gives full marks, 'void' removes it from the paper */
  dropped?: 'award_all' | 'void';
}

export interface Answer {
  questionId: string;
  selected?: string[];
  numeric?: string | number | null;
  timeSpentSec?: number;
}

export type ItemResult = 'correct' | 'incorrect' | 'partial' | 'unanswered' | 'void';

export interface EvaluationItem {
  questionId: string;
  sectionId: string;
  topicId: string | null;
  result: ItemResult;
  marks: number;
  maxMarks: number;
  timeSpentSec: number;
}

export interface SectionScore {
  sectionId: string;
  score: number;
  maxScore: number;
  correct: number;
  incorrect: number;
  partial: number;
  unanswered: number;
}

export interface Evaluation {
  attemptId: string;
  /** monotonically increasing per attempt; a re-evaluation creates version+1 */
  version: number;
  keyVersion: number;
  schemeVersion: number;
  score: number;
  maxScore: number;
  correct: number;
  incorrect: number;
  partial: number;
  unanswered: number;
  attempted: number;
  /** correct / attempted * 100 (partial counts as attempted, not correct) */
  accuracy: number;
  timeSpentSec: number;
  sections: SectionScore[];
  items: EvaluationItem[];
}

export interface EvaluateInput {
  attemptId: string;
  keyVersion: number;
  schemeVersion: number;
  /** version number to stamp; defaults to 1 */
  version?: number;
  questions: QuestionKey[];
  answers: Answer[];
}
