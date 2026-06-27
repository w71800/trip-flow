import type { getNotionClient } from "../notion.js";
import type { ItineraryRunConfig } from "./config.js";
import type { FlowPropertyNames } from "./flowProperties.js";

export type FlowNode = {
  id: string;
  title?: string;
  nextId: string | null;
  prevId: string | null;
  detailsId: string | null;
};

export type { FlowPropertyNames };

export type ItineraryContext = {
  config: ItineraryRunConfig;
  notion: ReturnType<typeof getNotionClient>;
  dataSourceId: string;
  dataSource: unknown;
  titlePropertyName: string;
  nextPropertyName: string;
  prevPropertyName: string;
  detailsPropertyName: string | null;
  datePropertyName: string | null;
  pages: unknown[];
  linkedNodes: Map<string, FlowNode>;
  pageById: Map<string, unknown>;
};
