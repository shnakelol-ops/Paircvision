import type { MatchEvent } from "./stats-event-model";

export class MatchEventStore {
  private events: MatchEvent[];

  constructor(initialEvents: readonly MatchEvent[] = []) {
    this.events = [...initialEvents];
  }

  add(event: MatchEvent): void {
    this.events.push(event);
  }

  removeLast(): MatchEvent | undefined {
    return this.events.pop();
  }

  getAll(): MatchEvent[] {
    return [...this.events];
  }

  clear(): void {
    this.events = [];
  }
}

export function createMatchEventStore(
  initialEvents: readonly MatchEvent[] = [],
): MatchEventStore {
  return new MatchEventStore(initialEvents);
}
