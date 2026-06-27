import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getDateFromPage,
  getRelationIds,
  getTitleFromPage,
  pickDatePropertyName,
  pickRelationPropertyName,
  pickTitlePropertyName,
} from "./flowProperties.js";

describe("pickTitlePropertyName", () => {
  it("returns override when provided", () => {
    assert.equal(pickTitlePropertyName({ properties: {} }, "自訂名稱"), "自訂名稱");
  });

  it("detects the title property from schema", () => {
    const schema = {
      properties: {
        備註: { type: "rich_text" },
        名稱: { type: "title" },
      },
    };
    assert.equal(pickTitlePropertyName(schema), "名稱");
  });

  it("throws when no title property exists", () => {
    assert.throws(
      () => pickTitlePropertyName({ properties: { 備註: { type: "rich_text" } } }),
      /找不到 title 欄位/,
    );
  });
});

describe("pickDatePropertyName", () => {
  it("returns override when provided", () => {
    assert.equal(pickDatePropertyName({ properties: {} }, "自訂日期"), "自訂日期");
  });

  it("prefers date fields matching common name patterns", () => {
    const schema = {
      properties: {
        其他: { type: "date" },
        行程日期: { type: "date" },
      },
    };
    assert.equal(pickDatePropertyName(schema), "行程日期");
  });

  it("falls back to the first date field", () => {
    const schema = {
      properties: {
        欄位A: { type: "date" },
        欄位B: { type: "date" },
      },
    };
    assert.equal(pickDatePropertyName(schema), "欄位A");
  });
});

describe("pickRelationPropertyName", () => {
  const schema = {
    properties: {
      下一個: { type: "relation" },
      上一個: { type: "relation" },
      行程詳情: { type: "relation" },
      備註: { type: "rich_text" },
    },
  };

  it("returns override when provided", () => {
    assert.equal(pickRelationPropertyName(schema, "自訂", "next"), "自訂");
  });

  it("detects next, previous, and details relation fields", () => {
    assert.equal(pickRelationPropertyName(schema, undefined, "next"), "下一個");
    assert.equal(pickRelationPropertyName(schema, undefined, "previous"), "上一個");
    assert.equal(pickRelationPropertyName(schema, undefined, "details"), "行程詳情");
  });

  it("returns null when no matching relation field exists", () => {
    const emptySchema = { properties: { 備註: { type: "rich_text" } } };
    assert.equal(pickRelationPropertyName(emptySchema, undefined, "next"), null);
  });
});

describe("getTitleFromPage", () => {
  it("extracts plain text from the title property", () => {
    const page = {
      properties: {
        名稱: {
          type: "title",
          title: [{ plain_text: "第一天" }],
        },
      },
    };
    assert.equal(getTitleFromPage(page, "名稱"), "第一天");
  });

  it("returns empty string when property is missing or wrong type", () => {
    assert.equal(getTitleFromPage({}, "名稱"), "");
    assert.equal(
      getTitleFromPage({ properties: { 名稱: { type: "rich_text" } } }, "名稱"),
      "",
    );
  });
});

describe("getRelationIds", () => {
  it("extracts relation page ids", () => {
    const prop = {
      type: "relation",
      relation: [{ id: "page-a" }, { id: "page-b" }],
    };
    assert.deepEqual(getRelationIds(prop), ["page-a", "page-b"]);
  });

  it("returns empty array for non-relation properties", () => {
    assert.deepEqual(getRelationIds(null), []);
    assert.deepEqual(getRelationIds({ type: "title" }), []);
  });
});

describe("getDateFromPage", () => {
  it("returns YYYY-MM-DD from a date property", () => {
    const page = {
      properties: {
        日期: {
          type: "date",
          date: { start: "2026-07-16T09:00:00.000+08:00" },
        },
      },
    };
    assert.equal(getDateFromPage(page, "日期"), "2026-07-16");
  });

  it("returns null when date property is missing or invalid", () => {
    assert.equal(getDateFromPage({}, null), null);
    assert.equal(getDateFromPage({ properties: {} }, "日期"), null);
  });
});
