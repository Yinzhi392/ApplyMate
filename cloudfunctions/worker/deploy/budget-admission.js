"use strict";

function transactionData(result) {
  return result && typeof result === "object" ? result.data : null;
}

async function settleBudgetAdmission(database, job, outcome, now) {
  if (typeof job.admissionId !== "string" || typeof database.runTransaction !== "function") {
    return false;
  }
  return database.runTransaction(async (transaction) => {
    const admissionReference = transaction.collection("ai_task_admissions").doc(job.admissionId);
    const admission = transactionData(await admissionReference.get());
    if (admission === null || admission.status !== "reserved") return false;
    const budgetReference = transaction.collection("budget_periods").doc(`budget_${admission.periodKey}`);
    const budget = transactionData(await budgetReference.get());
    if (budget === null) throw new Error("Budget period is missing for the AI admission.");
    const timestamp = now.toISOString();
    const reservedCostFen = Number(admission.reservedCostFen || 0);
    await budgetReference.update({
      reservedFen: Math.max(0, Number(budget.reservedFen || 0) - reservedCostFen),
      conservativeSettledFen: Number(budget.conservativeSettledFen || 0) +
        (outcome === "succeeded" ? reservedCostFen : 0),
      updatedAt: timestamp,
    });
    await admissionReference.update({
      status: outcome,
      settledCostFen: outcome === "succeeded" ? reservedCostFen : 0,
      updatedAt: timestamp,
    });
    if (typeof job.quotaReservationId === "string") {
      const quotaReference = transaction.collection("daily_usage").doc(job.quotaReservationId);
      if (outcome === "succeeded") {
        await quotaReference.update({ status: "succeeded", succeededAt: timestamp, updatedAt: timestamp });
      } else {
        await quotaReference.delete();
      }
    }
    return true;
  });
}

module.exports = { settleBudgetAdmission };
