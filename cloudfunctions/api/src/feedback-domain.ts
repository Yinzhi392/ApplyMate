export type FeedbackRating = "satisfied" | "needs_improvement";

export interface FeedbackRecord {
  feedbackId: string;
  applicationId: string;
  userId: string;
  rating: FeedbackRating;
  note?: string;
  createdAt: string;
  updatedAt: string;
}
