export interface ClockProvider {
  nowMs(): number;
  nowIso(): string;
}

class SystemClockProvider implements ClockProvider {
  nowMs() {
    return Date.now();
  }

  nowIso() {
    return new Date(this.nowMs()).toISOString();
  }
}

let activeClock: ClockProvider = new SystemClockProvider();

export const clock = () => activeClock;

export const setClockProviderForTests = (provider: ClockProvider) => {
  activeClock = provider;
};

export const resetClockProvider = () => {
  activeClock = new SystemClockProvider();
};
