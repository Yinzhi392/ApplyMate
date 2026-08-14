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

async function findOne(collection, query) {
  const result = assertDatabaseResult(await collection.where(query).limit(1).get(), "get");
  if (!Array.isArray(result.data)) {
    throw new Error("CloudBase database get returned an invalid response.");
  }
  return result.data.length > 0 ? result.data[0] : null;
}

async function updateDocument(target, update) {
  return assertDatabaseResult(await target.update(update), "update");
}

async function updateExactlyOne(target, update) {
  const result = await updateDocument(target, update);
  if (result.updated !== 1) {
    console.error("CloudBase update did not affect exactly one document.", {
      responseKeys: Object.keys(result).sort(),
      updated: result.updated,
      matched: result.matched,
    });
  }
  return result.updated === 1;
}

module.exports = { assertDatabaseResult, findOne, updateDocument, updateExactlyOne };
