import { create } from "zustand";
import { examReducer, initialState, type Action, type ExamState } from "./exam-machine";

interface Store extends ExamState {
  dispatch: (a: Action) => void;
  reset: () => void;
}

/** Zustand wrapper around the pure reducer (state machine lives in exam-machine.ts). */
export const useExamStore = create<Store>((set) => ({
  ...initialState,
  dispatch: (a) => set((s) => examReducer(s, a)),
  reset: () => set({ ...initialState }),
}));
