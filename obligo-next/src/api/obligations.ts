"use client";

import { apiGet } from "./client";

export const NOT_IMPLEMENTED = { status: "not_implemented" } as const;

export function getObligations(userId: string) {
  return apiGet<{ obligations: any[]; count: number }>("/api/obligations", {
    user_id: userId,
  });
}

export function getObligationDetail(_id: string, _userId: string) {
  return Promise.resolve(NOT_IMPLEMENTED);
}

export function getDependencies(userId: string) {
  return apiGet<{ obligations: any[]; dependencies_created?: number }>("/api/obligations/dependencies", {
    user_id: userId,
  });
}

export function getStuckDetection(userId: string) {
  return apiGet<{ obligations: any[]; deadlocks_detected?: number }>("/api/obligations/stuck-detection", {
    user_id: userId,
  });
}

export function getProofMissing(userId: string) {
  return apiGet<{ obligations: any[]; count: number }>("/api/obligations/proof-missing", {
    user_id: userId,
  });
}

export function getSteps(obligationId: string, userId: string) {
  return apiGet<{ steps: any[]; count: number }>(`/api/obligations/${obligationId}/steps`, {
    user_id: userId,
  });
}
