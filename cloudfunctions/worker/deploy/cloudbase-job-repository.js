"use strict";

const {
  addIfAbsent,
  findOne,
  updateExactlyOne,
} = require("./cloudbase-document-store");

const TERMINAL_STATUSES = new Set(["succeeded", "failed"]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function fromStoredJob(document) {
  if (document === null) return null;
  const job = clone(document);
  delete job._id;
  delete job.recordType;
  delete job.claimState;
  if (job.claimedBy === null) delete job.claimedBy;
  if (job.claimedAt === null) delete job.claimedAt;
  return job;
}

class CloudBaseJobRepository {
  constructor(collection) {
    this.collection = collection;
  }

  async getJobById(jobId) {
    return fromStoredJob(await findOne(this.collection, { recordType: "ai_job", jobId }));
  }

  async claimJob(jobId, workerId, now) {
    const current = await this.getJobById(jobId);
    if (current === null || TERMINAL_STATUSES.has(current.status) || current.claimedBy !== undefined) return null;
    const timestamp = now.toISOString();
    const claimed = await updateExactlyOne(
      this.collection.where({
        recordType: "ai_job",
        jobId,
        status: current.status,
        updatedAt: current.updatedAt,
        claimState: "available",
      }),
      { claimState: "claimed", claimedBy: workerId, claimedAt: timestamp, updatedAt: timestamp },
    );
    return claimed ? this.getJobById(jobId) : null;
  }

  async transitionJob(jobId, expectedStatus, nextStatus, now, updates = {}) {
    const current = await this.getJobById(jobId);
    if (current === null || current.status !== expectedStatus) return null;
    const timestamp = now.toISOString();
    const changed = await updateExactlyOne(
      this.collection.where({
        recordType: "ai_job",
        jobId,
        status: expectedStatus,
        updatedAt: current.updatedAt,
      }),
      {
        status: nextStatus,
        statusHistory: [...current.statusHistory, { status: nextStatus, enteredAt: timestamp }],
        updatedAt: timestamp,
        ...clone(updates),
      },
    );
    return changed ? this.getJobById(jobId) : null;
  }
}

module.exports = { CloudBaseJobRepository };
