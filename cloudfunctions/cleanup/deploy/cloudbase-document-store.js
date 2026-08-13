"use strict";

function assertDatabaseResult(result, operation) {
  if (result === null || typeof result !== "object" || Array.isArray(result)) {
    throw new Error(`CloudBase database ${operation} returned an invalid response.`);
  }
  if (
    Object.prototype.hasOwnProperty.call(result, "code") &&
    result.code !== undefined && result.code !== null && result.code !== "" &&
    result.code !== "NORMAL" && result.code !== "SUCCESS" &&
    result.code !== 0 && result.code !== "0"
  ) {
    throw new Error(`CloudBase database ${operation} failed (${String(result.code)}).`);
  }
  return result;
}

async function findMany(collection, query, limit = 100) {
  const result = assertDatabaseResult(await collection.where(query).limit(limit).get(), "get");
  if (!Array.isArray(result.data)) {
    throw new Error("CloudBase database get returned an invalid response.");
  }
  return result.data;
}

async function updateExactlyOne(target, update) {
  const result = assertDatabaseResult(await target.update(update), "update");
  return result.updated === 1;
}

async function addDocument(collection, document) {
  return assertDatabaseResult(await collection.add(document), "add");
}

async function removeDocuments(target) {
  return assertDatabaseResult(await target.remove(), "remove");
}

module.exports = { addDocument, assertDatabaseResult, findMany, removeDocuments, updateExactlyOne };
