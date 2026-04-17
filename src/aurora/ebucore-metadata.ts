/**
 * EBUCore metadata alignment for Aurora multimedia nodes.
 * Pure functions — no DB access, no side effects.
 */

import type { AuroraNode } from './aurora-schema.js';

/** EBUCore field mappings per node type. Keys are ebucore field names, values are property names. */
export const EBUCORE_MAPPINGS: Record<string, Record<string, string>> = {
  transcript: {
    'ebucore:duration': 'duration',
    'ebucore:dateCreated': 'publishedDate',
    'ebucore:hasLanguage': 'language',
    'ebucore:title': 'title',
    'ebucore:locator': 'videoUrl',
    'ebucore:hasFormat': 'platform',
    'ebucore:numberOfSegments': 'segmentCount',
  },
  voice_print: {
    'ebucore:speakerName': 'speakerLabel',
    'ebucore:speakerDuration': 'totalDurationMs',
    'ebucore:numberOfSegments': 'segmentCount',
  },
  speaker_identity: {
    'ebucore:givenName': 'givenName',
    'ebucore:familyName': 'familyName',
    'ebucore:personName': 'displayName',
    'ebucore:role': 'role',
    'ebucore:occupation': 'occupation',
    'ebucore:organisationName': 'affiliation.organizationName',
    'ebucore:organisationDepartment': 'affiliation.department',
    'ebucore:entityId': 'entityId',
    'ebucore:agentWikidata': 'wikidata',
    'ebucore:agentWikipedia': 'wikipedia',
    'ebucore:agentImdb': 'imdb',
    'ebucore:agentLinkedIn': 'linkedIn',
  },
};

function resolveNestedValue(obj: Record<string, unknown>, path: string): unknown {
  if (!path.includes('.')) return obj[path];
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function enrichWithEbucore(node: AuroraNode): AuroraNode {
  const mapping = EBUCORE_MAPPINGS[node.type];
  if (!mapping) return { ...node, properties: { ...node.properties } };

  const enriched: Record<string, unknown> = { ...node.properties };

  for (const [ebucoreKey, sourceKey] of Object.entries(mapping)) {
    if (ebucoreKey === 'ebucore:title') {
      enriched[ebucoreKey] = node.title;
    } else {
      const value = resolveNestedValue(node.properties, sourceKey);
      if (value !== undefined && value !== null) {
        enriched[ebucoreKey] = value;
      }
    }
  }

  return { ...node, properties: enriched };
}

/**
 * Return only the ebucore:* properties from a node.
 * If the node hasn't been enriched yet, applies the mapping on-the-fly.
 */
export function getEbucoreMetadata(node: AuroraNode): Record<string, unknown> {
  // Check if node already has ebucore properties
  const existingEbucore: Record<string, unknown> = {};
  let hasExisting = false;
  for (const key of Object.keys(node.properties)) {
    if (key.startsWith('ebucore:')) {
      existingEbucore[key] = node.properties[key];
      hasExisting = true;
    }
  }

  if (hasExisting) return existingEbucore;

  const mapping = EBUCORE_MAPPINGS[node.type];
  if (!mapping) return {};

  const result: Record<string, unknown> = {};
  for (const [ebucoreKey, sourceKey] of Object.entries(mapping)) {
    if (ebucoreKey === 'ebucore:title') {
      result[ebucoreKey] = node.title;
    } else {
      const value = resolveNestedValue(node.properties, sourceKey);
      if (value !== undefined && value !== null) {
        result[ebucoreKey] = value;
      }
    }
  }

  return result;
}

/**
 * Check which EBUCore fields are missing for this node type.
 * Returns complete=true if all fields have values, otherwise lists the missing ebucore field names.
 */
export function validateEbucoreCompleteness(node: AuroraNode): {
  complete: boolean;
  missing: string[];
} {
  const mapping = EBUCORE_MAPPINGS[node.type];
  if (!mapping) return { complete: true, missing: [] };

  const missing: string[] = [];

  for (const [ebucoreKey, sourceKey] of Object.entries(mapping)) {
    if (ebucoreKey === 'ebucore:title') {
      if (!node.title) missing.push(ebucoreKey);
    } else {
      const ebucoreValue = node.properties[ebucoreKey];
      const sourceValue = resolveNestedValue(node.properties, sourceKey);
      if (
        (ebucoreValue === undefined || ebucoreValue === null) &&
        (sourceValue === undefined || sourceValue === null)
      ) {
        missing.push(ebucoreKey);
      }
    }
  }

  return { complete: missing.length === 0, missing };
}

/**
 * Return which metadata standards apply to a node type.
 */
export function getAppliedStandards(nodeType: string): string[] {
  if (nodeType === 'transcript') return ['EBUCore 1.10', 'Dublin Core'];
  if (nodeType === 'voice_print' || nodeType === 'speaker_identity') return ['EBUCore 1.10'];
  return [];
}

/** Coverage stats for a single node type. */
export interface TypeCoverage {
  total: number;
  complete: number;
  partial: number;
  none: number;
}

/** Result of metadataCoverageReport. */
export interface CoverageReport {
  totalNodes: number;
  coveredNodes: number;
  coveragePercent: number;
  byType: Record<string, TypeCoverage>;
}

/**
 * Calculate metadata coverage stats for a set of nodes.
 * A node is "complete" if validateEbucoreCompleteness returns complete=true,
 * "partial" if it has some but not all EBUCore fields,
 * "none" if it has no EBUCore-applicable type (not in EBUCORE_MAPPINGS).
 */
export function metadataCoverageReport(nodes: AuroraNode[]): CoverageReport {
  const byType: Record<string, TypeCoverage> = {};
  let coveredNodes = 0;

  for (const node of nodes) {
    const mapping = EBUCORE_MAPPINGS[node.type];

    if (!byType[node.type]) {
      byType[node.type] = { total: 0, complete: 0, partial: 0, none: 0 };
    }
    byType[node.type].total++;

    if (!mapping) {
      byType[node.type].none++;
      continue;
    }

    const { complete, missing } = validateEbucoreCompleteness(node);
    const totalFields = Object.keys(mapping).length;

    if (complete) {
      byType[node.type].complete++;
      coveredNodes++;
    } else if (missing.length < totalFields) {
      byType[node.type].partial++;
      coveredNodes++;
    } else {
      byType[node.type].none++;
    }
  }

  const totalNodes = nodes.length;
  const coveragePercent = totalNodes > 0 ? Math.round((coveredNodes / totalNodes) * 100) : 0;

  return { totalNodes, coveredNodes, coveragePercent, byType };
}
