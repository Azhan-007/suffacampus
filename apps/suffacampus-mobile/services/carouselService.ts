/**
 * carouselService.ts
 *
 * Backend routes:
 *   GET    /carousel          — list carousel items ordered by order asc
 *   POST   /carousel          — create a carousel item (admin)
 *   PUT    /carousel/:id      — update a carousel item (admin)
 *   DELETE /carousel/:id      — delete a carousel item (admin)
 */

import { apiFetch } from "./api";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CarouselItem {
  id: string;
  uri: string;
  title: string;
  subtitle: string;
  order: number;
}

export interface CarouselPayload {
  uri: string;
  title: string;
  subtitle: string;
  order: number;
}

// ─── Functions ───────────────────────────────────────────────────────────────

/** Fetch all carousel items ordered by `order` ascending. Endpoint may not exist yet. */
export async function getCarouselItems(): Promise<CarouselItem[]> {
  try {
    return await apiFetch<CarouselItem[]>("/carousel");
  } catch {
    return [];
  }
}

/** Create a new carousel item (admin). */
export async function createCarouselItem(
  data: CarouselPayload
): Promise<CarouselItem> {
  return apiFetch<CarouselItem>("/carousel", { method: "POST", body: data });
}

/** Update a carousel item (admin). */
export async function updateCarouselItem(
  id: string,
  data: Partial<CarouselPayload>
): Promise<CarouselItem> {
  return apiFetch<CarouselItem>(`/carousel/${id}`, {
    method: "PATCH",
    body: data,
  });
}

/** Delete a carousel item (admin). */
export async function deleteCarouselItem(id: string): Promise<void> {
  await apiFetch<void>(`/carousel/${id}`, { method: "DELETE" });
}
