"use strict";

function assertDatabaseResult(result, operation) {
  if (result === null || typeof result !== "object" || Array.isArray(result)) {
    throw new Error(`CloudBase database ${operation} returned an invalid response.`);
  }
  if (
    Object.prototype.hasOwnProperty.call(result, "code") &&
    result.code !== undefined &&
    result.code !== null &&
    result.code !== "" &&
    result.code !== "NORMAL" &&
    result.code !== "SUCCESS" &&
    result.code !== 0 &&
    result.code !== "0"
  ) {
    const error = new Error(`CloudBase database ${operation} failed (${String(result.code)}).`);
    error.code = String(result.code);
    throw error;
  }
  return result;
}

async function findOne(collection, query) {
  const result = assertDatabaseResult(await collection.where(query).limit(1).get(), "get");
  if (!Array.isArray(result.data)) {
    throw new Error("CloudBase database get returned an invalid response.");
  }
  return result.data.length > 0 ? result.data[0] : null;
}

async function findMany(collection, query, limit = 100) {
  const result = assertDatabaseResult(await collection.where(query).limit(limit).get(), "get");
  if (!Array.isArray(result.data)) {
    throw new Error("CloudBase database get returned an invalid response.");
  }
  return result.data;
}

async function addDocument(collection, document) {
  return assertDatabaseResult(await collection.add(document), "add");
}

async function updateDocument(target, update) {
  return assertDatabaseResult(await target.update(update), "update");
}

async function addIfAbsent(collection, document) {
  if (await findOne(collection, { _id: document._id })) {
    return false;
  }
  try {
    await addDocument(collection, document);
    return true;
  } catch (error) {
    // A concurrent request may have inserted the deterministic document ID.
    // Only suppress that race after a successful re-read. Authentication,
    // transport and schema failures remain visible to the caller.
    if (await findOne(collection, { _id: document._id })) {
      return false;
    }
    throw error;
  }
}

async function updateExactlyOne(target, update) {
  const result = await updateDocument(target, update);
  return result.updated === 1;
}

module.exports = {
  addDocument,
  addIfAbsent,
  assertDatabaseResult,
  findOne,
  findMany,
  updateDocument,
  updateExactlyOne,
};
