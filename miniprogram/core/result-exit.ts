export type ResultExitDestination = "next_job" | "home";

interface ResultExitInput {
  currentBody: string;
  destination: ResultExitDestination;
  savedBody: string;
}

interface ResultExitDependencies {
  goHome(): Promise<void> | void;
  goToNextJob(): Promise<void> | void;
  persist(body: string): Promise<void>;
}

export async function leaveResult(
  input: ResultExitInput,
  dependencies: ResultExitDependencies,
): Promise<void> {
  if (input.currentBody !== input.savedBody) {
    await dependencies.persist(input.currentBody);
  }

  if (input.destination === "next_job") {
    await dependencies.goToNextJob();
    return;
  }

  await dependencies.goHome();
}
